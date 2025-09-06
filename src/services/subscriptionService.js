import { supabaseAdmin } from '../config/database.js';

export class SubscriptionService {
  static subscriptionPlans = {
    silver: {
      name: 'Silver',
      price: 19.99,
      duration: 90, // 3 months in days
      features: [
        'Unlimited likes per day',
        'See who liked you',
        '3 super likes daily',
        'Message read receipts',
        'Basic location radius (50km)'
      ]
    },
    gold: {
      name: 'Gold',
      price: 59.99,
      duration: 365, // 1 year in days
      features: [
        'All Silver features',
        'Unlimited super likes',
        'Priority in matching',
        'Extended location radius (200km)',
        'Advanced filters',
        'Rewind last swipe',
        '1 free boost per month'
      ]
    },
    platinum: {
      name: 'Platinum',
      price: 199.99,
      duration: null, // Lifetime
      features: [
        'All Gold features',
        'Top picks daily',
        'Message before matching',
        'Unlimited location radius',
        'Premium badge',
        'Priority support',
        'Unlimited boosts'
      ]
    }
  };

  static async isUserPremium(telegramId) {
    try {
      const { data: subscription, error } = await supabaseAdmin
        .from('subscriptions')
        .select('*')
        .eq('user_id', telegramId)
        .eq('status', 'active')
        .gte('expires_at', new Date().toISOString())
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return !!subscription;
    } catch (error) {
      console.error('Error checking premium status:', error);
      return false;
    }
  }

  static async getUserSubscription(telegramId) {
    try {
      const { data: subscription, error } = await supabaseAdmin
        .from('subscriptions')
        .select('*')
        .eq('user_id', telegramId)
        .eq('status', 'active')
        .gte('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return subscription;
    } catch (error) {
      console.error('Error fetching user subscription:', error);
      return null;
    }
  }

  static async createSubscription(telegramId, planType, paymentMethod, transactionId, amountPaid) {
    try {
      const plan = this.subscriptionPlans[planType];
      if (!plan) throw new Error('Invalid plan type');

      const startDate = new Date();
      const expiryDate = plan.duration ? new Date(startDate.getTime() + (plan.duration * 24 * 60 * 60 * 1000)) : null;

      const subscriptionData = {
        user_id: telegramId,
        plan_type: planType,
        status: 'active',
        payment_method: paymentMethod,
        transaction_id: transactionId,
        amount_paid: amountPaid,
        starts_at: startDate.toISOString(),
        expires_at: expiryDate ? expiryDate.toISOString() : null,
        created_at: startDate.toISOString()
      };

      const { data: subscription, error } = await supabaseAdmin
        .from('subscriptions')
        .insert(subscriptionData)
        .select()
        .single();

      if (error) throw error;

      // Update user premium status
      await supabaseAdmin
        .from('users')
        .update({
          is_premium: true,
          premium_plan: planType,
          premium_expires_at: expiryDate ? expiryDate.toISOString() : null
        })
        .eq('telegram_id', telegramId);

      return subscription;
    } catch (error) {
      console.error('Error creating subscription:', error);
      throw error;
    }
  }

  static async cancelSubscription(subscriptionId, reason = null) {
    try {
      const { data: subscription, error } = await supabaseAdmin
        .from('subscriptions')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancellation_reason: reason
        })
        .eq('id', subscriptionId)
        .select()
        .single();

      if (error) throw error;

      // Update user premium status
      await supabaseAdmin
        .from('users')
        .update({
          is_premium: false,
          premium_plan: null,
          premium_expires_at: null
        })
        .eq('telegram_id', subscription.user_id);

      return subscription;
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      throw error;
    }
  }

  static async checkExpiredSubscriptions() {
    try {
      const { data: expiredSubscriptions, error } = await supabaseAdmin
        .from('subscriptions')
        .select('*')
        .eq('status', 'active')
        .lt('expires_at', new Date().toISOString())
        .neq('expires_at', null); // Exclude lifetime plans

      if (error) throw error;

      for (const subscription of expiredSubscriptions || []) {
        // Update subscription status
        await supabaseAdmin
          .from('subscriptions')
          .update({
            status: 'expired',
            expired_at: new Date().toISOString()
          })
          .eq('id', subscription.id);

        // Update user premium status
        await supabaseAdmin
          .from('users')
          .update({
            is_premium: false,
            premium_plan: null,
            premium_expires_at: null
          })
          .eq('telegram_id', subscription.user_id);
      }

      console.log(`✅ Processed ${expiredSubscriptions?.length || 0} expired subscriptions`);
    } catch (error) {
      console.error('Error checking expired subscriptions:', error);
    }
  }

  static async renewSubscription(subscriptionId, transactionId, amountPaid) {
    try {
      const { data: subscription, error: fetchError } = await supabaseAdmin
        .from('subscriptions')
        .select('*')
        .eq('id', subscriptionId)
        .single();

      if (fetchError) throw fetchError;

      const plan = this.subscriptionPlans[subscription.plan_type];
      if (!plan) throw new Error('Invalid plan type');

      const startDate = new Date();
      const expiryDate = plan.duration ? new Date(startDate.getTime() + (plan.duration * 24 * 60 * 60 * 1000)) : null;

      const { data: updatedSubscription, error } = await supabaseAdmin
        .from('subscriptions')
        .update({
          status: 'active',
          last_payment_transaction_id: transactionId,
          last_payment_amount: amountPaid,
          last_payment_date: startDate.toISOString(),
          expires_at: expiryDate ? expiryDate.toISOString() : null,
          updated_at: startDate.toISOString()
        })
        .eq('id', subscriptionId)
        .select()
        .single();

      if (error) throw error;

      // Update user premium status
      await supabaseAdmin
        .from('users')
        .update({
          is_premium: true,
          premium_plan: subscription.plan_type,
          premium_expires_at: expiryDate ? expiryDate.toISOString() : null
        })
        .eq('telegram_id', subscription.user_id);

      return updatedSubscription;
    } catch (error) {
      console.error('Error renewing subscription:', error);
      throw error;
    }
  }

  static async getUserSubscriptionHistory(telegramId) {
    try {
      const { data: subscriptions, error } = await supabaseAdmin
        .from('subscriptions')
        .select('*')
        .eq('user_id', telegramId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return subscriptions || [];
    } catch (error) {
      console.error('Error fetching subscription history:', error);
      return [];
    }
  }

  static async getSubscriptionStats() {
    try {
      const { data: stats, error } = await supabaseAdmin
        .from('subscriptions')
        .select('plan_type, status, amount_paid')
        .eq('status', 'active');

      if (error) throw error;

      const totalRevenue = stats?.reduce((sum, sub) => sum + (sub.amount_paid || 0), 0) || 0;
      const planCounts = stats?.reduce((acc, sub) => {
        acc[sub.plan_type] = (acc[sub.plan_type] || 0) + 1;
        return acc;
      }, {}) || {};

      return {
        totalActiveSubscriptions: stats?.length || 0,
        totalRevenue,
        planBreakdown: planCounts
      };
    } catch (error) {
      console.error('Error fetching subscription stats:', error);
      return {
        totalActiveSubscriptions: 0,
        totalRevenue: 0,
        planBreakdown: {}
      };
    }
  }
}