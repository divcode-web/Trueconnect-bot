import { supabaseAdmin } from '../config/database.js';

export class MessageService {
  static async sendMessage(fromUserId, toUserId, messageText, messageType = 'text') {
    try {
      // Check if users are matched
      const match = await this.getMatchBetweenUsers(fromUserId, toUserId);
      if (!match) {
        throw new Error('Users are not matched');
      }

      const { data: message, error } = await supabaseAdmin
        .from('messages')
        .insert({
          sender_id: fromUserId,
          receiver_id: toUserId,
          message_text: messageText,
          message_type: messageType,
          sent_at: new Date().toISOString(),
          is_read: false
        })
        .select()
        .single();

      if (error) throw error;

      // Update match with last message info
      await supabaseAdmin
        .from('matches')
        .update({
          last_message_at: new Date().toISOString(),
          last_message_sender: fromUserId,
          last_message_preview: messageText.substring(0, 100)
        })
        .eq('id', match.id);

      return message;
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  static async getConversation(user1Id, user2Id, limit = 50, offset = 0) {
    try {
      const { data: messages, error } = await supabaseAdmin
        .from('messages')
        .select(`
          *,
          sender:users!messages_sender_id_fkey(first_name, username),
          receiver:users!messages_receiver_id_fkey(first_name, username)
        `)
        .or(`and(sender_id.eq.${user1Id},receiver_id.eq.${user2Id}),and(sender_id.eq.${user2Id},receiver_id.eq.${user1Id})`)
        .order('sent_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;
      return messages || [];
    } catch (error) {
      console.error('Error fetching conversation:', error);
      return [];
    }
  }

  static async getMatchBetweenUsers(user1Id, user2Id) {
    try {
      const { data: match, error } = await supabaseAdmin
        .from('matches')
        .select('*')
        .or(`and(user1_id.eq.${Math.min(user1Id, user2Id)},user2_id.eq.${Math.max(user1Id, user2Id)})`)
        .eq('is_active', true)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return match;
    } catch (error) {
      console.error('Error checking match:', error);
      return null;
    }
  }

  static async markMessagesAsRead(userId, senderId) {
    try {
      const { error } = await supabaseAdmin
        .from('messages')
        .update({ 
          is_read: true,
          read_at: new Date().toISOString()
        })
        .eq('receiver_id', userId)
        .eq('sender_id', senderId)
        .eq('is_read', false);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error marking messages as read:', error);
      return false;
    }
  }

  static async getUnreadMessageCount(userId) {
    try {
      const { count, error } = await supabaseAdmin
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('receiver_id', userId)
        .eq('is_read', false);

      if (error) throw error;
      return count || 0;
    } catch (error) {
      console.error('Error fetching unread message count:', error);
      return 0;
    }
  }

  static async getUserConversations(userId, limit = 20) {
    try {
      // Get all matches for the user
      const { data: matches, error: matchError } = await supabaseAdmin
        .from('matches')
        .select(`
          *,
          user1:users!matches_user1_id_fkey(first_name, username, telegram_id),
          user2:users!matches_user2_id_fkey(first_name, username, telegram_id)
        `)
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
        .eq('is_active', true)
        .order('last_message_at', { ascending: false })
        .limit(limit);

      if (matchError) throw matchError;

      // Get unread count for each conversation
      const conversations = [];
      for (const match of matches || []) {
        const otherUser = match.user1_id === userId ? match.user2 : match.user1;
        
        const { count: unreadCount } = await supabaseAdmin
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('receiver_id', userId)
          .eq('sender_id', otherUser.telegram_id)
          .eq('is_read', false);

        conversations.push({
          match,
          otherUser,
          unreadCount: unreadCount || 0,
          lastMessageAt: match.last_message_at,
          lastMessagePreview: match.last_message_preview
        });
      }

      return conversations;
    } catch (error) {
      console.error('Error fetching user conversations:', error);
      return [];
    }
  }

  static async deleteMessage(messageId, userId) {
    try {
      // Verify the user owns the message
      const { data: message, error: fetchError } = await supabaseAdmin
        .from('messages')
        .select('sender_id')
        .eq('id', messageId)
        .single();

      if (fetchError) throw fetchError;

      if (message.sender_id !== userId) {
        throw new Error('Unauthorized to delete this message');
      }

      const { error } = await supabaseAdmin
        .from('messages')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString()
        })
        .eq('id', messageId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error deleting message:', error);
      return false;
    }
  }

  static async archiveOldMessages(daysOld = 90) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const { data: archivedMessages, error } = await supabaseAdmin
        .from('messages')
        .update({
          is_archived: true,
          archived_at: new Date().toISOString()
        })
        .lt('sent_at', cutoffDate.toISOString())
        .eq('is_archived', false)
        .select('id');

      if (error) throw error;

      console.log(`✅ Archived ${archivedMessages?.length || 0} old messages`);
      return archivedMessages?.length || 0;
    } catch (error) {
      console.error('Error archiving old messages:', error);
      return 0;
    }
  }

  static async cleanupFreeUserMessages() {
    try {
      // Delete messages older than 30 days for free users
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30);

      const { data: deletedMessages, error } = await supabaseAdmin
        .from('messages')
        .delete()
        .in('sender_id', 
          supabaseAdmin
            .from('users')
            .select('telegram_id')
            .eq('is_premium', false)
        )
        .lt('sent_at', cutoffDate.toISOString());

      if (error) throw error;

      console.log(`✅ Cleaned up ${deletedMessages?.length || 0} free user messages`);
      return deletedMessages?.length || 0;
    } catch (error) {
      console.error('Error cleaning up free user messages:', error);
      return 0;
    }
  }

  static async reportMessage(messageId, reporterId, reason) {
    try {
      const { data: report, error } = await supabaseAdmin
        .from('message_reports')
        .insert({
          message_id: messageId,
          reporter_id: reporterId,
          reason: reason,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      return report;
    } catch (error) {
      console.error('Error reporting message:', error);
      throw error;
    }
  }

  static async getMessageStats() {
    try {
      const { count: totalMessages, error: totalError } = await supabaseAdmin
        .from('messages')
        .select('*', { count: 'exact', head: true });

      if (totalError) throw totalError;

      const today = new Date().toISOString().split('T')[0];
      const { count: todayMessages, error: todayError } = await supabaseAdmin
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .gte('sent_at', today);

      if (todayError) throw todayError;

      return {
        totalMessages: totalMessages || 0,
        todayMessages: todayMessages || 0
      };
    } catch (error) {
      console.error('Error fetching message stats:', error);
      return {
        totalMessages: 0,
        todayMessages: 0
      };
    }
  }
}