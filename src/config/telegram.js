import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';

dotenv.config();

const token = process.env.BOT_TOKEN;
const webhookUrl = process.env.WEBHOOK_URL;

if (!token) {
  throw new Error('BOT_TOKEN is required');
}

// Create bot instance
export const bot = new TelegramBot(token, { polling: false });

// Webhook setup for production
export async function setupWebhook() {
  try {
    if (process.env.NODE_ENV === 'production' && webhookUrl) {
      await bot.setWebHook(`${webhookUrl}/webhook`);
      console.log('✅ Webhook set successfully');
    } else {
      // Use polling for development
      bot.startPolling();
      console.log('✅ Bot started with polling');
    }
  } catch (error) {
    console.error('❌ Webhook setup failed:', error.message);
  }
}

// Bot configuration
export const botConfig = {
  adminUserId: parseInt(process.env.ADMIN_USER_ID),
  channelUsername: process.env.CHANNEL_USERNAME || '@YourChannel',
  channelPromotionFrequency: parseInt(process.env.CHANNEL_PROMOTION_FREQUENCY) || 10
};

// Inline keyboards
export const keyboards = {
  mainMenu: {
    reply_markup: {
      inline_keyboard: [
        [{ text: '👤 My Profile', callback_data: 'profile' }],
        [{ text: '💕 Browse Matches', callback_data: 'browse' }],
        [{ text: '💬 My Matches', callback_data: 'matches' }],
        [{ text: '💎 Premium', callback_data: 'premium' }],
        [{ text: '⚙️ Settings', callback_data: 'settings' }]
      ]
    }
  },
  
  premiumPlans: {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🥉 Silver - $19.99/3mo', callback_data: 'buy_silver' }],
        [{ text: '🥇 Gold - $59.99/year', callback_data: 'buy_gold' }],
        [{ text: '💎 Platinum - $199.99/lifetime', callback_data: 'buy_platinum' }],
        [{ text: '🔙 Back', callback_data: 'main_menu' }]
      ]
    }
  },
  
  profileActions: {
    reply_markup: {
      inline_keyboard: [
        [{ text: '✏️ Edit Profile', callback_data: 'edit_profile' }],
        [{ text: '📸 Add Photos', callback_data: 'add_photos' }],
        [{ text: '✅ Verify Profile', callback_data: 'verify_profile' }],
        [{ text: '🔙 Back', callback_data: 'main_menu' }]
      ]
    }
  },
  
  browsingActions: {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '❌ Pass', callback_data: 'pass' },
          { text: '💕 Like', callback_data: 'like' },
          { text: '⭐ Super Like', callback_data: 'super_like' }
        ],
        [{ text: '🔙 Back to Menu', callback_data: 'main_menu' }]
      ]
    }
  }
};