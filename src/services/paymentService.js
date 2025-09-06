import { supabaseAdmin } from '../config/database.js';
import { SubscriptionService } from './subscriptionService.js';
import crypto from 'crypto';

export class PaymentService {
  // Process Telegram Stars payment
  static async processTelegramStarsPayment(userId, planType, amount, transactionId) {
    try {
      // Record payment
      const { data: payment, error: paymentError } = await supabaseAdmin
        .from('payments')
        .insert({
          user_id: userId,
          amount: amount / 100, // Stars are in minor units
          currency: 'XTR',
          payment_method: 'telegram_stars',
          transaction_id: transactionId,
          status: 'completed'
        })
        .select()
        .single();

      if (paymentError) throw paymentError;

      // Create subscription
      const subscription = await SubscriptionService.createSubscription(
        userId,
        planType,
        'telegram_stars',
        transactionId,
        amount / 100
      );

      return { payment, subscription };
    } catch (error) {
      console.error('Error processing Telegram Stars payment:', error);
      throw error;
    }
  }

  // Initialize PayStack payment
  static async initializePayStackPayment(userId, planType, email) {
    try {
      const plan = SubscriptionService.subscriptionPlans[planType];
      if (!plan) throw new Error('Invalid plan type');

      const amount = Math.round(plan.price * 100); // PayStack expects amount in kobo
      
      const paymentData = {
        email: email,
        amount: amount,
        currency: 'NGN', // Nigerian Naira
        reference: `datingbot_${userId}_${planType}_${Date.now()}`,
        callback_url: `${process.env.WEBHOOK_URL}/webhook/paystack`,
        metadata: {
          user_id: userId,
          plan_type: planType
        }
      };

      // In production, you would make an API call to PayStack here
      // For now, return mock data
      return {
        authorization_url: `https://checkout.paystack.com/mock_${paymentData.reference}`,
        reference: paymentData.reference,
        access_code: `mock_access_code_${Date.now()}`
      };
    } catch (error) {
      console.error('Error initializing PayStack payment:', error);
      throw error;
    }
  }

  // Verify PayStack payment
  static async verifyPayStackPayment(reference) {
    try {
      // In production, verify with PayStack API
      // For now, return mock verification
      
      // Extract user and plan info from reference
      const parts = reference.split('_');
      if (parts.length < 3) throw new Error('Invalid reference format');
      
      const userId = parseInt(parts[1]);
      const planType = parts[2];

      const plan = SubscriptionService.subscriptionPlans[planType];
      if (!plan) throw new Error('Invalid plan type');

      // Record payment
      const { data: payment, error: paymentError } = await supabaseAdmin
        .from('payments')
        .insert({
          user_id: userId,
          amount: plan.price,
          currency: 'NGN',
          payment_method: 'paystack',
          transaction_id: reference,
          status: 'completed'
        })
        .select()
        .single();

      if (paymentError) throw paymentError;

      // Create subscription
      const subscription = await SubscriptionService.createSubscription(
        userId,
        planType,
        'paystack',
        reference,
        plan.price
      );

      return { payment, subscription };
    } catch (error) {
      console.error('Error verifying PayStack payment:', error);
      throw error;
    }
  }

  // Initialize NOWPayments crypto payment
  static async initializeNOWPayment(userId, planType, currency = 'btc') {
    try {
      const plan = SubscriptionService.subscriptionPlans[planType];
      if (!plan) throw new Error('Invalid plan type');

      const orderId = `datingbot_${userId}_${planType}_${Date.now()}`;
      
      const paymentData = {
        price_amount: plan.price,
        price_currency: 'USD',
        pay_currency: currency.toUpperCase(),
        order_id: orderId,
        order_description: `${plan.name} Plan Subscription`,
        ipn_callback_url: `${process.env.WEBHOOK_URL}/webhook/nowpayments`,
        success_url: `${process.env.WEBHOOK_URL}/payment/success`,
        cancel_url: `${process.env.WEBHOOK_URL}/payment/cancel`
      };

      // In production, make API call to NOWPayments
      // For now, return mock data
      return {
        payment_id: `mock_payment_${Date.now()}`,
        payment_status: 'waiting',
        pay_address: `mock_address_${currency}`,
        pay_amount: plan.price * 0.000025, // Mock conversion rate
        order_id: orderId,
        payment_url: `https://nowpayments.io/payment/mock_${orderId}`
      };
    } catch (error) {
      console.error('Error initializing NOWPayments payment:', error);
      throw error;
    }
  }

  // Handle NOWPayments webhook
  static async handleNOWPaymentsWebhook(webhookData) {
    try {
      const { payment_id, payment_status, order_id, price_amount, pay_currency } = webhookData;

      if (payment_status !== 'finished') {
        console.log(`Payment ${payment_id} status: ${payment_status}`);
        return;
      }

      // Extract user and plan info from order_id
      const parts = order_id.split('_');
      if (parts.length < 3) throw new Error('Invalid order_id format');
      
      const userId = parseInt(parts[1]);
      const planType = parts[2];

      // Record payment
      const { data: payment, error: paymentError } = await supabaseAdmin
        .from('payments')
        .insert({
          user_id: userId,
          amount: price_amount,
          currency: pay_currency,
          payment_method: 'nowpayments',
          transaction_id: payment_id,
          status: 'completed'
        })
        .select()
        .single();

      if (paymentError) throw paymentError;

      // Create subscription
      const subscription = await SubscriptionService.createSubscription(
        userId,
        planType,
        'nowpayments',
        payment_id,
        price_amount
      );

      return { payment, subscription };
    } catch (error) {
      console.error('Error handling NOWPayments webhook:', error);
      throw error;
    }
  }

  // Get user payment history
  static async getUserPaymentHistory(userId) {
    try {
      const { data: payments, error } = await supabaseAdmin
        .from('payments')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return payments || [];
    } catch (error) {
      console.error('Error fetching payment history:', error);
      return [];
    }
  }

  // Refund payment
  static async refundPayment(paymentId, reason = null) {
    try {
      const { data: payment, error: fetchError } = await supabaseAdmin
        .from('payments')
        .select('*')
        .eq('id', paymentId)
        .single();

      if (fetchError) throw fetchError;

      if (payment.status === 'refunded') {
        throw new Error('Payment already refunded');
      }

      // Update payment status
      const { data: updatedPayment, error: updateError } = await supabaseAdmin
        .from('payments')
        .update({
          status: 'refunded',
          refund_reason: reason,
          refunded_at: new Date().toISOString()
        })
        .eq('id', paymentId)
        .select()
        .single();

      if (updateError) throw updateError;

      // Cancel associated subscription if exists
      const { data: subscription } = await supabaseAdmin
        .from('subscriptions')
        .select('id')
        .eq('transaction_id', payment.transaction_id)
        .single();

      if (subscription) {
        await SubscriptionService.cancelSubscription(subscription.id, 'Payment refunded');
      }

      return updatedPayment;
    } catch (error) {
      console.error('Error processing refund:', error);
      throw error;
    }
  }

  // Generate payment link
  static generatePaymentLink(userId, planType, method) {
    const baseUrl = process.env.WEBHOOK_URL || 'https://your-domain.com';
    return `${baseUrl}/payment/${method}?user=${userId}&plan=${planType}`;
  }

  // Validate webhook signature (for security)
  static validateWebhookSignature(payload, signature, secret) {
    const computedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(computedSignature, 'hex')
    );
  }

  // Get payment statistics
  static async getPaymentStats() {
    try {
      const { data: payments, error } = await supabaseAdmin
        .from('payments')
        .select('amount, currency, payment_method, status, created_at');

      if (error) throw error;

      const stats = {
        totalRevenue: 0,
        totalTransactions: payments?.length || 0,
        completedTransactions: 0,
        failedTransactions: 0,
        refundedTransactions: 0,
        paymentMethods: {},
        currencies: {},
        dailyRevenue: {}
      };

      payments?.forEach(payment => {
        const amount = parseFloat(payment.amount || 0);
        const method = payment.payment_method || 'unknown';
        const currency = payment.currency || 'USD';
        const date = payment.created_at.split('T')[0];

        if (payment.status === 'completed') {
          stats.totalRevenue += amount;
          stats.completedTransactions++;
          
          stats.dailyRevenue[date] = (stats.dailyRevenue[date] || 0) + amount;
        } else if (payment.status === 'failed') {
          stats.failedTransactions++;
        } else if (payment.status === 'refunded') {
          stats.refundedTransactions++;
        }

        stats.paymentMethods[method] = (stats.paymentMethods[method] || 0) + 1;
        stats.currencies[currency] = (stats.currencies[currency] || 0) + amount;
      });

      return stats;
    } catch (error) {
      console.error('Error fetching payment stats:', error);
      return {
        totalRevenue: 0,
        totalTransactions: 0,
        completedTransactions: 0,
        failedTransactions: 0,
        refundedTransactions: 0,
        paymentMethods: {},
        currencies: {},
        dailyRevenue: {}
      };
    }
  }
}