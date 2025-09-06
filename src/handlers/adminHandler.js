import { ReportService } from '../services/reportService.js';
import { VerificationService } from '../services/verificationService.js';
import { UserService } from '../services/userService.js';
import { SubscriptionService } from '../services/subscriptionService.js';
import { bot, botConfig } from '../config/telegram.js';
import { supabaseAdmin } from '../config/database.js';

export class AdminHandler {
  static async isAdmin(userId) {
    return userId === botConfig.adminUserId;
  }

  static async handleAdminCommand(msg) {
    const isAdmin = await this.isAdmin(msg.from.id);
    if (!isAdmin) {
      await bot.sendMessage(msg.chat.id, '❌ Access denied. Admin only.');
      return;
    }

    const command = msg.text?.split(' ')[0] || '';
    const args = msg.text?.split(' ').slice(1) || [];
    
    switch (command) {
      case '/admin':
        await this.showAdminMenu(msg.chat.id);
        break;
      case '/stats':
        await this.showStats(msg.chat.id);
        break;
      case '/reports':
        await this.showPendingReports(msg.chat.id);
        break;
      case '/verifications':
        await this.showPendingVerifications(msg.chat.id);
        break;
      case '/ban':
        await this.handleBanCommand(msg);
        break;
      case '/unban':
        await this.handleUnbanCommand(msg);
        break;
      case '/suspend':
        await this.handleSuspendCommand(msg);
        break;
      case '/test_user':
        await this.handleTestUserMode(msg);
        break;
      case '/user':
        if (args.length > 0) {
          await this.handleUserCommand(msg.chat.id, args[0]);
        } else {
          await bot.sendMessage(msg.chat.id, 'Usage: /user <telegram_id>');
        }
        break;
      case '/broadcast':
        if (args.length > 0) {
          await this.handleBroadcast(msg.chat.id, args.join(' '));
        } else {
          await bot.sendMessage(msg.chat.id, 'Usage: /broadcast <message>');
        }
        break;
      default:
        await bot.sendMessage(msg.chat.id, 
          'Unknown admin command. Available commands:\n' +
          '/admin - Admin dashboard\n' +
          '/stats - Platform statistics\n' +
          '/reports - Pending reports\n' +
          '/verifications - Pending verifications\n' +
          '/ban <user_id> [reason] - Ban user\n' +
          '/unban <user_id> - Unban user\n' +
          '/suspend <user_id> <days> [reason] - Suspend user\n' +
          '/test_user - Test user mode\n' +
          '/user <user_id> - View user info\n' +
          '/broadcast <message> - Broadcast message to all users'
        );
    }
  }

  static async showAdminMenu(chatId) {
    const menuText = `🔧 Admin Dashboard\n\nSelect an option:`;
    
    await bot.sendMessage(chatId, menuText, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📊 Statistics', callback_data: 'admin_stats' },
            { text: '🚨 Reports', callback_data: 'admin_reports' }
          ],
          [
            { text: '✅ Verifications', callback_data: 'admin_verifications' },
            { text: '👥 User Management', callback_data: 'admin_users' }
          ],
          [
            { text: '💎 Subscriptions', callback_data: 'admin_subscriptions' },
            { text: '📈 Analytics', callback_data: 'admin_analytics' }
          ],
          [
            { text: '👤 Test User Mode', callback_data: 'admin_test_user' },
            { text: '💳 Payment Management', callback_data: 'admin_payments' }
          ],
          [{ text: '🔙 Close', callback_data: 'admin_close' }]
        ]
      }
    });
  }

  static async showStats(chatId) {
    try {
      // Get user statistics
      const { data: userStats } = await supabaseAdmin
        .from('users')
        .select('is_active, is_premium, is_verified, gender, created_at');

      const totalUsers = userStats?.length || 0;
      const activeUsers = userStats?.filter(u => u.is_active).length || 0;
      const premiumUsers = userStats?.filter(u => u.is_premium).length || 0;
      const verifiedUsers = userStats?.filter(u => u.is_verified).length || 0;
      const maleUsers = userStats?.filter(u => u.gender === 'male').length || 0;
      const femaleUsers = userStats?.filter(u => u.gender === 'female').length || 0;

      // Get today's registrations
      const today = new Date().toISOString().split('T')[0];
      const todayUsers = userStats?.filter(u => 
        u.created_at?.startsWith(today)
      ).length || 0;

      // Get match statistics
      const { count: totalMatches } = await supabaseAdmin
        .from('matches')
        .select('*', { count: 'exact', head: true });

      // Get message statistics (only if messages table exists)
      let totalMessages = 0;
      try {
        const { count } = await supabaseAdmin
          .from('messages')
          .select('*', { count: 'exact', head: true });
        totalMessages = count || 0;
      } catch (error) {
        console.log('Messages table not found, defaulting to 0');
      }

      // Get report statistics
      const { count: pendingReports } = await supabaseAdmin
        .from('reports')
        .select('*', { count: 'exact', head: true })
        .in('status', ['pending', 'escalated']);

      const statsText = `📊 Platform Statistics\n\n` +
        `👥 Total Users: ${totalUsers}\n` +
        `✅ Active Users: ${activeUsers}\n` +
        `💎 Premium Users: ${premiumUsers}\n` +
        `🔒 Verified Users: ${verifiedUsers}\n` +
        `👨 Male Users: ${maleUsers}\n` +
        `👩 Female Users: ${femaleUsers}\n` +
        `📅 Today's Signups: ${todayUsers}\n\n` +
        `💕 Total Matches: ${totalMatches || 0}\n` +
        `💬 Total Messages: ${totalMessages}\n` +
        `🚨 Pending Reports: ${pendingReports || 0}`;

      await bot.sendMessage(chatId, statsText, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Refresh', callback_data: 'admin_stats' }],
            [{ text: '🔙 Back', callback_data: 'admin_menu' }]
          ]
        }
      });
    } catch (error) {
      console.error('Error showing stats:', error);
      await bot.sendMessage(chatId, 'Error loading statistics.');
    }
  }

  static async showPendingReports(chatId) {
    try {
      const reports = await ReportService.getPendingReports();
      
      if (reports.length === 0) {
        await bot.sendMessage(chatId, 
          '✅ No pending reports!',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔙 Back', callback_data: 'admin_menu' }]
              ]
            }
          }
        );
        return;
      }

      let reportsText = `🚨 Pending Reports (${reports.length})\n\n`;
      
      reports.slice(0, 5).forEach((report, index) => {
        reportsText += `${index + 1}. ${ReportService.reportTypes[report.report_type] || report.report_type}\n`;
        reportsText += `   Reporter: ${report.reporter?.first_name || 'Unknown'}\n`;
        reportsText += `   Reported: ${report.reported?.first_name || 'Unknown'}\n`;
        reportsText += `   Date: ${new Date(report.created_at).toLocaleDateString()}\n\n`;
      });

      if (reports.length > 5) {
        reportsText += `... and ${reports.length - 5} more reports`;
      }

      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            ...reports.slice(0, 5).map((report, index) => [
              { text: `Review Report ${index + 1}`, callback_data: `admin_review_report_${report.id}` }
            ]),
            [{ text: '🔙 Back', callback_data: 'admin_menu' }]
          ]
        }
      };

      await bot.sendMessage(chatId, reportsText, keyboard);
    } catch (error) {
      console.error('Error showing pending reports:', error);
      await bot.sendMessage(chatId, 'Error loading reports.');
    }
  }

  static async showPendingVerifications(chatId) {
    try {
      const verifications = await VerificationService.getPendingVerifications();
      
      if (verifications.length === 0) {
        await bot.sendMessage(chatId, 
          '✅ No pending verifications!',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔙 Back', callback_data: 'admin_menu' }]
              ]
            }
          }
        );
        return;
      }

      let verificationsText = `✅ Pending Verifications (${verifications.length})\n\n`;
      
      verifications.slice(0, 5).forEach((verification, index) => {
        verificationsText += `${index + 1}. ${verification.user?.first_name || 'Unknown'}\n`;
        verificationsText += `   User ID: ${verification.user?.telegram_id || 'Unknown'}\n`;
        verificationsText += `   Submitted: ${new Date(verification.submitted_at).toLocaleDateString()}\n\n`;
      });

      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            ...verifications.slice(0, 5).map((verification, index) => [
              { text: `Review Verification ${index + 1}`, callback_data: `admin_review_verification_${verification.id}` }
            ]),
            [{ text: '🔙 Back', callback_data: 'admin_menu' }]
          ]
        }
      };

      await bot.sendMessage(chatId, verificationsText, keyboard);
    } catch (error) {
      console.error('Error showing pending verifications:', error);
      await bot.sendMessage(chatId, 'Error loading verifications.');
    }
  }

  static async reviewReport(chatId, reportId) {
    try {
      const { data: report, error } = await supabaseAdmin
        .from('reports')
        .select(`
          *,
          reporter:users!reports_reporter_id_fkey(*),
          reported:users!reports_reported_id_fkey(*)
        `)
        .eq('id', reportId)
        .single();

      if (error) throw error;

      const reportTypes = {
        'fake_profile': 'Fake Profile',
        'harassment': 'Harassment', 
        'inappropriate_content': 'Inappropriate Content',
        'spam': 'Spam',
        'underage': 'Underage',
        'other': 'Other'
      };

      const reportText = `🚨 Report Review\n\n` +
        `Type: ${reportTypes[report.report_type] || report.report_type}\n` +
        `Reporter: ${report.reporter?.first_name || 'Unknown'} (@${report.reporter?.username || 'N/A'})\n` +
        `Reported User: ${report.reported?.first_name || 'Unknown'} (@${report.reported?.username || 'N/A'})\n` +
        `Date: ${new Date(report.created_at).toLocaleString()}\n\n` +
        `Description:\n${report.description || 'No description provided'}\n\n` +
        `Choose an action:`;

      await bot.sendMessage(chatId, reportText, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '⚠️ Warn User', callback_data: `admin_report_action_warn_${reportId}` },
              { text: '⏸️ Suspend User', callback_data: `admin_report_action_suspend_${reportId}` }
            ],
            [
              { text: '🚫 Ban User', callback_data: `admin_report_action_ban_${reportId}` },
              { text: '❌ Dismiss Report', callback_data: `admin_report_action_dismiss_${reportId}` }
            ],
            [{ text: '👤 View User Profile', callback_data: `admin_user_${report.reported?.telegram_id}` }],
            [{ text: '🔙 Back', callback_data: 'admin_reports' }]
          ]
        }
      });
    } catch (error) {
      console.error('Error reviewing report:', error);
      await bot.sendMessage(chatId, 'Error loading report details.');
    }
  }

  static async handleReportAction(chatId, action, reportId) {
    try {
      const { data: report } = await supabaseAdmin
        .from('reports')
        .select('reported_id, reported:users!reports_reported_id_fkey(*)')
        .eq('id', reportId)
        .single();

      let actionTaken = '';
      
      switch (action) {
        case 'warn':
          await ReportService.resolveReport(reportId, botConfig.adminUserId, 'warn_user', 'User warned by admin');
          actionTaken = 'User has been warned';
          
          // Send warning to user
          try {
            await bot.sendMessage(report.reported.telegram_id, 
              '⚠️ Warning\n\n' +
              'You have received a warning from our moderation team. ' +
              'Please ensure you follow our community guidelines to avoid further action.');
          } catch (error) {
            console.log('Could not send warning message to user');
          }
          break;
          
        case 'suspend':
          await ReportService.resolveReport(reportId, botConfig.adminUserId, 'suspend_user', '7-day suspension');
          await this.suspendUserInternal(report.reported_id, 7, 'Suspended due to report');
          actionTaken = 'User has been suspended for 7 days';
          
          // Notify user
          try {
            await bot.sendMessage(report.reported.telegram_id, 
              '⏸️ Account Suspended\n\n' +
              'Your account has been suspended for 7 days due to a violation of our community guidelines.');
          } catch (error) {
            console.log('Could not send suspension message to user');
          }
          break;
          
        case 'ban':
          await ReportService.resolveReport(reportId, botConfig.adminUserId, 'ban_user', 'Banned due to report');
          await this.banUserInternal(report.reported_id, 'Banned due to report');
          actionTaken = 'User has been permanently banned';
          
          // Notify user
          try {
            await bot.sendMessage(report.reported.telegram_id, 
              '🚫 Account Banned\n\n' +
              'Your account has been permanently banned due to violations of our community guidelines.');
          } catch (error) {
            console.log('Could not send ban message to user');
          }
          break;
          
        case 'dismiss':
          await ReportService.resolveReport(reportId, botConfig.adminUserId, 'no_action', 'Report dismissed');
          actionTaken = 'Report has been dismissed';
          break;
      }

      await bot.sendMessage(chatId, 
        `✅ ${actionTaken}`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Back to Reports', callback_data: 'admin_reports' }]
            ]
          }
        }
      );
    } catch (error) {
      console.error('Error handling report action:', error);
      await bot.sendMessage(chatId, 'Error processing action.');
    }
  }

  static async reviewVerification(chatId, verificationId) {
    try {
      const { data: verification, error } = await supabaseAdmin
        .from('verifications')
        .select(`
          *,
          user:users(*)
        `)
        .eq('id', verificationId)
        .single();

      if (error) throw error;

      const verificationText = `✅ Verification Review\n\n` +
        `User: ${verification.user?.first_name || 'Unknown'} (@${verification.user?.username || 'N/A'})\n` +
        `User ID: ${verification.user?.telegram_id || 'Unknown'}\n` +
        `Submitted: ${new Date(verification.submitted_at).toLocaleString()}\n\n` +
        `Review the verification photo/video and decide:`;

      // Try to get verification media
      let mediaMessage = null;
      if (verification.file_id) {
        try {
          if (verification.verification_type === 'face') {
            mediaMessage = await bot.sendPhoto(chatId, verification.file_id, {
              caption: verificationText
            });
          }
        } catch (error) {
          console.error('Error sending verification media:', error);
        }
      }

      if (!mediaMessage) {
        await bot.sendMessage(chatId, verificationText);
      }

      await bot.sendMessage(chatId, 'Actions:', {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Approve', callback_data: `admin_verify_approve_${verificationId}` },
              { text: '❌ Reject', callback_data: `admin_verify_reject_${verificationId}` }
            ],
            [{ text: '👤 View User Profile', callback_data: `admin_user_${verification.user?.telegram_id}` }],
            [{ text: '🔙 Back', callback_data: 'admin_verifications' }]
          ]
        }
      });
    } catch (error) {
      console.error('Error reviewing verification:', error);
      await bot.sendMessage(chatId, 'Error loading verification details.');
    }
  }

  static async handleVerificationAction(chatId, action, verificationId) {
    try {
      let actionTaken = '';
      
      if (action === 'approve') {
        await VerificationService.approveVerification(verificationId, botConfig.adminUserId);
        actionTaken = 'Verification approved ✅';
        
        // Get user info to send notification
        const { data: verification } = await supabaseAdmin
          .from('verifications')
          .select('user_id, user:users(*)')
          .eq('id', verificationId)
          .single();
        
        if (verification?.user?.telegram_id) {
          try {
            await bot.sendMessage(verification.user.telegram_id, 
              '✅ Verification Approved!\n\n' +
              'Congratulations! Your profile has been verified. ' +
              'You now have a verification badge on your profile.');
          } catch (error) {
            console.log('Could not send approval message to user');
          }
        }
      } else {
        await VerificationService.rejectVerification(verificationId, botConfig.adminUserId, 'Photo quality insufficient');
        actionTaken = 'Verification rejected ❌';
        
        // Get user info to send notification  
        const { data: verification } = await supabaseAdmin
          .from('verifications')
          .select('user_id, user:users(*)')
          .eq('id', verificationId)
          .single();
        
        if (verification?.user?.telegram_id) {
          try {
            await bot.sendMessage(verification.user.telegram_id, 
              '❌ Verification Rejected\n\n' +
              'Your verification was not approved. Please ensure you follow all guidelines and try again:\n\n' +
              '• Clear, well-lit photo\n' +
              '• Face clearly visible\n' +
              '• No filters or editing\n' +
              '• Look directly at camera');
          } catch (error) {
            console.log('Could not send rejection message to user');
          }
        }
      }

      await bot.sendMessage(chatId, 
        actionTaken,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Back to Verifications', callback_data: 'admin_verifications' }]
            ]
          }
        }
      );
    } catch (error) {
      console.error('Error handling verification action:', error);
      await bot.sendMessage(chatId, 'Error processing action.');
    }
  }

  // Helper methods for user actions
  static async banUserInternal(userId, reason) {
    try {
      await supabaseAdmin
        .from('users')
        .update({
          is_banned: true,
          banned_at: new Date().toISOString(),
          banned_reason: reason
        })
        .eq('telegram_id', userId);
    } catch (error) {
      console.error('Error banning user internally:', error);
    }
  }

  static async suspendUserInternal(userId, days, reason) {
    try {
      const suspendUntil = new Date();
      suspendUntil.setDate(suspendUntil.getDate() + days);
      
      await supabaseAdmin
        .from('users')
        .update({
          is_suspended: true,
          suspended_until: suspendUntil.toISOString(),
          suspension_reason: reason
        })
        .eq('telegram_id', userId);
    } catch (error) {
      console.error('Error suspending user internally:', error);
    }
  }

  static async handleBanCommand(msg) {
    const args = msg.text.split(' ');
    if (args.length < 2) {
      await bot.sendMessage(msg.chat.id, 'Usage: /ban <user_id> [reason]');
      return;
    }

    const userId = parseInt(args[1]);
    const reason = args.slice(2).join(' ') || 'Banned by admin';

    try {
      await this.banUserInternal(userId, reason);
      await bot.sendMessage(msg.chat.id, `✅ User ${userId} has been banned.`);
    } catch (error) {
      console.error('Error banning user:', error);
      await bot.sendMessage(msg.chat.id, 'Error banning user.');
    }
  }

  static async handleUnbanCommand(msg) {
    const args = msg.text.split(' ');
    if (args.length < 2) {
      await bot.sendMessage(msg.chat.id, 'Usage: /unban <user_id>');
      return;
    }

    const userId = parseInt(args[1]);

    try {
      await supabaseAdmin
        .from('users')
        .update({
          is_banned: false,
          banned_at: null,
          banned_reason: null
        })
        .eq('telegram_id', userId);
        
      await bot.sendMessage(msg.chat.id, `✅ User ${userId} has been unbanned.`);
    } catch (error) {
      console.error('Error unbanning user:', error);
      await bot.sendMessage(msg.chat.id, 'Error unbanning user.');
    }
  }

  static async handleSuspendCommand(msg) {
    const args = msg.text.split(' ');
    if (args.length < 3) {
      await bot.sendMessage(msg.chat.id, 'Usage: /suspend <user_id> <days> [reason]');
      return;
    }

    const userId = parseInt(args[1]);
    const days = parseInt(args[2]);
    const reason = args.slice(3).join(' ') || 'Suspended by admin';

    try {
      await this.suspendUserInternal(userId, days, reason);
      await bot.sendMessage(msg.chat.id, `✅ User ${userId} has been suspended for ${days} days.`);
    } catch (error) {
      console.error('Error suspending user:', error);
      await bot.sendMessage(msg.chat.id, 'Error suspending user.');
    }
  }

  static async handleTestUserMode(msg) {
    const chatId = msg.chat.id;

    await bot.sendMessage(chatId, 
      '👤 Test User Mode\n\n' +
      'As an admin, you can now use the bot as a regular user for testing purposes.\n\n' +
      'Use the main menu below:',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '👤 My Profile', callback_data: 'profile' }],
            [{ text: '💕 Browse Matches', callback_data: 'browse' }],
            [{ text: '👥 My Matches', callback_data: 'matches' }],
            [{ text: '💎 Premium', callback_data: 'premium' }],
            [{ text: '🔧 Back to Admin', callback_data: 'admin_menu' }]
          ]
        }
      }
    );
  }

  static async showSubscriptionManagement(chatId) {
    try {
      const { data: subscriptions, error } = await supabaseAdmin
        .from('subscriptions')
        .select(`
          *,
          user:users(first_name, username, telegram_id)
        `)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (error) throw error;

      let subsText = `💎 Active Subscriptions (${subscriptions?.length || 0})\n\n`;
      
      subscriptions?.forEach((sub, index) => {
        subsText += `${index + 1}. ${sub.user?.first_name || 'Unknown'} (@${sub.user?.username || 'N/A'})\n`;
        subsText += `   Plan: ${sub.plan_type.toUpperCase()}\n`;
        subsText += `   Expires: ${sub.expires_at ? new Date(sub.expires_at).toLocaleDateString() : 'Never'}\n`;
        subsText += `   Amount: ${sub.amount_paid || 'N/A'}\n\n`;
      });

      await bot.sendMessage(chatId, subsText, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Refresh', callback_data: 'admin_subscriptions' }],
            [{ text: '🔙 Back', callback_data: 'admin_menu' }]
          ]
        }
      });
    } catch (error) {
      console.error('Error showing subscription management:', error);
      await bot.sendMessage(chatId, 'Error loading subscriptions.');
    }
  }

  static async handleUserCommand(chatId, userIdStr) {
    try {
      const userId = parseInt(userIdStr);
      const user = await UserService.getUserByTelegramId(userId);
      
      if (!user) {
        await bot.sendMessage(chatId, `User ${userId} not found.`);
        return;
      }

      const photos = await UserService.getUserPhotos(userId);
      const subscription = await SubscriptionService.getUserSubscription(userId);

      let userText = `👤 User Information\n\n`;
      userText += `Name: ${user.first_name} ${user.last_name || ''}\n`;
      userText += `Username: @${user.username || 'None'}\n`;
      userText += `Telegram ID: ${user.telegram_id}\n`;
      userText += `Age: ${user.age || 'Not set'}\n`;
      userText += `Gender: ${user.gender || 'Not set'}\n`;
      userText += `Status: ${user.is_active ? '✅ Active' : '❌ Inactive'}\n`;
      userText += `Verified: ${user.is_verified ? '✅ Yes' : '❌ No'}\n`;
      userText += `Premium: ${subscription ? `✅ ${subscription.plan_type}` : '❌ Free'}\n`;
      userText += `Banned: ${user.is_banned ? '🚫 Yes' : '✅ No'}\n`;
      userText += `Suspended: ${user.is_suspended ? '⏸️ Yes' : '✅ No'}\n`;
      userText += `Photos: ${photos.length}/6\n`;
      userText += `Joined: ${new Date(user.created_at).toLocaleDateString()}\n`;

      await bot.sendMessage(chatId, userText, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🚫 Ban User', callback_data: `admin_ban_${userId}` },
              { text: '⏸️ Suspend User', callback_data: `admin_suspend_${userId}` }
            ],
            [
              { text: '💎 Grant Premium', callback_data: `admin_premium_${userId}` },
              { text: '✅ Verify User', callback_data: `admin_verify_user_${userId}` }
            ],
            [{ text: '🔙 Back', callback_data: 'admin_menu' }]
          ]
        }
      });
    } catch (error) {
      console.error('Error handling user command:', error);
      await bot.sendMessage(chatId, 'Error loading user information.');
    }
  }

  static async handleBroadcast(chatId, message) {
    try {
      await bot.sendMessage(chatId, 
        `📢 Broadcast Message\n\n` +
        `Message: "${message}"\n\n` +
        `Are you sure you want to send this to all users?`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Confirm Broadcast', callback_data: `admin_broadcast_confirm_${Buffer.from(message).toString('base64')}` }],
              [{ text: '❌ Cancel', callback_data: 'admin_menu' }]
            ]
          }
        }
      );
    } catch (error) {
      console.error('Error preparing broadcast:', error);
      await bot.sendMessage(chatId, 'Error preparing broadcast.');
    }
  }

  static async executeBroadcast(chatId, message) {
    try {
      const { data: users } = await supabaseAdmin
        .from('users')
        .select('telegram_id')
        .eq('is_active', true)
        .eq('is_banned', false);

      if (!users || users.length === 0) {
        await bot.sendMessage(chatId, 'No active users found.');
        return;
      }

      let successCount = 0;
      let failureCount = 0;

      await bot.sendMessage(chatId, `📢 Starting broadcast to ${users.length} users...`);

      for (const user of users) {
        try {
          await bot.sendMessage(user.telegram_id, `📢 ${message}`);
          successCount++;
          
          // Add delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 50));
        } catch (error) {
          failureCount++;
        }
      }

      await bot.sendMessage(chatId, 
        `✅ Broadcast completed!\n\n` +
        `✅ Successful: ${successCount}\n` +
        `❌ Failed: ${failureCount}`
      );
    } catch (error) {
      console.error('Error executing broadcast:', error);
      await bot.sendMessage(chatId, 'Error executing broadcast.');
    }
  }

  // Additional callback handlers
  static async handleAdminCallback(chatId, userId, data) {
    try {
      if (data === 'admin_users') {
        await bot.sendMessage(chatId, 
          '👥 User Management\n\nUse commands:\n' +
          '/user <user_id> - View user info\n' +
          '/ban <user_id> [reason] - Ban user\n' +
          '/unban <user_id> - Unban user\n' +
          '/suspend <user_id> <days> [reason] - Suspend user',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔙 Back', callback_data: 'admin_menu' }]
              ]
            }
          }
        );
      } else if (data === 'admin_analytics') {
        await bot.sendMessage(chatId, 
          '📈 Analytics coming soon!',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔙 Back', callback_data: 'admin_menu' }]
              ]
            }
          }
        );
      } else if (data === 'admin_payments') {
        await bot.sendMessage(chatId, 
          '💳 Payment Management coming soon!',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔙 Back', callback_data: 'admin_menu' }]
              ]
            }
          }
        );
      } else if (data.startsWith('admin_broadcast_confirm_')) {
        const messageBase64 = data.replace('admin_broadcast_confirm_', '');
        const message = Buffer.from(messageBase64, 'base64').toString('utf-8');
        await this.executeBroadcast(chatId, message);
      }
    } catch (error) {
      console.error('Error handling admin callback:', error);
      await bot.sendMessage(chatId, 'Error processing admin action.');
    }
  }
}