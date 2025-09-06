// keyboards.js - Telegram keyboard configurations

export const keyboards = {
  mainMenu: {
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
  },

  profileActions: {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✏️ Edit Profile', callback_data: 'edit_profile' },
          { text: '📸 Add Photos', callback_data: 'add_photos' }
        ],
        [
          { text: '❤️ Who Likes Me', callback_data: 'who_likes_me' },
          { text: '✅ Verify Profile', callback_data: 'start_verification' }
        ],
        [
          { text: '🗑️ Delete Account', callback_data: 'delete_account' },
          { text: '🔙 Main Menu', callback_data: 'main_menu' }
        ]
      ]
    }
  },

  premiumPlans: {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🥉 Silver - $19.99', callback_data: 'buy_silver' }
        ],
        [
          { text: '🥇 Gold - $59.99', callback_data: 'buy_gold' }
        ],
        [
          { text: '💎 Platinum - $199.99', callback_data: 'buy_platinum' }
        ],
        [
          { text: '🔙 Back', callback_data: 'main_menu' }
        ]
      ]
    }
  },

  browsingActions: {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '❌ Pass', callback_data: 'swipe_pass' },
          { text: '💕 Like', callback_data: 'swipe_like' },
          { text: '⭐ Super Like', callback_data: 'swipe_super_like' }
        ],
        [
          { text: '📸 View Photos', callback_data: 'view_photos' },
          { text: '📋 Full Profile', callback_data: 'view_full_profile' }
        ],
        [
          { text: '🚫 Report', callback_data: 'report_user' },
          { text: '🔙 Menu', callback_data: 'main_menu' }
        ]
      ]
    }
  },

  settingsMenu: {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🎯 Matching Preferences', callback_data: 'settings_preferences' }
        ],
        [
          { text: '🔔 Notifications', callback_data: 'settings_notifications' }
        ],
        [
          { text: '🔒 Privacy', callback_data: 'settings_privacy' }
        ],
        [
          { text: '📍 Update Location', callback_data: 'update_location' }
        ],
        [
          { text: '🔙 Back', callback_data: 'main_menu' }
        ]
      ]
    }
  }
};

// Bot configuration
export const botConfig = {
  channelUsername: process.env.CHANNEL_USERNAME || null,
  channelPromotionFrequency: 5, // Show promotion every 5 profiles
  adminUserId: parseInt(process.env.ADMIN_USER_ID) || null,
  supportUsername: process.env.SUPPORT_USERNAME || null,
  maxPhotosPerUser: 6,
  maxDailyLikesForFree: 20,
  verificationRequired: false
};