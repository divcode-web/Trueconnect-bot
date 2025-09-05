import { MatchingService } from '../services/matchingService.js';
import { UserService } from '../services/userService.js';
import { SubscriptionService } from '../services/subscriptionService.js';
import { BrowsingService } from '../services/browsingService.js';
import { bot, keyboards, botConfig } from '../config/telegram.js';

export class BrowsingHandler {
  static userBrowsingState = new Map();

  static async startBrowsing(chatId, userId) {
    try {
      const user = await UserService.getUserByTelegramId(userId);
      if (!user || !user.profile_completed) {
        await bot.sendMessage(chatId, 
          'Please complete your profile first before browsing matches.',
          keyboards.profileActions
        );
        return;
      }

      // Check if user has location
      if (!user.latitude || !user.longitude) {
        await bot.sendMessage(chatId, 
          'Please update your location to find matches nearby.',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '📍 Update Location', callback_data: 'update_location' }],
                [{ text: '🔙 Back', callback_data: 'main_menu' }]
              ]
            }
          }
        );
        return;
      }

      const matches = await MatchingService.findPotentialMatches(userId, 20);
      
      if (matches.length === 0) {
        await bot.sendMessage(chatId, 
          'No more matches found in your area. Try expanding your search radius or check back later!',
          keyboards.mainMenu
        );
        return;
      }

      // Initialize browsing state
      this.userBrowsingState.set(userId, {
        matches: matches,
        currentIndex: 0,
        channelPromptCounter: 0
      });

      await this.showNextMatch(chatId, userId);
    } catch (error) {
      console.error('Error starting browsing:', error);
      await bot.sendMessage(chatId, 
        'Sorry, there was an error loading matches. Please try again later.',
        keyboards.mainMenu
      );
    }
  }

  static async showNextMatch(chatId, userId) {
    const state = this.userBrowsingState.get(userId);
    if (!state || state.currentIndex >= state.matches.length) {
      await bot.sendMessage(chatId, 
        'You\'ve seen all available matches! Check back later for more.',
        keyboards.mainMenu
      );
      this.userBrowsingState.delete(userId);
      return;
    }

    const match = state.matches[state.currentIndex];
    
    // Check for channel promotion
    state.channelPromptCounter++;
    if (state.channelPromptCounter % botConfig.channelPromotionFrequency === 0) {
      await this.showChannelPromotion(chatId, userId);
      return;
    }

    await this.displayProfile(chatId, match);
  }

  static async displayProfile(chatId, profile) {
    try {
      const photos = await UserService.getUserPhotos(profile.telegram_id);
      const primaryPhoto = photos.find(p => p.is_primary) || photos[0];

      let profileText = `${profile.first_name}, ${profile.age}\n`;
      profileText += `📍 ${this.formatDistance(profile.distance)}km away\n\n`;
      
      if (profile.bio) {
        profileText += `${profile.bio}\n\n`;
      }

      if (profile.profession) {
        profileText += `💼 ${profile.profession}\n`;
      }

      if (profile.education) {
        profileText += `🎓 ${profile.education.replace('_', ' ')}\n`;
      }

      if (profile.height) {
        profileText += `📏 ${profile.height}\n`;
      }

      if (profile.interests) {
        profileText += `💫 ${profile.interests}\n`;
      }

      if (profile.is_verified) {
        profileText += `\n✅ Verified Profile`;
      }

      if (profile.compatibility_score) {
        profileText += `\n💕 ${profile.compatibility_score}% Match`;
      }

      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '❌ Pass', callback_data: 'swipe_pass' },
              { text: '💕 Like', callback_data: 'swipe_like' },
              { text: '⭐ Super Like', callback_data: 'swipe_super_like' }
            ],
            [
              { text: '📸 More Photos', callback_data: `photos_${profile.telegram_id}` },
              { text: '🚫 Report', callback_data: `report_${profile.telegram_id}` }
            ],
            [{ text: '🔙 Back to Menu', callback_data: 'main_menu' }]
          ]
        }
      };

      if (primaryPhoto) {
        await bot.sendPhoto(chatId, primaryPhoto.file_id, {
          caption: profileText,
          ...keyboard
        });
      } else {
        await bot.sendMessage(chatId, profileText, keyboard);
      }
    } catch (error) {
      console.error('Error displaying profile:', error);
      await bot.sendMessage(chatId, 
        'Error loading profile. Skipping to next match...'
      );
      await this.handleSwipe(chatId, userId, 'pass');
    }
  }

  static async showChannelPromotion(chatId, userId) {
    const promotionMessages = [
      `💡 Pro tip: Subscribe to ${botConfig.channelUsername} for dating advice and success stories!`,
      `🌟 Join ${botConfig.channelUsername} for exclusive dating tips!`,
      `💕 Get more matches! Follow ${botConfig.channelUsername} for premium dating strategies!`
    ];

    const randomMessage = promotionMessages[Math.floor(Math.random() * promotionMessages.length)];

    await bot.sendMessage(chatId, randomMessage, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📢 Subscribe Now', url: `https://t.me/${botConfig.channelUsername.replace('@', '')}` }],
          [{ text: '➡️ Continue Browsing', callback_data: 'continue_browsing' }]
        ]
      }
    });
  }

  static async handleSwipe(chatId, userId, action) {
    try {
      const state = this.userBrowsingState.get(userId);
      if (!state) {
        await this.startBrowsing(chatId, userId);
        return;
      }

      const currentMatch = state.matches[state.currentIndex];
      
      // Check subscription limits for free users
      if (action === 'super_like') {
        const isPremium = await SubscriptionService.isUserPremium(userId);
        if (!isPremium) {
          await bot.sendMessage(chatId, 
            '⭐ Super Likes are a premium feature!\n\n' +
            'Upgrade to premium to send unlimited super likes and get better matches.',
            keyboards.premiumPlans
          );
          return;
        }
      }

      // Record the swipe
      const result = await MatchingService.recordSwipe(userId, currentMatch.telegram_id, action);
      
      if (result.match) {
        await this.handleNewMatch(chatId, userId, currentMatch, result.match);
      } else if (action === 'like' || action === 'super_like') {
        const messages = [
          '💕 Like sent!',
          '⭐ Super like sent! They\'ll know you\'re really interested!',
          '👍 Nice choice!'
        ];
        await bot.sendMessage(chatId, 
          action === 'super_like' ? messages[1] : messages[0]
        );
      }

      // Move to next match
      state.currentIndex++;
      await this.showNextMatch(chatId, userId);

    } catch (error) {
      console.error('Error handling swipe:', error);
      await bot.sendMessage(chatId, 
        'Error processing your action. Please try again.'
      );
    }
  }

  static async handleNewMatch(chatId, userId, matchedUser, matchRecord) {
    await bot.sendMessage(chatId, 
      `🎉 It's a Match!\n\n` +
      `You and ${matchedUser.first_name} liked each other!\n` +
      `Start chatting now and get to know each other better.`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '💬 Start Chatting', callback_data: `chat_${matchedUser.telegram_id}` }],
            [{ text: '➡️ Continue Browsing', callback_data: 'continue_browsing' }],
            [{ text: '👥 View All Matches', callback_data: 'matches' }]
          ]
        }
      }
    );

    // Notify the other user
    try {
      await bot.sendMessage(matchedUser.telegram_id, 
        `🎉 New Match!\n\n` +
        `You have a new match! Start chatting and see where it goes.`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '💬 Start Chatting', callback_data: `chat_${userId}` }],
              [{ text: '👥 View All Matches', callback_data: 'matches' }]
            ]
          }
        }
      );
    } catch (error) {
      console.error('Error notifying matched user:', error);
    }
  }

  static async showUserPhotos(chatId, userId, targetUserId) {
    try {
      const photos = await UserService.getUserPhotos(targetUserId);
      
      if (photos.length <= 1) {
        await bot.sendMessage(chatId, 'This user has only one photo.');
        return;
      }

      for (let i = 1; i < photos.length; i++) {
        await bot.sendPhoto(chatId, photos[i].file_id, {
          caption: `Photo ${i + 1} of ${photos.length}`
        });
      }

      await bot.sendMessage(chatId, 'Back to profile:', keyboards.browsingActions);
    } catch (error) {
      console.error('Error showing user photos:', error);
      await bot.sendMessage(chatId, 'Error loading photos.');
    }
  }

  static formatDistance(distance) {
    return Math.round(distance * 10) / 10; // Round to 1 decimal place
  }

  static async continueBrowsing(chatId, userId) {
    await this.showNextMatch(chatId, userId);
  }

  static async updateLocation(chatId, userId) {
    await bot.sendMessage(chatId, 
      'Please share your current location:',
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
  }

  // Browse matches
  static async handleBrowseMatches(msg, user) {
    const matches = await BrowsingService.browseMatches(user.telegram_id);
    if (!matches || matches.length === 0) {
      await bot.sendMessage(msg.chat.id, 'No matches found. Try updating your preferences!');
    } else {
      const matchList = matches.map(m => `• ${m.first_name} (@${m.username})`).join('\n');
      await bot.sendMessage(msg.chat.id, `Browse matches:\n${matchList}`);
    }
  }

  static async handleLocationUpdate(msg) {
    const userId = msg.from.id;
    const lat = msg.location.latitude;
    const lon = msg.location.longitude;
    await BrowsingService.updateLocation(userId, lat, lon);
    await bot.sendMessage(msg.chat.id, '✅ Location updated!');
  }
}