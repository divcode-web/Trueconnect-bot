import { VerificationService } from '../services/verificationService.js';
import { bot } from '../config/telegram.js';

export class VerificationHandler {
  // Handle video upload for verification
  static async handleVideoUpload(msg, user) {
    const videoFileId = msg.video.file_id;
    const videoUrl = await VerificationService.saveVideoToStorage(user.telegram_id, videoFileId);
    await VerificationService.submitVerificationVideo(user.telegram_id, { file_id: videoFileId, file_path: videoUrl });
    await bot.sendMessage(msg.chat.id, '✅ Your verification video has been submitted!');
  }

  // Handle verification text (if needed)
  static async handleText(msg, user) {
    await bot.sendMessage(msg.chat.id, 'Please upload a video for verification.');
  }
}