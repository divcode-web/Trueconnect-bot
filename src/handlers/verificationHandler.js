import { VerificationService } from '../services/verificationService.js';
import { UserService } from '../services/userService.js';
import { bot } from '../config/telegram.js';

export class VerificationHandler {
  // Handle video upload for verification
  static async handleVideoUpload(msg, user) {
    try {
      if (!msg.video) {
        await bot.sendMessage(msg.chat.id, 'Please upload a valid video file.');
        return;
      }

      // Check video duration (should be 5-30 seconds)
      if (msg.video.duration > 30) {
        await bot.sendMessage(msg.chat.id, 'Video is too long. Please upload a video under 30 seconds.');
        return;
      }

      if (msg.video.duration < 3) {
        await bot.sendMessage(msg.chat.id, 'Video is too short. Please upload a video at least 3 seconds long.');
        return;
      }

      // Submit verification video
      const result = await VerificationService.submitVerificationVideo(user.telegram_id, msg.video);
      
      // Clear the uploading_verification flag
      await UserService.updateUser(user.telegram_id, { uploading_verification: false });
      
      await bot.sendMessage(msg.chat.id, 
        '✅ Your verification video has been submitted!\n\n' +
        'Our team will review your video within 24 hours and notify you of the result.',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '👤 Back to Profile', callback_data: 'profile' }],
              [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
            ]
          }
        }
      );
    } catch (error) {
      console.error('Error handling video upload:', error);
      await bot.sendMessage(msg.chat.id, 
        '❌ Error uploading verification video. Please try again.',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔄 Try Again', callback_data: 'start_verification' }],
              [{ text: '👤 Back to Profile', callback_data: 'profile' }]
            ]
          }
        }
      );
    }
  }

  // Handle photo upload for verification
  static async handlePhotoUpload(msg, user) {
    try {
      if (!msg.photo || msg.photo.length === 0) {
        await bot.sendMessage(msg.chat.id, 'Please upload a valid photo.');
        return;
      }

      const photo = msg.photo[msg.photo.length - 1]; // Get highest resolution

      // Submit verification photo
      const result = await VerificationService.submitVerificationPhoto(user.telegram_id, photo);
      
      // Clear the uploading_verification flag
      await UserService.updateUser(user.telegram_id, { uploading_verification: false });
      
      await bot.sendMessage(msg.chat.id, 
        '✅ Your verification photo has been submitted!\n\n' +
        'Our team will review your photo within 24 hours and notify you of the result.',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '👤 Back to Profile', callback_data: 'profile' }],
              [{ text: '🏠 Main Menu', callback_data: 'main_menu' }]
            ]
          }
        }
      );
    } catch (error) {
      console.error('Error handling photo upload:', error);
      await bot.sendMessage(msg.chat.id, 
        '❌ Error uploading verification photo. Please try again.',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔄 Try Again', callback_data: 'start_verification' }],
              [{ text: '👤 Back to Profile', callback_data: 'profile' }]
            ]
          }
        }
      );
    }
  }

  // Handle verification text (if needed)
  static async handleText(msg, user) {
    await bot.sendMessage(msg.chat.id, 
      'Please upload a photo or video for verification.\n\n' +
      '📸 For photo verification: Send a clear selfie\n' +
      '🎥 For video verification: Record a short video',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📸 Upload Photo', callback_data: 'start_verification' }],
            [{ text: '🎥 Upload Video', callback_data: 'upload_verification' }],
            [{ text: '❌ Cancel', callback_data: 'profile' }]
          ]
        }
      }
    );
  }

  // Check verification status
  static async checkVerificationStatus(userId) {
    try {
      const status = await VerificationService.getUserVerificationStatus(userId);
      return status;
    } catch (error) {
      console.error('Error checking verification status:', error);
      return null;
    }
  }

  // Handle verification approval notification
  static async notifyVerificationApproved(userId) {
    try {
      await bot.sendMessage(userId, 
        '🎉 Verification Approved!\n\n' +
        'Congratulations! Your profile has been verified successfully.\n' +
        'You now have a verified badge on your profile which will help you get better matches!',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '💕 Start Browsing', callback_data: 'browse' }],
              [{ text: '👤 View Profile', callback_data: 'profile' }]
            ]
          }
        }
      );
    } catch (error) {
      console.error('Error sending verification approved notification:', error);
    }
  }

  // Handle verification rejection notification
  static async notifyVerificationRejected(userId, reason) {
    try {
      await bot.sendMessage(userId, 
        '❌ Verification Rejected\n\n' +
        `Your verification was not approved. Reason: ${reason}\n\n` +
        'Please try again with a clearer photo or video that follows our guidelines:\n' +
        '• Clear face visibility\n' +
        '• Good lighting\n' +
        '• No filters or editing\n' +
        '• Look directly at camera',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔄 Try Again', callback_data: 'start_verification' }],
              [{ text: '📋 View Guidelines', callback_data: 'verification_guidelines' }],
              [{ text: '👤 Back to Profile', callback_data: 'profile' }]
            ]
          }
        }
      );
    } catch (error) {
      console.error('Error sending verification rejected notification:', error);
    }
  }

  // Show verification guidelines
  static async showVerificationGuidelines(chatId) {
    const guidelinesText = `📋 Verification Guidelines\n\n` +
      `📸 Photo Requirements:\n` +
      `• Clear, front-facing photo\n` +
      `• Good lighting\n` +
      `• Face clearly visible\n` +
      `• No sunglasses or hat\n` +
      `• No filters or editing\n` +
      `• Match your profile photos\n\n` +
      `🎥 Video Requirements:\n` +
      `• 3-30 seconds long\n` +
      `• Say your name clearly\n` +
      `• Say "verifying my profile"\n` +
      `• Look directly at camera\n` +
      `• Good lighting and audio\n` +
      `• No background music\n\n` +
      `⏰ Review Process:\n` +
      `• Manual review by our team\n` +
      `• Results within 24 hours\n` +
      `• Email notification sent\n\n` +
      `❓ Need help? Contact our support team.`;

    await bot.sendMessage(chatId, guidelinesText, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📸 Start Photo Verification', callback_data: 'start_verification' }],
          [{ text: '🎥 Start Video Verification', callback_data: 'upload_verification' }],
          [{ text: '🔙 Back', callback_data: 'profile' }]
        ]
      }
    });
  }

  // Handle verification callback
  static async handleVerificationCallback(query) {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const data = query.data;

    if (data === 'verification_guidelines') {
      await this.showVerificationGuidelines(chatId);
      return;
    }

    // Handle other verification-related callbacks
    switch (data) {
      case 'start_verification':
        await this.startPhotoVerification(chatId, userId);
        break;
      case 'upload_verification':
        await this.startVideoVerification(chatId, userId);
        break;
      default:
        await bot.sendMessage(chatId, 'Invalid verification option.');
    }
  }

  // Start photo verification process
  static async startPhotoVerification(chatId, userId) {
    try {
      await VerificationService.startFaceVerification(userId);
      await UserService.updateUser(userId, { uploading_verification: true });
      
      await bot.sendMessage(chatId, 
        '📸 Photo Verification Started\n\n' +
        'Please upload a clear photo of yourself following these guidelines:\n\n' +
        '✅ Requirements:\n' +
        '• Hold phone at eye level\n' +
        '• Look directly at camera\n' +
        '• Ensure good lighting\n' +
        '• Remove glasses/hat if possible\n' +
        '• No filters or editing\n' +
        '• Must match your profile photos\n\n' +
        '📤 Send your verification photo now:'
      );
    } catch (error) {
      console.error('Error starting photo verification:', error);
      await bot.sendMessage(chatId, 'Error starting verification. Please try again.');
    }
  }

  // Start video verification process
  static async startVideoVerification(chatId, userId) {
    try {
      await VerificationService.startFaceVerification(userId);
      await UserService.updateUser(userId, { uploading_verification: true });
      
      await bot.sendMessage(chatId, 
        '🎥 Video Verification Started\n\n' +
        'Please record a short video following these guidelines:\n\n' +
        '✅ Requirements:\n' +
        '• 3-30 seconds long\n' +
        '• Hold phone at eye level\n' +
        '• Look directly at camera\n' +
        '• Say your first name clearly\n' +
        '• Say "I am verifying my profile"\n' +
        '• Ensure good lighting and audio\n' +
        '• No background music or noise\n\n' +
        '📤 Send your verification video now:'
      );
    } catch (error) {
      console.error('Error starting video verification:', error);
      await bot.sendMessage(chatId, 'Error starting verification. Please try again.');
    }
  }
}