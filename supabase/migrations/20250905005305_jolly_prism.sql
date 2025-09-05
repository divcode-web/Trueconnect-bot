/*
  # Matching Algorithm Functions

  1. Functions
    - `find_potential_matches` - Find compatible users for matching
    - `calculate_distance` - Calculate distance between two points
    - `get_compatibility_score` - Calculate compatibility percentage

  2. Optimizations
    - Spatial indexing for location-based queries
    - Efficient filtering for preferences
*/

-- Function to calculate distance between two points (Haversine formula)
CREATE OR REPLACE FUNCTION calculate_distance(
  lat1 DECIMAL, lon1 DECIMAL, lat2 DECIMAL, lon2 DECIMAL
) RETURNS DECIMAL AS $$
BEGIN
  RETURN (
    6371 * acos(
      cos(radians(lat1)) * cos(radians(lat2)) * cos(radians(lon2) - radians(lon1)) +
      sin(radians(lat1)) * sin(radians(lat2))
    )
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to find potential matches
CREATE OR REPLACE FUNCTION find_potential_matches(
  user_id BIGINT,
  user_age INTEGER,
  user_gender TEXT,
  user_latitude DECIMAL,
  user_longitude DECIMAL,
  max_distance INTEGER DEFAULT 50,
  min_age INTEGER DEFAULT 18,
  max_age INTEGER DEFAULT 99,
  preferred_gender TEXT DEFAULT NULL,
  match_limit INTEGER DEFAULT 10
) RETURNS TABLE (
  telegram_id BIGINT,
  first_name TEXT,
  age INTEGER,
  gender TEXT,
  bio TEXT,
  profession TEXT,
  education TEXT,
  height TEXT,
  interests TEXT,
  lifestyle TEXT,
  latitude DECIMAL,
  longitude DECIMAL,
  is_verified BOOLEAN,
  distance DECIMAL,
  compatibility_score INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.telegram_id,
    u.first_name,
    u.age,
    u.gender,
    u.bio,
    u.profession,
    u.education,
    u.height,
    u.interests,
    u.lifestyle,
    u.latitude,
    u.longitude,
    u.is_verified,
    calculate_distance(user_latitude, user_longitude, u.latitude, u.longitude) as distance,
    CASE 
      WHEN u.age BETWEEN min_age AND max_age THEN 
        CASE 
          WHEN abs(u.age - user_age) <= 2 THEN 90
          WHEN abs(u.age - user_age) <= 5 THEN 80
          WHEN abs(u.age - user_age) <= 10 THEN 70
          ELSE 60
        END
      ELSE 50
    END as compatibility_score
  FROM users u
  WHERE u.telegram_id != user_id
    AND u.is_active = true
    AND u.is_banned = false
    AND u.profile_completed = true
    AND u.latitude IS NOT NULL
    AND u.longitude IS NOT NULL
    AND (preferred_gender IS NULL OR u.gender = preferred_gender)
    AND u.age BETWEEN min_age AND max_age
    AND calculate_distance(user_latitude, user_longitude, u.latitude, u.longitude) <= max_distance
    AND NOT EXISTS (
      SELECT 1 FROM user_swipes s 
      WHERE s.swiper_id = user_id AND s.swiped_id = u.telegram_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM user_blocks b 
      WHERE (b.blocker_id = user_id AND b.blocked_id = u.telegram_id)
         OR (b.blocker_id = u.telegram_id AND b.blocked_id = user_id)
    )
  ORDER BY 
    u.is_verified DESC,
    u.is_premium DESC,
    distance ASC,
    compatibility_score DESC,
    u.created_at DESC
  LIMIT match_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to get user statistics
CREATE OR REPLACE FUNCTION get_user_stats(user_id BIGINT)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_likes_sent', (
      SELECT COUNT(*) FROM user_swipes 
      WHERE swiper_id = user_id AND action IN ('like', 'super_like')
    ),
    'total_likes_received', (
      SELECT COUNT(*) FROM user_swipes 
      WHERE swiped_id = user_id AND action IN ('like', 'super_like')
    ),
    'total_matches', (
      SELECT COUNT(*) FROM matches 
      WHERE (user1_id = user_id OR user2_id = user_id) AND is_active = true
    ),
    'total_messages_sent', (
      SELECT COUNT(*) FROM messages 
      WHERE sender_id = user_id
    ),
    'total_messages_received', (
      SELECT COUNT(*) FROM messages 
      WHERE receiver_id = user_id
    ),
    'profile_views', 0, -- Placeholder for future feature
    'verification_status', (
      SELECT is_verified FROM users WHERE telegram_id = user_id
    ),
    'premium_status', (
      SELECT is_premium FROM users WHERE telegram_id = user_id
    )
  ) INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old data
CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS void AS $$
BEGIN
  -- Delete old swipes (older than 6 months)
  DELETE FROM user_swipes 
  WHERE created_at < NOW() - INTERVAL '6 months';
  
  -- Delete old location verifications (keep only last 10 per user)
  DELETE FROM location_verifications 
  WHERE id NOT IN (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY verified_at DESC) as rn
      FROM location_verifications
    ) t WHERE t.rn <= 10
  );
  
  -- Update suspended users whose suspension has expired
  UPDATE users 
  SET is_suspended = false, 
      suspended_until = NULL, 
      suspended_by = NULL, 
      suspension_reason = NULL,
      is_active = true
  WHERE is_suspended = true 
    AND suspended_until < NOW();
    
  -- Mark expired subscriptions as expired
  UPDATE subscriptions 
  SET status = 'expired' 
  WHERE status = 'active' 
    AND expires_at < NOW();
    
  -- Update user premium status based on active subscriptions
  UPDATE users 
  SET is_premium = false, 
      premium_plan = NULL, 
      premium_expires_at = NULL
  WHERE is_premium = true 
    AND NOT EXISTS (
      SELECT 1 FROM subscriptions s 
      WHERE s.user_id = users.telegram_id 
        AND s.status = 'active' 
        AND s.expires_at > NOW()
    );
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply the trigger to relevant tables
CREATE TRIGGER update_users_updated_at 
  BEFORE UPDATE ON users 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_preferences_updated_at 
  BEFORE UPDATE ON user_preferences 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();