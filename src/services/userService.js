import { supabaseAdmin } from '../config/database.js';
import bcrypt from 'bcryptjs';

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

  static async updateUser(telegramId, updates) {
    try {
      const { data, error } = await supabaseAdmin
        .from('users')
        .update(updates)
        .eq('telegram_id', telegramId)
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
}