import express from 'express';
import { PaymentService } from '../services/paymentService.js';
import { bot } from '../config/telegram.js';
import crypto from 'crypto';

const router = express.Router();

// Telegram Stars webhook handler
router.post('/telegram/stars', async (req, res) => {
  try {
    const { pre_checkout_query, successful_payment } = req.body;

    if (pre_checkout_query) {
      // Answer pre-checkout query
      await bot.answerPreCheckoutQuery(pre_checkout_query.id, true);
      return res.status(200).json({ ok: true });
    }

    if (successful_payment) {
      const payload = successful_payment.invoice_payload;
      const [, planType, userId] = payload.split('_');
      
      try {
        const result = await PaymentService.processTelegramStarsPayment(
          parseInt(userId),
          planType,
          successful_payment.total_amount,
          successful_payment.telegram_payment_charge_id
        );

        // Notify user
        await bot.sendMessage(parseInt(userId), 
          `✅ Payment Successful!\n\n` +
          `Your ${planType.charAt(0).toUpperCase() + planType.slice(1)} subscription is now active!\n\n` +
          `Enjoy all premium features and happy matching!`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '💕 Start Browsing', callback_data: 'browse' }],
                [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
              ]
            }
          }
        );
      } catch (error) {
        console.error('Error processing Telegram Stars payment:', error);
        await bot.sendMessage(parseInt(userId), 
          '❌ Payment processing failed. Please contact support.'
        );
      }
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Telegram Stars webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// PayStack webhook handler
router.post('/paystack', async (req, res) => {
  try {
    const signature = req.headers['x-paystack-signature'];
    const secret = process.env.PAYSTACK_SECRET_KEY;
    
    // Verify webhook signature
    if (!PaymentService.validateWebhookSignature(JSON.stringify(req.body), signature, secret)) {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const { event, data } = req.body;

    if (event === 'charge.success') {
      try {
        const result = await PaymentService.verifyPayStackPayment(data.reference);
        
        // Extract user ID from reference
        const userId = parseInt(data.reference.split('_')[1]);
        
        // Notify user
        await bot.sendMessage(userId, 
          `✅ Payment Successful!\n\n` +
          `Your premium subscription is now active!\n\n` +
          `Transaction ID: ${data.reference}\n` +
          `Amount: ₦${(data.amount / 100).toLocaleString()}\n\n` +
          `Enjoy all premium features!`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '💕 Start Browsing', callback_data: 'browse' }],
                [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
              ]
            }
          }
        );
      } catch (error) {
        console.error('Error processing PayStack payment:', error);
      }
    }

    res.status(200).json({ message: 'Webhook received' });
  } catch (error) {
    console.error('PayStack webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// NOWPayments webhook handler
router.post('/nowpayments', async (req, res) => {
  try {
    const signature = req.headers['x-nowpayments-sig'];
    const secret = process.env.NOWPAYMENTS_IPN_SECRET;
    
    // Verify webhook signature
    if (!PaymentService.validateWebhookSignature(JSON.stringify(req.body), signature, secret)) {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    try {
      const result = await PaymentService.handleNOWPaymentsWebhook(req.body);
      
      if (result) {
        // Extract user ID from order_id
        const userId = parseInt(req.body.order_id.split('_')[1]);
        
        // Notify user
        await bot.sendMessage(userId, 
          `✅ Crypto Payment Confirmed!\n\n` +
          `Your premium subscription is now active!\n\n` +
          `Payment ID: ${req.body.payment_id}\n` +
          `Amount: ${req.body.pay_amount} ${req.body.pay_currency.toUpperCase()}\n\n` +
          `Thank you for choosing premium!`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '💕 Start Browsing', callback_data: 'browse' }],
                [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
              ]
            }
          }
        );
      }
    } catch (error) {
      console.error('Error processing NOWPayments webhook:', error);
    }

    res.status(200).json({ message: 'OK' });
  } catch (error) {
    console.error('NOWPayments webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Payment success page
router.get('/success', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Payment Successful</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f0f0f0; }
            .container { background: white; padding: 40px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); max-width: 500px; margin: 0 auto; }
            .success { color: #28a745; font-size: 48px; margin-bottom: 20px; }
            .title { color: #333; font-size: 24px; margin-bottom: 15px; }
            .message { color: #666; font-size: 16px; line-height: 1.5; margin-bottom: 30px; }
            .button { background: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-size: 16px; }
            .button:hover { background: #0056b3; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="success">✅</div>
            <h1 class="title">Payment Successful!</h1>
            <p class="message">
                Thank you for your payment! Your premium subscription has been activated.
                <br><br>
                You can now return to the bot and enjoy all premium features.
            </p>
            <a href="https://t.me/your_bot_username" class="button">Return to Bot</a>
        </div>
    </body>
    </html>
  `);
});

// Payment cancel page
router.get('/cancel', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Payment Cancelled</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f0f0f0; }
            .container { background: white; padding: 40px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); max-width: 500px; margin: 0 auto; }
            .cancel { color: #dc3545; font-size: 48px; margin-bottom: 20px; }
            .title { color: #333; font-size: 24px; margin-bottom: 15px; }
            .message { color: #666; font-size: 16px; line-height: 1.5; margin-bottom: 30px; }
            .button { background: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-size: 16px; margin: 0 10px; }
            .button:hover { background: #0056b3; }
            .button.secondary { background: #6c757d; }
            .button.secondary:hover { background: #545b62; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="cancel">❌</div>
            <h1 class="title">Payment Cancelled</h1>
            <p class="message">
                Your payment was cancelled. No charges were made to your account.
                <br><br>
                You can try again anytime or return to the bot.
            </p>
            <a href="https://t.me/your_bot_username" class="button">Return to Bot</a>
            <a href="/premium" class="button secondary">Try Again</a>
        </div>
    </body>
    </html>
  `);
});

export default router;