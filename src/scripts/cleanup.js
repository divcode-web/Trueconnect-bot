import { supabaseAdmin } from '../config/database.js';
import { MessageService } from '../services/messageService.js';
import { SubscriptionService } from '../services/subscriptionService.js';
import { ReportService } from '../services/reportService.js';

async function runCleanup() {
  console.log('🧹 Starting cleanup tasks...');
  
  try {
    // Archive old messages
    console.log('📦 Archiving old messages...');
    await MessageService.archiveOldMessages();
    
    // Clean up free user messages
    console.log('🗑️ Cleaning up free user messages...');
    await MessageService.cleanupFreeUserMessages();
    
    // Check expired subscriptions
    console.log('💎 Checking expired subscriptions...');
    await SubscriptionService.checkExpiredSubscriptions();
    
    // Check suspended users
    console.log('🔒 Checking suspended users...');
    await ReportService.checkSuspensions();
    
    // Run database cleanup function
    console.log('🗄️ Running database cleanup...');
    const { error } = await supabaseAdmin.rpc('cleanup_old_data');
    if (error) throw error;
    
    console.log('✅ Cleanup completed successfully');
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    process.exit(1);
  }
}

// Run cleanup if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runCleanup().then(() => process.exit(0));
}

export { runCleanup };