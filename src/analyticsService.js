import { supabaseAdmin } from '../config/database.js';

export class AnalyticsService {
  // Log user activity
  static async logActivity(userId, activityType, activityData = null) {
    try {
      const { error } = await supabaseAdmin.rpc('log_user_activity', {
        p_user_id: userId,
        p_activity_type: activityType,
        p_activity_data: activityData
      });

      if (error) throw error;
    } catch (error) {
      console.error('Error logging activity:', error);
    }
  }

  // Get user engagement metrics
  static async getUserEngagement(userId) {
    try {
      const { data, error } = await supabaseAdmin.rpc('get_user_stats', {
        user_id: userId
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching user engagement:', error);
      return null;
    }
  }

  // Get platform analytics
  static async getPlatformAnalytics() {
    try {
      // Daily active users
      const today = new Date().toISOString().split('T')[0];
      const { count: dailyActive } = await supabaseAdmin
        .from('user_activity_log')
        .select('user_id', { count: 'exact', head: true })
        .gte('created_at', today)
        .eq('activity_type', 'login');

      // Weekly active users
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const { count: weeklyActive } = await supabaseAdmin
        .from('user_activity_log')
        .select('user_id', { count: 'exact', head: true })
        .gte('created_at', weekAgo.toISOString())
        .eq('activity_type', 'login');

      // Monthly active users
      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      const { count: monthlyActive } = await supabaseAdmin
        .from('user_activity_log')
        .select('user_id', { count: 'exact', head: true })
        .gte('created_at', monthAgo.toISOString())
        .eq('activity_type', 'login');

      // Match rate
      const { count: totalSwipes } = await supabaseAdmin
        .from('user_swipes')
        .select('*', { count: 'exact', head: true })
        .in('action', ['like', 'super_like']);

      const { count: totalMatches } = await supabaseAdmin
        .from('matches')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);

      const matchRate = totalSwipes > 0 ? ((totalMatches * 2) / totalSwipes * 100).toFixed(2) : 0;

      // Popular activities
      const { data: activities } = await supabaseAdmin
        .from('user_activity_log')
        .select('activity_type')
        .gte('created_at', today);

      const activityCounts = activities?.reduce((acc, activity) => {
        acc[activity.activity_type] = (acc[activity.activity_type] || 0) + 1;
        return acc;
      }, {}) || {};

      return {
        dailyActiveUsers: dailyActive || 0,
        weeklyActiveUsers: weeklyActive || 0,
        monthlyActiveUsers: monthlyActive || 0,
        matchRate: parseFloat(matchRate),
        totalSwipes: totalSwipes || 0,
        totalMatches: totalMatches || 0,
        popularActivities: activityCounts
      };
    } catch (error) {
      console.error('Error fetching platform analytics:', error);
      return {
        dailyActiveUsers: 0,
        weeklyActiveUsers: 0,
        monthlyActiveUsers: 0,
        matchRate: 0,
        totalSwipes: 0,
        totalMatches: 0,
        popularActivities: {}
      };
    }
  }

  // Get conversion metrics
  static async getConversionMetrics() {
    try {
      const { count: totalUsers } = await supabaseAdmin
        .from('users')
        .select('*', { count: 'exact', head: true });

      const { count: completedProfiles } = await supabaseAdmin
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('profile_completed', true);

      const { count: verifiedUsers } = await supabaseAdmin
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('is_verified', true);

      const { count: premiumUsers } = await supabaseAdmin
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('is_premium', true);

      const profileCompletionRate = totalUsers > 0 ? (completedProfiles / totalUsers * 100).toFixed(2) : 0;
      const verificationRate = totalUsers > 0 ? (verifiedUsers / totalUsers * 100).toFixed(2) : 0;
      const premiumConversionRate = totalUsers > 0 ? (premiumUsers / totalUsers * 100).toFixed(2) : 0;

      return {
        totalUsers: totalUsers || 0,
        completedProfiles: completedProfiles || 0,
        verifiedUsers: verifiedUsers || 0,
        premiumUsers: premiumUsers || 0,
        profileCompletionRate: parseFloat(profileCompletionRate),
        verificationRate: parseFloat(verificationRate),
        premiumConversionRate: parseFloat(premiumConversionRate)
      };
    } catch (error) {
      console.error('Error fetching conversion metrics:', error);
      return {
        totalUsers: 0,
        completedProfiles: 0,
        verifiedUsers: 0,
        premiumUsers: 0,
        profileCompletionRate: 0,
        verificationRate: 0,
        premiumConversionRate: 0
      };
    }
  }

  // Get revenue metrics
  static async getRevenueMetrics() {
    try {
      const { data: payments, error } = await supabaseAdmin
        .from('payments')
        .select('amount, currency, created_at')
        .eq('status', 'completed');

      if (error) throw error;

      const totalRevenue = payments?.reduce((sum, payment) => sum + parseFloat(payment.amount || 0), 0) || 0;

      // Revenue by month
      const monthlyRevenue = payments?.reduce((acc, payment) => {
        const month = payment.created_at.substring(0, 7); // YYYY-MM
        acc[month] = (acc[month] || 0) + parseFloat(payment.amount || 0);
        return acc;
      }, {}) || {};

      // Active subscriptions value
      const { data: subscriptions, error: subError } = await supabaseAdmin
        .from('subscriptions')
        .select('amount_paid')
        .eq('status', 'active');

      if (subError) throw subError;

      const recurringRevenue = subscriptions?.reduce((sum, sub) => sum + parseFloat(sub.amount_paid || 0), 0) || 0;

      return {
        totalRevenue,
        recurringRevenue,
        monthlyRevenue,
        totalTransactions: payments?.length || 0
      };
    } catch (error) {
      console.error('Error fetching revenue metrics:', error);
      return {
        totalRevenue: 0,
        recurringRevenue: 0,
        monthlyRevenue: {},
        totalTransactions: 0
      };
    }
  }
}