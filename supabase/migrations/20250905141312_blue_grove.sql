/*
  # Additional Tables for Enhanced Functionality

  1. New Tables
    - `user_notification_settings` - User notification preferences
    - `user_privacy_settings` - User privacy settings
    - `user_activity_log` - Track user activities for analytics

  2. Security
    - Enable RLS on all new tables
    - Add appropriate policies
*/

-- User notification settings table
CREATE TABLE IF NOT EXISTS user_notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE UNIQUE,
  new_matches BOOLEAN DEFAULT true,
  new_messages BOOLEAN DEFAULT true,
  profile_views BOOLEAN DEFAULT true,
  super_likes BOOLEAN DEFAULT true,
  marketing_emails BOOLEAN DEFAULT false,
  push_notifications BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- User privacy settings table
CREATE TABLE IF NOT EXISTS user_privacy_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE UNIQUE,
  profile_visibility TEXT DEFAULT 'public' CHECK (profile_visibility IN ('public', 'private', 'premium_only')),
  location_privacy TEXT DEFAULT 'approximate' CHECK (location_privacy IN ('exact', 'approximate', 'city_only', 'hidden')),
  message_privacy TEXT DEFAULT 'matches_only' CHECK (message_privacy IN ('everyone', 'matches_only', 'premium_only')),
  show_online_status BOOLEAN DEFAULT true,
  show_last_active BOOLEAN DEFAULT true,
  allow_profile_discovery BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- User activity log table for analytics
CREATE TABLE IF NOT EXISTS user_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('login', 'logout', 'profile_view', 'swipe', 'match', 'message', 'photo_upload', 'settings_change')),
  activity_data JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_notification_settings_user_id ON user_notification_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_user_privacy_settings_user_id ON user_privacy_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_log_user_id ON user_activity_log(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_user_activity_log_type ON user_activity_log(activity_type, created_at);

-- Enable Row Level Security
ALTER TABLE user_notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_privacy_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_activity_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can manage own notification settings" ON user_notification_settings
  FOR ALL USING (user_id = current_setting('app.current_user_id')::bigint);

CREATE POLICY "Users can manage own privacy settings" ON user_privacy_settings
  FOR ALL USING (user_id = current_setting('app.current_user_id')::bigint);

CREATE POLICY "Users can view own activity log" ON user_activity_log
  FOR SELECT USING (user_id = current_setting('app.current_user_id')::bigint);

-- Function to update the updated_at timestamp for new tables
CREATE TRIGGER update_user_notification_settings_updated_at 
  BEFORE UPDATE ON user_notification_settings 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_privacy_settings_updated_at 
  BEFORE UPDATE ON user_privacy_settings 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to log user activities
CREATE OR REPLACE FUNCTION log_user_activity(
  p_user_id BIGINT,
  p_activity_type TEXT,
  p_activity_data JSONB DEFAULT NULL
) RETURNS void AS $$
BEGIN
  INSERT INTO user_activity_log (user_id, activity_type, activity_data)
  VALUES (p_user_id, p_activity_type, p_activity_data);
END;
$$ LANGUAGE plpgsql;