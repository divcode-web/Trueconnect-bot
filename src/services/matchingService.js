import { supabaseAdmin } from '../config/database.js';

export class MatchingService {
  static async findPotentialMatches(userId, limit = 10) {
    try {
      const user = await this.getUserWithPreferences(userId);
      if (!user) return [];

      const { data: matches, error } = await supabaseAdmin.rpc('find_potential_matches', {
        user_id: userId,
        user_age: user.age,
        user_gender: user.gender,
        user_latitude: user.latitude,
        user_longitude: user.longitude,
        max_distance: user.user_preferences?.max_distance || 50,
        min_age: user.user_preferences?.min_age || 18,
        max_age: user.user_preferences?.max_age || 99,
        preferred_gender: user.user_preferences?.preferred_gender,
        match_limit: limit
      });

      if (error) throw error;
      return matches || [];
    } catch (error) {
      console.error('Error finding potential matches:', error);
      return [];
    }
  }

  static async getUserWithPreferences(userId) {
    try {
      const { data, error } = await supabaseAdmin
        .from('users')
        .select(`
          *,
          user_preferences(*),
          user_photos(*)
        `)
        .eq('telegram_id', userId)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching user with preferences:', error);
      return null;
    }
  }

  static async recordSwipe(swiperId, swipedId, action) {
    try {
      const { data, error } = await supabaseAdmin
        .from('user_swipes')
        .insert({
          swiper_id: swiperId,
          swiped_id: swipedId,
          action: action, // 'like', 'pass', 'super_like'
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      // Check for mutual like (match)
      if (action === 'like' || action === 'super_like') {
        const match = await this.checkForMatch(swiperId, swipedId);
        if (match) {
          return { swipe: data, match: match };
        }
      }

      return { swipe: data, match: null };
    } catch (error) {
      console.error('Error recording swipe:', error);
      throw error;
    }
  }

  static async checkForMatch(userId1, userId2) {
    try {
      // Check if both users liked each other
      const { data: mutualLikes, error } = await supabaseAdmin
        .from('user_swipes')
        .select('*')
        .or(`and(swiper_id.eq.${userId1},swiped_id.eq.${userId2},action.in.(like,super_like)),and(swiper_id.eq.${userId2},swiped_id.eq.${userId1},action.in.(like,super_like))`)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (mutualLikes && mutualLikes.length >= 2) {
        // Create match record
        const { data: match, error: matchError } = await supabaseAdmin
          .from('matches')
          .insert({
            user1_id: Math.min(userId1, userId2),
            user2_id: Math.max(userId1, userId2),
            matched_at: new Date().toISOString(),
            is_active: true
          })
          .select()
          .single();

        if (matchError) throw matchError;
        return match;
      }

      return null;
    } catch (error) {
      console.error('Error checking for match:', error);
      return null;
    }
  }

  static async getUserMatches(userId) {
    try {
      const { data, error } = await supabaseAdmin
        .from('matches')
        .select(`
          *,
          user1:users!matches_user1_id_fkey(*),
          user2:users!matches_user2_id_fkey(*)
        `)
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
        .eq('is_active', true)
        .order('matched_at', { ascending: false });

      if (error) throw error;

      // Format matches to always show the other user
      return data?.map(match => ({
        ...match,
        otherUser: match.user1_id === userId ? match.user2 : match.user1
      })) || [];
    } catch (error) {
      console.error('Error fetching user matches:', error);
      return [];
    }
  }

  static async hasUserSwiped(swiperId, swipedId) {
    try {
      const { data, error } = await supabaseAdmin
        .from('user_swipes')
        .select('action')
        .eq('swiper_id', swiperId)
        .eq('swiped_id', swipedId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data?.action || null;
    } catch (error) {
      console.error('Error checking if user swiped:', error);
      return null;
    }
  }

  static async calculateCompatibilityScore(user1, user2) {
    let score = 0;
    let maxScore = 0;

    // Age compatibility (20 points)
    maxScore += 20;
    const ageDiff = Math.abs(user1.age - user2.age);
    if (ageDiff <= 2) score += 20;
    else if (ageDiff <= 5) score += 15;
    else if (ageDiff <= 10) score += 10;
    else if (ageDiff <= 15) score += 5;

    // Location proximity (30 points)
    maxScore += 30;
    if (user1.latitude && user1.longitude && user2.latitude && user2.longitude) {
      const distance = this.calculateDistance(
        user1.latitude, user1.longitude,
        user2.latitude, user2.longitude
      );
      if (distance <= 5) score += 30;
      else if (distance <= 15) score += 25;
      else if (distance <= 30) score += 20;
      else if (distance <= 50) score += 15;
      else if (distance <= 100) score += 10;
    }

    // Interest overlap (25 points)
    maxScore += 25;
    if (user1.interests && user2.interests) {
      const interests1 = user1.interests.split(',').map(i => i.trim().toLowerCase());
      const interests2 = user2.interests.split(',').map(i => i.trim().toLowerCase());
      const commonInterests = interests1.filter(i => interests2.includes(i));
      const overlapRatio = commonInterests.length / Math.max(interests1.length, interests2.length);
      score += Math.round(overlapRatio * 25);
    }

    // Education level (15 points)
    maxScore += 15;
    if (user1.education && user2.education) {
      if (user1.education === user2.education) score += 15;
      else if (Math.abs(this.getEducationLevel(user1.education) - this.getEducationLevel(user2.education)) <= 1) {
        score += 10;
      }
    }

    // Lifestyle compatibility (10 points)
    maxScore += 10;
    if (user1.lifestyle && user2.lifestyle) {
      const lifestyle1 = user1.lifestyle.split(',').map(l => l.trim().toLowerCase());
      const lifestyle2 = user2.lifestyle.split(',').map(l => l.trim().toLowerCase());
      const commonLifestyle = lifestyle1.filter(l => lifestyle2.includes(l));
      score += Math.round((commonLifestyle.length / Math.max(lifestyle1.length, lifestyle2.length)) * 10);
    }

    return Math.round((score / maxScore) * 100);
  }

  static calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  static toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }

  static getEducationLevel(education) {
    const levels = {
      'high_school': 1,
      'some_college': 2,
      'bachelors': 3,
      'masters': 4,
      'phd': 5
    };
    return levels[education] || 0;
  }

  static async getUserLikes(userId) {
    try {
      const { data, error } = await supabaseAdmin
        .from('user_swipes')
        .select(`
          *,
          swiper:users!user_swipes_swiper_id_fkey(*)
        `)
        .eq('swiped_id', userId)
        .in('action', ['like', 'super_like'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data?.map(swipe => swipe.swiper) || [];
    } catch (error) {
      console.error('Error fetching user likes:', error);
      return [];
    }
  }
}