import { supabaseAdmin } from '../config/database.js';

export class ReportService {
  static reportTypes = {
    fake_profile: 'Fake Profile',
    harassment: 'Harassment',
    inappropriate_content: 'Inappropriate Content',
    spam: 'Spam',
    underage: 'Underage User',
    other: 'Other'
  };

  static async createReport(reporterId, reportedId, reportType, description, evidence = null) {
    try {
      // Validate input parameters
      if (!reporterId || !reportedId || !reportType || !description) {
        throw new Error('Missing required report parameters');
      }

      // Ensure reportType is valid
      if (!Object.keys(this.reportTypes).includes(reportType)) {
        throw new Error('Invalid report type');
      }

      const { data, error } = await supabaseAdmin
        .from('reports')
        .insert({
          reporter_id: reporterId,
          reported_id: reportedId,
          report_type: reportType,
          description: description,
          evidence: evidence,
          status: 'pending',
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      // Auto-escalate serious reports
      if (['harassment', 'underage', 'inappropriate_content'].includes(reportType)) {
        await this.escalateReport(data.id);
      }

      return data;
    } catch (error) {
      console.error('Error creating report:', error);
      throw error;
    }
  }

  static async escalateReport(reportId) {
    try {
      const { error } = await supabaseAdmin
        .from('reports')
        .update({
          status: 'escalated',
          escalated_at: new Date().toISOString()
        })
        .eq('id', reportId);

      if (error) throw error;
    } catch (error) {
      console.error('Error escalating report:', error);
    }
  }

  static async getPendingReports() {
    try {
      const { data, error } = await supabaseAdmin
        .from('reports')
        .select(`
          *,
          reporter:users!reports_reporter_id_fkey(first_name, username, telegram_id),
          reported:users!reports_reported_id_fkey(first_name, username, telegram_id)
        `)
        .in('status', ['pending', 'escalated'])
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching pending reports:', error);
      return [];
    }
  }

  static async resolveReport(reportId, adminId, action, notes = null) {
    try {
      const { data, error } = await supabaseAdmin
        .from('reports')
        .update({
          status: 'resolved',
          admin_action: action,
          admin_notes: notes,
          resolved_by: adminId,
          resolved_at: new Date().toISOString()
        })
        .eq('id', reportId)
        .select()
        .single();

      if (error) throw error;

      // Execute admin action
      if (action === 'ban_user') {
        await this.banUser(data.reported_id, adminId, 'Banned due to report resolution');
      } else if (action === 'suspend_user') {
        await this.suspendUser(data.reported_id, adminId, 7); // 7 days suspension
      } else if (action === 'warn_user') {
        await this.warnUser(data.reported_id, adminId, notes);
      }

      return data;
    } catch (error) {
      console.error('Error resolving report:', error);
      throw error;
    }
  }

  static async banUser(userId, adminId, reason) {
    try {
      const { error } = await supabaseAdmin
        .from('users')
        .update({
          is_banned: true,
          banned_at: new Date().toISOString(),
          banned_by: adminId,
          ban_reason: reason,
          is_active: false
        })
        .eq('telegram_id', userId);

      if (error) throw error;

      // Record moderation action
      await this.recordModerationAction(userId, adminId, 'ban', reason);
    } catch (error) {
      console.error('Error banning user:', error);
      throw error;
    }
  }

  static async suspendUser(userId, adminId, days, reason = null) {
    try {
      const suspendedUntil = new Date();
      suspendedUntil.setDate(suspendedUntil.getDate() + days);

      const { error } = await supabaseAdmin
        .from('users')
        .update({
          is_suspended: true,
          suspended_until: suspendedUntil.toISOString(),
          suspended_by: adminId,
          suspension_reason: reason,
          is_active: false
        })
        .eq('telegram_id', userId);

      if (error) throw error;

      // Record moderation action
      await this.recordModerationAction(userId, adminId, 'suspend', `${days} days: ${reason}`);
    } catch (error) {
      console.error('Error suspending user:', error);
      throw error;
    }
  }

  static async warnUser(userId, adminId, reason) {
    try {
      // Record warning
      await this.recordModerationAction(userId, adminId, 'warn', reason);

      // Increment warning count
      const { error } = await supabaseAdmin
        .from('users')
        .update({
          warning_count: supabaseAdmin.raw('warning_count + 1')
        })
        .eq('telegram_id', userId);

      if (error) throw error;
    } catch (error) {
      console.error('Error warning user:', error);
      throw error;
    }
  }

  static async recordModerationAction(userId, adminId, action, reason) {
    try {
      const { error } = await supabaseAdmin
        .from('moderation_actions')
        .insert({
          user_id: userId,
          admin_id: adminId,
          action: action,
          reason: reason,
          created_at: new Date().toISOString()
        });

      if (error) throw error;
    } catch (error) {
      console.error('Error recording moderation action:', error);
    }
  }

  static async getUserReports(userId) {
    try {
      const { data, error } = await supabaseAdmin
        .from('reports')
        .select(`
          *,
          reporter:users!reports_reporter_id_fkey(first_name, username)
        `)
        .eq('reported_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching user reports:', error);
      return [];
    }
  }

  static async getModerationHistory(userId) {
    try {
      const { data, error } = await supabaseAdmin
        .from('moderation_actions')
        .select(`
          *,
          admin:users!moderation_actions_admin_id_fkey(first_name, username)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching moderation history:', error);
      return [];
    }
  }

  static async unbanUser(userId, adminId) {
    try {
      const { error } = await supabaseAdmin
        .from('users')
        .update({
          is_banned: false,
          banned_at: null,
          banned_by: null,
          ban_reason: null,
          is_active: true
        })
        .eq('telegram_id', userId);

      if (error) throw error;

      // Record moderation action
      await this.recordModerationAction(userId, adminId, 'unban', 'User unbanned by admin');
    } catch (error) {
      console.error('Error unbanning user:', error);
      throw error;
    }
  }

  static async checkSuspensions() {
    try {
      const { data: suspendedUsers, error } = await supabaseAdmin
        .from('users')
        .select('telegram_id')
        .eq('is_suspended', true)
        .lt('suspended_until', new Date().toISOString());

      if (error) throw error;

      for (const user of suspendedUsers || []) {
        await supabaseAdmin
          .from('users')
          .update({
            is_suspended: false,
            suspended_until: null,
            suspended_by: null,
            suspension_reason: null,
            is_active: true
          })
          .eq('telegram_id', user.telegram_id);
      }

      console.log(`✅ Lifted suspensions for ${suspendedUsers?.length || 0} users`);
    } catch (error) {
      console.error('Error checking suspensions:', error);
    }
  }
}