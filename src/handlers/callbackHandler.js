import { UserService } from '../services/userService.js';
import { RegistrationHandler } from './registrationHandler.js';
import { ProfileHandler } from './profileHandler.js';
import { BrowsingHandler } from './browsingHandler.js';
import { VerificationHandler } from './verificationHandler.js';
import { AdminHandler } from './adminHandler.js';
import { SubscriptionService } from '../services/subscriptionService.js';
import { PaymentService } from '../services/paymentService.js';
import { ReportService } from '../services/reportService.js';
import { MessageService } from '../services/messageService.js';
import { bot } from '../config/telegram.js';

export class CallbackHandler {
  static async handleCallback(query) {
    try {
      const chatId = query.message.chat.id;
      const userId = query.from.id;
      const data = query.data;
      
      // Get user
      const user = await UserService.getUserByTelegramId(userId);
      
      // Route callbacks to appropriate handlers
      if (data.startsWith('admin_')) {
        await AdminHandler.handleAdminCallback(chatId, userId, data);
      } else if (data.startsWith('gender_') || data.startsWith('looking_') || data.startsWith('edu_')) {
        await this.handleRegistrationCallbacks(query, data);
      } else if (data.startsWith('swipe_')) {
        await this.handleSwipeCallbacks(query, user, data);
      } else if (data.startsWith('browse_')) {
        await this.handleBrowseCallbacks(query, user, data);
      } else if (data.startsWith('report_')) {
        await this.handleReportCallbacks(query, user, data);
      } else if (data.startsWith('chat_')) {
        await this.handleChatCallbacks(query, user, data);
      } else if (data.startsWith('pay_')) {
        await this.handlePaymentCallbacks(query, user, data);
      } else if (data.startsWith('verification_') || data === 'start_verification' || data === 'upload_verification') {
        await VerificationHandler.handleVerificationCallback(query);
      } else if (data.startsWith('edit_')) {
        await this.handleEditCallbacks(query, user, data);
      } else if (data.startsWith('pref_') || data.startsWith('notif_') || data.startsWith('privacy_')) {
        await this.handleSettingsCallbacks(query, user, data);
      } else {
        await this.handleGeneralCallbacks(query, user, data);
      }
      
      await bot.answerCallbackQuery(query.id);
    } catch (error) {
      console.error('Error handling callback query:', error);
      await bot.answerCallbackQuery(query.id, { text: 'Error processing request' });
    }
  }

  static async handleRegistrationCallbacks(query, data) {
    if (data.startsWith('gender_')) {
      await RegistrationHandler.handleGenderCallback(query);
    } else if (data.startsWith('looking_')) {
      await RegistrationHandler.handleLookingForCallback(query);
    } else if (data.startsWith('edu_')) {
      await RegistrationHandler.handleEducationCallback(query);
    }
  }

  static async handleSwipeCallbacks(query, user, data) {
    const action = data.split('_')[1];
    
    if (action === 'like') {
      await BrowsingHandler.handleLike(query, user);
    } else if (action === 'pass') {
      await BrowsingHandler.handlePass(query, user);
    } else if (action === 'super_like') {
      await BrowsingHandler.handleSuperLike(query, user);
    }
  }

  static async handleBrowseCallbacks(query, user, data) {
    const parts = data.split('_');
    const action = parts[1];
    const targetUserId = parts[2];
    
    if (action === 'photos') {
      await BrowsingHandler.showUserPhotos(query.message.chat.id, user.telegram_id, parseInt(targetUserId));
    } else if (action === 'profile') {
      await BrowsingHandler.showProfile(query.message.chat.id, user.telegram_id, parseInt(targetUserId));
    }
  }

  static async handleReportCallbacks(query, user, data) {
    const chatId = query.message.chat.id;
    
    if (data.startsWith('report_user_')) {
      const targetUserId = data.split('_')[2];
      await this.startReportProcess(chatId, user.telegram_id, parseInt(targetUserId));
    } else if (data.startsWith('report_type_')) {
      const reportType = data.split('_')[2];
      await this.handleReportType(query, user, reportType);
    }
  }

  static async handleChatCallbacks(query, user, data) {
    const targetUserId = data.split('_')[1];
    await this.startChatWithUser(query.message.chat.id, user, parseInt(targetUserId));
  }

  static async handlePaymentCallbacks(query, user, data) {
    const parts = data.split('_');
    const method = parts[1]; // pay_stars_silver -> stars
    const planType = parts[2]; // pay_stars_silver -> silver
    
    await this.processPayment(query.message.chat.id, user.telegram_id, method, planType);
  }

  static async handleEditCallbacks(query, user, data) {
    const field = data.split('_')[1];
    const chatId = query.message.chat.id;
    
    await this.startFieldEdit(chatId, user.telegram_id, field);
  }

  static async handleSettingsCallbacks(query, user, data) {
    const chatId = query.message.chat.id;
    
    if (data.startsWith('pref_')) {
      await this.handlePreferenceSettings(chatId, user.telegram_id, data);
    } else if (data.startsWith('notif_')) {
      await this.handleNotificationSettings(chatId, user.telegram_id, data);
    } else if (data.startsWith('privacy_')) {
      await this.handlePrivacySettings(chatId, user.telegram_id, data);
    }
  }

  static async handleGeneralCallbacks(query, user, data) {
    const chatId = query.message.chat.id;
    const userId = user.telegram_id;
    
    switch (data) {
      case 'main_menu':
        await this.showMainMenu(chatId);
        break;
      case 'profile':
        await ProfileHandler.showUserProfile(chatId, userId);
        break;
      case 'browse':
        await BrowsingHandler.startBrowsing(chatId, userId);
        break;
      case 'matches':
        await this.showMatches(chatId, userId);
        break;
      case 'premium':
        await this.showPremiumPlans(chatId);
        break;
      case 'settings':
        await this.showSettings(chatId);
        break;
      case 'help':
        await this.showHelp(chatId);
        break;
      case 'add_photos':
        await this.handleAddPhotos(chatId, userId);
        break;
      case 'manage_photos':
        await ProfileHandler.showPhotoManagement(chatId, userId);
        break;
      case 'who_likes_me':
        await this.handleWhoLikesMe(chatId, userId);
        break;
      case 'delete_account':
        await this.handleDeleteAccount(chatId, userId);
        break;
      case 'continue_browsing':
        await BrowsingHandler.continueBrowsing(chatId, userId);
        break;
      case 'browse_reload':
        await BrowsingHandler.reloadMatches(chatId, userId);
        break;
      case 'request_location':
      case 'update_location':
        await BrowsingHandler.requestLocationUpdate(chatId);
        break;
      default:
        if (data.startsWith('delete_photo_')) {
          const photoId = data.split('_')[2];
          await ProfileHandler.deletePhoto(chatId, userId, photoId);
        } else if (data.startsWith('set_primary_')) {
          const photoId = data.split('_')[2];
          await ProfileHandler.setPrimaryPhoto(chatId, userId, photoId);
        }
        break;
    }
  }

  // Helper methods
  static async showMainMenu(chatId) {
    await bot.editMessageText(
      'What would you like to do?',
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        reply_markup: {
          inline_keyboard: [
            [
              { text: '👤 My Profile', callback_data: 'profile' },
              { text: '💕 Browse Matches', callback_data: 'browse' }
            ],
            [
              { text: '👥 My Matches', callback_data: 'matches' },
              { text: '💎 Premium', callback_data: 'premium' }
            ],
            [
              { text: '⚙️ Settings', callback_data: 'settings' },
              { text: '🆘 Help', callback_data: 'help' }
            ]
          ]
        }
      }
    );
  }

  static async startReportProcess(chatId, reporterId, targetUserId) {
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

  static async handleReportType(query, user, reportType) {
    // Set user state for report description
    // This would be handled in the main bot file's state management
    await bot.sendMessage(query.message.chat.id, 
      'Please provide a brief description of the issue:'
    );
  }

  static async startChatWithUser(chatId, user, targetUserId) {
    // Check if users are matched
    const match = await MessageService.getMatchBetweenUsers(user.telegram_id, targetUserId);
    if (!match) {
      await bot.sendMessage(chatId, 'You can only chat with your matches.');
      return;
    }
    
    // Get recent conversation
    const messages = await MessageService.getConversation(user.telegram_id, targetUserId, 10);
    const targetUser = await UserService.getUserByTelegramId(targetUserId);
    
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

  static async processPayment(chatId, userId, method, planType) {
    const plan = SubscriptionService.subscriptionPlans[planType];
    if (!plan) {
      await bot.sendMessage(chatId, 'Invalid plan selected.');
      return;
    }
    
    if (method === 'stars') {
      // Handle Telegram Stars payment
      const starsAmount = Math.round(plan.price * 50); // 1 USD ≈ 50 stars
      
      await bot.sendInvoice(chatId, {
        title: `${plan.name} Plan`,
        description: `Premium dating features for ${plan.duration ? `${plan.duration} days` : 'lifetime'}`,
        payload: `premium_${planType}_${userId}`,
        provider_token: '', // Empty for Telegram Stars
        currency: 'XTR',
        prices: [{ label: plan.name, amount: starsAmount }]
      });
    } else if (method === 'card') {
      // Handle credit card payment via PayStack
      try {
        const user = await UserService.getUserByTelegramId(userId);
        const email = `${user.username || user.telegram_id}@telegram.user`;
        
        const paymentData = await PaymentService.initializePayStackPayment(userId, planType, email);
        
        await bot.sendMessage(chatId, 
          `💳 Credit Card Payment\n\n` +
          `Plan: ${plan.name}\n` +
          `Price: $${plan.price}\n\n` +
          `Click the link below to complete your payment:`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '💳 Pay Now', url: paymentData.authorization_url }],
                [{ text: '🔙 Back', callback_data: 'premium' }]
              ]
            }
          }
        );
      } catch (error) {
        console.error('Error initializing PayStack payment:', error);
        await bot.sendMessage(chatId, 'Error setting up payment. Please try again.');
      }
    } else if (method === 'crypto') {
      // Handle crypto payment via NOWPayments
      try {
        const paymentData = await PaymentService.initializeNOWPayment(userId, planType);
        
        await bot.sendMessage(chatId, 
          `₿ Cryptocurrency Payment\n\n` +
          `Plan: ${plan.name}\n` +
          `Price: $${plan.price}\n\n` +
          `Click the link below to pay with crypto:`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '₿ Pay with Crypto', url: paymentData.payment_url }],
                [{ text: '🔙 Back', callback_data: 'premium' }]
              ]
            }
          }
        );
      } catch (error) {
        console.error('Error initializing NOWPayments payment:', error);
        await bot.sendMessage(chatId, 'Error setting up crypto payment. Please try again.');
      }
    }
  }

  static async startFieldEdit(chatId, userId, field) {
    const fieldNames = {
      bio: 'Bio',
      interests: 'Interests',
      profession: 'Profession',
      height: 'Height',
      lifestyle: 'Lifestyle'
    };
    
    const fieldName = fieldNames[field] || field;
    
    await bot.sendMessage(chatId, 
      `✏️ Edit ${fieldName}\n\n` +
      `Please enter your new ${fieldName.toLowerCase()}:`
    );
    
    // Set user state for editing - this would be handled in main bot file
  }

  static async handlePreferenceSettings(chatId, userId, data) {
    const setting = data.split('_')[1]; // pref_age -> age
    
    if (setting === 'age') {
      await bot.sendMessage(chatId, 
        '🎂 Age Range\n\n' +
        'Enter your preferred age range (e.g., 25-35):'
      );
    } else if (setting === 'distance') {
      await bot.sendMessage(chatId, 
        '📍 Distance\n\n' +
        'Enter maximum distance in kilometers (e.g., 50):'
      );
    } else if (setting === 'gender') {
      await bot.sendMessage(chatId, 
        '👥 Gender Preference\n\n' +
        'Who are you interested in?',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '👨 Men', callback_data: 'set_pref_male' }],
              [{ text: '👩 Women', callback_data: 'set_pref_female' }],
              [{ text: '👥 Everyone', callback_data: 'set_pref_all' }],
              [{ text: '🔙 Back', callback_data: 'settings_preferences' }]
            ]
          }
        }
      );
    }
  }

  static async handleNotificationSettings(chatId, userId, data) {
    const setting = data.split('_')[1]; // notif_matches -> matches
    
    const currentSettings = await UserService.getUserNotificationSettings(userId);
    const newSettings = { ...currentSettings };
    
    if (setting === 'matches') {
      newSettings.new_matches = !currentSettings.new_matches;
    } else if (setting === 'messages') {
      newSettings.new_messages = !currentSettings.new_messages;
    } else if (setting === 'views') {
      newSettings.profile_views = !currentSettings.profile_views;
    } else if (setting === 'super') {
      newSettings.super_likes = !currentSettings.super_likes;
    }
    
    await UserService.updateNotificationSettings(userId, newSettings);
    
    await bot.sendMessage(chatId, 
      `✅ Notification setting updated!`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔙 Back to Notifications', callback_data: 'settings_notifications' }]
          ]
        }
      }
    );
  }

  static async handlePrivacySettings(chatId, userId, data) {
    const setting = data.split('_')[1]; // privacy_profile -> profile
    
    if (setting === 'profile') {
      await bot.sendMessage(chatId, 
        '👁️ Profile Visibility\n\n' +
        'Who can see your profile?',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🌍 Everyone', callback_data: 'set_visibility_public' }],
              [{ text: '🔒 Private', callback_data: 'set_visibility_private' }],
              [{ text: '💎 Premium Only', callback_data: 'set_visibility_premium' }],
              [{ text: '🔙 Back', callback_data: 'settings_privacy' }]
            ]
          }
        }
      );
    } else if (setting === 'location') {
      await bot.sendMessage(chatId, 
        '📍 Location Privacy\n\n' +
        'How should your location be shown?',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '📍 Exact Location', callback_data: 'set_location_exact' }],
              [{ text: '📍 Approximate', callback_data: 'set_location_approximate' }],
              [{ text: '🏙️ City Only', callback_data: 'set_location_city' }],
              [{ text: '🔒 Hidden', callback_data: 'set_location_hidden' }],
              [{ text: '🔙 Back', callback_data: 'settings_privacy' }]
            ]
          }
        }
      );
    } else if (setting === 'messages') {
      await bot.sendMessage(chatId, 
        '💬 Message Privacy\n\n' +
        'Who can message you?',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '👥 Everyone', callback_data: 'set_messages_everyone' }],
              [{ text: '💕 Matches Only', callback_data: 'set_messages_matches' }],
              [{ text: '💎 Premium Only', callback_data: 'set_messages_premium' }],
              [{ text: '🔙 Back', callback_data: 'settings_privacy' }]
            ]
          }
        }
      );
    }
  }
}