import express from 'express';
import { bot, setupWebhook, keyboards, botConfig } from './config/telegram.js';
import { testConnection } from './config/database.js';
import { UserService } from './services/userService.js';
import { MatchingService } from './services/matchingService.js';
import { MessageService } from './services/messageService.js';
import { SubscriptionService } from './services/subscriptionService.js';
import { VerificationService } from './services/verificationService.js';
import { ReportService } from './services/reportService.js';
import { RegistrationHandler } from './handlers/registrationHandler.js';
import { BrowsingHandler } from './handlers/browsingHandler.js';
import { ProfileHandler } from './handlers/profileHandler.js';
import { VerificationHandler } from './handlers/verificationHandler.js';
import { AdminHandler } from './handlers/adminHandler.js';
import cron from 'node-cron';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Premium Dating Bot is running!',
    timestamp: new Date().toISOString()
  });
});

// Webhook endpoint for Telegram
app.post('/webhook', (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Initialize bot
async function initializeBot() {
  try {
    console.log('🚀 Starting Premium Dating Bot...');
    
    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
      throw new Error('Database connection failed');
    }

    // Setup webhook
    await setupWebhook();

    // Setup scheduled tasks
    setupScheduledTasks();

    console.log('✅ Bot initialized successfully');
  } catch (error) {
    console.error('❌ Bot initialization failed:', error);
    process.exit(1);
  }
}

// Scheduled tasks
function setupScheduledTasks() {
  // Archive old messages daily at 2 AM
  cron.schedule('0 2 * * *', async () => {
    console.log('🗄️ Running message archival...');
    await MessageService.archiveOldMessages();
    await MessageService.cleanupFreeUserMessages();
  });

  // Check expired subscriptions every hour
  cron.schedule('0 * * * *', async () => {
    console.log('💎 Checking expired subscriptions...');
    await SubscriptionService.checkExpiredSubscriptions();
  });

  // Check suspended users daily at 1 AM
  cron.schedule('0 1 * * *', async () => {
    console.log('🔒 Checking suspended users...');
    await ReportService.checkSuspensions();
  });

  console.log('⏰ Scheduled tasks configured');
}

// Bot event handlers
bot.on('message', async (msg) => {
  try {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;

    console.log(`📨 Message from ${msg.from.first_name} (${userId}): ${text}`);

    // Check if user is banned or suspended
    const user = await UserService.getUserByTelegramId(userId);
    if (user?.is_banned) {
      await bot.sendMessage(chatId, '🚫 Your account has been banned. Contact support if you believe this is an error.');
      return;
    }
    if (user?.is_suspended && new Date(user.suspended_until) > new Date()) {
      await bot.sendMessage(chatId, `⏸️ Your account is suspended until ${new Date(user.suspended_until).toLocaleDateString()}.`);
      return;
    }

    // Handle admin commands
    if (text?.startsWith('/') && await AdminHandler.isAdmin(userId)) {
      await AdminHandler.handleAdminCommand(msg);
      return;
    }

    // Handle location updates
    if (msg.location) {
      // Route based on user state
      if (user && user.registration_step && user.registration_step !== 'done') {
        await RegistrationHandler.handleLocation(msg, user);
      } else if (user && user.is_active) {
        await BrowsingHandler.handleLocationUpdate(msg);
      } else {
        await bot.sendMessage(chatId, 'Location received, but you are not in a valid state.');
      }
      return;
    }

    // Handle commands
    if (text?.startsWith('/')) {
      switch (text.split(' ')[0]) {
        case '/start':
          await handleStart(msg);
          break;
        case '/help':
          await handleHelp(chatId);
          break;
        case '/profile':
          await handleProfile(chatId, userId);
          break;
        case '/browse':
          await BrowsingHandler.startBrowsing(chatId, userId);
          break;
        case '/matches':
          await handleMatches(chatId, userId);
          break;
        case '/premium':
          await handlePremium(chatId);
          break;
        case '/verify':
          await handleVerification(chatId, userId);
          break;
        case '/done':
          // Handle photo upload completion in registration
          const currentUser = await UserService.getUserByTelegramId(userId);
          if (currentUser?.registration_step === 'photos') {
            await RegistrationHandler.handlePhotos(msg, currentUser);
          }
          break;
        default:
          await bot.sendMessage(chatId, 'Unknown command. Type /help for available commands.');
      }
      return;
    }

    // Handle registration flow
    const currentUser = await UserService.getUserByTelegramId(userId);
    if (currentUser && currentUser.registration_step !== 'completed') {
      await RegistrationHandler.handleRegistration(msg);
      return;
    }

    // Handle account deletion confirmation
    if (text === 'DELETE MY ACCOUNT') {
      const success = await UserService.deleteUserAccount(userId);
      if (success) {
        await bot.sendMessage(chatId, 
          '✅ Account Deleted\n\n' +
          'Your account has been permanently deleted. All your data has been removed.\n\n' +
          'Thank you for using our service. You can create a new account anytime with /start'
        );
      } else {
        await bot.sendMessage(chatId, 
          '❌ Error deleting account. Please contact support.'
        );
      }
      return;
    }

    // Handle profile editing text inputs
    if (currentUser?.editing_field) {
      await handleProfileEdit(msg, currentUser);
      return;
    }

    // Handle photo uploads
    if (msg.photo) {
      if (currentUser?.registration_step === 'photos') {
        await RegistrationHandler.handlePhotos(msg, currentUser);
      } else if (currentUser?.uploading_photos) {
        await handlePhotoUpload(msg, currentUser);
      } else {
        await bot.sendMessage(chatId, 'Photo received! Use /profile to manage your photos.');
      }
      return;
    }

    // Handle video uploads for verification
    if (msg.video) {
      if (currentUser?.uploading_verification) {
        await handleVerificationVideo(msg, currentUser);
      } else {
        await bot.sendMessage(chatId, 'Video received! Use /verify to start verification process.');
      }
      return;
    }

    // Default response
    await bot.sendMessage(chatId, 
      'Hi! Use the menu below to navigate:',
      keyboards.mainMenu
    );

  } catch (error) {
    console.error('Error handling message:', error);
    await bot.sendMessage(msg.chat.id, 'Sorry, something went wrong. Please try again.');
  }
});

// Handle callback queries (inline keyboard buttons)
bot.on('callback_query', async (query) => {
  try {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const data = query.data;

    console.log(`🔘 Callback from ${query.from.first_name} (${userId}): ${data}`);

    // Answer the callback query to remove loading state
    await bot.answerCallbackQuery(query.id);

    // Handle different callback types
    if (data === 'main_menu') {
      await bot.editMessageText('What would you like to do?', {
        chat_id: chatId,
        message_id: query.message.message_id,
        ...keyboards.mainMenu
      });
    } else if (data === 'profile') {
      await handleProfile(chatId, userId);
    } else if (data === 'browse') {
      await BrowsingHandler.startBrowsing(chatId, userId);
    } else if (data === 'matches') {
      await handleMatches(chatId, userId);
    } else if (data === 'premium') {
      await handlePremium(chatId);
    } else if (data === 'settings') {
      await handleSettings(chatId, userId);
    } else if (data.startsWith('gender_')) {
      await RegistrationHandler.handleGenderCallback(query);
    } else if (data.startsWith('looking_')) {
      await RegistrationHandler.handleLookingForCallback(query);
    } else if (data.startsWith('edu_')) {
      await RegistrationHandler.handleEducationCallback(query);
    } else if (data.startsWith('swipe_')) {
      const action = data.split('_')[1];
      await BrowsingHandler.handleSwipe(chatId, userId, action);
    } else if (data === 'continue_browsing') {
      await BrowsingHandler.continueBrowsing(chatId, userId);
    } else if (data === 'update_location') {
      await BrowsingHandler.updateLocation(chatId, userId);
    } else if (data.startsWith('photos_')) {
      const targetUserId = parseInt(data.split('_')[1]);
      await BrowsingHandler.showUserPhotos(chatId, userId, targetUserId);
    } else if (data.startsWith('report_')) {
      const targetUserId = parseInt(data.split('_')[1]);
      await handleReportUser(chatId, userId, targetUserId);
    } else if (data.startsWith('chat_')) {
      const targetUserId = parseInt(data.split('_')[1]);
      await handleStartChat(chatId, userId, targetUserId);
    } else if (data.startsWith('buy_')) {
      const plan = data.split('_')[1];
      await handlePurchasePlan(chatId, userId, plan);
    } else if (data === 'verify_profile') {
      await handleVerification(chatId, userId);
    } else if (data.startsWith('admin_')) {
      if (await AdminHandler.isAdmin(userId)) {
        await handleAdminCallback(chatId, userId, data);
      }
    } else if (data.startsWith('edit_')) {
      const field = data.split('_')[1];
      await handleStartFieldEdit(chatId, userId, field);
    } else if (data === 'upload_verification') {
      await handleUploadVerification(chatId, userId);
    } else if (data.startsWith('confirm_stars_')) {
      const parts = data.split('_');
      const plan = parts[2];
      const amount = parts[3];
      await processStarPayment(chatId, userId, plan, amount);
    }

  } catch (error) {
    console.error('Error handling callback query:', error);
    await bot.answerCallbackQuery(query.id, { text: 'Error occurred. Please try again.' });
  }
});

// Command handlers
async function handleStart(msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  try {
    const { user, isNew } = await UserService.createUser(msg.from);

    if (isNew) {
      await bot.sendMessage(chatId, 
        `Welcome to our Premium Dating Platform! 💕\n\n` +
        `I'm here to help you find meaningful connections. Let's start by setting up your profile.`
      );
      await RegistrationHandler.startRegistration(chatId, user);
    } else if (user.registration_step !== 'completed') {
      await bot.sendMessage(chatId, 
        `Welcome back! Let's continue setting up your profile.`
      );
      await RegistrationHandler.handleRegistration({ 
        chat: { id: chatId }, 
        from: { id: userId },
        text: '/continue'
      });
    } else {
      await bot.sendMessage(chatId, 
        `Welcome back, ${user.first_name}! 💕\n\n` +
        `Ready to find your perfect match?`,
        keyboards.mainMenu
      );
    }
  } catch (error) {
    console.error('Error in handleStart:', error);
    await bot.sendMessage(chatId, 'Welcome! Something went wrong, but let\'s try again.');
  }
}

async function handleHelp(chatId) {
  const helpText = `🆘 Help & Commands\n\n` +
    `🏠 /start - Start or return to main menu\n` +
    `👤 /profile - View and edit your profile\n` +
    `💕 /browse - Browse potential matches\n` +
    `👥 /matches - View your matches\n` +
    `💎 /premium - Upgrade to premium\n` +
    `✅ /verify - Verify your profile\n` +
    `🆘 /help - Show this help message\n\n` +
    `💡 Tips:\n` +
    `• Complete your profile for better matches\n` +
    `• Verify your profile to build trust\n` +
    `• Be respectful and genuine\n` +
    `• Report any inappropriate behavior\n\n` +
    `Need more help? Contact our support team!`;

  await bot.sendMessage(chatId, helpText, keyboards.mainMenu);
}

async function handleProfile(chatId, userId) {
  try {
    const user = await UserService.getUserByTelegramId(userId);
    if (!user) {
      await bot.sendMessage(chatId, 'Profile not found. Please start with /start');
      return;
    }

    const photos = await UserService.getUserPhotos(userId);
    const subscription = await SubscriptionService.getUserSubscription(userId);

    let profileText = `👤 Your Profile\n\n`;
    profileText += `Name: ${user.first_name}${user.last_name ? ' ' + user.last_name : ''}\n`;
    profileText += `Age: ${user.age || 'Not set'}\n`;
    profileText += `Gender: ${user.gender || 'Not set'}\n`;
    profileText += `Looking for: ${user.looking_for || 'Not set'}\n`;
    profileText += `Bio: ${user.bio || 'Not set'}\n`;
    profileText += `Photos: ${photos.length}/6\n`;
    profileText += `Verified: ${user.is_verified ? '✅ Yes' : '❌ No'}\n`;
    profileText += `Premium: ${subscription ? `✅ ${subscription.plan_type}` : '❌ Free'}\n`;
    profileText += `Profile Complete: ${user.profile_completed ? '✅ Yes' : '❌ No'}\n`;

    await bot.sendMessage(chatId, profileText, keyboards.profileActions);
  } catch (error) {
    console.error('Error handling profile:', error);
    await bot.sendMessage(chatId, 'Error loading profile.');
  }
}

async function handleMatches(chatId, userId) {
  try {
    const matches = await MatchingService.getUserMatches(userId);
    
    if (matches.length === 0) {
      await bot.sendMessage(chatId, 
        'No matches yet! Start browsing to find your perfect match.',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '💕 Start Browsing', callback_data: 'browse' }],
              [{ text: '🔙 Back', callback_data: 'main_menu' }]
            ]
          }
        }
      );
      return;
    }

    let matchesText = `💕 Your Matches (${matches.length})\n\n`;
    
    matches.slice(0, 10).forEach((match, index) => {
      const otherUser = match.otherUser;
      matchesText += `${index + 1}. ${otherUser.first_name}, ${otherUser.age}\n`;
      matchesText += `   Matched: ${new Date(match.matched_at).toLocaleDateString()}\n`;
      if (match.last_message) {
        matchesText += `   Last message: ${match.last_message.substring(0, 50)}...\n`;
      }
      matchesText += '\n';
    });

    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          ...matches.slice(0, 5).map((match, index) => [
            { text: `💬 Chat with ${match.otherUser.first_name}`, callback_data: `chat_${match.otherUser.telegram_id}` }
          ]),
          [{ text: '🔙 Back', callback_data: 'main_menu' }]
        ]
      }
    };

    await bot.sendMessage(chatId, matchesText, keyboard);
  } catch (error) {
    console.error('Error handling matches:', error);
    await bot.sendMessage(chatId, 'Error loading matches.');
  }
}

async function handlePremium(chatId) {
  const premiumText = `💎 Premium Plans\n\n` +
    `Unlock premium features and find better matches!\n\n` +
    `🥉 Silver ($19.99/3 months):\n` +
    `• Unlimited likes per day\n` +
    `• See who liked you\n` +
    `• 3 super likes daily\n` +
    `• Message read receipts\n` +
    `• Basic location radius (50km)\n\n` +
    `🥇 Gold ($59.99/year):\n` +
    `• All Silver features\n` +
    `• Unlimited super likes\n` +
    `• Priority in matching\n` +
    `• Extended location radius (200km)\n` +
    `• Advanced filters\n` +
    `• Rewind last swipe\n` +
    `• 1 free boost per month\n\n` +
    `💎 Platinum ($199.99/lifetime):\n` +
    `• All Gold features\n` +
    `• Top picks daily\n` +
    `• Message before matching\n` +
    `• Unlimited location radius\n` +
    `• Premium badge\n` +
    `• Priority support\n` +
    `• Unlimited boosts`;

  await bot.sendMessage(chatId, premiumText, keyboards.premiumPlans);
}

async function handleVerification(chatId, userId) {
  const verificationText = `✅ Profile Verification\n\n` +
    `Get verified to build trust and get better matches!\n\n` +
    `📸 Face Verification Process:\n` +
    `1. Hold your phone at eye level\n` +
    `2. Look directly at the camera\n` +
    `3. Ensure good lighting\n` +
    `4. Remove glasses/hat if applicable\n` +
    `5. Take a clear, front-facing photo\n\n` +
    `Your photo will be reviewed by our team within 24 hours.\n\n` +
    `Ready to get verified?`;

  await bot.sendMessage(chatId, verificationText, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📸 Start Verification', callback_data: 'start_verification' }],
        [{ text: '🔙 Back', callback_data: 'profile' }]
      ]
    }
  });
}

async function handleSettings(chatId, userId) {
  await bot.sendMessage(chatId, 
    '⚙️ Settings\n\nChoose what you want to configure:',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🎯 Matching Preferences', callback_data: 'settings_preferences' }],
          [{ text: '🔔 Notifications', callback_data: 'settings_notifications' }],
          [{ text: '🔒 Privacy', callback_data: 'settings_privacy' }],
          [{ text: '📍 Location', callback_data: 'update_location' }],
          [{ text: '🔙 Back', callback_data: 'main_menu' }]
        ]
      }
    }
  );
}

async function handleReportUser(chatId, reporterId, reportedId) {
  await bot.sendMessage(chatId, 
    '🚨 Report User\n\nWhy are you reporting this user?',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🎭 Fake Profile', callback_data: `report_submit_fake_profile_${reportedId}` }],
          [{ text: '😠 Harassment', callback_data: `report_submit_harassment_${reportedId}` }],
          [{ text: '🔞 Inappropriate Content', callback_data: `report_submit_inappropriate_content_${reportedId}` }],
          [{ text: '📧 Spam', callback_data: `report_submit_spam_${reportedId}` }],
          [{ text: '👶 Underage', callback_data: `report_submit_underage_${reportedId}` }],
          [{ text: '❓ Other', callback_data: `report_submit_other_${reportedId}` }],
          [{ text: '🔙 Cancel', callback_data: 'browse' }]
        ]
      }
    }
  );
}

async function handleStartChat(chatId, userId, targetUserId) {
  await bot.sendMessage(chatId, 
    `💬 Chat feature coming soon!\n\n` +
    `For now, you can continue browsing matches.`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '💕 Continue Browsing', callback_data: 'browse' }],
          [{ text: '👥 View Matches', callback_data: 'matches' }],
          [{ text: '🔙 Main Menu', callback_data: 'main_menu' }]
        ]
      }
    }
  );
}

async function handlePurchasePlan(chatId, userId, plan) {
  const planDetails = SubscriptionService.subscriptionPlans[plan];
  if (!planDetails) return;

  await bot.sendMessage(chatId, 
    `💎 ${planDetails.name} Plan\n\n` +
    `Price: $${planDetails.price}\n` +
    `Duration: ${plan === 'platinum' ? 'Lifetime' : planDetails.duration + ' days'}\n\n` +
    `Features:\n${planDetails.features.map(f => `• ${f}`).join('\n')}\n\n` +
    `Payment options:`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '💳 Telegram Stars', callback_data: `pay_stars_${plan}` }],
          [{ text: '🏦 PayStack', callback_data: `pay_paystack_${plan}` }],
          [{ text: '₿ Crypto (NOWPayments)', callback_data: `pay_crypto_${plan}` }],
          [{ text: '🔙 Back', callback_data: 'premium' }]
        ]
      }
    }
  );
}

// New handler functions for profile editing
async function handleStartFieldEdit(chatId, userId, field) {
  const fieldNames = {
    bio: 'Bio',
    interests: 'Interests',
    profession: 'Profession',
    height: 'Height',
    education: 'Education'
  };

  await UserService.updateUser(userId, { editing_field: field });
  
  await bot.sendMessage(chatId, 
    `✏️ Edit ${fieldNames[field]}\n\n` +
    `Please enter your new ${fieldNames[field].toLowerCase()}:`
  );
}

async function handleProfileEdit(msg, user) {
  const field = user.editing_field;
  const value = msg.text?.trim();

  if (!value) {
    await bot.sendMessage(msg.chat.id, 'Please enter a valid value.');
    return;
  }

  try {
    await UserService.updateUserField(user.telegram_id, field, value);
    await UserService.updateUser(user.telegram_id, { editing_field: null });
    
    await bot.sendMessage(msg.chat.id, 
      `✅ ${field.charAt(0).toUpperCase() + field.slice(1)} updated successfully!`,
      keyboards.profileActions
    );
  } catch (error) {
    console.error('Error updating profile field:', error);
    await bot.sendMessage(msg.chat.id, 'Error updating profile. Please try again.');
  }
}

async function handlePhotoUpload(msg, user) {
  const photos = await UserService.getUserPhotos(user.telegram_id);
  if (photos.length >= 6) {
    await bot.sendMessage(msg.chat.id, 
      'You can upload maximum 6 photos.',
      keyboards.profileActions
    );
    return;
  }

  const photo = msg.photo[msg.photo.length - 1];
  await UserService.addUserPhoto(user.telegram_id, {
    file_id: photo.file_id,
    url: `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${photo.file_path}`,
    is_primary: photos.length === 0,
    order_index: photos.length
  });

  await bot.sendMessage(msg.chat.id, 
    `📸 Photo ${photos.length + 1} uploaded successfully!`,
    keyboards.profileActions
  );
}

async function handleUploadVerification(chatId, userId) {
  await UserService.updateUser(userId, { uploading_verification: true });
  
  await bot.sendMessage(chatId, 
    '📹 Upload Verification Video\n\n' +
    'Please upload your verification video now. Make sure it follows the guidelines:\n\n' +
    '• 5-10 seconds long\n' +
    '• Clear face visibility\n' +
    '• Say your name and "verifying my profile"\n' +
    '• Good lighting\n\n' +
    'Send the video now:'
  );
}

async function handleVerificationVideo(msg, user) {
  try {
    await VerificationService.submitVerificationVideo(user.telegram_id, msg.video);
    await UserService.updateUser(user.telegram_id, { uploading_verification: false });
    
    await bot.sendMessage(msg.chat.id, 
      '✅ Verification Video Submitted!\n\n' +
      'Your verification video has been submitted for review. ' +
      'Our team will review it within 24 hours and notify you of the result.',
      keyboards.profileActions
    );
  } catch (error) {
    console.error('Error submitting verification video:', error);
    await bot.sendMessage(msg.chat.id, 
      '❌ Error uploading verification video. Please try again.'
    );
  }
}

async function processStarPayment(chatId, userId, plan, amount) {
  try {
    // Create Telegram Stars invoice
    const invoice = {
      title: `Premium ${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan`,
      description: `Upgrade to ${plan} plan with premium features`,
      payload: `premium_${plan}_${userId}`,
      provider_token: '', // Empty for Telegram Stars
      currency: 'XTR', // Telegram Stars currency
      prices: [{ label: 'Premium Plan', amount: parseInt(amount) }]
    };

    await bot.sendInvoice(chatId, invoice.title, invoice.description, 
      invoice.payload, invoice.provider_token, invoice.currency, invoice.prices);
      
  } catch (error) {
    console.error('Error processing star payment:', error);
    await bot.sendMessage(chatId, 'Error processing payment. Please try again.');
  }
}

async function handleAdminCallback(chatId, userId, data) {
  const action = data.split('_')[1];
  
  switch (action) {
    case 'stats':
      await AdminHandler.showStats(chatId);
      break;
    case 'reports':
      await AdminHandler.showPendingReports(chatId);
      break;
    case 'verifications':
      await AdminHandler.showPendingVerifications(chatId);
      break;
    case 'subscriptions':
      await AdminHandler.showSubscriptionManagement(chatId);
      break;
    case 'test':
      if (data === 'admin_test_user') {
        await AdminHandler.handleTestUserMode({ chat: { id: chatId }, from: { id: userId } });
      }
      break;
    case 'menu':
      await AdminHandler.showAdminMenu(chatId);
      break;
    default:
      if (data.startsWith('review_report_')) {
        const reportId = parseInt(data.split('_')[2]);
        await AdminHandler.reviewReport(chatId, reportId);
      } else if (data.startsWith('review_verification_')) {
        const verificationId = parseInt(data.split('_')[2]);
        await AdminHandler.reviewVerification(chatId, verificationId);
      } else if (data.startsWith('report_action_')) {
        const actionType = data.split('_')[2];
        const reportId = parseInt(data.split('_')[3]);
        await AdminHandler.handleReportAction(chatId, actionType, reportId);
      } else if (data.startsWith('verify_')) {
        const actionType = data.split('_')[1];
        const verificationId = parseInt(data.split('_')[2]);
        await AdminHandler.handleVerificationAction(chatId, actionType, verificationId);
      }
  }
}

// Start the server
app.listen(PORT, async () => {
  console.log(`🌐 Server running on port ${PORT}`);
  await initializeBot();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('👋 Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('👋 Shutting down gracefully...');
  process.exit(0);
});