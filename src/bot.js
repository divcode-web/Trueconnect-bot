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
    
    const dbConnected = await testConnection();
    if (!dbConnected) {
      throw new Error('Database connection failed');
    }

    await setupWebhook();
    setupScheduledTasks();

    console.log('✅ Bot initialized successfully');
  } catch (error) {
    console.error('❌ Bot initialization failed:', error);
    process.exit(1);
  }
}

function setupScheduledTasks() {
  cron.schedule('0 2 * * *', async () => {
    console.log('🗄️ Running message archival...');
    try {
      if (MessageService && MessageService.archiveOldMessages) {
        await MessageService.archiveOldMessages();
        await MessageService.cleanupFreeUserMessages();
      }
    } catch (error) {
      console.error('Error in message archival:', error);
    }
  });

  cron.schedule('0 * * * *', async () => {
    console.log('💎 Checking expired subscriptions...');
    try {
      await SubscriptionService.checkExpiredSubscriptions();
    } catch (error) {
      console.error('Error checking subscriptions:', error);
    }
  });

  cron.schedule('0 1 * * *', async () => {
    console.log('🔒 Checking suspended users...');
    try {
      await ReportService.checkSuspensions();
    } catch (error) {
      console.error('Error checking suspensions:', error);
    }
  });

  cron.schedule('0 0 * * *', async () => {
    console.log('🧹 Cleaning daily likes cache...');
    BrowsingHandler.cleanupDailyLikes();
  });

  console.log('⏰ Scheduled tasks configured');
}

bot.on('message', async (msg) => {
  try {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;

    console.log(`📨 Message from ${msg.from.first_name} (${userId}): ${text}`);

    const user = await UserService.getUserByTelegramId(userId);
    if (user?.is_banned) {
      await bot.sendMessage(chatId, '🚫 Your account has been banned. Contact support if you believe this is an error.');
      return;
    }
    if (user?.is_suspended && new Date(user.suspended_until) > new Date()) {
      await bot.sendMessage(chatId, `⏸️ Your account is suspended until ${new Date(user.suspended_until).toLocaleDateString()}.`);
      return;
    }

    if (text?.startsWith('/') && await AdminHandler.isAdmin(userId)) {
      await AdminHandler.handleAdminCommand(msg);
      return;
    }

    if (msg.location) {
      if (user && user.registration_step && user.registration_step !== 'completed') {
        await RegistrationHandler.handleLocation(msg, user);
      } else if (user && user.is_active) {
        await BrowsingHandler.handleLocationUpdate(msg);
      } else {
        await bot.sendMessage(chatId, 'Location received, but you are not in a valid state.');
      }
      return;
    }

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

    const currentUser = await UserService.getUserByTelegramId(userId);
    if (currentUser && currentUser.registration_step !== 'completed') {
      await RegistrationHandler.handleRegistration(msg);
      return;
    }

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

    if (currentUser?.editing_field) {
      await handleProfileEdit(msg, currentUser);
      return;
    }

    if (msg.photo) {
      if (currentUser?.registration_step === 'photos') {
        await RegistrationHandler.handlePhotos(msg, currentUser);
      } else if (currentUser?.uploading_photos) {
        await handlePhotoUpload(msg, currentUser);
      } else if (currentUser?.uploading_verification) {
        await handleVerificationPhotoUpload(msg, currentUser);
      } else {
        await bot.sendMessage(chatId, 'Photo received! Use /profile to manage your photos.');
      }
      return;
    }

    if (msg.video) {
      if (currentUser?.uploading_verification) {
        await handleVerificationVideo(msg, currentUser);
      } else {
        await bot.sendMessage(chatId, 'Video received! Use /verify to start verification process.');
      }
      return;
    }

    await bot.sendMessage(chatId, 
      'Hi! Use the menu below to navigate:',
      keyboards.mainMenu
    );

  } catch (error) {
    console.error('Error handling message:', error);
    await bot.sendMessage(msg.chat.id, 'Sorry, something went wrong. Please try again.');
  }
});

bot.on('callback_query', async (query) => {
  try {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const data = query.data || '';
    const messageId = query.message.message_id;

    console.log(`📘 Callback from ${query.from.first_name} (${userId}): ${data}`);

    const user = await UserService.getUserByTelegramId(userId);
    if (!user) {
      await bot.answerCallbackQuery(query.id, { text: 'User not found. Please start with /start' });
      return;
    }

    await bot.answerCallbackQuery(query.id);

    // Route all callbacks properly
    if (data === 'main_menu') {
      await bot.editMessageText('What would you like to do?', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: keyboards.mainMenu.reply_markup
      });
      return;
    }

    if (data === 'profile') {
      await handleProfile(chatId, userId);
      return;
    }

    if (data === 'browse') {
      await BrowsingHandler.startBrowsing(chatId, userId);
      return;
    }
    
    if (data === 'swipe_like') {
      await BrowsingHandler.handleLike(query, user);
      return;
    }
    
    if (data === 'swipe_pass') {
      await BrowsingHandler.handlePass(query, user);
      return;
    }
    
    if (data === 'swipe_super_like') {
      await BrowsingHandler.handleSuperLike(query, user);
      return;
    }
    
    if (data === 'continue_browsing') {
      await BrowsingHandler.continueBrowsing(chatId, userId);
      return;
    }
    
    if (data === 'browse_reload') {
      await BrowsingHandler.reloadMatches(chatId, userId);
      return;
    }

    if (data.startsWith('browse_photos_')) {
      const targetUserId = parseInt(data.split('_')[2]);
      await BrowsingHandler.showUserPhotos(chatId, userId, targetUserId);
      return;
    }
    
    if (data.startsWith('browse_profile_')) {
      const targetUserId = parseInt(data.split('_')[2]);
      await BrowsingHandler.showProfile(chatId, userId, targetUserId);
      return;
    }

    if (data === 'matches') {
      await handleMatches(chatId, userId);
      return;
    }

    if (data === 'premium') {
      await handlePremium(chatId);
      return;
    }

    if (data === 'settings') {
      await handleSettings(chatId, userId);
      return;
    }

    if (data === 'edit_profile') {
      await handleEditProfileMenu(chatId, userId);
      return;
    }
    
    if (data === 'add_photos') {
      await handleAddPhotos(chatId, userId);
      return;
    }
    
    if (data === 'who_likes_me') {
      await handleWhoLikesMe(chatId, userId);
      return;
    }
    
    if (data === 'delete_account') {
      await handleDeleteAccountConfirmation(chatId, userId);
      return;
    }

    // Verification section
    if (data === 'start_verification') {
      await handleStartVerification(chatId, userId);
      return;
    }
    
    if (data === 'upload_verification') {
      await handleUploadVerification(chatId, userId);
      return;
    }

    if (data.startsWith('gender_')) {
      await RegistrationHandler.handleGenderCallback(query);
      return;
    }
    
    if (data.startsWith('looking_')) {
      await RegistrationHandler.handleLookingForCallback(query);
      return;
    }
    
    if (data.startsWith('edu_')) {
      await RegistrationHandler.handleEducationCallback(query);
      return;
    }

    // Settings callbacks - FIXED
    if (data.startsWith('settings_')) {
      const settingType = data.split('_')[1];
      await handleSettingsCallback(chatId, userId, settingType);
      return;
    }

    // Preference callbacks - FIXED
    if (data.startsWith('pref_')) {
      const prefType = data.split('_')[1];
      await handlePreferenceCallback(chatId, userId, prefType);
      return;
    }

    // Notification callbacks - FIXED
    if (data.startsWith('notif_')) {
      const notifType = data.split('_')[1];
      await handleNotificationCallback(chatId, userId, notifType);
      return;
    }

    // Privacy callbacks - FIXED
    if (data.startsWith('privacy_')) {
      const privacyType = data.split('_')[1];
      await handlePrivacyCallback(chatId, userId, privacyType);
      return;
    }

    if (data === 'update_location') {
      await BrowsingHandler.requestLocationUpdate(chatId);
      return;
    }
    
    if (data === 'request_location') {
      await bot.sendMessage(chatId, 
        'Please share your location:',
        {
          reply_markup: {
            keyboard: [
              [{ text: '📍 Share Location', request_location: true }]
            ],
            resize_keyboard: true,
            one_time_keyboard: true
          }
        }
      );
      return;
    }

    if (data.startsWith('report_user_')) {
      const targetUserId = parseInt(data.split('_')[2]);
      await handleReportUser(chatId, userId, targetUserId);
      return;
    }
    
    if (data.startsWith('report_submit_')) {
      const parts = data.split('_');
      await handleReportSubmission(chatId, userId, parts);
      return;
    }

    if (data.startsWith('chat_')) {
      const targetUserId = parseInt(data.split('_')[1]);
      await handleStartChat(chatId, userId, targetUserId);
      return;
    }

    if (data.startsWith('buy_')) {
      const plan = data.split('_')[1];
      await handlePurchasePlan(chatId, userId, plan);
      return;
    }
    
    if (data.startsWith('pay_stars_')) {
      const plan = data.split('_')[2];
      await handlePayWithStars(chatId, userId, plan);
      return;
    }

    // Profile field editing - FIXED
    if (data.startsWith('edit_field_')) {
      const field = data.split('_')[2];
      await handleStartFieldEdit(chatId, userId, field);
      return;
    }

    if (data.startsWith('confirm_delete_')) {
      const confirmUserId = parseInt(data.split('_')[2]);
      await handleConfirmDeleteAccount(chatId, userId, confirmUserId);
      return;
    }

    if (data.startsWith('admin_') && await AdminHandler.isAdmin(userId)) {
      await handleAdminCallback(chatId, userId, data);
      return;
    }

    if (data.startsWith('confirm_stars_')) {
      const parts = data.split('_');
      const plan = parts[2];
      const amount = parts[3];
      await processStarPayment(chatId, userId, plan, amount);
      return;
    }
    // Add these callback handlers to your bot.js file inside the callback_query handler

// Age preference callbacks
if (data.startsWith('set_age_')) {
  const ageRange = data.replace('set_age_', '');
  const [minAge, maxAge] = ageRange.split('_').map(Number);
  try {
    await UserService.setAgePreference(userId, minAge, maxAge);
    await bot.sendMessage(chatId, 
      `Age preference updated to ${minAge}-${maxAge} years!`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Back to Preferences', callback_data: 'settings_preferences' }]
          ]
        }
      }
    );
  } catch (error) {
    console.error('Error setting age preference:', error);
    await bot.sendMessage(chatId, 'Error updating preference.');
  }
  return;
}

// Distance preference callbacks
if (data.startsWith('set_distance_')) {
  const distance = parseInt(data.replace('set_distance_', ''));
  try {
    await UserService.setDistancePreference(userId, distance);
    await bot.sendMessage(chatId, 
      `Distance preference updated to ${distance}km!`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Back to Preferences', callback_data: 'settings_preferences' }]
          ]
        }
      }
    );
  } catch (error) {
    console.error('Error setting distance preference:', error);
    await bot.sendMessage(chatId, 'Error updating preference.');
  }
  return;
}

// Gender preference callbacks
if (data.startsWith('set_gender_')) {
  const gender = data.replace('set_gender_', '');
  const genderMap = {
    'male': 'male',
    'female': 'female', 
    'both': 'both'
  };
  
  try {
    await UserService.setGenderPreference(userId, genderMap[gender]);
    await bot.sendMessage(chatId, 
      `Gender preference updated to ${gender}!`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Back to Preferences', callback_data: 'settings_preferences' }]
          ]
        }
      }
    );
  } catch (error) {
    console.error('Error setting gender preference:', error);
    await bot.sendMessage(chatId, 'Error updating preference.');
  }
  return;
}

// Privacy visibility callbacks
if (data.startsWith('set_visibility_')) {
  const visibility = data.replace('set_visibility_', '');
  try {
    await UserService.setProfileVisibility(userId, visibility);
    await bot.sendMessage(chatId, 
      `Profile visibility updated to ${visibility}!`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Back to Privacy Settings', callback_data: 'settings_privacy' }]
          ]
        }
      }
    );
  } catch (error) {
    console.error('Error setting visibility:', error);
    await bot.sendMessage(chatId, 'Error updating setting.');
  }
  return;
}

// Location privacy callbacks
if (data.startsWith('set_location_')) {
  const locationPrivacy = data.replace('set_location_', '');
  try {
    await UserService.setLocationPrivacy(userId, locationPrivacy);
    await bot.sendMessage(chatId, 
      `Location privacy updated to ${locationPrivacy}!`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Back to Privacy Settings', callback_data: 'settings_privacy' }]
          ]
        }
      }
    );
  } catch (error) {
    console.error('Error setting location privacy:', error);
    await bot.sendMessage(chatId, 'Error updating setting.');
  }
  return;
}

// Message privacy callbacks
if (data.startsWith('set_messages_')) {
  const messagePrivacy = data.replace('set_messages_', '');
  try {
    await UserService.setMessagePrivacy(userId, messagePrivacy);
    await bot.sendMessage(chatId, 
      `Message privacy updated to ${messagePrivacy}!`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Back to Privacy Settings', callback_data: 'settings_privacy' }]
          ]
        }
      }
    );
  } catch (error) {
    console.error('Error setting message privacy:', error);
    await bot.sendMessage(chatId, 'Error updating setting.');
  }
  return;
}

// Admin callbacks
if (data.startsWith('admin_ban_')) {
  const targetUserId = parseInt(data.replace('admin_ban_', ''));
  await AdminHandler.banUserInternal(targetUserId, 'Banned by admin');
  await bot.sendMessage(chatId, `User ${targetUserId} has been banned.`);
  return;
}

if (data.startsWith('admin_suspend_')) {
  const targetUserId = parseInt(data.replace('admin_suspend_', ''));
  await AdminHandler.suspendUserInternal(targetUserId, 7, 'Suspended by admin');
  await bot.sendMessage(chatId, `User ${targetUserId} has been suspended for 7 days.`);
  return;
}

if (data.startsWith('admin_verify_user_')) {
  const targetUserId = parseInt(data.replace('admin_verify_user_', ''));
  try {
    await supabaseAdmin
      .from('users')
      .update({
        is_verified: true,
        verified_at: new Date().toISOString()
      })
      .eq('telegram_id', targetUserId);
    await bot.sendMessage(chatId, `User ${targetUserId} has been verified.`);
  } catch (error) {
    await bot.sendMessage(chatId, 'Error verifying user.');
  }
  return;
}

// Handle other admin callbacks
if (data.startsWith('admin_') && await AdminHandler.isAdmin(userId)) {
  await AdminHandler.handleAdminCallback(chatId, userId, data);
  return;
}

    console.log(`Unhandled callback data: ${data}`);
    await bot.answerCallbackQuery(query.id, { text: 'Feature coming soon!' });

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
    keyboards.settingsMenu
  );
}


// Profile editing handlers
async function handleEditProfileMenu(chatId, userId) {
  await bot.sendMessage(chatId, 
    '✏️ Edit Profile\n\nWhat would you like to edit?',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📝 Bio', callback_data: 'edit_field_bio' }],
          [{ text: '🎯 Interests', callback_data: 'edit_field_interests' }],
          [{ text: '💼 Profession', callback_data: 'edit_field_profession' }],
          [{ text: '📏 Height', callback_data: 'edit_field_height' }],
          [{ text: '🌟 Lifestyle', callback_data: 'edit_field_lifestyle' }],
          [{ text: '📸 Manage Photos', callback_data: 'add_photos' }],
          [{ text: '🔙 Back', callback_data: 'profile' }]
        ]
      }
    }
  );
}

async function handleAddPhotos(chatId, userId) {
  const photos = await UserService.getUserPhotos(userId);
  
  await UserService.updateUser(userId, { uploading_photos: true });
  
  await bot.sendMessage(chatId, 
    `📸 Add Photos\n\n` +
    `You currently have ${photos.length}/6 photos.\n` +
    `Send me your photos one by one. You can add ${6 - photos.length} more photos.`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '❌ Cancel', callback_data: 'edit_profile' }]
        ]
      }
    }
  );
}

async function handleWhoLikesMe(chatId, userId) {
  try {
    const likes = await UserService.getUserLikes(userId);
    
    if (likes.length === 0) {
      await bot.sendMessage(chatId, 
        'No one has liked you yet. Keep browsing and improve your profile!',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '💕 Start Browsing', callback_data: 'browse' }],
              [{ text: '🔙 Back', callback_data: 'profile' }]
            ]
          }
        }
      );
      return;
    }

    const isPremium = await SubscriptionService.isUserPremium(userId);
    
    if (!isPremium) {
      await bot.sendMessage(chatId, 
        `❤️ Who Likes You\n\n` +
        `${likes.length} people have liked you!\n\n` +
        `Upgrade to premium to see who liked you and get unlimited likes!`,
        keyboards.premiumPlans
      );
      return;
    }

    let likesText = `❤️ Who Likes You (${likes.length})\n\n`;
    likes.slice(0, 10).forEach((user, index) => {
      likesText += `${index + 1}. ${user.first_name}, ${user.age}\n`;
    });

    await bot.sendMessage(chatId, likesText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '💕 Browse Matches', callback_data: 'browse' }],
          [{ text: '🔙 Back', callback_data: 'profile' }]
        ]
      }
    });
  } catch (error) {
    console.error('Error handling who likes me:', error);
    await bot.sendMessage(chatId, 'Error loading likes.');
  }
}

async function handleDeleteAccountConfirmation(chatId, userId) {
  await bot.sendMessage(chatId, 
    '⚠️ Delete Account\n\n' +
    'Are you sure you want to permanently delete your account?\n\n' +
    'This action cannot be undone and will:\n' +
    '• Delete all your profile data\n' +
    '• Remove all your photos\n' +
    '• Delete all your matches and messages\n' +
    '• Cancel any active subscriptions\n\n' +
    'If you\'re sure, type "DELETE MY ACCOUNT" (all caps) to confirm.',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '❌ Cancel', callback_data: 'profile' }]
        ]
      }
    }
  );
}

async function handleStartVerification(chatId, userId) {
  try {
    await VerificationService.startFaceVerification(userId);
    await UserService.updateUser(userId, { uploading_verification: true });
    await bot.sendMessage(chatId, 
      '📸 Face Verification\n\n' +
      'Please upload a clear photo of yourself following these guidelines:\n\n' +
      '• Hold phone at eye level\n' +
      '• Look directly at camera\n' +
      '• Ensure good lighting\n' +
      '• Remove glasses/hat\n' +
      '• No filters or editing\n\n' +
      'Upload your verification photo now:',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🎥 Upload Video Instead', callback_data: 'upload_verification' }],
            [{ text: '❌ Cancel', callback_data: 'profile' }]
          ]
        }
      }
    );
  } catch (error) {
    console.error('Error starting verification:', error);
    await bot.sendMessage(chatId, 'Error starting verification process.');
  }
}

async function handleUploadVerification(chatId, userId) {
  await UserService.updateUser(userId, { uploading_verification: true });
  
  await bot.sendMessage(chatId, 
    '🎥 Upload Verification Video\n\n' +
    'Please upload your verification video now. Make sure it follows the guidelines:\n\n' +
    '• 5-10 seconds long\n' +
    '• Clear face visibility\n' +
    '• Say your name and "verifying my profile"\n' +
    '• Good lighting\n\n' +
    'Send the video now:'
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

async function handleReportSubmission(chatId, reporterId, parts) {
  try {
    const reportType = parts[2];
    const reportedId = parseInt(parts[3]);
    
    await ReportService.createReport(
      reporterId, 
      reportedId, 
      reportType, 
      `Report submitted via bot for: ${ReportService.reportTypes[reportType]}`
    );
    
    await bot.sendMessage(chatId, 
      '✅ Report Submitted\n\n' +
      'Thank you for reporting. Our team will review this report and take appropriate action.\n\n' +
      'You can continue browsing matches.',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '💕 Continue Browsing', callback_data: 'browse' }],
            [{ text: '🔙 Main Menu', callback_data: 'main_menu' }]
          ]
        }
      }
    );
  } catch (error) {
    console.error('Error submitting report:', error);
    await bot.sendMessage(chatId, 'Error submitting report. Please try again.');
  }
}

async function handleStartChat(chatId, userId, targetUserId) {
  await bot.sendMessage(chatId, 
    '💬 Chat feature coming soon!\n\n' +
    'For now, you can continue browsing matches.',
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
  const planDetails = SubscriptionService.subscriptionPlans?.[plan];
  if (!planDetails) {
    await bot.sendMessage(chatId, 'Invalid plan selected.');
    return;
  }

  await bot.sendMessage(chatId, 
    `💎 ${planDetails.name} Plan\n\n` +
    `Price: ${planDetails.price}\n` +
    `Duration: ${plan === 'platinum' ? 'Lifetime' : planDetails.duration + ' days'}\n\n` +
    `Features:\n${planDetails.features?.map(f => `• ${f}`).join('\n') || 'Premium features included'}\n\n` +
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

async function handlePayWithStars(chatId, userId, plan) {
  const plans = {
    silver: { amount: 2000, name: 'Silver' },
    gold: { amount: 6000, name: 'Gold' },
    platinum: { amount: 20000, name: 'Platinum' }
  };
  
  const planData = plans[plan];
  if (!planData) return;
  
  await bot.sendMessage(chatId, 
    `⭐ Pay with Telegram Stars\n\n` +
    `Plan: ${planData.name}\n` +
    `Amount: ${planData.amount} stars\n\n` +
    `Confirm your purchase:`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: `✅ Pay ${planData.amount} Stars`, callback_data: `confirm_stars_${plan}_${planData.amount}` }],
          [{ text: '🔙 Back', callback_data: `buy_${plan}` }]
        ]
      }
    }
  );
}

async function handleStartFieldEdit(chatId, userId, field) {
  const fieldNames = {
    bio: 'Bio',
    interests: 'Interests',
    profession: 'Profession',
    height: 'Height',
    education: 'Education',
    lifestyle: 'Lifestyle'
  };

  await UserService.updateUser(userId, { editing_field: field });
  
  await bot.sendMessage(chatId, 
    `✏️ Edit ${fieldNames[field]}\n\n` +
    `Please enter your new ${fieldNames[field].toLowerCase()}:`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '❌ Cancel', callback_data: 'edit_profile' }]
        ]
      }
    }
  );
}

async function handleProfileEdit(msg, user) {
  const field = user.editing_field;
  const value = msg.text?.trim();

  if (!value || value.length === 0) {
    await bot.sendMessage(msg.chat.id, 'Please enter a valid value.');
    return;
  }

  try {
    await UserService.updateUserField(user.telegram_id, field, value);
    await UserService.updateUser(user.telegram_id, { editing_field: null });
    
    await bot.sendMessage(msg.chat.id, 
      `✅ ${field.charAt(0).toUpperCase() + field.slice(1)} updated successfully!\n\nNew ${field}: ${value}`,
      keyboards.profileActions
    );
  } catch (error) {
    console.error('Error updating profile field:', error);
    await bot.sendMessage(msg.chat.id, 'Error updating profile. Please try again.');
  }
}

async function handlePhotoUpload(msg, user) {
  if (!msg.photo || msg.photo.length === 0) return;
  
  const photos = await UserService.getUserPhotos(user.telegram_id);
  if (photos.length >= 6) {
    await bot.sendMessage(msg.chat.id, 
      'You can upload maximum 6 photos.',
      keyboards.profileActions
    );
    return;
  }

  const photo = msg.photo[msg.photo.length - 1];
  
  await UserService.updateUser(user.telegram_id, { uploading_photos: false });
  await UserService.addUserPhoto(user.telegram_id, {
    file_id: photo.file_id,
    url: `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${photo.file_path || photo.file_id}`,
    is_primary: photos.length === 0,
    order_index: photos.length
  });

  await bot.sendMessage(msg.chat.id, 
    `📸 Photo ${photos.length + 1} uploaded successfully!\n\n` +
    `You now have ${photos.length + 1} photo${photos.length + 1 > 1 ? 's' : ''}. ` +
    `${photos.length + 1 < 6 ? `You can add ${6 - photos.length - 1} more photo${6 - photos.length - 1 !== 1 ? 's' : ''}.` : 'You\'ve reached the maximum of 6 photos.'}`,
    keyboards.profileActions
  );
}

async function handleVerificationPhotoUpload(msg, user) {
  try {
    if (!msg.photo || msg.photo.length === 0) return;
    
    const photo = msg.photo[msg.photo.length - 1];
    await VerificationService.submitVerificationPhoto(user.telegram_id, photo);
    await UserService.updateUser(user.telegram_id, { uploading_verification: false });
    
    await bot.sendMessage(msg.chat.id, 
      '✅ Verification Photo Submitted!\n\n' +
      'Your verification photo has been submitted for review. ' +
      'Our team will review it within 24 hours and notify you of the result.',
      keyboards.profileActions
    );
  } catch (error) {
    console.error('Error submitting verification photo:', error);
    await bot.sendMessage(msg.chat.id, 
      '❌ Error uploading verification photo. Please try again.'
    );
  }
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

async function handleSettingsCallback(chatId, userId, settingType) {
  switch (settingType) {
    case 'preferences':
      await handleMatchingPreferences(chatId, userId);
      break;
    case 'notifications':
      await handleNotificationSettings(chatId, userId);
      break;
    case 'privacy':
      await handlePrivacySettings(chatId, userId);
      break;
    default:
      await bot.sendMessage(chatId, 'Setting not implemented yet.');
  }
}

async function handleMatchingPreferences(chatId, userId) {
  try {
    const user = await UserService.getUserByTelegramId(userId);
    const prefs = user.user_preferences?.[0] || {};
    
    const prefsText = `🎯 Matching Preferences\n\n` +
      `Age Range: ${prefs.min_age || 18} - ${prefs.max_age || 99}\n` +
      `Max Distance: ${prefs.max_distance || 50}km\n` +
      `Preferred Gender: ${prefs.preferred_gender || 'Any'}\n\n` +
      `Update your preferences:`;
    
    await bot.sendMessage(chatId, prefsText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📊 Age Range', callback_data: 'pref_age' }],
          [{ text: '📏 Distance', callback_data: 'pref_distance' }],
          [{ text: '⚧️ Gender', callback_data: 'pref_gender' }],
          [{ text: '🔙 Back', callback_data: 'settings' }]
        ]
      }
    });
  } catch (error) {
    console.error('Error showing preferences:', error);
    await bot.sendMessage(chatId, 'Error loading preferences.');
  }
}

async function handleNotificationSettings(chatId, userId) {
  try {
    const settings = await UserService.getUserNotificationSettings(userId);
    
    const settingsText = `🔔 Notification Settings\n\n` +
      `New Matches: ${settings.new_matches ? '✅' : '❌'}\n` +
      `Messages: ${settings.new_messages ? '✅' : '❌'}\n` +
      `Profile Views: ${settings.profile_views ? '✅' : '❌'}\n` +
      `Super Likes: ${settings.super_likes ? '✅' : '❌'}\n\n` +
      `Toggle notifications:`;
    
    await bot.sendMessage(chatId, settingsText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: `💕 New Matches ${settings.new_matches ? '✅' : '❌'}`, callback_data: 'notif_matches' }],
          [{ text: `💬 Messages ${settings.new_messages ? '✅' : '❌'}`, callback_data: 'notif_messages' }],
          [{ text: `👀 Profile Views ${settings.profile_views ? '✅' : '❌'}`, callback_data: 'notif_views' }],
          [{ text: `⭐ Super Likes ${settings.super_likes ? '✅' : '❌'}`, callback_data: 'notif_superlikes' }],
          [{ text: '🔙 Back', callback_data: 'settings' }]
        ]
      }
    });
  } catch (error) {
    console.error('Error showing notification settings:', error);
    await bot.sendMessage(chatId, 'Error loading notification settings.');
  }
}

async function handlePrivacySettings(chatId, userId) {
  try {
    const settings = await UserService.getUserPrivacySettings(userId);
    
    const settingsText = `🔒 Privacy Settings\n\n` +
      `Profile Visibility: ${settings.profile_visibility}\n` +
      `Location Privacy: ${settings.location_privacy}\n` +
      `Message Privacy: ${settings.message_privacy}\n\n` +
      `Update privacy settings:`;
    
    await bot.sendMessage(chatId, settingsText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '👁️ Profile Visibility', callback_data: 'privacy_visibility' }],
          [{ text: '📍 Location Privacy', callback_data: 'privacy_location' }],
          [{ text: '💬 Message Privacy', callback_data: 'privacy_messages' }],
          [{ text: '🔙 Back', callback_data: 'settings' }]
        ]
      }
    });
  } catch (error) {
    console.error('Error showing privacy settings:', error);
    await bot.sendMessage(chatId, 'Error loading privacy settings.');
  }
}

// New callback handlers
async function handlePreferenceCallback(chatId, userId, prefType) {
  switch (prefType) {
    case 'age':
      await bot.sendMessage(chatId, 
        '📊 Age Range Preference\n\nEnter your preferred age range (e.g., "18-35"):',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '18-25', callback_data: 'set_age_18_25' }],
              [{ text: '25-35', callback_data: 'set_age_25_35' }],
              [{ text: '35-50', callback_data: 'set_age_35_50' }],
              [{ text: '🔙 Back', callback_data: 'settings_preferences' }]
            ]
          }
        }
      );
      break;
    case 'distance':
      await bot.sendMessage(chatId,
        '📏 Distance Preference\n\nChoose your maximum distance:',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '10km', callback_data: 'set_distance_10' }],
              [{ text: '25km', callback_data: 'set_distance_25' }],
              [{ text: '50km', callback_data: 'set_distance_50' }],
              [{ text: '100km', callback_data: 'set_distance_100' }],
              [{ text: '🔙 Back', callback_data: 'settings_preferences' }]
            ]
          }
        }
      );
      break;
    case 'gender':
      await bot.sendMessage(chatId,
        '⚧️ Gender Preference\n\nChoose who you want to see:',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Men', callback_data: 'set_gender_male' }],
              [{ text: 'Women', callback_data: 'set_gender_female' }],
              [{ text: 'Both', callback_data: 'set_gender_both' }],
              [{ text: '🔙 Back', callback_data: 'settings_preferences' }]
            ]
          }
        }
      );
      break;
  }
}

async function handleNotificationCallback(chatId, userId, notifType) {
  try {
    const settings = await UserService.getUserNotificationSettings(userId);
    const newSettings = { ...settings };
    
    switch (notifType) {
      case 'matches':
        newSettings.new_matches = !settings.new_matches;
        break;
      case 'messages':
        newSettings.new_messages = !settings.new_messages;
        break;
      case 'views':
        newSettings.profile_views = !settings.profile_views;
        break;
      case 'superlikes':
        newSettings.super_likes = !settings.super_likes;
        break;
    }
    
    await UserService.updateNotificationSettings(userId, newSettings);
    
    await bot.sendMessage(chatId, 
      `✅ Notification setting updated!\n\n${notifType.charAt(0).toUpperCase() + notifType.slice(1)} notifications are now ${newSettings[notifType.replace('superlikes', 'super_likes')] ? 'enabled' : 'disabled'}.`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Back to Notifications', callback_data: 'settings_notifications' }]
          ]
        }
      }
    );
  } catch (error) {
    console.error('Error updating notification settings:', error);
    await bot.sendMessage(chatId, 'Error updating settings.');
  }
}

async function handlePrivacyCallback(chatId, userId, privacyType) {
  switch (privacyType) {
    case 'visibility':
      await bot.sendMessage(chatId,
        '👁️ Profile Visibility\n\nWho can see your profile?',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🌍 Everyone', callback_data: 'set_visibility_public' }],
              [{ text: '👥 Matches Only', callback_data: 'set_visibility_matches' }],
              [{ text: '🔒 Private', callback_data: 'set_visibility_private' }],
              [{ text: '🔙 Back', callback_data: 'settings_privacy' }]
            ]
          }
        }
      );
      break;
    case 'location':
      await bot.sendMessage(chatId,
        '📍 Location Privacy\n\nHow precise should your location be?',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '📍 Exact', callback_data: 'set_location_exact' }],
              [{ text: '🌆 Approximate', callback_data: 'set_location_approximate' }],
              [{ text: '🌍 City Only', callback_data: 'set_location_city' }],
              [{ text: '🔙 Back', callback_data: 'settings_privacy' }]
            ]
          }
        }
      );
      break;
    case 'messages':
      await bot.sendMessage(chatId,
        '💬 Message Privacy\n\nWho can message you?',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '👥 Matches Only', callback_data: 'set_messages_matches' }],
              [{ text: '💎 Premium Users', callback_data: 'set_messages_premium' }],
              [{ text: '🌍 Everyone', callback_data: 'set_messages_everyone' }],
              [{ text: '🔙 Back', callback_data: 'settings_privacy' }]
            ]
          }
        }
      );
      break;
  }
}

async function processStarPayment(chatId, userId, plan, amount) {
  try {
    const planNames = {
      silver: 'Silver Premium Plan',
      gold: 'Gold Premium Plan', 
      platinum: 'Platinum Premium Plan'
    };
    
    const invoice = {
      title: planNames[plan] || 'Premium Plan',
      description: `Upgrade to ${plan} plan with premium features`,
      payload: `premium_${plan}_${userId}`,
      provider_token: '',
      currency: 'XTR',
      prices: [{ label: 'Premium Plan', amount: parseInt(amount) }]
    };

    await bot.sendInvoice(chatId, invoice.title, invoice.description, 
      invoice.payload, invoice.provider_token, invoice.currency, invoice.prices);
      
  } catch (error) {
    console.error('Error processing star payment:', error);
    await bot.sendMessage(chatId, 'Error processing payment. Please try again.');
  }
}

async function handleConfirmDeleteAccount(chatId, userId, confirmUserId) {
  if (userId !== confirmUserId) {
    await bot.sendMessage(chatId, 'Invalid confirmation.');
    return;
  }
  
  await bot.sendMessage(chatId, 
    '⚠️ Final Confirmation\n\n' +
    'Type "DELETE MY ACCOUNT" (all capitals) to permanently delete your account.\n\n' +
    'This cannot be undone!',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '❌ Cancel', callback_data: 'profile' }]
        ]
      }
    }
  );
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
    case 'menu':
      await AdminHandler.showAdminMenu(chatId);
      break;
    case 'test':
      if (data === 'admin_test_user') {
        await AdminHandler.handleTestUserMode({ chat: { id: chatId }, from: { id: userId } });
      }
      break;
    case 'close':
      try {
        await bot.deleteMessage(chatId, messageId);
      } catch (error) {
        console.log('Could not delete message');
      }
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