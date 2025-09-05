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
    if (!await this.isAdmin(msg.from.id)) {
      await bot.sendMessage(msg.chat.id, '❌ Access denied. Admin only.');
      return;
    }

    const command = msg.text.split(' ')[0];
    
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
      default:
        await bot.sendMessage(msg.chat.id, 'Unknown admin command.');
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

      // Get message statistics
      const { count: totalMessages } = await supabaseAdmin
        .from('messages')
        .select('*', { count: 'exact', head: true });

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
        `💬 Total Messages: ${totalMessages || 0}\n` +
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
        reportsText += `${index + 1}. ${ReportService.reportTypes[report.report_type]}\n`;
        reportsText += `   Reporter: ${report.reporter.first_name}\n`;
        reportsText += `   Reported: ${report.reported.first_name}\n`;
        reportsText += `   Date: ${new Date(report.created_at).toLocaleDateString()}\n\n`;
      });

      if (reports.length > 5) {
        reportsText += `... and ${reports.length - 5} more reports`;
      }

      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            ...reports.slice(0, 5).map((report, index) => [
              { text: `Review Report ${index + 1}`, callback_data: `review_report_${report.id}` }
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
        verificationsText += `${index + 1}. ${verification.user.first_name}\n`;
        verificationsText += `   User ID: ${verification.user.telegram_id}\n`;
        verificationsText += `   Submitted: ${new Date(verification.submitted_at).toLocaleDateString()}\n\n`;
      });

      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            ...verifications.slice(0, 5).map((verification, index) => [
              { text: `Review Verification ${index + 1}`, callback_data: `review_verification_${verification.id}` }
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

      const reportText = `🚨 Report Review\n\n` +
        `Type: ${ReportService.reportTypes[report.report_type]}\n` +
        `Reporter: ${report.reporter.first_name} (@${report.reporter.username || 'N/A'})\n` +
        `Reported User: ${report.reported.first_name} (@${report.reported.username || 'N/A'})\n` +
        `Date: ${new Date(report.created_at).toLocaleString()}\n\n` +
        `Description:\n${report.description}\n\n` +
        `Choose an action:`;

      await bot.sendMessage(chatId, reportText, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '⚠️ Warn User', callback_data: `report_action_warn_${reportId}` },
              { text: '⏸️ Suspend User', callback_data: `report_action_suspend_${reportId}` }
            ],
            [
              { text: '🚫 Ban User', callback_data: `report_action_ban_${reportId}` },
              { text: '❌ Dismiss Report', callback_data: `report_action_dismiss_${reportId}` }
            ],
            [{ text: '👤 View User Profile', callback_data: `admin_user_${report.reported.telegram_id}` }],
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
        .select('reported_id')
        .eq('id', reportId)
        .single();

      let actionTaken = '';
      
      switch (action) {
        case 'warn':
          await ReportService.resolveReport(reportId, botConfig.adminUserId, 'warn_user', 'User warned by admin');
          actionTaken = 'User has been warned';
          break;
        case 'suspend':
          await ReportService.resolveReport(reportId, botConfig.adminUserId, 'suspend_user', '7-day suspension');
          actionTaken = 'User has been suspended for 7 days';
          break;
        case 'ban':
          await ReportService.resolveReport(reportId, botConfig.adminUserId, 'ban_user', 'Banned due to report');
          actionTaken = 'User has been permanently banned';
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

      // Get the verification photo URL
      const { data: photoUrl } = await supabaseAdmin.storage
        .from('verification-photos')
        .createSignedUrl(verification.photo_url, 3600); // 1 hour expiry

      const verificationText = `✅ Verification Review\n\n` +
        `User: ${verification.user.first_name} (@${verification.user.username || 'N/A'})\n` +
        `User ID: ${verification.user.telegram_id}\n` +
        `Submitted: ${new Date(verification.submitted_at).toLocaleString()}\n\n` +
        `Review the verification photo and decide:`;

      await bot.sendPhoto(chatId, photoUrl.signedUrl, {
        caption: verificationText,
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Approve', callback_data: `verify_approve_${verificationId}` },
              { text: '❌ Reject', callback_data: `verify_reject_${verificationId}` }
            ],
            [{ text: '👤 View User Profile', callback_data: `admin_user_${verification.user.telegram_id}` }],
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
      } else {
        await VerificationService.rejectVerification(verificationId, botConfig.adminUserId, 'Photo quality insufficient');
        actionTaken = 'Verification rejected ❌';
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

  static async handleBanCommand(msg) {
    const args = msg.text.split(' ');
    if (args.length < 2) {
      await bot.sendMessage(msg.chat.id, 'Usage: /ban <user_id> [reason]');
      return;
    }

    const userId = parseInt(args[1]);
    const reason = args.slice(2).join(' ') || 'Banned by admin';

    try {
      await ReportService.banUser(userId, botConfig.adminUserId, reason);
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
      await ReportService.unbanUser(userId, botConfig.adminUserId);
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
      await ReportService.suspendUser(userId, botConfig.adminUserId, days, reason);
      await bot.sendMessage(msg.chat.id, `✅ User ${userId} has been suspended for ${days} days.`);
    } catch (error) {
      console.error('Error suspending user:', error);
      await bot.sendMessage(msg.chat.id, 'Error suspending user.');
    }
  }

  static async handleTestUserMode(msg) {
    const chatId = msg.chat.id;
    const adminId = msg.from.id;

    await bot.sendMessage(chatId, 
      '👤 Test User Mode\n\n' +
      'As an admin, you can now use the bot as a regular user for testing purposes.\n\n' +
      'Use the main menu below:',
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '👤 My Profile', callback_data: 'profile' }],
            [{ text: '💕 Browse Matches', callback_data: 'browse' }],
            [{ text: '💬 My Matches', callback_data: 'matches' }],
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
        subsText += `${index + 1}. ${sub.user.first_name} (@${sub.user.username || 'N/A'})\n`;
        subsText += `   Plan: ${sub.plan_type.toUpperCase()}\n`;
        subsText += `   Expires: ${new Date(sub.expires_at).toLocaleDateString()}\n`;
        subsText += `   Amount: $${sub.amount_paid}\n\n`;
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
}