import { UserService } from '../services/userService.js';
import { bot, keyboards } from '../config/telegram.js';

export class RegistrationHandler {
  static registrationSteps = {
    basic_info: 'Please tell me your age (18-99):',
    gender: 'What is your gender?',
    location: 'Please share your location so we can find matches nearby:',
    bio: 'Write a short bio about yourself (max 500 characters):',
    interests: 'What are your interests? (separate with commas):',
    looking_for: 'What are you looking for?',
    education: 'What is your education level?',
    profession: 'What is your profession?',
    height: 'What is your height? (e.g., 175cm or 5\'8"):',
    lifestyle: 'Describe your lifestyle (e.g., active, social, quiet):',
    photos: 'Please upload 1-6 photos of yourself:',
    preferences: 'Set your matching preferences:'
  };

  static async handleRegistration(msg) {
    const user = await UserService.getUserByTelegramId(msg.from.id);
    if (!user) return;

    const step = user.registration_step;
    
    switch (step) {
      case 'basic_info':
        await this.handleAge(msg, user);
        break;
      case 'gender':
        await this.handleGender(msg, user);
        break;
      case 'location':
        await this.handleLocation(msg, user);
        break;
      case 'bio':
        await this.handleBio(msg, user);
        break;
      case 'interests':
        await this.handleInterests(msg, user);
        break;
      case 'looking_for':
        await this.handleLookingFor(msg, user);
        break;
      case 'education':
        await this.handleEducation(msg, user);
        break;
      case 'profession':
        await this.handleProfession(msg, user);
        break;
      case 'height':
        await this.handleHeight(msg, user);
        break;
      case 'lifestyle':
        await this.handleLifestyle(msg, user);
        break;
      case 'photos':
        await this.handlePhotos(msg, user);
        break;
      case 'preferences':
        await this.handlePreferences(msg, user);
        break;
      default:
        await this.showMainMenu(msg.chat.id);
    }
  }

  static async startRegistration(chatId, user) {
    await bot.sendMessage(chatId, 
      `Welcome to our premium dating platform! 💕\n\n` +
      `Let's set up your profile to find your perfect match.\n\n` +
      this.registrationSteps.basic_info
    );
  }

  static async handleAge(msg, user) {
    const age = parseInt(msg.text);
    
    if (isNaN(age) || age < 18 || age > 99) {
      await bot.sendMessage(msg.chat.id, 
        'Please enter a valid age between 18 and 99:'
      );
      return;
    }

    await UserService.updateUser(user.telegram_id, { age });
    await UserService.updateRegistrationStep(user.telegram_id, 'gender');
    
    await bot.sendMessage(msg.chat.id, this.registrationSteps.gender, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '👨 Male', callback_data: 'gender_male' },
            { text: '👩 Female', callback_data: 'gender_female' }
          ],
          [{ text: '🏳️‍⚧️ Non-binary', callback_data: 'gender_non_binary' }]
        ]
      }
    });
  }

  static async handleGender(msg, user) {
    // This will be handled by callback query
  }

  static async handleGenderCallback(query) {
    const gender = query.data.split('_')[1];
    const user = await UserService.getUserByTelegramId(query.from.id);
    
    await UserService.updateUser(user.telegram_id, { gender });
    await UserService.updateRegistrationStep(user.telegram_id, 'location');
    
    await bot.editMessageText(
      this.registrationSteps.location,
      {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        reply_markup: {
          inline_keyboard: [
            [{ text: '📍 Share Location', callback_data: 'request_location' }]
          ]
        }
      }
    );
  }

  static async handleLocation(msg, user) {
    if (msg.location) {
      await UserService.updateUser(user.telegram_id, {
        latitude: msg.location.latitude,
        longitude: msg.location.longitude,
        location_updated_at: new Date().toISOString()
      });
      
      await UserService.updateRegistrationStep(user.telegram_id, 'bio');
      await bot.sendMessage(msg.chat.id, this.registrationSteps.bio);
    } else {
      await bot.sendMessage(msg.chat.id, 
        'Please share your location using the button below:',
        {
          reply_markup: {
            keyboard: [
              [{ text: '📍 Share Location', request_location: true }]
            ],
            resize_keyboard: true,
            one_time_keyboard: true
          }
        }
      );
    }
  }

  static async handleBio(msg, user) {
    const bio = msg.text?.trim();
    
    if (!bio || bio.length > 500) {
      await bot.sendMessage(msg.chat.id, 
        'Please write a bio between 1 and 500 characters:'
      );
      return;
    }

    await UserService.updateUser(user.telegram_id, { bio });
    await UserService.updateRegistrationStep(user.telegram_id, 'interests');
    await bot.sendMessage(msg.chat.id, this.registrationSteps.interests);
  }

  static async handleInterests(msg, user) {
    const interests = msg.text?.trim();
    
    if (!interests) {
      await bot.sendMessage(msg.chat.id, 
        'Please enter your interests separated by commas:'
      );
      return;
    }

    await UserService.updateUser(user.telegram_id, { interests });
    await UserService.updateRegistrationStep(user.telegram_id, 'looking_for');
    
    await bot.sendMessage(msg.chat.id, this.registrationSteps.looking_for, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '💕 Relationship', callback_data: 'looking_relationship' },
            { text: '😊 Casual', callback_data: 'looking_casual' }
          ],
          [
            { text: '💍 Marriage', callback_data: 'looking_marriage' },
            { text: '👥 Friends', callback_data: 'looking_friends' }
          ]
        ]
      }
    });
  }

  static async handleLookingForCallback(query) {
    const lookingFor = query.data.split('_')[1];
    const user = await UserService.getUserByTelegramId(query.from.id);
    
    await UserService.updateUser(user.telegram_id, { looking_for: lookingFor });
    await UserService.updateRegistrationStep(user.telegram_id, 'education');
    
    await bot.editMessageText(
      this.registrationSteps.education,
      {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🎓 High School', callback_data: 'edu_high_school' },
              { text: '📚 Some College', callback_data: 'edu_some_college' }
            ],
            [
              { text: '🎓 Bachelor\'s', callback_data: 'edu_bachelors' },
              { text: '🎓 Master\'s', callback_data: 'edu_masters' }
            ],
            [{ text: '🎓 PhD', callback_data: 'edu_phd' }]
          ]
        }
      }
    );
  }

  static async handleEducationCallback(query) {
    const education = query.data.split('_')[1];
    const user = await UserService.getUserByTelegramId(query.from.id);
    
    await UserService.updateUser(user.telegram_id, { education });
    await UserService.updateRegistrationStep(user.telegram_id, 'profession');
    
    await bot.editMessageText(
      this.registrationSteps.profession,
      {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id
      }
    );
  }

  static async handleProfession(msg, user) {
    const profession = msg.text?.trim();
    
    if (!profession) {
      await bot.sendMessage(msg.chat.id, 'Please enter your profession:');
      return;
    }

    await UserService.updateUser(user.telegram_id, { profession });
    await UserService.updateRegistrationStep(user.telegram_id, 'height');
    await bot.sendMessage(msg.chat.id, this.registrationSteps.height);
  }

  static async handleHeight(msg, user) {
    const height = msg.text?.trim();
    
    if (!height) {
      await bot.sendMessage(msg.chat.id, 'Please enter your height:');
      return;
    }

    await UserService.updateUser(user.telegram_id, { height });
    await UserService.updateRegistrationStep(user.telegram_id, 'lifestyle');
    await bot.sendMessage(msg.chat.id, this.registrationSteps.lifestyle);
  }

  static async handleLifestyle(msg, user) {
    const lifestyle = msg.text?.trim();
    
    if (!lifestyle) {
      await bot.sendMessage(msg.chat.id, 'Please describe your lifestyle:');
      return;
    }

    await UserService.updateUser(user.telegram_id, { lifestyle });
    await UserService.updateRegistrationStep(user.telegram_id, 'photos');
    
    await bot.sendMessage(msg.chat.id, 
      this.registrationSteps.photos + '\n\n' +
      'Send me your photos one by one. When you\'re done, type /done'
    );
  }

  static async handlePhotos(msg, user) {
    if (msg.text === '/done') {
      const photos = await UserService.getUserPhotos(user.telegram_id);
      if (photos.length === 0) {
        await bot.sendMessage(msg.chat.id, 
          'Please upload at least one photo before continuing.'
        );
        return;
      }

      await UserService.updateRegistrationStep(user.telegram_id, 'preferences');
      await this.showPreferencesSetup(msg.chat.id);
      return;
    }

    if (msg.photo) {
      const photos = await UserService.getUserPhotos(user.telegram_id);
      if (photos.length >= 6) {
        await bot.sendMessage(msg.chat.id, 
          'You can upload maximum 6 photos. Type /done to continue.'
        );
        return;
      }

      const photo = msg.photo[msg.photo.length - 1]; // Get highest resolution
      await UserService.addUserPhoto(user.telegram_id, {
        file_id: photo.file_id,
        url: `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${photo.file_path}`,
        is_primary: photos.length === 0,
        order_index: photos.length
      });

      await bot.sendMessage(msg.chat.id, 
        `Photo ${photos.length + 1} uploaded! ${photos.length < 5 ? 'Send more photos or' : ''} Type /done when finished.`
      );
    } else {
      await bot.sendMessage(msg.chat.id, 
        'Please send a photo or type /done to continue.'
      );
    }
  }

  static async showPreferencesSetup(chatId) {
    await bot.sendMessage(chatId, 
      'Now let\'s set your matching preferences:\n\n' +
      'What age range are you interested in? (e.g., 25-35):'
    );
  }

  static async handlePreferences(msg, user) {
    const ageRange = msg.text?.trim();
    const match = ageRange?.match(/(\d+)-(\d+)/);
    
    if (!match) {
      await bot.sendMessage(msg.chat.id, 
        'Please enter age range in format: 25-35'
      );
      return;
    }

    const minAge = parseInt(match[1]);
    const maxAge = parseInt(match[2]);

    if (minAge < 18 || maxAge > 99 || minAge >= maxAge) {
      await bot.sendMessage(msg.chat.id, 
        'Please enter a valid age range (18-99):'
      );
      return;
    }

    await UserService.saveUserPreferences(user.telegram_id, {
      min_age: minAge,
      max_age: maxAge,
      max_distance: 50, // Default 50km
      preferred_gender: user.gender === 'male' ? 'female' : 'male' // Default opposite
    });

    await UserService.completeProfile(user.telegram_id);
    
    await bot.sendMessage(msg.chat.id, 
      '🎉 Congratulations! Your profile is complete!\n\n' +
      'You can now start browsing matches and connecting with people. ' +
      'Remember to verify your profile for better matches!\n\n' +
      'Use the menu below to get started:',
      keyboards.mainMenu
    );
  }

  static async showMainMenu(chatId) {
    await bot.sendMessage(chatId, 
      'Welcome back! What would you like to do?',
      keyboards.mainMenu
    );
  }
}