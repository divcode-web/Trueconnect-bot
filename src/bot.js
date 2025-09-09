import TelegramBot from 'node-telegram-bot-api';
import express from 'express';
import dotenv from 'dotenv';
import { testConnection } from './config/database.js';
import { UserService } from './services/userService.js';
import { RegistrationHandler } from './handlers/registrationHandler.js';
import { ProfileHandler } from './handlers/profileHandler.js';
import { BrowsingHandler } from './handlers/browsingHandler.js';
import { VerificationHandler } from './handlers/verificationHandler.js';
import { AdminHandler } from './handlers/adminHandler.js';
import { SubscriptionService } from './services/subscriptionService.js';
import { PaymentService } from './services/paymentService.js';
import { ReportService } from './services/reportService.js';
import { MessageService } from './services/messageService.js';
import { MatchingService } from './services/matchingService.js';
import { AnalyticsService } from './analyticsService.js';
import { bot, keyboards, botConfig, setupWebhook } from './config/telegram.js';
import webhookHandler from './handlers/webhookHandler.js';
import cron from 'node-cron';

dotenv.config();

// Express app for webhooks
const app = express();
app.use(express.json());

// Webhook routes
app.use('/webhook', webhookHandler);

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'Bot is running', timestamp: new Date().toISOString() });
});

// User state management
const userStates = new Map();

// Set user state
function setUserState(userId, state, data = {}) {
  userStates.set(userId, { state, data, timestamp: Date.now() });
}

// Get user state
function getUserState(userId) {
  return userStates.get(userId);
}

// Clear user state
function clearUserState(userId) {
  userStates.delete(userId);
}

// Clean up old states (run every hour)
setInterval(() => {
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  for (const [userId, stateData] of userStates.entries()) {
    if (stateData.timestamp < oneHourAgo) {
      userStates.delete(userId);
    }
  }
}, 60 * 60 * 1000);

// Bot command handlers
bot.onText(/\/start/, async (msg) => {
  try {
    const { user, isNew } = await UserService.createUser(msg.from);
    
    if (isNew) {
      await bot.sendMessage(msg.chat.id, 
        `🎉 Welcome to our premium dating platform!\n\n` +
        `I'm here to help you find meaningful connections. Let's start by setting up your profile.\n\n` +
        `Ready to begin your journey to find love? 💕`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🚀 Start Profile Setup', callback_data: 'start_registration' }],
              [{ text: '❓ How it works', callback_data: 'how_it_works' }]
            ]
          }
        }
      );
    } else if (!user.profile_completed) {
      await RegistrationHandler.startRegistration(msg.chat.id, user);
    } else {
      await bot.sendMessage(msg.chat.id, 
        `Welcome back, ${user.first_name}! 👋\n\n` +
        `What would you like to do today?`,
        keyboards.mainMenu
      );
    }
    
    // Log user activity
    await AnalyticsService.logActivity(user.telegram_id, 'login');
  } catch (error) {
    console.error('Error in /start command:', error);
    await bot.sendMessage(msg.chat.id, 
      'Sorry, there was an error. Please try again later.'
    );
  }
});

bot.onText(/\/profile/, async (msg) => {
  try {
    const user = await UserService.getUserByTelegramId(msg.from.id);
    if (!user) {
      await bot.sendMessage(msg.chat.id, 'Please start with /start first.');
      return;
    }
    
    await ProfileHandler.showUserProfile(msg.chat.id, user.telegram_id);
  } catch (error) {
    console.error('Error in /profile command:', error);
    await bot.sendMessage(msg.chat.id, 'Error loading profile. Please try again.');
  }
});

bot.onText(/\/browse/, async (msg) => {
  try {
    const user = await UserService.getUserByTelegramId(msg.from.id);
    if (!user) {
      await bot.sendMessage(msg.chat.id, 'Please start with /start first.');
      return;
    }
    
    await BrowsingHandler.startBrowsing(msg.chat.id, user.telegram_id);
  } catch (error) {
    console.error('Error in /browse command:', error);
    await bot.sendMessage(msg.chat.id, 'Error starting browse. Please try again.');
  }
});

bot.onText(/\/matches/, async (msg) => {
  try {
    const user = await UserService.getUserByTelegramId(msg.from.id);
    if (!user) {
      await bot.sendMessage(msg.chat.id, 'Please start with /start first.');
      return;
    }
    
    const matches = await MatchingService.getUserMatches(user.telegram_id);
    
    if (matches.length === 0) {
      await bot.sendMessage(msg.chat.id, 
        'You have no matches yet.\n\n' +
        'Start browsing to find your perfect match!',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '💕 Start Browsing', callback_data: 'browse' }],
              [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
            ]
          }
        }
      );
      return;
    }
    
    let matchText = `💕 Your Matches (${matches.length})\n\n`;
    
    matches.slice(0, 10).forEach((match, index) => {
      const otherUser = match.otherUser;
      matchText += `${index + 1}. ${otherUser.first_name}`;
      if (otherUser.age) matchText += `, ${otherUser.age}`;
      if (match.last_message_at) {
        const lastMessageDate = new Date(match.last_message_at).toLocaleDateString();
        matchText += ` (Last message: ${lastMessageDate})`;
      }
      matchText += '\n';
    });
    
    if (matches.length > 10) {
      matchText += `\n...and ${matches.length - 10} more matches!`;
    }
    
    const keyboard = [];
    matches.slice(0, 5).forEach((match, index) => {
      keyboard.push([{ 
        text: `💬 Chat with ${match.otherUser.first_name}`, 
        callback_data: `chat_${match.otherUser.telegram_id}` 
      }]);
    });
    
    keyboard.push([{ text: '🔙 Main Menu', callback_data: 'main_menu' }]);
    
    await bot.sendMessage(msg.chat.id, matchText, {
      reply_markup: { inline_keyboard: keyboard }
    });
  } catch (error) {
    console.error('Error in /matches command:', error);
    await bot.sendMessage(msg.chat.id, 'Error loading matches. Please try again.');
  }
});

bot.onText(/\/premium/, async (msg) => {
  try {
    const user = await UserService.getUserByTelegramId(msg.from.id);
    if (!user) {
      await bot.sendMessage(msg.chat.id, 'Please start with /start first.');
      return;
    }
    
    const subscription = await SubscriptionService.getUserSubscription(user.telegram_id);
    
    if (subscription) {
      const expiryDate = subscription.expires_at ? 
        new Date(subscription.expires_at).toLocaleDateString() : 'Never';
      
      await bot.sendMessage(msg.chat.id, 
        `💎 Premium Status\n\n` +
        `Plan: ${subscription.plan_type.toUpperCase()}\n` +
        `Status: Active ✅\n` +
        `Expires: ${expiryDate}\n\n` +
        `Enjoy all premium features!`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '💕 Start Browsing', callback_data: 'browse' }],
              [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
            ]
          }
        }
      );
    } else {
      await showPremiumPlans(msg.chat.id);
    }
  } catch (error) {
    console.error('Error in /premium command:', error);
    await bot.sendMessage(msg.chat.id, 'Error loading premium info. Please try again.');
  }
});

bot.onText(/\/verify/, async (msg) => {
  try {
    const user = await UserService.getUserByTelegramId(msg.from.id);
    if (!user) {
      await bot.sendMessage(msg.chat.id, 'Please start with /start first.');
      return;
    }
    
    if (user.is_verified) {
      await bot.sendMessage(msg.chat.id, 
        '✅ Your profile is already verified!\n\n' +
        'Verified profiles get better matches and more trust from other users.',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '💕 Start Browsing', callback_data: 'browse' }],
              [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
            ]
          }
        }
      );
      return;
    }
    
    await bot.sendMessage(msg.chat.id, 
      '✅ Profile Verification\n\n' +
      'Verify your profile to build trust and get better matches!\n\n' +
      '📸 Photo Verification:\n' +
      '• Upload a clear selfie\n' +
      '• Face must be clearly visible\n' +
      '• No filters or editing\n\n' +
      '🎥 Video Verification:\n' +
      '• Record a 5-30 second video\n' +
      '• Say your name and "verifying my profile"\n' +
      '• Look directly at camera\n\n' +
      'Choose your verification method:',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📸 Photo Verification', callback_data: 'start_verification' }],
            [{ text: '🎥 Video Verification', callback_data: 'upload_verification' }],
            [{ text: '📋 View Guidelines', callback_data: 'verification_guidelines' }],
            [{ text: '🔙 Back', callback_data: 'main_menu' }]
          ]
        }
      }
    );
  } catch (error) {
    console.error('Error in /verify command:', error);
    await bot.sendMessage(msg.chat.id, 'Error loading verification. Please try again.');
  }
});

bot.onText(/\/help/, async (msg) => {
  const helpText = `🆘 Help & Support\n\n` +
    `📱 Available Commands:\n` +
    `/start - Start or restart the bot\n` +
    `/profile - View and edit your profile\n` +
    `/browse - Browse potential matches\n` +
    `/matches - View your matches\n` +
    `/premium - Upgrade to premium\n` +
    `/verify - Verify your profile\n` +
    `/help - Show this help message\n\n` +
    `💡 How to use:\n` +
    `1. Complete your profile with photos and info\n` +
    `2. Set your preferences (age, distance, etc.)\n` +
    `3. Start browsing and liking profiles\n` +
    `4. When someone likes you back, it's a match!\n` +
    `5. Start chatting with your matches\n\n` +
    `🔒 Safety Tips:\n` +
    `• Never share personal information early\n` +
    `• Meet in public places for first dates\n` +
    `• Trust your instincts\n` +
    `• Report suspicious behavior\n\n` +
    `📞 Need more help?\n` +
    `Contact our support team: ${botConfig.supportUsername || '@support'}`;
  
  await bot.sendMessage(msg.chat.id, helpText, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
      ]
    }
  });
});

// Admin commands
bot.onText(/\/admin/, async (msg) => {
  await AdminHandler.handleAdminCommand(msg);
});

bot.onText(/\/stats/, async (msg) => {
  await AdminHandler.handleAdminCommand(msg);
});

bot.onText(/\/reports/, async (msg) => {
  await AdminHandler.handleAdminCommand(msg);
});

bot.onText(/\/verifications/, async (msg) => {
  await AdminHandler.handleAdminCommand(msg);
});

bot.onText(/\/ban (.+)/, async (msg, match) => {
  await AdminHandler.handleAdminCommand(msg);
});

bot.onText(/\/unban (.+)/, async (msg, match) => {
  await AdminHandler.handleAdminCommand(msg);
});

bot.onText(/\/suspend (.+)/, async (msg, match) => {
  await AdminHandler.handleAdminCommand(msg);
});

bot.onText(/\/test_user/, async (msg) => {
  await AdminHandler.handleAdminCommand(msg);
});

bot.onText(/\/user (.+)/, async (msg, match) => {
  await AdminHandler.handleAdminCommand(msg);
});

bot.onText(/\/broadcast (.+)/, async (msg, match) => {
  await AdminHandler.handleAdminCommand(msg);
});

// Callback query handler
bot.on('callback_query', async (query) => {
  try {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const data = query.data;
    
    // Get user
    const user = await UserService.getUserByTelegramId(userId);
    
    // Handle different callback types
    if (data === 'main_menu') {
      await bot.editMessageText(
        'What would you like to do?',
        {
          chat_id: chatId,
          message_id: query.message.message_id,
          ...keyboards.mainMenu
        }
      );
    } else if (data === 'start_registration') {
      await RegistrationHandler.startRegistration(chatId, user);
    } else if (data === 'how_it_works') {
      await showHowItWorks(chatId);
    } else if (data === 'profile') {
      await ProfileHandler.showUserProfile(chatId, userId);
    } else if (data === 'browse') {
      await BrowsingHandler.startBrowsing(chatId, userId);
    } else if (data === 'matches') {
      // Trigger matches command
      await bot.sendMessage(chatId, '/matches');
    } else if (data === 'premium') {
      await showPremiumPlans(chatId);
    } else if (data === 'settings') {
      await showSettings(chatId);
    } else if (data === 'help') {
      // Trigger help command
      await bot.sendMessage(chatId, '/help');
    } else if (data.startsWith('gender_')) {
      await RegistrationHandler.handleGenderCallback(query);
    } else if (data.startsWith('looking_')) {
      await RegistrationHandler.handleLookingForCallback(query);
    } else if (data.startsWith('edu_')) {
      await RegistrationHandler.handleEducationCallback(query);
    } else if (data.startsWith('buy_')) {
      await handlePremiumPurchase(query);
    } else if (data.startsWith('swipe_')) {
      await handleSwipeAction(query, user);
    } else if (data.startsWith('browse_')) {
      await handleBrowseAction(query, user);
    } else if (data.startsWith('admin_')) {
      await AdminHandler.handleAdminCallback(chatId, userId, data);
    } else if (data.startsWith('report_')) {
      await handleReportAction(query, user);
    } else if (data.startsWith('chat_')) {
      await handleChatAction(query, user);
    } else if (data === 'continue_browsing') {
      await BrowsingHandler.continueBrowsing(chatId, userId);
    } else if (data === 'browse_reload') {
      await BrowsingHandler.reloadMatches(chatId, userId);
    } else if (data === 'request_location') {
      await BrowsingHandler.requestLocationUpdate(chatId);
    } else if (data === 'update_location') {
      await BrowsingHandler.requestLocationUpdate(chatId);
    } else if (data.startsWith('verification_') || data === 'start_verification' || data === 'upload_verification') {
      await VerificationHandler.handleVerificationCallback(query);
    } else if (data === 'edit_profile') {
      await showEditProfileMenu(chatId);
    } else if (data === 'add_photos') {
      await handleAddPhotos(chatId, userId);
    } else if (data === 'manage_photos') {
      await ProfileHandler.showPhotoManagement(chatId, userId);
    } else if (data.startsWith('delete_photo_')) {
      const photoId = data.split('_')[2];
      await ProfileHandler.deletePhoto(chatId, userId, photoId);
    } else if (data.startsWith('set_primary_')) {
      const photoId = data.split('_')[2];
      await ProfileHandler.setPrimaryPhoto(chatId, userId, photoId);
    } else if (data === 'who_likes_me') {
      await handleWhoLikesMe(chatId, userId);
    } else if (data === 'delete_account') {
      await handleDeleteAccount(query);
    } else if (data === 'settings_preferences') {
      await showPreferencesSettings(chatId, userId);
    } else if (data === 'settings_notifications') {
      await showNotificationSettings(chatId, userId);
    } else if (data === 'settings_privacy') {
      await showPrivacySettings(chatId, userId);
    }
    
    await bot.answerCallbackQuery(query.id);
  } catch (error) {
    console.error('Error handling callback query:', error);
    await bot.answerCallbackQuery(query.id, { text: 'Error processing request' });
  }
});

// Message handler for different states
bot.on('message', async (msg) => {
  try {
    // Skip if it's a command
    if (msg.text && msg.text.startsWith('/')) return;
    
    const user = await UserService.getUserByTelegramId(msg.from.id);
    if (!user) return;
    
    const userState = getUserState(msg.from.id);
    
    // Handle location updates
    if (msg.location) {
      await BrowsingHandler.handleLocationUpdate(msg);
      return;
    }
    
    // Handle registration flow
    if (!user.profile_completed && user.registration_step !== 'completed') {
      await RegistrationHandler.handleRegistration(msg);
      return;
    }
    
    // Handle verification uploads
    if (user.uploading_verification) {
      if (msg.photo) {
        await VerificationHandler.handlePhotoUpload(msg, user);
      } else if (msg.video) {
        await VerificationHandler.handleVideoUpload(msg, user);
      } else {
        await VerificationHandler.handleText(msg, user);
      }
      return;
    }
    
    // Handle photo uploads
    if (user.uploading_photos || (user.registration_step === 'photos' && msg.photo)) {
      await ProfileHandler.handlePhotoUpload(msg, user);
      return;
    }
    
    // Handle state-based interactions
    if (userState) {
      await handleStateBasedMessage(msg, user, userState);
      return;
    }
    
    // Handle regular messages (potential chat messages)
    if (msg.text && !msg.text.startsWith('/')) {
      await handleRegularMessage(msg, user);
    }
  } catch (error) {
    console.error('Error handling message:', error);
    await bot.sendMessage(msg.chat.id, 
      'Sorry, there was an error processing your message. Please try again.'
    );
  }
});

// Helper functions
async function showHowItWorks(chatId) {
  const howItWorksText = `🎯 How It Works\n\n` +
    `1️⃣ **Complete Your Profile**\n` +
    `Add photos, write a bio, and set your preferences\n\n` +
    `2️⃣ **Browse & Like**\n` +
    `Swipe through potential matches in your area\n\n` +
    `3️⃣ **Get Matches**\n` +
    `When someone likes you back, it's a match!\n\n` +
    `4️⃣ **Start Chatting**\n` +
    `Send messages and get to know each other\n\n` +
    `5️⃣ **Meet Safely**\n` +
    `Take it offline when you're ready\n\n` +
    `💎 **Premium Features:**\n` +
    `• Unlimited likes\n` +
    `• See who liked you\n` +
    `• Super likes\n` +
    `• Advanced filters\n` +
    `• Priority matching`;
  
  await bot.sendMessage(chatId, howItWorksText, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🚀 Get Started', callback_data: 'start_registration' }],
        [{ text: '🔙 Back', callback_data: 'main_menu' }]
      ]
    }
  });
}

async function showPremiumPlans(chatId) {
  const plansText = `💎 Premium Plans\n\n` +
    `🥉 **Silver Plan - $19.99/3 months**\n` +
    `• Unlimited likes per day\n` +
    `• See who liked you\n` +
    `• 3 super likes daily\n` +
    `• Message read receipts\n\n` +
    `🥇 **Gold Plan - $59.99/year**\n` +
    `• All Silver features\n` +
    `• Unlimited super likes\n` +
    `• Priority in matching\n` +
    `• Advanced filters\n` +
    `• Rewind last swipe\n` +
    `• 1 free boost per month\n\n` +
    `💎 **Platinum Plan - $199.99/lifetime**\n` +
    `• All Gold features\n` +
    `• Top picks daily\n` +
    `• Message before matching\n` +
    `• Premium badge\n` +
    `• Priority support\n` +
    `• Unlimited boosts`;
  
  await bot.sendMessage(chatId, plansText, keyboards.premiumPlans);
}

async function showSettings(chatId) {
  await bot.sendMessage(chatId, 
    '⚙️ Settings\n\nChoose what you want to configure:',
    keyboards.settingsMenu
  );
}

async function handlePremiumPurchase(query) {
  const planType = query.data.split('_')[1]; // buy_silver -> silver
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  
  const plan = SubscriptionService.subscriptionPlans[planType];
  if (!plan) {
    await bot.sendMessage(chatId, 'Invalid plan selected.');
    return;
  }
  
  const paymentText = `💳 Payment for ${plan.name} Plan\n\n` +
    `Price: $${plan.price}\n` +
    `Duration: ${plan.duration ? `${plan.duration} days` : 'Lifetime'}\n\n` +
    `Choose your payment method:`;
  
  await bot.sendMessage(chatId, paymentText, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '⭐ Telegram Stars', callback_data: `pay_stars_${planType}` }],
        [{ text: '💳 Credit Card', callback_data: `pay_card_${planType}` }],
        [{ text: '₿ Cryptocurrency', callback_data: `pay_crypto_${planType}` }],
        [{ text: '🔙 Back', callback_data: 'premium' }]
      ]
    }
  });
}

async function handleSwipeAction(query, user) {
  const action = query.data.split('_')[1]; // swipe_like -> like
  
  if (action === 'like') {
    await BrowsingHandler.handleLike(query, user);
  } else if (action === 'pass') {
    await BrowsingHandler.handlePass(query, user);
  } else if (action === 'super_like') {
    await BrowsingHandler.handleSuperLike(query, user);
  }
}

async function handleBrowseAction(query, user) {
  const parts = query.data.split('_');
  const action = parts[1]; // browse_photos -> photos
  const targetUserId = parts[2]; // browse_photos_123 -> 123
  
  if (action === 'photos') {
    await BrowsingHandler.showUserPhotos(query.message.chat.id, user.telegram_id, parseInt(targetUserId));
  } else if (action === 'profile') {
    await BrowsingHandler.showProfile(query.message.chat.id, user.telegram_id, parseInt(targetUserId));
  }
}

async function handleReportAction(query, user) {
  const targetUserId = query.data.split('_')[2]; // report_user_123 -> 123
  const chatId = query.message.chat.id;
  
  setUserState(user.telegram_id, 'reporting', { targetUserId: parseInt(targetUserId) });
  
  await bot.sendMessage(chatId, 
    '🚫 Report User\n\n' +
    'Why are you reporting this user?',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🎭 Fake Profile', callback_data: `report_type_fake_profile` }],
          [{ text: '😠 Harassment', callback_data: `report_type_harassment` }],
          [{ text: '🔞 Inappropriate Content', callback_data: `report_type_inappropriate_content` }],
          [{ text: '📧 Spam', callback_data: `report_type_spam` }],
          [{ text: '🔞 Underage', callback_data: `report_type_underage` }],
          [{ text: '❓ Other', callback_data: `report_type_other` }],
          [{ text: '❌ Cancel', callback_data: 'browse' }]
        ]
      }
    }
  );
}

async function handleChatAction(query, user) {
  const targetUserId = query.data.split('_')[1]; // chat_123 -> 123
  const chatId = query.message.chat.id;
  
  // Check if users are matched
  const match = await MessageService.getMatchBetweenUsers(user.telegram_id, parseInt(targetUserId));
  if (!match) {
    await bot.sendMessage(chatId, 'You can only chat with your matches.');
    return;
  }
  
  // Get recent conversation
  const messages = await MessageService.getConversation(user.telegram_id, parseInt(targetUserId), 10);
  
  const targetUser = await UserService.getUserByTelegramId(parseInt(targetUserId));
  
  let chatText = `💬 Chat with ${targetUser.first_name}\n\n`;
  
  if (messages.length === 0) {
    chatText += `No messages yet. Start the conversation!\n\n`;
    chatText += `💡 Tip: Ask about their interests or share something about yourself.`;
  } else {
    chatText += `Recent messages:\n\n`;
    messages.reverse().forEach(msg => {
      const sender = msg.sender_id === user.telegram_id ? 'You' : targetUser.first_name;
      const time = new Date(msg.sent_at).toLocaleTimeString();
      chatText += `${sender} (${time}): ${msg.message_text}\n`;
    });
  }
  
  setUserState(user.telegram_id, 'chatting', { targetUserId: parseInt(targetUserId) });
  
  await bot.sendMessage(chatId, chatText, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📝 Send Message', callback_data: 'send_message' }],
        [{ text: '👤 View Profile', callback_data: `browse_profile_${targetUserId}` }],
        [{ text: '🚫 Block User', callback_data: `block_user_${targetUserId}` }],
        [{ text: '🔙 Back to Matches', callback_data: 'matches' }]
      ]
    }
  });
}

async function showEditProfileMenu(chatId) {
  await bot.sendMessage(chatId, 
    '✏️ Edit Profile\n\n' +
    'What would you like to edit?',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📝 Bio', callback_data: 'edit_bio' }],
          [{ text: '🎯 Interests', callback_data: 'edit_interests' }],
          [{ text: '💼 Profession', callback_data: 'edit_profession' }],
          [{ text: '📏 Height', callback_data: 'edit_height' }],
          [{ text: '🌟 Lifestyle', callback_data: 'edit_lifestyle' }],
          [{ text: '🔙 Back to Profile', callback_data: 'profile' }]
        ]
      }
    }
  );
}

async function handleAddPhotos(chatId, userId) {
  const photos = await UserService.getUserPhotos(userId);
  
  if (photos.length >= 6) {
    await bot.sendMessage(chatId, 
      'You already have the maximum of 6 photos.\n\n' +
      'Delete some photos first if you want to add new ones.',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🗑️ Manage Photos', callback_data: 'manage_photos' }],
            [{ text: '🔙 Back to Profile', callback_data: 'profile' }]
          ]
        }
      }
    );
    return;
  }
  
  await UserService.updateUser(userId, { uploading_photos: true });
  
  await bot.sendMessage(chatId, 
    `📸 Add Photos (${photos.length}/6)\n\n` +
    `${ProfileHandler.getPhotoUploadInstructions()}\n\n` +
    `Send me your photos one by one. Type /done when finished.`
  );
}

async function handleWhoLikesMe(chatId, userId) {
  const isPremium = await SubscriptionService.isUserPremium(userId);
  
  if (!isPremium) {
    await bot.sendMessage(chatId, 
      '💎 Premium Feature\n\n' +
      '"Who Likes Me" is a premium feature!\n\n' +
      'Upgrade to premium to see who liked your profile and get better matches.',
      keyboards.premiumPlans
    );
    return;
  }
  
  const likes = await UserService.getUserLikes(userId);
  
  if (likes.length === 0) {
    await bot.sendMessage(chatId, 
      '💔 No likes yet\n\n' +
      'Keep browsing and improving your profile to get more likes!',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '💕 Start Browsing', callback_data: 'browse' }],
            [{ text: '✏️ Edit Profile', callback_data: 'edit_profile' }],
            [{ text: '🔙 Back', callback_data: 'profile' }]
          ]
        }
      }
    );
    return;
  }
  
  let likesText = `❤️ People who liked you (${likes.length})\n\n`;
  
  likes.slice(0, 10).forEach((like, index) => {
    likesText += `${index + 1}. ${like.first_name}`;
    if (like.age) likesText += `, ${like.age}`;
    likesText += '\n';
  });
  
  if (likes.length > 10) {
    likesText += `\n...and ${likes.length - 10} more!`;
  }
  
  await bot.sendMessage(chatId, likesText, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '💕 Browse Matches', callback_data: 'browse' }],
        [{ text: '🔙 Back to Profile', callback_data: 'profile' }]
      ]
    }
  });
}

async function handleDeleteAccount(query) {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  
  await bot.sendMessage(chatId, 
    '⚠️ Delete Account\n\n' +
    'Are you sure you want to delete your account?\n\n' +
    '❌ This action cannot be undone!\n' +
    '❌ All your data will be permanently deleted\n' +
    '❌ Your matches and messages will be lost\n\n' +
    'Type "DELETE MY ACCOUNT" to confirm, or press Cancel.',
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '❌ Cancel', callback_data: 'profile' }]
        ]
      }
    }
  );
  
  setUserState(userId, 'deleting_account');
}

async function showPreferencesSettings(chatId, userId) {
  const user = await UserService.getUserByTelegramId(userId);
  const preferences = user.user_preferences?.[0] || {};
  
  const prefsText = `🎯 Matching Preferences\n\n` +
    `Age Range: ${preferences.min_age || 18} - ${preferences.max_age || 99}\n` +
    `Distance: ${preferences.max_distance || 50}km\n` +
    `Gender: ${preferences.preferred_gender || 'Any'}\n\n` +
    `What would you like to change?`;
  
  await bot.sendMessage(chatId, prefsText, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🎂 Age Range', callback_data: 'pref_age' }],
        [{ text: '📍 Distance', callback_data: 'pref_distance' }],
        [{ text: '👥 Gender', callback_data: 'pref_gender' }],
        [{ text: '🔙 Back to Settings', callback_data: 'settings' }]
      ]
    }
  });
}

async function showNotificationSettings(chatId, userId) {
  const settings = await UserService.getUserNotificationSettings(userId);
  
  const settingsText = `🔔 Notification Settings\n\n` +
    `New Matches: ${settings.new_matches ? '✅' : '❌'}\n` +
    `New Messages: ${settings.new_messages ? '✅' : '❌'}\n` +
    `Profile Views: ${settings.profile_views ? '✅' : '❌'}\n` +
    `Super Likes: ${settings.super_likes ? '✅' : '❌'}\n\n` +
    `Toggle notifications:`;
  
  await bot.sendMessage(chatId, settingsText, {
    reply_markup: {
      inline_keyboard: [
        [{ text: `${settings.new_matches ? '🔕' : '🔔'} New Matches`, callback_data: 'notif_matches' }],
        [{ text: `${settings.new_messages ? '🔕' : '🔔'} New Messages`, callback_data: 'notif_messages' }],
        [{ text: `${settings.profile_views ? '🔕' : '🔔'} Profile Views`, callback_data: 'notif_views' }],
        [{ text: `${settings.super_likes ? '🔕' : '🔔'} Super Likes`, callback_data: 'notif_super' }],
        [{ text: '🔙 Back to Settings', callback_data: 'settings' }]
      ]
    }
  });
}

async function showPrivacySettings(chatId, userId) {
  const settings = await UserService.getUserPrivacySettings(userId);
  
  const settingsText = `🔒 Privacy Settings\n\n` +
    `Profile Visibility: ${settings.profile_visibility}\n` +
    `Location Privacy: ${settings.location_privacy}\n` +
    `Message Privacy: ${settings.message_privacy}\n\n` +
    `Adjust your privacy:`;
  
  await bot.sendMessage(chatId, settingsText, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '👁️ Profile Visibility', callback_data: 'privacy_profile' }],
        [{ text: '📍 Location Privacy', callback_data: 'privacy_location' }],
        [{ text: '💬 Message Privacy', callback_data: 'privacy_messages' }],
        [{ text: '🔙 Back to Settings', callback_data: 'settings' }]
      ]
    }
  });
}

async function handleStateBasedMessage(msg, user, userState) {
  const chatId = msg.chat.id;
  const state = userState.state;
  
  if (state === 'reporting') {
    // Handle report description
    const description = msg.text?.trim();
    if (!description) {
      await bot.sendMessage(chatId, 'Please provide a description for your report.');
      return;
    }
    
    try {
      await ReportService.createReport(
        user.telegram_id,
        userState.data.targetUserId,
        userState.data.reportType,
        description
      );
      
      clearUserState(user.telegram_id);
      
      await bot.sendMessage(chatId, 
        '✅ Report Submitted\n\n' +
        'Thank you for your report. Our team will review it and take appropriate action.',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '💕 Continue Browsing', callback_data: 'browse' }],
              [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
            ]
          }
        }
      );
    } catch (error) {
      console.error('Error submitting report:', error);
      await bot.sendMessage(chatId, 'Error submitting report. Please try again.');
    }
  } else if (state === 'chatting') {
    // Handle chat message
    const messageText = msg.text?.trim();
    if (!messageText) {
      await bot.sendMessage(chatId, 'Please send a text message.');
      return;
    }
    
    try {
      await MessageService.sendMessage(
        user.telegram_id,
        userState.data.targetUserId,
        messageText
      );
      
      await bot.sendMessage(chatId, 
        '✅ Message sent!',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '💬 Continue Chat', callback_data: `chat_${userState.data.targetUserId}` }],
              [{ text: '👥 Back to Matches', callback_data: 'matches' }]
            ]
          }
        }
      );
      
      // Notify the recipient
      const targetUser = await UserService.getUserByTelegramId(userState.data.targetUserId);
      try {
        await bot.sendMessage(userState.data.targetUserId, 
          `💬 New message from ${user.first_name}!\n\n` +
          `"${messageText}"\n\n` +
          `Reply to continue the conversation.`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '💬 Reply', callback_data: `chat_${user.telegram_id}` }],
                [{ text: '👥 View Matches', callback_data: 'matches' }]
              ]
            }
          }
        );
      } catch (error) {
        console.log('Could not notify recipient');
      }
      
      clearUserState(user.telegram_id);
    } catch (error) {
      console.error('Error sending message:', error);
      await bot.sendMessage(chatId, 'Error sending message. Please try again.');
    }
  } else if (state === 'deleting_account') {
    if (msg.text === 'DELETE MY ACCOUNT') {
      const success = await UserService.deleteUserAccount(user.telegram_id);
      if (success) {
        clearUserState(user.telegram_id);
        await bot.sendMessage(chatId, 
          '✅ Account Deleted\n\n' +
          'Your account has been permanently deleted. Thank you for using our service.\n\n' +
          'You can create a new account anytime by sending /start'
        );
      } else {
        await bot.sendMessage(chatId, 'Error deleting account. Please contact support.');
      }
    } else {
      await bot.sendMessage(chatId, 
        'Account deletion cancelled. Type "DELETE MY ACCOUNT" exactly to confirm deletion.',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '❌ Cancel', callback_data: 'profile' }]
            ]
          }
        }
      );
    }
  } else if (state.startsWith('edit_')) {
    const field = state.split('_')[1];
    const value = msg.text?.trim();
    
    if (!value) {
      await bot.sendMessage(chatId, `Please provide a valid ${field}.`);
      return;
    }
    
    const success = await ProfileHandler.handleValidatedFieldUpdate(chatId, user.telegram_id, field, value);
    if (success) {
      clearUserState(user.telegram_id);
    }
  }
}

async function handleRegularMessage(msg, user) {
  // Handle regular text messages when not in a specific state
  await bot.sendMessage(msg.chat.id, 
    'I didn\'t understand that. Use the menu below or type /help for available commands.',
    keyboards.mainMenu
  );
}

// Scheduled tasks
cron.schedule('0 0 * * *', async () => {
  console.log('🕛 Running daily cleanup tasks...');
  try {
    await SubscriptionService.checkExpiredSubscriptions();
    await ReportService.checkSuspensions();
    await BrowsingHandler.cleanupDailyLikes();
    console.log('✅ Daily cleanup completed');
  } catch (error) {
    console.error('❌ Daily cleanup failed:', error);
  }
});

cron.schedule('0 2 * * 0', async () => {
  console.log('🕛 Running weekly cleanup tasks...');
  try {
    await MessageService.archiveOldMessages();
    await MessageService.cleanupFreeUserMessages();
    console.log('✅ Weekly cleanup completed');
  } catch (error) {
    console.error('❌ Weekly cleanup failed:', error);
  }
});

// Error handlers
bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});

bot.on('webhook_error', (error) => {
  console.error('Webhook error:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Initialize bot
async function initializeBot() {
  try {
    console.log('🤖 Starting Telegram Dating Bot...');
    
    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
      throw new Error('Database connection failed');
    }
    
    // Setup webhook or polling
    if (process.env.NODE_ENV === 'production') {
      await setupWebhook();
      const port = process.env.PORT || 3000;
      app.listen(port, () => {
        console.log(`🚀 Bot server running on port ${port}`);
        console.log('✅ Webhook mode enabled');
      });
    } else {
      console.log('✅ Polling mode enabled');
    }
    
    console.log('✅ Bot initialized successfully');
    
    // Send startup notification to admin
    if (botConfig.adminUserId) {
      try {
        await bot.sendMessage(botConfig.adminUserId, 
          '🤖 Bot Started\n\n' +
          `Environment: ${process.env.NODE_ENV || 'development'}\n` +
          `Time: ${new Date().toLocaleString()}\n` +
          `Status: ✅ Online`
        );
      } catch (error) {
        console.log('Could not send startup notification to admin');
      }
    }
  } catch (error) {
    console.error('❌ Failed to initialize bot:', error);
    process.exit(1);
  }
}

// Start the bot
initializeBot();

export { bot, app };