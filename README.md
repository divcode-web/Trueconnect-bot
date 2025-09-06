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
- Payment provider accounts:
  - Telegram Bot with Stars enabled
  - SmartGlocal merchant account
- Telegram Bot Token (for Telegram integration)

### Environment Variables
```env
# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Payment Integration
SMARTGLOCAL_API_KEY=your_smartglocal_key
SMARTGLOCAL_MERCHANT_ID=your_merchant_id
TELEGRAM_BOT_TOKEN=your_telegram_bot_token

# App Configuration
NODE_ENV=production
PORT=3000
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_USER_ID=your_telegram_admin_id

# Channel Configuration
CHANNEL_USERNAME=@YourChannel
CHANNEL_PROMOTION_FREQUENCY=10
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

## 💳 Payment Integration Setup

### Telegram Stars Setup
1. **Enable Stars in BotFather**:
   - Contact @BotFather
   - Use `/mybots` → Select your bot → Bot Settings → Payments
   - Enable Telegram Stars payments

2. **Configure Star Prices**:
   - 1 USD ≈ 50 Telegram Stars
   - Silver Plan: 1000 Stars
   - Gold Plan: 3000 Stars
   - Platinum Plan: 10000 Stars

### SmartGlocal Integration
1. **Create Merchant Account**:
   - Register at SmartGlocal
   - Complete KYC verification
   - Get API credentials

2. **Configure Webhook**:
   - Set webhook URL: `https://yourdomain.com/webhook/smartglocal`
   - Configure payment notifications
   - Test payment flow

## 🆕 New Features Added

### ✅ Profile Verification System
- **Video Verification**: Users upload verification videos
- **Step-by-step Instructions**: Clear guidance for verification process
- **Sample Video**: Reference video showing proper verification
- **Admin Review**: Manual verification review by administrators

### 👤 Enhanced Profile Management
- **Edit Profile Fields**: Users can edit bio, interests, profession, etc.
- **Photo Management**: Upload, delete, and reorder profile photos
- **Account Deletion**: Complete account removal with data cleanup
- **Who Likes Me**: Premium feature showing users who liked your profile

### 🔧 Admin Enhancements
- **Test User Mode**: Admin can test app as regular user
- **Subscription Management**: View and manage all subscriptions
- **Payment Monitoring**: Track all payment transactions
- **Enhanced Analytics**: Detailed user and revenue analytics

### 💳 Payment System Upgrades
- **Telegram Stars**: Native Telegram payment integration
- **SmartGlocal Gateway**: International payment processing
- **Multiple Payment Options**: Various payment methods for global users
- **Automated Billing**: Subscription management and renewals

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

- **Subscription Management**:
  - View all active subscriptions
  - Monitor payment transactions
  - Handle subscription issues
  - Generate revenue reports

- **Test User Mode**:
  - Admin can switch to regular user mode for testing
  - Test all features from user perspective
  - Debug issues in real-time

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

2. **Telegram Stars Integration**
   - Profile boosts: ⭐50 stars
   - Super likes: ⭐20 stars
   - Message highlights: ⭐10 stars
   - Premium subscriptions: ⭐1000-5000 stars
   - Seamless in-app payments

3. **SmartGlocal Payment Gateway**
   - Credit/Debit card payments
   - International payment support
   - Secure payment processing
   - Multiple currency support

4. **Channel Promotion** 
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
# Premium Dating Bot for Telegram

A comprehensive Telegram dating bot with advanced matching algorithms, premium subscriptions, payment processing, and admin management features.

## Features

### Core Features
- 🔐 **User Registration & Profiles** - Complete profile setup with photos, preferences, and verification
- 💕 **Smart Matching Algorithm** - Location-based matching with compatibility scoring
- 💬 **In-App Messaging** - Direct messaging between matched users
- 📸 **Photo Management** - Multiple photo uploads with primary photo selection
- 🎯 **Advanced Preferences** - Age, distance, education, and lifestyle preferences

### Premium Features
- 💎 **Multiple Subscription Plans** - Silver, Gold, and Platinum tiers
- ⭐ **Super Likes** - Stand out with super likes
- 👀 **See Who Liked You** - View your admirers (premium only)
- 🚀 **Unlimited Likes** - No daily limits for premium users
- 🔄 **Rewind Feature** - Undo accidental swipes

### Payment Integration
- 💳 **Telegram Stars** - Native Telegram payments
- 🏦 **PayStack Integration** - For Nigerian market
- ₿ **Crypto Payments** - Bitcoin and other cryptocurrencies via NOWPayments

### Admin Features
- 🔧 **Admin Dashboard** - Comprehensive management interface
- 📊 **Analytics & Statistics** - User engagement and platform metrics
- 🚨 **Report Management** - Handle user reports and moderation
- ✅ **Verification System** - Manual verification of user profiles
- 👤 **User Management** - Ban, suspend, and manage users

### Security & Safety
- 🔒 **Profile Verification** - Photo/video verification system
- 🚫 **User Reporting** - Report inappropriate behavior
- 🛡️ **Location Privacy** - Approximate location display
- 🔐 **Data Protection** - Secure data handling with Supabase

## Tech Stack

- **Backend**: Node.js with Express
- **Database**: PostgreSQL with Supabase
- **Bot Framework**: node-telegram-bot-api
- **Payment Processing**: PayStack, NOWPayments, Telegram Stars
- **Image Processing**: Sharp
- **Scheduling**: node-cron
- **Authentication**: Row Level Security (RLS)

## Installation

### Prerequisites
- Node.js 18+ and npm
- Telegram Bot Token (from @BotFather)
- Supabase account and database
- PayStack account (optional)
- NOWPayments account (optional)

### Setup Instructions

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/telegram-dating-bot.git
   cd telegram-dating-bot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Set up Supabase database**
   - Create a new Supabase project
   - Run the SQL migrations in order:
     - `database/migrations/20250905005225_super_coral.sql`
     - `database/migrations/20250905005305_jolly_prism.sql`  
     - `database/migrations/20250905141312_blue_grove.sql`

5. **Configure your Telegram Bot**
   - Create a bot with @BotFather
   - Set bot commands:
     ```
     start - Start the bot
     profile - View and edit profile
     browse - Browse potential matches
     matches - View your matches
     premium - Upgrade to premium
     verify - Verify your profile
     help - Get help
     ```

6. **Start the application**
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm start
   ```

## Configuration

### Environment Variables

```bash
# Telegram Bot
BOT_TOKEN=your_bot_token
WEBHOOK_URL=https://your-domain.com
ADMIN_USER_ID=your_telegram_id

# Database
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Payment Gateways (Optional)
PAYSTACK_PUBLIC_KEY=pk_test_your_key
PAYSTACK_SECRET_KEY=sk_test_your_key
NOWPAYMENTS_API_KEY=your_api_key
NOWPAYMENTS_IPN_SECRET=your_ipn_secret

# Optional Features
CHANNEL_USERNAME=@your_channel
VERIFICATION_REQUIRED=false
ENABLE_ANALYTICS=true
```

### Subscription Plans Configuration

Edit the plans in `src/services/subscriptionService.js`:

```javascript
static subscriptionPlans = {
  silver: {
    name: 'Silver',
    price: 19.99,
    duration: 90, // days
    features: [...]
  },
  // ... other plans
}
```

## Database Schema

The bot uses a comprehensive PostgreSQL schema with the following main tables:

- `users` - User profiles and account information
- `user_photos` - Profile photos
- `user_preferences` - Matching preferences
- `user_swipes` - Swipe history (like/pass/super_like)
- `matches` - Mutual matches
- `messages` - Chat messages
- `subscriptions` - Premium subscriptions
- `payments` - Payment records
- `verifications` - Identity verification
- `reports` - User reports
- `moderation_actions` - Admin actions

## API Endpoints

### Webhooks
- `POST /webhook/telegram` - Telegram bot webhook
- `POST /webhook/paystack` - PayStack payment webhook
- `POST /webhook/nowpayments` - NOWPayments webhook

### Payment Pages
- `GET /webhook/success` - Payment success page
- `GET /webhook/cancel` - Payment cancellation page

## Deployment

### Using Railway/Render/Heroku

1. **Set up environment variables** in your deployment platform
2. **Configure webhook URL** to point to your deployed instance
3. **Set up database** using Supabase
4. **Deploy the application**

### Using Docker

```bash
# Build the image
docker build -t dating-bot .

# Run the container
docker run -p 3000:3000 --env-file .env dating-bot
```

### Using PM2 (Production)

```bash
# Install PM2
npm install -g pm2

# Start the application
pm2 start src/bot.js --name "dating-bot"

# Save PM2 configuration
pm2 save
pm2 startup
```

## Usage

### For Users
1. Start the bot with `/start`
2. Complete profile registration
3. Upload photos and set preferences
4. Start browsing potential matches
5. Like/pass on profiles to find matches
6. Chat with matched users

### For Admins
1. Set your user ID as `ADMIN_USER_ID` in environment
2. Use `/admin` to access admin dashboard
3. Manage reports, verifications, and users
4. View platform statistics and analytics

## Scheduled Tasks

The bot runs automated tasks:
- **Daily**: Archive old messages, clean up data
- **Hourly**: Check expired subscriptions
- **Daily**: Check suspended users

## Security Features

- Row Level Security (RLS) on all database tables
- Webhook signature verification
- Rate limiting on API endpoints
- Encrypted sensitive data storage
- Input validation and sanitization

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support, contact:
- Telegram: @your_support_username
- Email: support@yourdomain.com
- Issues: GitHub Issues page

## Roadmap

- [ ] Video chat integration
- [ ] AI-powered matching improvements
- [ ] Social media integration
- [ ] Advanced analytics dashboard
- [ ] Multi-language support
- [ ] Voice messages
- [ ] Story/status features

## Disclaimer

This bot is designed for educational and legitimate dating purposes. Ensure compliance with:
- Telegram's Terms of Service
- Local laws and regulations
- Data protection regulations (GDPR, etc.)
- Age verification requirements

## Changelog

### v1.0.0
- Initial release with core dating features
- Payment integration
- Admin management system
- Comprehensive matching algorithm