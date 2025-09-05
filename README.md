# 🌟 LoveConnect - Advanced Dating Platform

A comprehensive dating platform built with Node.js, featuring live verification, location matching, premium subscriptions, and seamless database synchronization across all deployment platforms.

## ✨ Core Features

### 🔐 User Authentication & Registration
- **Complete Profile Setup**: During registration, users answer all essential questions
- **Face Verification**: Real-time video verification with step-by-step instructions
- **Live Location Services**: Request and verify user locations for accurate matching
- **Profile Customization**: Users can upload pictures, set preferences (age, type, interests, etc.)
- **Edit Profile**: Users can modify their profiles anytime with instant updates

### 💎 Premium Subscription Tiers
- **🥇 Gold Plan (Yearly)**: $99/year
  - Unlimited matches and messages
  - Priority profile visibility
  - Advanced location filters
  - Read receipts
  - Video calls
  - Premium support
- **🥈 Silver Plan (Quarterly)**: $29/quarter
  - 50 matches per month
  - Extended location range
  - Message read status
  - Profile boost once per week
- **🥉 Bronze Plan (Monthly)**: $12/month
  - 25 matches per month
  - Basic location matching
  - Limited messaging
- **⭐ Free Plan**:
  - 10 matches per month
  - Basic messaging (last 100 messages stored)
  - Standard location matching

### 📍 Advanced Location Matching
- **Live Location Verification**: Verify user locations in real-time
- **5-Profile Location Match**: Advanced algorithm checks 5 profile locations before matching
- **Distance-Based Matching**: Find users within specified radius
- **Location History**: Track and verify location consistency

### 💬 Smart Messaging System
- **Message Archiving**: Automatically move messages older than 30-60 days to Supabase Storage as JSON files
- **Free User Limits**: Restrict free users to last 100 messages in database
- **Heavy Content Storage**: Images and files stored in Supabase Storage (not database)
- **Auto-Cleanup**: Scheduled cron jobs purge old messages and optimize performance

### 🛡️ Safety & Moderation
- **Report System**: Users can report inappropriate behavior
- **Complaint Management**: Comprehensive complaint tracking
- **Admin Dashboard**: 
  - View all reports and complaints
  - Block/unblock users
  - Manage premium subscriptions
  - Monitor user activity
  - Content moderation tools
- **Profile Verification**: Multi-step verification process

### 💳 Payment Integration
- **Primary Payments**: PayStack integration via Telegram Payments API for subscriptions
- **Global/Crypto Users**: Wallet Pay and NOWPayments for international users
- **Micro-Payments**: Telegram Stars for small add-ons and features
- **Subscription Management**: Automated billing and renewal system

## 🏗️ Technical Architecture

### 🗄️ Database & Storage
- **Primary Database**: Supabase PostgreSQL with Row Level Security (RLS)
- **File Storage**: Supabase Storage for images, videos, and archived messages
- **Real-time Updates**: Supabase real-time subscriptions for instant messaging
- **Data Synchronization**: **YES** - Your Supabase database stays perfectly synchronized when deploying to any Node.js hosting platform (Vercel, Netlify, Railway, Heroku, etc.)

### 🔄 Database Synchronization
**Important**: When you link your Supabase project from Bolt and deploy your code to any Node.js hosting platform, your database remains **100% synchronized**. This includes:
- All user data and profiles
- Messages and media files
- Premium subscription status
- Location data and verification records
- Reports and admin actions

The synchronization works because:
1. Your app connects to the same Supabase instance via environment variables
2. All database operations use the same API endpoints
3. Real-time features continue working across all platforms
4. File storage remains centralized in Supabase Storage

### 🛠️ Tech Stack
- **Backend**: Node.js with Express.js
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth with email/password
- **File Storage**: Supabase Storage
- **Real-time**: Supabase real-time subscriptions
- **Payments**: PayStack, NOWPayments, Telegram Payments API
- **Location Services**: Geolocation API with verification
- **Image Processing**: Sharp for profile picture optimization

## 📱 User Experience Features

### 🔍 Profile Discovery
- **Smart Matching Algorithm**: Based on preferences, location, and compatibility
- **Profile Browsing**: Swipe through potential matches
- **Advanced Filters**: Age, distance, interests, verification status
- **Boost System**: Premium users get enhanced visibility
- **Channel Promotion**: Occasional "Please subscribe to my channel" prompts during browsing

### ✅ Verification System
- **Face Verification**: 
  - Step-by-step video tutorial showing how verification works
  - Real-time face detection and matching
  - Manual admin review for edge cases
- **Location Verification**: 
  - GPS location confirmation
  - Cross-reference with multiple location points
  - Prevent location spoofing
- **Profile Verification**: Blue checkmark for verified users

### 💌 Communication
- **Instant Messaging**: Real-time chat with read receipts (premium)
- **Media Sharing**: Photos, videos, and voice messages
- **Video Calls**: Premium feature for verified users
- **Message History**: Configurable retention based on subscription tier

## 🚀 Installation & Setup

### Prerequisites
- Node.js 18+ 
- Supabase account
- PayStack account (for payments)
- Telegram Bot Token (for Telegram integration)

### Environment Variables
```env
# Supabase Configuration
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Payment Integration
PAYSTACK_SECRET_KEY=your_paystack_secret
NOWPAYMENTS_API_KEY=your_nowpayments_key
TELEGRAM_BOT_TOKEN=your_telegram_bot_token

# App Configuration
NODE_ENV=production
PORT=3000
JWT_SECRET=your_jwt_secret
ADMIN_EMAIL=admin@yourdomain.com
```

### Quick Start
```bash
# Clone repository
git clone <repository-url>
cd dating-app

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Run database migrations
npm run db:migrate

# Start development server
npm run dev

# For production
npm run build
npm start
```

## 🔧 Admin Features

### 👨‍💼 Admin Dashboard (Restricted Access)
**Note**: Admin access is restricted to designated administrators only.

- **User Management**:
  - View all user profiles and activity
  - Block/unblock users instantly
  - Manage verification status
  - View subscription history

- **Report Management**:
  - Review user reports with detailed information
  - Take action on complaints (warning, temporary ban, permanent ban)
  - Track report resolution status
  - Generate safety reports

- **Content Moderation**:
  - Review flagged content
  - Manage profile photos and descriptions
  - Monitor chat messages for policy violations
  - Automated content filtering

- **Analytics Dashboard**:
  - User engagement metrics
  - Revenue tracking
  - Geographic distribution
  - Premium conversion rates

## 📊 Performance Optimization

### 🗄️ Database Optimization
- **Automated Archiving**: Messages older than 30-60 days moved to cold storage
- **Index Optimization**: Optimized queries for location and matching
- **Connection Pooling**: Efficient database connection management
- **Query Caching**: Redis integration for frequently accessed data

### 📁 File Management
- **CDN Integration**: Fast image and video delivery
- **Image Compression**: Automatic optimization for different screen sizes
- **Progressive Loading**: Lazy loading for better performance
- **Storage Cleanup**: Automated removal of unused files

## 🔒 Security Features

### 🛡️ Data Protection
- **Row Level Security (RLS)**: Database-level access control
- **Data Encryption**: Sensitive data encrypted at rest
- **API Rate Limiting**: Prevent abuse and spam
- **GDPR Compliance**: User data export and deletion

### 🚨 Safety Measures
- **Photo Verification**: AI-powered inappropriate content detection
- **Spam Detection**: Automated spam message filtering
- **Location Privacy**: Fuzzy location sharing for safety
- **Block/Report System**: Easy user reporting and blocking

## 💰 Monetization Strategy

### 💳 Revenue Streams
1. **Premium Subscriptions** (Primary Revenue)
   - Gold: $99/year - Unlimited features
   - Silver: $29/quarter - Enhanced experience  
   - Bronze: $12/month - Basic premium features

2. **Micro-Transactions** via Telegram Stars
   - Profile boosts: ⭐50 stars
   - Super likes: ⭐20 stars
   - Message highlights: ⭐10 stars

3. **Channel Promotion** 
   - Strategic "Subscribe to my channel" prompts
   - Affiliate marketing integration

## 📈 Scaling & Deployment

### 🌐 Multi-Platform Deployment
The app is designed to work seamlessly across:
- **Vercel**: Serverless deployment with automatic scaling
- **Railway**: Full-stack hosting with persistent storage  
- **Heroku**: Traditional PaaS deployment
- **DigitalOcean**: VPS deployment with Docker
- **AWS/GCP**: Enterprise-level scaling

### 🔄 Database Sync Guarantee
Your Supabase database **will remain synchronized** regardless of where you deploy because:
- Single source of truth (Supabase)
- Environment-based configuration
- API-driven architecture
- Real-time subscriptions work everywhere

## 🤝 Contributing

We welcome contributions! Please read our contributing guidelines and submit pull requests for any improvements.

### Development Setup
1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: Full API documentation available
- **Community**: Join our Discord server for support
- **Issues**: Report bugs via GitHub issues
- **Premium Support**: Priority support for premium subscribers

---

**Built with ❤️ for meaningful connections**

*Last updated: January 2025*