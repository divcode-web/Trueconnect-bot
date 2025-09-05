import { UserService } from '../services/userService.js';
import { bot } from '../config/telegram.js';

export class ProfileHandler {
  static async handleEditProfile(msg, user) {
    await UserService.updateUser(user.telegram_id, { bio: msg.text });
    await bot.sendMessage(msg.chat.id, '✅ Your profile has been updated!');
  }

  static async handlePhotoUpload(msg, user) {
    const photoFileId = msg.photo[msg.photo.length - 1].file_id;
    const photoUrl = await UserService.savePhotoToStorage(user.telegram_id, photoFileId);
    await UserService.addPhoto(user.telegram_id, photoUrl);
    await bot.sendMessage(msg.chat.id, '✅ Photo added to your profile!');
  }

  static async handleLikes(msg, user) {
    const likes = await UserService.getLikesForUser(user.telegram_id);
    if (!likes || likes.length === 0) {
      await bot.sendMessage(msg.chat.id, 'No one has liked you yet.');
    } else {
      const likeList = likes.map(l => `• ${l.liked_by_id}`).join('\n');
      await bot.sendMessage(msg.chat.id, `People who liked you:\n${likeList}`);
    }
  }

  static async handleDeleteAccount(msg, user) {
    await UserService.deleteUser(user.telegram_id);
    await bot.sendMessage(msg.chat.id, 'Your account has been deleted. Goodbye!');
  }

  static async handleMyMatches(msg, user) {
    const matches = await UserService.getMatchesForUser(user.telegram_id);
    if (!matches || matches.length === 0) {
      await bot.sendMessage(msg.chat.id, 'You have no matches yet.');
    } else {
      const matchList = matches.map(m => `• ${m.user1_id === user.telegram_id ? m.user2_id : m.user1_id}`).join('\n');
      await bot.sendMessage(msg.chat.id, `Your matches:\n${matchList}`);
    }
  }

  static async handleMatchingPreferences(msg, user) {
    await UserService.updatePreferences(user.telegram_id, msg.text);
    await bot.sendMessage(msg.chat.id, 'Your matching preferences have been updated!');
  }

  static async handleNotifications(msg, user) {
    await UserService.updateNotifications(user.telegram_id, msg.text);
    await bot.sendMessage(msg.chat.id, 'Your notification settings have been updated!');
  }

  static async handlePrivacy(msg, user) {
    await UserService.updatePrivacy(user.telegram_id, msg.text);
    await bot.sendMessage(msg.chat.id, 'Your privacy settings have been updated!');
  }
}