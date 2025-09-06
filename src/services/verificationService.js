import { supabaseAdmin } from '../config/database.js';
import sharp from 'sharp';
import fetch from 'node-fetch';

export class VerificationService {
  static async startFaceVerification(userId) {
    try {
      const { data, error } = await supabaseAdmin
        .from('verifications')
        .insert({
          user_id: userId,
          verification_type: 'face',
          status: 'pending',
          started_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error starting face verification:', error);
      throw error;
    }
  }

  static async submitVerificationPhoto(userId, photoData) {
    try {
      // Get the file from Telegram
      const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${photoData.file_path || photoData.file_id}`;
      
      let imageBuffer;
      try {
        const response = await fetch(fileUrl);
        imageBuffer = await response.buffer();
      } catch (fetchError) {
        console.error('Error fetching photo from Telegram:', fetchError);
        // Fallback - just use the file_id as reference
        imageBuffer = null;
      }

      let processedImage = imageBuffer;
      let fileName = `verification_${userId}_${Date.now()}.jpg`;
      
      if (imageBuffer) {
        // Process and optimize the image
        processedImage = await this.processVerificationImage(imageBuffer);
        
        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
          .from('verification-photos')
          .upload(fileName, processedImage, {
            contentType: 'image/jpeg'
          });

        if (uploadError) {
          console.error('Storage upload error:', uploadError);
          // Continue without storage upload
        }
        
        fileName = uploadData?.path || fileName;
      }

      // Update or create verification record
      const { data, error } = await supabaseAdmin
        .from('verifications')
        .upsert({
          user_id: userId,
          verification_type: 'face',
          photo_url: fileName,
          file_id: photoData.file_id,
          status: 'submitted',
          submitted_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error submitting verification photo:', error);
      throw error;
    }
  }

  static async processVerificationImage(imageBuffer) {
    try {
      return await sharp(imageBuffer)
        .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
    } catch (error) {
      console.error('Error processing verification image:', error);
      // Return original buffer if processing fails
      return imageBuffer;
    }
  }

  static async submitVerificationVideo(userId, videoData) {
    try {
      // Process and upload the video
      const fileName = `verification_video_${userId}_${Date.now()}.mp4`;
      
      // Get the file URL from Telegram
      const fileUrl = videoData.file_path ? 
        `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${videoData.file_path}` :
        null;

      let uploadPath = fileName;

      if (fileUrl) {
        try {
          const response = await fetch(fileUrl);
          const videoBuffer = await response.buffer();
          
          // Upload to Supabase Storage
          const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
            .from('verification-videos')
            .upload(fileName, videoBuffer, {
              contentType: 'video/mp4'
            });
          
          if (uploadData?.path) {
            uploadPath = uploadData.path;
          }
          
          if (uploadError) {
            console.error('Video upload error:', uploadError);
          }
        } catch (fetchError) {
          console.error('Error fetching video from Telegram:', fetchError);
        }
      }

      // Update or create verification record
      const { data, error } = await supabaseAdmin
        .from('verifications')
        .upsert({
          user_id: userId,
          verification_type: 'face',
          photo_url: uploadPath, // Using photo_url field for video path
          file_id: videoData.file_id,
          status: 'submitted',
          submitted_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error submitting verification video:', error);
      throw error;
    }
  }

  static async approveVerification(verificationId, adminId) {
    try {
      // Get the verification record first
      const { data: verification, error: getError } = await supabaseAdmin
        .from('verifications')
        .select('user_id')
        .eq('id', verificationId)
        .single();

      if (getError) throw getError;

      // Update verification record
      const { data, error } = await supabaseAdmin
        .from('verifications')
        .update({
          status: 'approved',
          reviewed_by: adminId,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', verificationId)
        .select()
        .single();

      if (error) throw error;

      // Update user verification status
      await supabaseAdmin
        .from('users')
        .update({
          is_verified: true,
          verified_at: new Date().toISOString()
        })
        .eq('telegram_id', verification.user_id);

      return data;
    } catch (error) {
      console.error('Error approving verification:', error);
      throw error;
    }
  }

  static async rejectVerification(verificationId, adminId, reason) {
    try {
      const { data, error } = await supabaseAdmin
        .from('verifications')
        .update({
          status: 'rejected',
          rejection_reason: reason,
          reviewed_by: adminId,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', verificationId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error rejecting verification:', error);
      throw error;
    }
  }

  static async getPendingVerifications() {
    try {
      const { data, error } = await supabaseAdmin
        .from('verifications')
        .select(`
          *,
          user:users(*)
        `)
        .eq('status', 'submitted')
        .order('submitted_at', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching pending verifications:', error);
      return [];
    }
  }

  static async recordLocationVerification(userId, latitude, longitude, accuracy) {
    try {
      const { data, error } = await supabaseAdmin
        .from('location_verifications')
        .insert({
          user_id: userId,
          latitude: latitude,
          longitude: longitude,
          accuracy: accuracy,
          verified_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      // Update user's current location
      await supabaseAdmin
        .from('users')
        .update({
          latitude: latitude,
          longitude: longitude,
          location_updated_at: new Date().toISOString()
        })
        .eq('telegram_id', userId);

      return data;
    } catch (error) {
      console.error('Error recording location verification:', error);
      throw error;
    }
  }

  static async getUserLocationHistory(userId, limit = 5) {
    try {
      const { data, error } = await supabaseAdmin
        .from('location_verifications')
        .select('*')
        .eq('user_id', userId)
        .order('verified_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching location history:', error);
      return [];
    }
  }

  static async isLocationConsistent(userId) {
    try {
      const locations = await this.getUserLocationHistory(userId, 5);
      if (locations.length < 3) return true; // Not enough data

      // Check if locations are within reasonable distance of each other
      const maxDistance = 100; // 100km
      for (let i = 0; i < locations.length - 1; i++) {
        for (let j = i + 1; j < locations.length; j++) {
          const distance = this.calculateDistance(
            locations[i].latitude, locations[i].longitude,
            locations[j].latitude, locations[j].longitude
          );
          if (distance > maxDistance) {
            return false; // Suspicious location jump
          }
        }
      }

      return true;
    } catch (error) {
      console.error('Error checking location consistency:', error);
      return true; // Default to true on error
    }
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

  static async saveVideoToStorage(telegram_id, fileId) {
    // Download video from Telegram and upload to Supabase Storage
    // Return public URL
    // This is a placeholder - implement actual video storage logic
    return `https://your-supabase-url/storage/v1/object/public/verification-videos/${telegram_id}_${fileId}.mp4`;
  }

  static async getUserVerificationStatus(userId) {
    try {
      const { data, error } = await supabaseAdmin
        .from('verifications')
        .select('*')
        .eq('user_id', userId)
        .eq('verification_type', 'face')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return data;
    } catch (error) {
      console.error('Error fetching verification status:', error);
      return null;
    }
  }
}