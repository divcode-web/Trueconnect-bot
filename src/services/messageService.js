import { supabaseAdmin } from '../config/database.js';

export class MessageService {
  static async sendMessage(senderId, receiverId, content, messageType = 'text') {
    try {
      // Check if users are matched
      const isMatched = await this.areUsersMatched(senderId, receiverId);
      if (!isMatched) {
        throw new Error('Users are not matched');
      }

      const { data, error } = await supabaseAdmin
        .from('messages')
        .insert({
          sender_id: senderId,
          receiver_id: receiverId,
          content: content,
          message_type: messageType,
          sent_at: new Date().toISOString(),
          is_read: false
        })
        .select()
        .single();

      if (error) throw error;

      // Update last message in match
      await this.updateMatchLastMessage(senderId, receiverId, content);

      return data;
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  static async getConversation(userId1, userId2, limit = 50, offset = 0) {
    try {
      const { data, error } = await supabaseAdmin
        .from('messages')
        .select(`
          *,
          sender:users!messages_sender_id_fkey(first_name, username),
          receiver:users!messages_receiver_id_fkey(first_name, username)
        `)
        .or(`and(sender_id.eq.${userId1},receiver_id.eq.${userId2}),and(sender_id.eq.${userId2},receiver_id.eq.${userId1})`)
        .order('sent_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;
      return data?.reverse() || [];
    } catch (error) {
      console.error('Error fetching conversation:', error);
      return [];
    }
  }

  static async markMessagesAsRead(userId, senderId) {
    try {
      const { error } = await supabaseAdmin
        .from('messages')
        .update({ is_read: true, read_at: new Date().toISOString() })
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
      console.error('Error getting unread message count:', error);
      return 0;
    }
  }

  static async areUsersMatched(userId1, userId2) {
    try {
      const { data, error } = await supabaseAdmin
        .from('matches')
        .select('*')
        .or(`and(user1_id.eq.${Math.min(userId1, userId2)},user2_id.eq.${Math.max(userId1, userId2)})`)
        .eq('is_active', true)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return !!data;
    } catch (error) {
      console.error('Error checking if users are matched:', error);
      return false;
    }
  }

  static async updateMatchLastMessage(userId1, userId2, lastMessage) {
    try {
      const { error } = await supabaseAdmin
        .from('matches')
        .update({
          last_message: lastMessage.substring(0, 100),
          last_message_at: new Date().toISOString()
        })
        .or(`and(user1_id.eq.${Math.min(userId1, userId2)},user2_id.eq.${Math.max(userId1, userId2)})`);

      if (error) throw error;
    } catch (error) {
      console.error('Error updating match last message:', error);
    }
  }

  static async archiveOldMessages() {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 60); // 60 days ago

      // Get old messages
      const { data: oldMessages, error: fetchError } = await supabaseAdmin
        .from('messages')
        .select('*')
        .lt('sent_at', cutoffDate.toISOString());

      if (fetchError) throw fetchError;

      if (oldMessages && oldMessages.length > 0) {
        // Group messages by conversation
        const conversations = {};
        oldMessages.forEach(msg => {
          const key = `${Math.min(msg.sender_id, msg.receiver_id)}_${Math.max(msg.sender_id, msg.receiver_id)}`;
          if (!conversations[key]) conversations[key] = [];
          conversations[key].push(msg);
        });

        // Archive each conversation
        for (const [conversationKey, messages] of Object.entries(conversations)) {
          const fileName = `archived_messages_${conversationKey}_${Date.now()}.json`;
          
          // Upload to Supabase Storage
          const { error: uploadError } = await supabaseAdmin.storage
            .from('message-archives')
            .upload(fileName, JSON.stringify(messages, null, 2), {
              contentType: 'application/json'
            });

          if (uploadError) {
            console.error('Error uploading archived messages:', uploadError);
            continue;
          }

          // Delete messages from database
          const messageIds = messages.map(m => m.id);
          const { error: deleteError } = await supabaseAdmin
            .from('messages')
            .delete()
            .in('id', messageIds);

          if (deleteError) {
            console.error('Error deleting archived messages:', deleteError);
          }
        }

        console.log(`✅ Archived ${oldMessages.length} old messages`);
      }
    } catch (error) {
      console.error('Error archiving old messages:', error);
    }
  }

  static async cleanupFreeUserMessages() {
    try {
      // Get free users (users without active premium subscriptions)
      const { data: freeUsers, error: usersError } = await supabaseAdmin
        .from('users')
        .select(`
          telegram_id,
          subscriptions!left(*)
        `)
        .is('subscriptions.id', null)
        .or('subscriptions.status.neq.active,subscriptions.expires_at.lt.now()', { foreignTable: 'subscriptions' });

      if (usersError) throw usersError;

      for (const user of freeUsers || []) {
        // Keep only last 100 messages for each free user
        const { data: userMessages, error: messagesError } = await supabaseAdmin
          .from('messages')
          .select('id')
          .or(`sender_id.eq.${user.telegram_id},receiver_id.eq.${user.telegram_id}`)
          .order('sent_at', { ascending: false })
          .range(100, 999999); // Skip first 100, get the rest

        if (messagesError) continue;

        if (userMessages && userMessages.length > 0) {
          const messageIds = userMessages.map(m => m.id);
          const { error: deleteError } = await supabaseAdmin
            .from('messages')
            .delete()
            .in('id', messageIds);

          if (deleteError) {
            console.error(`Error cleaning up messages for user ${user.telegram_id}:`, deleteError);
          }
        }
      }

      console.log('✅ Cleaned up free user messages');
    } catch (error) {
      console.error('Error cleaning up free user messages:', error);
    }
  }
}