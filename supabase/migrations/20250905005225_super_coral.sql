/*
  # Initial Dating Bot Schema

  1. New Tables
    - `users` - User profiles and account information
    - `user_photos` - User profile photos
    - `user_preferences` - Matching preferences
    - `user_swipes` - Swipe history (like/pass/super_like)
    - `matches` - Mutual matches between users
    - `messages` - Chat messages between matched users
    - `subscriptions` - Premium subscription records
    - `payments` - Payment transaction history
    - `verifications` - Identity verification records
    - `location_verifications` - Location check-in history
    - `reports` - User reports and complaints
    - `moderation_actions` - Admin moderation history
    - `user_blocks` - Blocked users

  2. Security
    - Enable RLS on all tables
    - Add policies for user data access
    - Admin-only access for moderation tables
*/

-- Users table
CREATE TABLE IF NOT EXISTS users (
  telegram_id BIGINT PRIMARY KEY,
  username TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT,
  age INTEGER,
  gender TEXT CHECK (gender IN ('male', 'female', 'non_binary')),
  bio TEXT,
  profession TEXT,
  education TEXT CHECK (education IN ('high_school', 'some_college', 'bachelors', 'masters', 'phd')),
  height TEXT,
  interests TEXT,
  lifestyle TEXT,
  looking_for TEXT CHECK (looking_for IN ('relationship', 'casual', 'marriage', 'friends')),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  location_updated_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  is_premium BOOLEAN DEFAULT false,
  premium_plan TEXT,
  premium_expires_at TIMESTAMPTZ,
  is_verified BOOLEAN DEFAULT false,
  verified_at TIMESTAMPTZ,
  is_banned BOOLEAN DEFAULT false,
  banned_at TIMESTAMPTZ,
  banned_by BIGINT,
  ban_reason TEXT,
  is_suspended BOOLEAN DEFAULT false,
  suspended_until TIMESTAMPTZ,
  suspended_by BIGINT,
  suspension_reason TEXT,
  warning_count INTEGER DEFAULT 0,
  registration_step TEXT DEFAULT 'basic_info',
  profile_completed BOOLEAN DEFAULT false,
  profile_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- User photos table
CREATE TABLE IF NOT EXISTS user_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  file_id TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- User preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE UNIQUE,
  min_age INTEGER DEFAULT 18,
  max_age INTEGER DEFAULT 99,
  preferred_gender TEXT,
  max_distance INTEGER DEFAULT 50,
  education_preference TEXT[],
  lifestyle_preference TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- User swipes table
CREATE TABLE IF NOT EXISTS user_swipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  swiper_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  swiped_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('like', 'pass', 'super_like')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(swiper_id, swiped_id)
);

-- Matches table
CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user1_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  user2_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  matched_at TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT true,
  last_message TEXT,
  last_message_at TIMESTAMPTZ,
  UNIQUE(user1_id, user2_id),
  CHECK (user1_id < user2_id)
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  receiver_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'photo', 'video', 'audio')),
  sent_at TIMESTAMPTZ DEFAULT now(),
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ
);

-- Subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  plan_type TEXT NOT NULL CHECK (plan_type IN ('silver', 'gold', 'platinum')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired')),
  started_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  cancelled_at TIMESTAMPTZ,
  payment_method TEXT,
  transaction_id TEXT,
  amount_paid DECIMAL(10, 2),
  currency TEXT DEFAULT 'USD',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  payment_method TEXT NOT NULL,
  transaction_id TEXT UNIQUE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Verifications table
CREATE TABLE IF NOT EXISTS verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  verification_type TEXT NOT NULL CHECK (verification_type IN ('face', 'phone', 'email')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'approved', 'rejected')),
  photo_url TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  reviewed_by BIGINT,
  rejection_reason TEXT
);

-- Location verifications table
CREATE TABLE IF NOT EXISTS location_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  accuracy DECIMAL(10, 2),
  verified_at TIMESTAMPTZ DEFAULT now()
);

-- Reports table
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  reported_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  report_type TEXT NOT NULL CHECK (report_type IN ('fake_profile', 'harassment', 'inappropriate_content', 'spam', 'underage', 'other')),
  description TEXT NOT NULL,
  evidence TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'escalated', 'resolved', 'dismissed')),
  admin_action TEXT,
  admin_notes TEXT,
  resolved_by BIGINT,
  resolved_at TIMESTAMPTZ,
  escalated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Moderation actions table
CREATE TABLE IF NOT EXISTS moderation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  admin_id BIGINT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('warn', 'suspend', 'ban', 'unban')),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- User blocks table
CREATE TABLE IF NOT EXISTS user_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  blocked_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(blocker_id, blocked_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_location ON users(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_age_gender ON users(age, gender) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_user_swipes_swiper ON user_swipes(swiper_id, created_at);
CREATE INDEX IF NOT EXISTS idx_user_swipes_swiped ON user_swipes(swiped_id, created_at);
CREATE INDEX IF NOT EXISTS idx_matches_users ON matches(user1_id, user2_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(sender_id, receiver_id, sent_at);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(receiver_id, is_read, sent_at) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at);
CREATE INDEX IF NOT EXISTS idx_verifications_status ON verifications(status, submitted_at);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_swipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_blocks ENABLE ROW LEVEL SECURITY;

-- RLS Policies (Note: These are basic policies - adjust based on your specific needs)

-- Users can read their own data and public data of others
CREATE POLICY "Users can read own data" ON users
  FOR SELECT USING (true); -- Public read for matching

CREATE POLICY "Users can update own data" ON users
  FOR UPDATE USING (telegram_id = current_setting('app.current_user_id')::bigint);

-- User photos policies
CREATE POLICY "Users can manage own photos" ON user_photos
  FOR ALL USING (user_id = current_setting('app.current_user_id')::bigint);

CREATE POLICY "Users can view photos" ON user_photos
  FOR SELECT USING (true);

-- User preferences policies
CREATE POLICY "Users can manage own preferences" ON user_preferences
  FOR ALL USING (user_id = current_setting('app.current_user_id')::bigint);

-- Swipes policies
CREATE POLICY "Users can manage own swipes" ON user_swipes
  FOR ALL USING (swiper_id = current_setting('app.current_user_id')::bigint);

-- Matches policies
CREATE POLICY "Users can view own matches" ON matches
  FOR SELECT USING (
    user1_id = current_setting('app.current_user_id')::bigint OR 
    user2_id = current_setting('app.current_user_id')::bigint
  );

-- Messages policies
CREATE POLICY "Users can manage own messages" ON messages
  FOR ALL USING (
    sender_id = current_setting('app.current_user_id')::bigint OR 
    receiver_id = current_setting('app.current_user_id')::bigint
  );

-- Subscriptions policies
CREATE POLICY "Users can view own subscriptions" ON subscriptions
  FOR SELECT USING (user_id = current_setting('app.current_user_id')::bigint);

-- Reports policies
CREATE POLICY "Users can create reports" ON reports
  FOR INSERT WITH CHECK (reporter_id = current_setting('app.current_user_id')::bigint);

CREATE POLICY "Users can view own reports" ON reports
  FOR SELECT USING (reporter_id = current_setting('app.current_user_id')::bigint);

-- Admin-only policies for moderation
CREATE POLICY "Admin only moderation" ON moderation_actions
  FOR ALL USING (admin_id = current_setting('app.admin_user_id')::bigint);

-- User blocks policies
CREATE POLICY "Users can manage own blocks" ON user_blocks
  FOR ALL USING (blocker_id = current_setting('app.current_user_id')::bigint);