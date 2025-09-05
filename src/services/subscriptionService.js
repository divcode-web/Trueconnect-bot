import { supabaseAdmin } from '../config/database.js';

export class SubscriptionService {
  static subscriptionPlans = {
    silver: {
      name: 'Silver',
      price: 19.99,
      duration: 90, // 3 months in days
      currency: 'USD',
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
      currency: 'USD',
      features: [
        'All Silver features',
        'Unlimited super likes',
        'Priority in matching algorithm',
        'Extended location radius (200km)',
        'Advanced filters',
        'Rewind last swipe',
        '1 free boost per month'
      ]
    },
    platinum: {
      name: 'Platinum',
      price: 199.99,
      duration: 36500, // Lifetime (100 years)
      currency: 'USD',
      features: [
        'All Gold features',
        'Top picks daily suggestions',
        'Message before matching',
        'Unlimited location radius',
        'Premium badge on profile',
        'Priority customer support',
        'Unlimited boosts'
      ]
    }
  };

  static async createSubscription(userId, planType, paymentMethod, transactionId) {
    try {
      const plan = this.subscriptionPlans[planType];
      if (!plan) throw new Error('Invalid subscription plan');

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + plan.duration);

      const { data, error } = await supabaseAdmin
        .from('subscriptions')
        .insert({
          user_id: userId,
          plan_type: planType,
          status: 'active',
          started_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
          payment_method: paymentMethod,
          transaction_id: transactionId,
          amount_paid: plan.price,
          currency: plan.currency
        })
        .select()
        .single();

      if (error) throw error;

      // Update user's premium status
      await supabaseAdmin
        .from('users')
        .update({
          is_premium: true,
          premium_plan: planType,
          premium_expires_at: expiresAt.toISOString()
        })
        .eq('telegram_id', userId);

      return data;
    } catch (error) {
      console.error('Error creating subscription:', error);
      throw error;
    }
  }

  static async getUserSubscription(userId) {
    try {
      const { data, error } = await supabaseAdmin
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data;
    } catch (error) {
      console.error('Error fetching user subscription:', error);
      return null;
    }
  }

  static async isUserPremium(userId) {
    const subscription = await this.getUserSubscription(userId);
    return !!subscription;
  }

  static async getUserPremiumFeatures(userId) {
    const subscription = await this.getUserSubscription(userId);
    if (!subscription) return null;

    const plan = this.subscriptionPlans[subscription.plan_type];
    return {
      planType: subscription.plan_type,
      planName: plan.name,
      features: plan.features,
      expiresAt: subscription.expires_at
    };
  }

  static async cancelSubscription(userId) {
    try {
      const { error } = await supabaseAdmin
        .from('subscriptions')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('status', 'active');

      if (error) throw error;

      // Update user's premium status
      await supabaseAdmin
        .from('users')
        .update({
          is_premium: false,
          premium_plan: null,
          premium_expires_at: null
        })
        .eq('telegram_id', userId);

      return true;
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      return false;
    }
  }

  static async checkExpiredSubscriptions() {
    try {
      const { data: expiredSubs, error } = await supabaseAdmin
        .from('subscriptions')
        .select('*')
        .eq('status', 'active')
        .lt('expires_at', new Date().toISOString());

      if (error) throw error;

      for (const subscription of expiredSubs || []) {
        await this.cancelSubscription(subscription.user_id);
      }

      console.log(`✅ Processed ${expiredSubs?.length || 0} expired subscriptions`);
    } catch (error) {
      console.error('Error checking expired subscriptions:', error);
    }
  }

  static async recordPayment(userId, amount, currency, paymentMethod, transactionId, status = 'completed') {
    try {
      const { data, error } = await supabaseAdmin
        .from('payments')
        .insert({
          user_id: userId,
          amount: amount,
          currency: currency,
          payment_method: paymentMethod,
          transaction_id: transactionId,
          status: status,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error recording payment:', error);
      throw error;
    }
  }

  static async getUserPaymentHistory(userId) {
    try {
      const { data, error } = await supabaseAdmin
        .from('payments')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching payment history:', error);
      return [];
    }
  }
}