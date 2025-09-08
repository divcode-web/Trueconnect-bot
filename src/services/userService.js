import { supabaseAdmin } from '../config/database.js';
import sharp from 'sharp';

export class UserService {
  static async createUser(telegramData) {
    try {
      const { data: existingUser } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('telegram_id', telegramData.id)
        .single();

      if (existingUser) {
        return { user: existingUser, isNew: false };
      }

      const userData = {
        telegram_id: telegramData.id,
        username: telegramData.username,
        first_name: telegramData.first_name,
        last_name: telegramData.last_name,
        is_active: true,
        registration_step: 'basic_info',
        created_at: new Date().toISOString()
      };

      const { data: newUser, error } = await supabaseAdmin
        .from('users')
        .insert(userData)
        .select()
        .single();

      if (error) throw error;

      return { user: newUser, isNew: true };
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }

  static async getUserByTelegramId(telegramId) {
    try {
      const { data, error } = await supabaseAdmin
        .from('users')
        .select(`
          *,
          user_photos(*),
          user_preferences(*),
          subscriptions(*)
        `)
        .eq('telegram_id', telegramId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data;
    } catch (error) {
      console.error('Error fetching user:', error);
      return null;
    }
  }

  static async updateUser(telegram_id, fields) {
    try {
      const { data, error } = await supabaseAdmin
        .from('users')
        .update({
          ...fields,
          updated_at: new Date().toISOString()
        })
        .eq('telegram_id', telegram_id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
  }

  static async updateRegistrationStep(telegramId, step) {
    return this.updateUser(telegramId, { registration_step: step });
  }

  static async completeProfile(telegramId) {
    return this.updateUser(telegramId, { 
      registration_step: 'completed',
      profile_completed: true,
      profile_completed_at: new Date().toISOString()
    });
  }

  // IMPROVED PHOTO HANDLING WITH STORAGE
  static async addUserPhoto(telegramId, photoData) {
    try {
      // Get file info from Telegram
      const fileInfo = await this.getTelegramFile(photoData.file_id);
      if (!fileInfo) {
        throw new Error('Could not get file info from Telegram');
      }

      // Download the photo
      const imageBuffer = await this.downloadTelegramFile(fileInfo.file_path);
      
      // Process the image
      const processedImage = await this.processProfileImage(imageBuffer);
      
      // Upload to Supabase Storage
      const fileName = `profile_${telegramId}_${Date.now()}.jpg`;
      const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
        .from('profile-photos')
        .upload(fileName, processedImage, {
          contentType: 'image/jpeg'
        });

      if (uploadError) {
        console.error('Photo storage upload error:', uploadError);
        // Continue without throwing error - save reference anyway
      }

      // Get public URL
      const { data: publicData } = supabaseAdmin.storage
        .from('profile-photos')
        .getPublicUrl(fileName);

      // Save photo record to database
      const { data, error } = await supabaseAdmin
        .from('user_photos')
        .insert({
          user_id: telegramId,
          photo_url: publicData.publicUrl,
          file_id: photoData.file_id,
          file_path: fileName,
          is_primary: photoData.is_primary || false,
          order_index: photoData.order_index || 0,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error adding user photo:', error);
      
      // Fallback - save just the file_id without storage
      try {
        const { data, error: fallbackError } = await supabaseAdmin
          .from('user_photos')
          .insert({
            user_id: telegramId,
            photo_url: `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${photoData.file_id}`,
            file_id: photoData.file_id,
            is_primary: photoData.is_primary || false,
            order_index: photoData.order_index || 0,
            created_at: new Date().toISOString()
          })
          .select()
          .single();
        
        if (fallbackError) throw fallbackError;
        return data;
      } catch (fallbackError) {
        console.error('Fallback photo save also failed:', fallbackError);
        throw error;
      }
    }
  }

  static async getTelegramFile(fileId) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/getFile?file_id=${fileId}`);
      const data = await response.json();
      
      if (!data.ok) {
        throw new Error('Failed to get file info from Telegram');
      }
      
      return data.result;
    } catch (error) {
      console.error('Error getting Telegram file info:', error);
      return null;
    }
  }

  static async downloadTelegramFile(filePath) {
    try {
      const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${filePath}`;
      const response = await fetch(fileUrl);
      
      if (!response.ok) {
        throw new Error('Failed to download file from Telegram');
      }
      
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      console.error('Error downloading file from Telegram:', error);
      throw error;
    }
  }

  static async processProfileImage(imageBuffer) {
    try {
      return await sharp(imageBuffer)
        .resize(1080, 1080, { fit: 'cover', withoutEnlargement: false })
        .jpeg({ quality: 85 })
        .toBuffer();
    } catch (error) {
      console.error('Error processing profile image:', error);
      // Return original buffer if processing fails
      return imageBuffer;
    }
  }

  // Legacy method for backward compatibility
  static async addPhoto(telegram_id, photoUrl) {
    try {
      const { data, error } = await supabaseAdmin
        .from('user_photos')
        .insert({ 
          user_id: telegram_id, 
          photo_url: photoUrl,
          file_id: null,
          is_primary: false,
          order_index: 0,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error adding photo:', error);
      throw error;
    }
  }

  // Legacy method for backward compatibility
  static async savePhotoToStorage(telegram_id, fileId) {
    try {
      const fileInfo = await this.getTelegramFile(fileId);
      if (!fileInfo) return null;

      const imageBuffer = await this.downloadTelegramFile(fileInfo.file_path);
      const processedImage = await this.processProfileImage(imageBuffer);
      const fileName = `profile_${telegram_id}_${Date.now()}.jpg`;
      
      const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
        .from('profile-photos')
        .upload(fileName, processedImage, {
          contentType: 'image/jpeg'
        });

      if (uploadError) throw uploadError;

      const { data: publicData } = supabaseAdmin.storage
        .from('profile-photos')
        .getPublicUrl(fileName);

      return publicData.publicUrl;
    } catch (error) {
      console.error('Error saving photo to storage:', error);
      return `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${fileId}`;
    }
  }

  static async getUserLikes(telegram_id) {
    try {
      const { data, error } = await supabaseAdmin
        .from('user_swipes')
        .select(`
          *,
          swiper:users!user_swipes_swiper_id_fkey(*)
        `)
        .eq('swiped_id', telegram_id)
        .in('action', ['like', 'super_like'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data?.map(swipe => swipe.swiper) || [];
    } catch (error) {
      console.error('Error fetching user likes:', error);
      return [];
    }
  }

  static async deleteUser(telegram_id) {
    try {
      const { error } = await supabaseAdmin
        .from('users')
        .delete()
        .eq('telegram_id', telegram_id);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error deleting user:', error);
      return false;
    }
  }

  static async getMatchesForUser(telegram_id) {
    try {
      const { data, error } = await supabaseAdmin
        .from('matches')
        .select('*')
        .or(`user1_id.eq.${telegram_id},user2_id.eq.${telegram_id}`)
        .eq('is_active', true);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching matches:', error);
      return [];
    }
  }

  static async updatePreferences(telegram_id, prefs) {
    try {
      const { data, error } = await supabaseAdmin
        .from('users')
        .update({ matching_preferences: prefs })
        .eq('telegram_id', telegram_id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating preferences:', error);
      throw error;
    }
  }

  static async updateNotifications(telegram_id, notif) {
    try {
      const { data, error } = await supabaseAdmin
        .from('users')
        .update({ notification_settings: notif })
        .eq('telegram_id', telegram_id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating notifications:', error);
      throw error;
    }
  }

  static async updatePrivacy(telegram_id, privacy) {
    try {
      const { data, error } = await supabaseAdmin
        .from('users')
        .update({ privacy_settings: privacy })
        .eq('telegram_id', telegram_id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating privacy:', error);
      throw error;
    }
  }

  static async getUserPhotos(telegramId) {
    try {
      const { data, error } = await supabaseAdmin
        .from('user_photos')
        .select('*')
        .eq('user_id', telegramId)
        .order('order_index');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching user photos:', error);
      return [];
    }
  }

  static async saveUserPreferences(telegramId, preferences) {
    try {
      const { data, error } = await supabaseAdmin
        .from('user_preferences')
        .upsert({
          user_id: telegramId,
          ...preferences,
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error saving user preferences:', error);
      throw error;
    }
  }

  static async blockUser(blockerTelegramId, blockedTelegramId) {
    try {
      const { data, error } = await supabaseAdmin
        .from('user_blocks')
        .insert({
          blocker_id: blockerTelegramId,
          blocked_id: blockedTelegramId,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error blocking user:', error);
      throw error;
    }
  }

  static async isUserBlocked(userId1, userId2) {
    try {
      const { data, error } = await supabaseAdmin
        .from('user_blocks')
        .select('*')
        .or(`and(blocker_id.eq.${userId1},blocked_id.eq.${userId2}),and(blocker_id.eq.${userId2},blocked_id.eq.${userId1})`)
        .limit(1);

      if (error) throw error;
      return data && data.length > 0;
    } catch (error) {
      console.error('Error checking if user is blocked:', error);
      return false;
    }
  }

  static async deleteUserAccount(telegramId) {
    try {
      // Delete user photos from storage first
      const photos = await this.getUserPhotos(telegramId);
      for (const photo of photos) {
        if (photo.file_path) {
          try {
            await supabaseAdmin.storage
              .from('profile-photos')
              .remove([photo.file_path]);
          } catch (storageError) {
            console.error('Error deleting photo from storage:', storageError);
          }
        }
      }

      // This will cascade delete all related data due to foreign key constraints
      const { error } = await supabaseAdmin
        .from('users')
        .delete()
        .eq('telegram_id', telegramId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error deleting user account:', error);
      return false;
    }
  }

  static async updateUserField(telegramId, field, value) {
    try {
      const updates = {};
      updates[field] = value;
      updates.updated_at = new Date().toISOString();

      const { data, error } = await supabaseAdmin
        .from('users')
        .update(updates)
        .eq('telegram_id', telegramId)
        .select()
        .single();
        
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating user field:', error);
      throw error;
    }
  }

  // PREFERENCES METHODS
  static async updateUserPreferences(telegramId, preferences) {
    try {
      const { data, error } = await supabaseAdmin
        .from('user_preferences')
        .upsert({
          user_id: telegramId,
          ...preferences,
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating user preferences:', error);
      throw error;
    }
  }

  static async getUserNotificationSettings(telegramId) {
    try {
      const { data, error } = await supabaseAdmin
        .from('user_notification_settings')
        .select('*')
        .eq('user_id', telegramId)
        .single();
      if (error && error.code !== 'PGRST116') {
        // If record doesn't exist, return default settings
        return {
          new_matches: true,
          new_messages: true,
          profile_views: true,
          super_likes: true
        };
      }
      return data || {
        new_matches: true,
        new_messages: true,
        profile_views: true,
        super_likes: true
      };
    } catch (error) {
      console.error('Error fetching notification settings:', error);
      return {
        new_matches: true,
        new_messages: true,
        profile_views: true,
        super_likes: true
      };
    }
  }

  static async updateNotificationSettings(telegramId, settings) {
    try {
      const { data, error } = await supabaseAdmin
        .from('user_notification_settings')
        .upsert({
          user_id: telegramId,
          ...settings,
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating notification settings:', error);
      throw error;
    }
  }

  static async getUserPrivacySettings(telegramId) {
    try {
      const { data, error } = await supabaseAdmin
        .from('user_privacy_settings')
        .select('*')
        .eq('user_id', telegramId)
        .single();
      if (error && error.code !== 'PGRST116') {
        // If record doesn't exist, return default settings
        return {
          profile_visibility: 'public',
          location_privacy: 'approximate',
          message_privacy: 'matches_only'
        };
      }
      return data || {
        profile_visibility: 'public',
        location_privacy: 'approximate',
        message_privacy: 'matches_only'
      };
    } catch (error) {
      console.error('Error fetching privacy settings:', error);
      return {
        profile_visibility: 'public',
        location_privacy: 'approximate',
        message_privacy: 'matches_only'
      };
    }
  }

  static async updatePrivacySettings(telegramId, settings) {
    try {
      const { data, error } = await supabaseAdmin
        .from('user_privacy_settings')
        .upsert({
          user_id: telegramId,
          ...settings,
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating privacy settings:', error);
      throw error;
    }
  }

  // PHOTO MANAGEMENT METHODS
  static async deleteUserPhoto(telegramId, photoId) {
    try {
      // Get photo info first
      const { data: photo, error: getError } = await supabaseAdmin
        .from('user_photos')
        .select('*')
        .eq('user_id', telegramId)
        .eq('id', photoId)
        .single();

      if (getError) throw getError;

      // Delete from storage if exists
      if (photo.file_path) {
        try {
          await supabaseAdmin.storage
            .from('profile-photos')
            .remove([photo.file_path]);
        } catch (storageError) {
          console.error('Error deleting photo from storage:', storageError);
        }
      }

      // Delete from database
      const { error } = await supabaseAdmin
        .from('user_photos')
        .delete()
        .eq('user_id', telegramId)
        .eq('id', photoId);
      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error deleting user photo:', error);
      return false;
    }
  }

  static async setPrimaryPhoto(telegramId, photoId) {
    try {
      // First, set all photos as non-primary
      await supabaseAdmin
        .from('user_photos')
        .update({ is_primary: false })
        .eq('user_id', telegramId);
      
      // Then set the selected photo as primary
      const { error } = await supabaseAdmin
        .from('user_photos')
        .update({ is_primary: true })
        .eq('user_id', telegramId)
        .eq('id', photoId);
      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error setting primary photo:', error);
      return false;
    }
  }

  // HELPER METHODS FOR PREFERENCES
  static async setAgePreference(telegramId, minAge, maxAge) {
    return this.updateUserPreferences(telegramId, { min_age: minAge, max_age: maxAge });
  }

  static async setDistancePreference(telegramId, distance) {
    return this.updateUserPreferences(telegramId, { max_distance: distance });
  }

  static async setGenderPreference(telegramId, gender) {
    return this.updateUserPreferences(telegramId, { preferred_gender: gender });
  }

  static async setProfileVisibility(telegramId, visibility) {
    return this.updatePrivacySettings(telegramId, { profile_visibility: visibility });
  }

  static async setLocationPrivacy(telegramId, privacy) {
    return this.updatePrivacySettings(telegramId, { location_privacy: privacy });
  }

  static async setMessagePrivacy(telegramId, privacy) {
    return this.updatePrivacySettings(telegramId, { message_privacy: privacy });
  }
}