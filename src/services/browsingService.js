import { supabaseAdmin } from '../config/database.js';

export class BrowsingService {
  static async browseMatches(telegram_id) {
    // Example: fetch users with matching preferences
    const { data } = await supabaseAdmin
      .from('users')
      .select('first_name, username, telegram_id')
      .neq('telegram_id', telegram_id)
      .eq('is_active', true)
      .limit(10);
    return data;
  }

  static async updateLocation(telegram_id, lat, lon) {
    return await supabaseAdmin
      .from('users')
      .update({ location_lat: lat, location_lon: lon })
      .eq('telegram_id', telegram_id);
  }
}