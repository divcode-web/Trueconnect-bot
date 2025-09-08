import { UserService } from '../services/userService.js';
import { bot } from '../config/telegram.js';

export class ProfileHandler {
  static async handleEditProfile(msg, user) {
    try {
      await UserService.updateUser(user.telegram_id, { bio: msg.text });
      await bot.sendMessage(msg.chat.id, 'Your profile has been updated!');
    } catch (error) {
      console.error('Error updating profile:', error);
      await bot.sendMessage(msg.chat.id, 'Error updating profile. Please try again.');
    }
  }

  static async handlePhotoUpload(msg, user) {
    try {
      if (!msg.photo || msg.photo.length === 0) {
        await bot.sendMessage(msg.chat.id, 'Please send a valid photo.');
        return;
      }

      // Check current photo count
      const currentPhotos = await UserService.getUserPhotos(user.telegram_id);
      if (currentPhotos.length >= 6) {
        await bot.sendMessage(msg.chat.id, 
          'Photo Limit Reached\n\n' +
          'You can only have up to 6 photos. Please delete some photos before adding new ones.',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Manage Photos', callback_data: 'manage_photos' }],
                [{ text: 'Back to Profile', callback_data: 'profile' }]
              ]
            }
          }
        );
        return;
      }

      const photo = msg.photo[msg.photo.length - 1]; // Get highest resolution
      
      // Add photo to user's profile
      await UserService.addUserPhoto(user.telegram_id, {
        file_id: photo.file_id,
        is_primary: currentPhotos.length === 0, // First photo is primary
        order_index: currentPhotos.length
      });

      await bot.sendMessage(msg.chat.id, 
        `Photo ${currentPhotos.length + 1} added successfully!\n\n` +
        `You now have ${currentPhotos.length + 1} photo${currentPhotos.length + 1 > 1 ? 's' : ''}. ` +
        `${currentPhotos.length + 1 < 6 ? `You can add ${6 - currentPhotos.length - 1} more.` : 'You\'ve reached the maximum of 6 photos.'}`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Add More Photos', callback_data: 'add_photos' }],
              [{ text: 'Manage Photos', callback_data: 'manage_photos' }],
              [{ text: 'Back to Profile', callback_data: 'profile' }]
            ]
          }
        }
      );

      // Clear uploading flag
      await UserService.updateUser(user.telegram_id, { uploading_photos: false });

    } catch (error) {
      console.error('Error uploading photo:', error);
      await bot.sendMessage(msg.chat.id, 
        'Error uploading photo. Please try again.',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Try Again', callback_data: 'add_photos' }],
              [{ text: 'Back to Profile', callback_data: 'profile' }]
            ]
          }
        }
      );
    }
  }

  static async handleLikes(msg, user) {
    try {
      const likes = await UserService.getUserLikes(user.telegram_id);
      if (!likes || likes.length === 0) {
        await bot.sendMessage(msg.chat.id, 
          'No one has liked you yet.\n\n' +
          'Tips to get more likes:\n' +
          '• Add more photos to your profile\n' +
          '• Write an interesting bio\n' +
          '• Verify your profile\n' +
          '• Be active and browse matches',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Start Browsing', callback_data: 'browse' }],
                [{ text: 'Add Photos', callback_data: 'add_photos' }],
                [{ text: 'Verify Profile', callback_data: 'start_verification' }]
              ]
            }
          }
        );
      } else {
        const likeList = likes.slice(0, 10).map((l, i) => `${i + 1}. ${l.first_name}`).join('\n');
        await bot.sendMessage(msg.chat.id, 
          `People who liked you (${likes.length}):\n\n${likeList}${likes.length > 10 ? '\n\n...and more!' : ''}`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Browse Matches', callback_data: 'browse' }],
                [{ text: 'Back to Profile', callback_data: 'profile' }]
              ]
            }
          }
        );
      }
    } catch (error) {
      console.error('Error fetching likes:', error);
      await bot.sendMessage(msg.chat.id, 'Error loading likes. Please try again.');
    }
  }

  static async handleDeleteAccount(msg, user) {
    try {
      const success = await UserService.deleteUserAccount(user.telegram_id);
      if (success) {
        await bot.sendMessage(msg.chat.id, 
          'Your account has been deleted successfully.\n\n' +
          'Thank you for using our service. You can create a new account anytime by sending /start'
        );
      } else {
        await bot.sendMessage(msg.chat.id, 'Error deleting account. Please contact support.');
      }
    } catch (error) {
      console.error('Error deleting account:', error);
      await bot.sendMessage(msg.chat.id, 'Error deleting account. Please try again or contact support.');
    }
  }

  static async handleMyMatches(msg, user) {
    try {
      const matches = await UserService.getMatchesForUser(user.telegram_id);
      if (!matches || matches.length === 0) {
        await bot.sendMessage(msg.chat.id, 
          'You have no matches yet.\n\n' +
          'Start browsing to find your perfect match!',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Start Browsing', callback_data: 'browse' }],
                [{ text: 'Back to Profile', callback_data: 'profile' }]
              ]
            }
          }
        );
      } else {
        const matchList = matches.slice(0, 10).map((m, i) => {
          const otherId = m.user1_id === user.telegram_id ? m.user2_id : m.user1_id;
          return `${i + 1}. Match ID: ${otherId}`;
        }).join('\n');
        
        await bot.sendMessage(msg.chat.id, 
          `Your matches (${matches.length}):\n\n${matchList}${matches.length > 10 ? '\n\n...and more!' : ''}`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'View All Matches', callback_data: 'matches' }],
                [{ text: 'Back to Profile', callback_data: 'profile' }]
              ]
            }
          }
        );
      }
    } catch (error) {
      console.error('Error fetching matches:', error);
      await bot.sendMessage(msg.chat.id, 'Error loading matches. Please try again.');
    }
  }

  static async handleMatchingPreferences(msg, user) {
    try {
      const preferences = msg.text?.trim();
      if (!preferences) {
        await bot.sendMessage(msg.chat.id, 'Please provide valid preferences.');
        return;
      }

      await UserService.updatePreferences(user.telegram_id, preferences);
      await bot.sendMessage(msg.chat.id, 
        'Your matching preferences have been updated!',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'View Settings', callback_data: 'settings' }],
              [{ text: 'Back to Profile', callback_data: 'profile' }]
            ]
          }
        }
      );
    } catch (error) {
      console.error('Error updating preferences:', error);
      await bot.sendMessage(msg.chat.id, 'Error updating preferences. Please try again.');
    }
  }

  static async handleNotifications(msg, user) {
    try {
      const notificationSettings = msg.text?.trim();
      if (!notificationSettings) {
        await bot.sendMessage(msg.chat.id, 'Please provide valid notification settings.');
        return;
      }

      await UserService.updateNotifications(user.telegram_id, notificationSettings);
      await bot.sendMessage(msg.chat.id, 
        'Your notification settings have been updated!',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'View Settings', callback_data: 'settings' }],
              [{ text: 'Back to Profile', callback_data: 'profile' }]
            ]
          }
        }
      );
    } catch (error) {
      console.error('Error updating notifications:', error);
      await bot.sendMessage(msg.chat.id, 'Error updating notification settings. Please try again.');
    }
  }

  static async handlePrivacy(msg, user) {
    try {
      const privacySettings = msg.text?.trim();
      if (!privacySettings) {
        await bot.sendMessage(msg.chat.id, 'Please provide valid privacy settings.');
        return;
      }

      await UserService.updatePrivacy(user.telegram_id, privacySettings);
      await bot.sendMessage(msg.chat.id, 
        'Your privacy settings have been updated!',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'View Settings', callback_data: 'settings' }],
              [{ text: 'Back to Profile', callback_data: 'profile' }]
            ]
          }
        }
      );
    } catch (error) {
      console.error('Error updating privacy settings:', error);
      await bot.sendMessage(msg.chat.id, 'Error updating privacy settings. Please try again.');
    }
  }

  // ENHANCED PROFILE FUNCTIONALITY

  static async showUserProfile(chatId, userId) {
    try {
      const user = await UserService.getUserByTelegramId(userId);
      const photos = await UserService.getUserPhotos(userId);
      
      if (!user) {
        await bot.sendMessage(chatId, 'User profile not found.');
        return;
      }

      let profileText = `${user.first_name}'s Profile\n\n`;
      profileText += `Age: ${user.age || 'Not specified'}\n`;
      profileText += `Gender: ${user.gender || 'Not specified'}\n`;
      
      if (user.bio) {
        profileText += `\nBio:\n${user.bio}\n`;
      }
      
      if (user.profession) {
        profileText += `\nProfession: ${user.profession}`;
      }
      
      if (user.interests) {
        profileText += `\nInterests: ${user.interests}`;
      }
      
      if (user.height) {
        profileText += `\nHeight: ${user.height}`;
      }

      profileText += `\nPhotos: ${photos.length}/6`;
      profileText += `\n${user.is_verified ? 'Verified' : 'Not verified'}`;

      if (photos.length > 0) {
        const primaryPhoto = photos.find(p => p.is_primary) || photos[0];
        await bot.sendPhoto(chatId, primaryPhoto.file_id, {
          caption: profileText,
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Edit Profile', callback_data: 'edit_profile' }],
              [{ text: 'Manage Photos', callback_data: 'manage_photos' }],
              [{ text: 'Main Menu', callback_data: 'main_menu' }]
            ]
          }
        });
      } else {
        await bot.sendMessage(chatId, profileText, {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Edit Profile', callback_data: 'edit_profile' }],
              [{ text: 'Add Photos', callback_data: 'add_photos' }],
              [{ text: 'Main Menu', callback_data: 'main_menu' }]
            ]
          }
        });
      }
    } catch (error) {
      console.error('Error showing user profile:', error);
      await bot.sendMessage(chatId, 'Error loading profile. Please try again.');
    }
  }

  static async showPhotoManagement(chatId, userId) {
    try {
      const photos = await UserService.getUserPhotos(userId);
      
      if (photos.length === 0) {
        await bot.sendMessage(chatId, 
          'Photo Management\n\n' +
          'You don\'t have any photos yet. Add some photos to make your profile more attractive!',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Add Photos', callback_data: 'add_photos' }],
                [{ text: 'Back to Profile', callback_data: 'profile' }]
              ]
            }
          }
        );
        return;
      }

      let photoText = `Photo Management (${photos.length}/6)\n\n`;
      
      const keyboard = [];
      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        photoText += `${i + 1}. Photo ${i + 1}${photo.is_primary ? ' (Primary)' : ''}\n`;
        
        keyboard.push([
          { text: `Delete Photo ${i + 1}`, callback_data: `delete_photo_${photo.id}` },
          { text: `Set Primary`, callback_data: `set_primary_${photo.id}` }
        ]);
      }

      if (photos.length < 6) {
        keyboard.unshift([{ text: 'Add More Photos', callback_data: 'add_photos' }]);
      }
      
      keyboard.push([{ text: 'Back to Profile', callback_data: 'profile' }]);

      await bot.sendMessage(chatId, photoText, {
        reply_markup: {
          inline_keyboard: keyboard
        }
      });
    } catch (error) {
      console.error('Error showing photo management:', error);
      await bot.sendMessage(chatId, 'Error loading photo management. Please try again.');
    }
  }

  static async deletePhoto(chatId, userId, photoId) {
    try {
      const success = await UserService.deleteUserPhoto(userId, photoId);
      if (success) {
        await bot.sendMessage(chatId, 
          'Photo deleted successfully!',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Manage Photos', callback_data: 'manage_photos' }],
                [{ text: 'Back to Profile', callback_data: 'profile' }]
              ]
            }
          }
        );
      } else {
        await bot.sendMessage(chatId, 'Error deleting photo. Please try again.');
      }
    } catch (error) {
      console.error('Error deleting photo:', error);
      await bot.sendMessage(chatId, 'Error deleting photo. Please try again.');
    }
  }

  static async setPrimaryPhoto(chatId, userId, photoId) {
    try {
      const success = await UserService.setPrimaryPhoto(userId, photoId);
      if (success) {
        await bot.sendMessage(chatId, 
          'Primary photo updated successfully!',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: 'Manage Photos', callback_data: 'manage_photos' }],
                [{ text: 'Back to Profile', callback_data: 'profile' }]
              ]
            }
          }
        );
      } else {
        await bot.sendMessage(chatId, 'Error setting primary photo. Please try again.');
      }
    } catch (error) {
      console.error('Error setting primary photo:', error);
      await bot.sendMessage(chatId, 'Error setting primary photo. Please try again.');
    }
  }

  static async handleFieldEdit(chatId, userId, field, value) {
    try {
      await UserService.updateUserField(userId, field, value);
      await bot.sendMessage(chatId, 
        `${field.charAt(0).toUpperCase() + field.slice(1)} updated successfully!`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Edit More', callback_data: 'edit_profile' }],
              [{ text: 'View Profile', callback_data: 'profile' }]
            ]
          }
        }
      );
    } catch (error) {
      console.error(`Error updating ${field}:`, error);
      await bot.sendMessage(chatId, `Error updating ${field}. Please try again.`);
    }
  }

  // PROFILE COMPLETION AND INSIGHTS
  static async checkProfileCompletion(userId) {
    try {
      const user = await UserService.getUserByTelegramId(userId);
      const photos = await UserService.getUserPhotos(userId);
      
      const missingFields = [];
      
      if (!user.age) missingFields.push('Age');
      if (!user.bio || user.bio.trim().length < 10) missingFields.push('Bio');
      if (photos.length === 0) missingFields.push('Photos');
      if (!user.profession) missingFields.push('Profession');
      if (!user.interests) missingFields.push('Interests');
      
      return {
        isComplete: missingFields.length === 0,
        missingFields: missingFields,
        completionPercentage: Math.round(((5 - missingFields.length) / 5) * 100)
      };
    } catch (error) {
      console.error('Error checking profile completion:', error);
      return { isComplete: false, missingFields: [], completionPercentage: 0 };
    }
  }

  static async showProfileCompletionStatus(chatId, userId) {
    try {
      const completion = await this.checkProfileCompletion(userId);
      
      let statusText = `Profile Completion: ${completion.completionPercentage}%\n\n`;
      
      if (completion.isComplete) {
        statusText += `Your profile is complete! You're ready to find great matches.\n\n`;
        statusText += `Tips to improve your matches:\n`;
        statusText += `• Verify your profile for more trust\n`;
        statusText += `• Add more photos (up to 6)\n`;
        statusText += `• Keep your profile updated\n`;
        statusText += `• Be active and browse regularly`;
      } else {
        statusText += `Complete these fields to improve your matches:\n\n`;
        completion.missingFields.forEach(field => {
          statusText += `• ${field}\n`;
        });
        statusText += `\nA complete profile gets 5x more matches!`;
      }
      
      const keyboard = [];
      if (!completion.isComplete) {
        keyboard.push([{ text: 'Complete Profile', callback_data: 'edit_profile' }]);
      }
      keyboard.push(
        [{ text: 'Add Photos', callback_data: 'add_photos' }],
        [{ text: 'Verify Profile', callback_data: 'start_verification' }],
        [{ text: 'Back to Profile', callback_data: 'profile' }]
      );

      await bot.sendMessage(chatId, statusText, {
        reply_markup: {
          inline_keyboard: keyboard
        }
      });
    } catch (error) {
      console.error('Error showing profile completion:', error);
      await bot.sendMessage(chatId, 'Error loading profile status. Please try again.');
    }
  }

  // PHOTO PREVIEW AND BULK OPERATIONS
  static async showPhotoPreview(chatId, userId) {
    try {
      const photos = await UserService.getUserPhotos(userId);
      
      if (photos.length === 0) {
        await bot.sendMessage(chatId, 'You don\'t have any photos to preview.');
        return;
      }
      
      if (photos.length === 1) {
        await bot.sendPhoto(chatId, photos[0].file_id, {
          caption: `Your photo${photos[0].is_primary ? ' (Primary)' : ''}`,
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Manage Photos', callback_data: 'manage_photos' }],
              [{ text: 'Back to Profile', callback_data: 'profile' }]
            ]
          }
        });
      } else {
        const mediaGroup = photos.map((photo, index) => ({
          type: 'photo',
          media: photo.file_id,
          caption: index === 0 ? `Your ${photos.length} photos` : undefined
        }));
        
        await bot.sendMediaGroup(chatId, mediaGroup);
        await bot.sendMessage(chatId, 'Photo preview complete.', {
          reply_markup: {
            inline_keyboard: [
              [{ text: 'Manage Photos', callback_data: 'manage_photos' }],
              [{ text: 'Back to Profile', callback_data: 'profile' }]
            ]
          }
        });
      }
    } catch (error) {
      console.error('Error showing photo preview:', error);
      await bot.sendMessage(chatId, 'Error loading photo preview. Please try again.');
    }
  }

  // FIELD VALIDATION
  static validateProfileField(field, value) {
    const validations = {
      bio: {
        minLength: 10,
        maxLength: 500,
        message: 'Bio must be between 10 and 500 characters'
      },
      interests: {
        minLength: 5,
        maxLength: 200,
        message: 'Interests must be between 5 and 200 characters'
      },
      profession: {
        minLength: 2,
        maxLength: 100,
        message: 'Profession must be between 2 and 100 characters'
      },
      height: {
        pattern: /^\d{1,3}(\.\d)?cm$|^\d{1}'(\d{1,2}")?$/,
        message: 'Height must be in format like "175cm" or "5\'10""'
      },
      lifestyle: {
        minLength: 5,
        maxLength: 100,
        message: 'Lifestyle must be between 5 and 100 characters'
      }
    };

    const validation = validations[field];
    if (!validation) return { valid: true };

    if (validation.minLength && value.length < validation.minLength) {
      return { valid: false, message: validation.message };
    }

    if (validation.maxLength && value.length > validation.maxLength) {
      return { valid: false, message: validation.message };
    }

    if (validation.pattern && !validation.pattern.test(value)) {
      return { valid: false, message: validation.message };
    }

    return { valid: true };
  }

  static async handleValidatedFieldUpdate(chatId, userId, field, value) {
    try {
      const validation = this.validateProfileField(field, value);
      
      if (!validation.valid) {
        await bot.sendMessage(chatId, `Invalid ${field}: ${validation.message}`);
        return false;
      }

      await this.handleFieldEdit(chatId, userId, field, value);
      return true;
    } catch (error) {
      console.error(`Error updating ${field}:`, error);
      await bot.sendMessage(chatId, `Error updating ${field}. Please try again.`);
      return false;
    }
  }

  // PROFILE INSIGHTS
  static async getProfileInsights(userId) {
    try {
      const user = await UserService.getUserByTelegramId(userId);
      const photos = await UserService.getUserPhotos(userId);
      
      const insights = {
        profileViews: 0,
        likes: 0,
        matches: 0,
        recommendations: []
      };
      
      if (photos.length < 3) {
        insights.recommendations.push('Add more photos to increase your matches by up to 40%');
      }
      
      if (!user.bio || user.bio.length < 50) {
        insights.recommendations.push('Write a longer bio to help others understand your personality');
      }
      
      if (!user.is_verified) {
        insights.recommendations.push('Verify your profile to build trust and get more matches');
      }
      
      if (!user.interests || user.interests.split(',').length < 3) {
        insights.recommendations.push('Add more interests to find people with similar hobbies');
      }
      
      return insights;
    } catch (error) {
      console.error('Error getting profile insights:', error);
      return { profileViews: 0, likes: 0, matches: 0, recommendations: [] };
    }
  }

  static async showProfileInsights(chatId, userId) {
    try {
      const insights = await this.getProfileInsights(userId);
      
      let insightsText = `Profile Insights\n\n`;
      insightsText += `Profile Views: ${insights.profileViews}\n`;
      insightsText += `Likes Received: ${insights.likes}\n`;
      insightsText += `Total Matches: ${insights.matches}\n\n`;
      
      if (insights.recommendations.length > 0) {
        insightsText += `Recommendations:\n`;
        insights.recommendations.forEach((rec, index) => {
          insightsText += `${index + 1}. ${rec}\n`;
        });
      } else {
        insightsText += `Your profile looks great! Keep being active to find more matches.`;
      }
      
      await bot.sendMessage(chatId, insightsText, {
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Edit Profile', callback_data: 'edit_profile' }],
            [{ text: 'Add Photos', callback_data: 'add_photos' }],
            [{ text: 'Back to Profile', callback_data: 'profile' }]
          ]
        }
      });
    } catch (error) {
      console.error('Error showing profile insights:', error);
      await bot.sendMessage(chatId, 'Error loading profile insights. Please try again.');
    }
  }

  // PHOTO VALIDATION
  static validatePhoto(photo) {
    if (!photo) return { valid: false, message: 'No photo provided' };
    
    if (photo.file_size && photo.file_size > 20 * 1024 * 1024) {
      return { valid: false, message: 'Photo file is too large. Please use a smaller image.' };
    }

    return { valid: true };
  }

  static getPhotoUploadInstructions() {
    return `Photo Upload Tips:\n\n` +
           `Good photos:\n` +
           `• Clear, well-lit images\n` +
           `• Show your face clearly\n` +
           `• Smile and look natural\n` +
           `• Recent photos (within 2 years)\n` +
           `• Variety of settings/outfits\n\n` +
           `Avoid:\n` +
           `• Blurry or dark photos\n` +
           `• Group photos as main image\n` +
           `• Heavy filters or editing\n` +
           `• Inappropriate content\n` +
           `• Photos with text/watermarks`;
  }
}