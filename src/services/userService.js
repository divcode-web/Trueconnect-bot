import { supabaseAdmin } from '../config/database.js';

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
    return await supabaseAdmin
      .from('users')
      .update(fields)
      .eq('telegram_id', telegram_id);
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

  static async addUserPhoto(telegramId, photoData) {
    try {
      const { data, error } = await supabaseAdmin
        .from('user_photos')
        .insert({
          user_id: telegramId,
          photo_url: photoData.url,
          file_id: photoData.file_id,
          is_primary: photoData.is_primary || false,
          order_index: photoData.order_index || 0
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error adding user photo:', error);
      throw error;
    }
  }

  static async addPhoto(telegram_id, photoUrl) {
    return await supabaseAdmin
      .from('user_photos')
      .insert({ user_id: telegram_id, photo_url: photoUrl });
  }

  static async savePhotoToStorage(telegram_id, fileId) {
    // Download photo from Telegram and upload to Supabase Storage
    // Return public URL
    // Implement this as needed
    return `https://your-supabase-url/storage/v1/object/public/profile-photos/${telegram_id}_${fileId}.jpg`;
  }

  static async getLikesForUser(telegram_id) {
    const { data } = await supabaseAdmin
      .from('likes')
      .select('*')
      .eq('user_id', telegram_id);
    return data;
  }

  static async deleteUser(telegram_id) {
    return await supabaseAdmin
      .from('users')
      .delete()
      .eq('telegram_id', telegram_id);
  }

  static async getMatchesForUser(telegram_id) {
    const { data } = await supabaseAdmin
      .from('matches')
      .select('*')
      .or(`user1_id.eq.${telegram_id},user2_id.eq.${telegram_id}`);
    return data;
  }

  static async updatePreferences(telegram_id, prefs) {
    return await supabaseAdmin
      .from('users')
      .update({ matching_preferences: prefs })
      .eq('telegram_id', telegram_id);
  }

  static async updateNotifications(telegram_id, notif) {
    return await supabaseAdmin
      .from('users')
      .update({ notification_settings: notif })
      .eq('telegram_id', telegram_id);
  }

  static async updatePrivacy(telegram_id, privacy) {
    return await supabaseAdmin
      .from('users')
      .update({ privacy_settings: privacy })
      .eq('telegram_id', telegram_id);
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

  static async getUserLikes(telegramId) {
    try {
      const { data, error } = await supabaseAdmin
      if (error) throw error;
      return data?.map(swipe => swipe.swiper) || [];
    } catch (error) {
      console.error('Error fetching user likes:', error);
      return [];
    }
  }

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
      if (error && error.code !== 'PGRST116') throw error;
      return data || {
        new_matches: true,
        new_messages: true,
        profile_views: true,
        super_likes: true
      };
    } catch (error) {
      console.error('Error fetching notification settings:', error);
      return null;
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
      if (error && error.code !== 'PGRST116') throw error;
      return data || {
        profile_visibility: 'public',
        location_privacy: 'approximate',
        message_privacy: 'matches_only'
      };
    } catch (error) {
      console.error('Error fetching privacy settings:', error);
      return null;
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

  static async deleteUserPhoto(telegramId, photoId) {
    try {
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
}