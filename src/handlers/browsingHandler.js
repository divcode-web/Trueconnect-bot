import { MatchingService } from '../services/matchingService.js';
import { UserService } from '../services/userService.js';
import { SubscriptionService } from '../services/subscriptionService.js';
import { BrowsingService } from '../services/browsingService.js';
import { VerificationService } from '../services/verificationService.js';
import { ReportService } from '../services/reportService.js';
import { bot, keyboards, botConfig } from '../config/telegram.js';

export class BrowsingHandler {
  static userBrowsingState = new Map();
  static dailyLikes = new Map(); // Track daily likes for free users

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

      // Check daily like limit for free users
      const isPremium = await SubscriptionService.isUserPremium(userId);
      if (!isPremium) {
        const todayLikes = this.getTodayLikes(userId);
        if (todayLikes >= 20) { // Free users get 20 likes per day
          await bot.sendMessage(chatId, 
            '💔 Daily Like Limit Reached\n\n' +
            'You\'ve used all your likes for today! Upgrade to premium for unlimited likes.',
            keyboards.premiumPlans
          );
          return;
        }
      }

      const matches = await MatchingService.findPotentialMatches(userId, 20);
      
      if (matches.length === 0) {
        await bot.sendMessage(chatId, 
          'No more matches found in your area. Try expanding your search radius or check back later!',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '⚙️ Update Preferences', callback_data: 'settings_preferences' }],
                [{ text: '🔙 Main Menu', callback_data: 'main_menu' }]
              ]
            }
          }
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
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔄 Load More', callback_data: 'browse_reload' }],
              [{ text: '🔙 Main Menu', callback_data: 'main_menu' }]
            ]
          }
        }
      );
      this.userBrowsingState.delete(userId);
      return;
    }

    const match = state.matches[state.currentIndex];
    
    // Check for channel promotion
    state.channelPromptCounter++;
    if (botConfig.channelPromotionFrequency && state.channelPromptCounter % botConfig.channelPromotionFrequency === 0) {
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
        profileText += `🎓 ${this.formatEducation(profile.education)}\n`;
      }

      if (profile.height) {
        profileText += `📏 ${profile.height}\n`;
      }

      if (profile.interests) {
        profileText += `🎯 ${profile.interests}\n`;
      }

      if (profile.lifestyle) {
        profileText += `🌟 ${profile.lifestyle}\n`;
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
              { text: '❌', callback_data: 'swipe_pass' },
              { text: '💕', callback_data: 'swipe_like' },
              { text: '⭐', callback_data: 'swipe_super_like' }
            ],
            [
              { text: '📸 Photos', callback_data: `browse_photos_${profile.telegram_id}` },
              { text: '📋 Full Profile', callback_data: `browse_profile_${profile.telegram_id}` }
            ],
            [
              { text: '🚫 Report', callback_data: `report_user_${profile.telegram_id}` },
              { text: '🔙 Menu', callback_data: 'main_menu' }
            ]
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
      await this.handleSwipe(chatId, null, 'pass');
    }
  }

  static async showChannelPromotion(chatId, userId) {
    if (!botConfig.channelUsername) {
      // Skip promotion if no channel configured
      await this.showNextMatch(chatId, userId);
      return;
    }

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

  // Fixed: Callback handlers for browsing actions
  static async handleLike(query, user) {
    await this.handleSwipe(query.message.chat.id, user.telegram_id, 'like');
    await bot.answerCallbackQuery(query.id, { text: '💕 Liked!' });
  }

  static async handlePass(query, user) {
    await this.handleSwipe(query.message.chat.id, user.telegram_id, 'pass');
    await bot.answerCallbackQuery(query.id, { text: '👋 Passed' });
  }

  static async handleSuperLike(query, user) {
    const isPremium = await SubscriptionService.isUserPremium(user.telegram_id);
    if (!isPremium) {
      await bot.answerCallbackQuery(query.id, { text: '⭐ Premium feature!' });
      await bot.sendMessage(query.message.chat.id, 
        '⭐ Super Likes are a premium feature!\n\n' +
        'Upgrade to premium to send unlimited super likes and get better matches.',
        keyboards.premiumPlans
      );
      return;
    }
    
    await this.handleSwipe(query.message.chat.id, user.telegram_id, 'super_like');
    await bot.answerCallbackQuery(query.id, { text: '⭐ Super liked!' });
  }

  static async handleSwipe(chatId, userId, action) {
    try {
      const state = this.userBrowsingState.get(userId);
      if (!state) {
        await this.startBrowsing(chatId, userId);
        return;
      }

      const currentMatch = state.matches[state.currentIndex];
      
      // Check daily limits for free users
      if ((action === 'like' || action === 'super_like')) {
        const isPremium = await SubscriptionService.isUserPremium(userId);
        if (!isPremium) {
          const todayLikes = this.getTodayLikes(userId);
          if (todayLikes >= 20) {
            await bot.sendMessage(chatId, 
              '💔 Daily Like Limit Reached\n\n' +
              'You\'ve used all your likes for today! Upgrade to premium for unlimited likes.',
              keyboards.premiumPlans
            );
            return;
          }
          this.incrementTodayLikes(userId);
        }
      }

      // Record the swipe
      const result = await MatchingService.recordSwipe(userId, currentMatch.telegram_id, action);
      
      if (result.match) {
        await this.handleNewMatch(chatId, userId, currentMatch, result.match);
      } else if (action === 'like' || action === 'super_like') {
        // Optional: Show brief feedback
        if (action === 'super_like') {
          await bot.sendMessage(chatId, '⭐ Super like sent!');
        }
      }

      // Move to next match
      state.currentIndex++;
      setTimeout(() => {
        this.showNextMatch(chatId, userId);
      }, 1000); // Brief delay for better UX

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

  static async showProfile(chatId, userId, targetUserId) {
    try {
      const profile = await UserService.getUserByTelegramId(targetUserId);
      if (!profile) {
        await bot.sendMessage(chatId, 'Profile not found.');
        return;
      }

      const photos = await UserService.getUserPhotos(targetUserId);
      
      let profileText = `${profile.first_name}, ${profile.age}\n\n`;
      
      if (profile.bio) {
        profileText += `📋 About:\n${profile.bio}\n\n`;
      }

      if (profile.profession) {
        profileText += `💼 Work: ${profile.profession}\n`;
      }

      if (profile.education) {
        profileText += `🎓 Education: ${this.formatEducation(profile.education)}\n`;
      }

      if (profile.height) {
        profileText += `📏 Height: ${profile.height}\n`;
      }

      if (profile.interests) {
        profileText += `🎯 Interests: ${profile.interests}\n`;
      }

      if (profile.lifestyle) {
        profileText += `🌟 Lifestyle: ${profile.lifestyle}\n`;
      }

      if (profile.looking_for) {
        profileText += `💕 Looking for: ${this.formatLookingFor(profile.looking_for)}\n`;
      }

      if (profile.is_verified) {
        profileText += `\n✅ Verified Profile`;
      }

      profileText += `\n📸 ${photos.length} photo${photos.length !== 1 ? 's' : ''}`;

      await bot.sendMessage(chatId, profileText, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📸 View Photos', callback_data: `browse_photos_${targetUserId}` }],
            [{ text: '🔙 Back to Browsing', callback_data: 'browse' }]
          ]
        }
      });
    } catch (error) {
      console.error('Error showing profile:', error);
      await bot.sendMessage(chatId, 'Error loading profile.');
    }
  }

  static async showUserPhotos(chatId, userId, targetUserId) {
    try {
      const photos = await UserService.getUserPhotos(targetUserId);
      
      if (photos.length === 0) {
        await bot.sendMessage(chatId, 'This user has no photos.');
        return;
      }

      if (photos.length === 1) {
        await bot.sendMessage(chatId, 'This user has only one photo.');
        return;
      }

      // Show all photos
      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        const caption = `Photo ${i + 1} of ${photos.length}${photo.is_primary ? ' (Primary)' : ''}`;
        
        await bot.sendPhoto(chatId, photo.file_id, {
          caption: caption
        });
        
        // Add small delay between photos
        if (i < photos.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      await bot.sendMessage(chatId, 'Back to browsing:', {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '❌', callback_data: 'swipe_pass' },
              { text: '💕', callback_data: 'swipe_like' },
              { text: '⭐', callback_data: 'swipe_super_like' }
            ],
            [{ text: '🔙 Back to Browsing', callback_data: 'browse' }]
          ]
        }
      });
    } catch (error) {
      console.error('Error showing user photos:', error);
      await bot.sendMessage(chatId, 'Error loading photos.');
    }
  }

  static async continueBrowsing(chatId, userId) {
    await this.showNextMatch(chatId, userId);
  }

  static async reloadMatches(chatId, userId) {
    this.userBrowsingState.delete(userId);
    await this.startBrowsing(chatId, userId);
  }

  static async handleLocationUpdate(msg) {
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    
    if (!msg.location) {
      await bot.sendMessage(chatId, 
        'Please share your location using the location button.',
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

    try {
      const lat = msg.location.latitude;
      const lon = msg.location.longitude;
      
      // Update user location
      await UserService.updateUser(userId, {
        latitude: lat,
        longitude: lon,
        location_updated_at: new Date().toISOString()
      });
      
      // Record location verification
      await VerificationService.recordLocationVerification(userId, lat, lon, msg.location.horizontal_accuracy || 0);
      
      await bot.sendMessage(chatId, 
        '✅ Location Updated!\n\n' +
        'Your location has been updated successfully. You can now find matches near you!',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '💕 Start Browsing', callback_data: 'browse' }],
              [{ text: '🔙 Back to Menu', callback_data: 'main_menu' }]
            ]
          }
        }
      );
    } catch (error) {
      console.error('Error updating location:', error);
      await bot.sendMessage(chatId, 
        '❌ Error updating location. Please try again.',
        keyboards.mainMenu
      );
    }
  }

  static async requestLocationUpdate(chatId) {
    await bot.sendMessage(chatId, 
      '📍 Update Location\n\n' +
      'To find matches near you, please share your current location.\n\n' +
      'Your location is used to:\n' +
      '• Find matches within your preferred distance\n' +
      '• Show accurate distance to potential matches\n' +
      '• Improve matching algorithm\n\n' +
      'Your exact location is never shown to other users.',
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

  // Helper methods
  static formatDistance(distance) {
    if (distance < 1) {
      return '<1';
    }
    return Math.round(distance * 10) / 10; // Round to 1 decimal place
  }

  static formatEducation(education) {
    const educationMap = {
      'high_school': 'High School',
      'some_college': 'Some College',
      'bachelors': "Bachelor's Degree",
      'masters': "Master's Degree",
      'phd': 'PhD'
    };
    return educationMap[education] || education;
  }

  static formatLookingFor(lookingFor) {
    const lookingForMap = {
      'relationship': 'Long-term relationship',
      'casual': 'Casual dating',
      'marriage': 'Marriage',
      'friends': 'Friends'
    };
    return lookingForMap[lookingFor] || lookingFor;
  }

  // Daily likes tracking for free users
  static getTodayLikes(userId) {
    const today = new Date().toDateString();
    const userKey = `${userId}_${today}`;
    return this.dailyLikes.get(userKey) || 0;
  }

  static incrementTodayLikes(userId) {
    const today = new Date().toDateString();
    const userKey = `${userId}_${today}`;
    const current = this.dailyLikes.get(userKey) || 0;
    this.dailyLikes.set(userKey, current + 1);
  }

  // Clean up old daily like counts (run this daily)
  static cleanupDailyLikes() {
    const today = new Date().toDateString();
    for (const [key, value] of this.dailyLikes.entries()) {
      if (!key.includes(today)) {
        this.dailyLikes.delete(key);
      }
    }
  }

  // Legacy methods for backward compatibility
  static async handleBrowseMatches(msg, user) {
    await this.startBrowsing(msg.chat.id, user.telegram_id);
  }
}