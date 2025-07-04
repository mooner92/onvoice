# LiveTranscribe - Real-Time Lecture Transcription & Translation

LiveTranscribe is a real-time lecture transcription and translation service. Speakers can conduct lectures through Bluetooth microphones, and participants can scan QR codes to view real-time subtitles and translations.

## 🚀 Key Features

### 🎤 Speaker (Host)
- **High-Quality Speech Recognition**: Server-based STT using OpenAI Whisper API (high accuracy)
- **Session Management**: Lecture title, description, language settings
- **Automatic QR Code Generation**: Real-time QR codes for easy participant access
- **Session Persistence**: Automatic session recovery after browser restart
- **Real-Time Caption Display**: 3-second audio processing for text conversion
- **Live Participant Monitoring**: Real-time display of connected participants
- **Lifetime Storage**: Unlimited storage for speaker sessions
- **5-Minute Auto-Timeout**: Automatic session termination after 5 minutes to prevent cost overruns

### 👥 Audience (Participants)
- **QR Code Access**: Scan QR codes with smartphones for instant participation
- **No Authentication Required**: Public links for online sessions
- **Multi-Language Translation**: Real-time translation in 50+ languages
- **Personalized Settings**: Font size, dark mode, auto-scroll, etc.
- **Remote Access**: Support for online conferences, webinars, and remote participation
- **30-Day Free Storage**: Free storage of participated sessions for 30 days (with login)

### 💰 Subscription Model
- **Free Plan**: 30-day session storage, basic features
- **Premium Plan**: £5.99/month, unlimited storage, AI summaries, and advanced features

## 🛠️ Technology Stack

- **Frontend**: Next.js 15, React 19, TypeScript
- **UI**: Tailwind CSS, Radix UI, react-qr-code
- **Authentication**: Supabase Auth (Google OAuth)
- **Database**: Supabase PostgreSQL
- **Real-time Communication**: Supabase Realtime
- **Speech Recognition**: OpenAI Whisper API (server-based STT)
- **QR Code**: react-qr-code, qrcode
- **Audio Processing**: MediaRecorder API (WebRTC)
- **Translation**: Google Translate API / Azure Translator

## 📦 Installation & Setup

### 1. Clone Project
```bash
git clone <repository-url>
cd onvoice
pnpm install
pnpm dev
```

### 2. Supabase Setup
1. Create a new project on [Supabase](https://supabase.com)
2. Enable Google OAuth in Authentication > Providers
3. Create OAuth 2.0 Client ID in Google Cloud Console
4. Configure Google OAuth in Supabase project settings

### 3. Environment Variables
Create `.env.local` file and add the following:
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Google OAuth
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id

# OpenAI (Whisper API)
OPENAI_API_KEY=your_openai_api_key

# Google Translate (Optional - for translation features)
GOOGLE_TRANSLATE_API_KEY=your_google_translate_api_key

# Next.js (Optional)
NEXTAUTH_SECRET=your_nextauth_secret
NEXTAUTH_URL=http://localhost:3000
```

#### How to Obtain Environment Variables:

1. **Supabase Keys**: 
   - Supabase Dashboard → Settings → API
   - Copy URL and anon/public key
   - `SUPABASE_SERVICE_ROLE_KEY` is the service_role key (never expose!)

2. **Google Client ID**: 
   - Google Cloud Console → APIs & Services → Credentials
   - Create OAuth 2.0 Client ID for Web application
   - Add your domain to authorized domains

3. **OpenAI API Key**:
   - OpenAI Platform → API Keys
   - Create new secret key
   - Note: Paid OpenAI account required for Whisper API

4. **Google Translate API Key** (Optional):
   - Google Cloud Console → APIs & Services → Library
   - Enable Cloud Translation API
   - Create API key

### 4. Database Schema Setup
Execute the contents of `supabase-schema.sql` file in Supabase SQL Editor to create tables and policies.

### 5. Start Development Server
```bash
pnpm dev
```

## 🎯 Usage

### Starting a Session as Speaker
1. Login with Google account
2. Click "Start as Host"
3. Set session title, description, and language
4. Click "Start Session" to begin speech recognition
5. Display QR code for participants to access

### Joining a Session as Participant
1. Scan QR code provided by speaker
2. Login with Google account (optional)
3. Select desired language
4. View real-time captions and translations

## 📁 Project Structure

```
onvoice/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   │   ├── session/       # Session management APIs
│   │   ├── stt/           # Speech-to-text API
│   │   ├── stt-stream/    # Real-time STT streaming
│   │   └── translate/     # Translation API
│   ├── auth/              # Authentication pages
│   ├── host/              # Speaker dashboard
│   ├── session/           # Session participation
│   ├── my-sessions/       # My sessions management
│   ├── s/[slug]/          # Public session access
│   └── demo/              # Demo page
├── components/            # React components
│   ├── auth/             # Authentication components
│   ├── ui/               # UI components
│   └── RealtimeSTT.tsx   # Real-time STT component
├── lib/                  # Utilities and configuration
│   ├── supabase.ts       # Supabase client
│   ├── types.ts          # TypeScript type definitions
│   └── utils.ts          # Utility functions
└── supabase-schema.sql   # Database schema
```

## 🔧 Key Features Explained

### Real-Time STT System
- **OpenAI Whisper Integration**: High-accuracy speech recognition
- **3-Second Chunks**: Optimal balance between latency and accuracy
- **Automatic Fallback**: Mock STT when API keys are not configured
- **Cost Optimization**: 5-minute auto-timeout to prevent excessive costs

### Translation System
- **On-Demand Translation**: Only translates when translation tab is active
- **Cost Efficiency**: 50-70% cost reduction through selective translation
- **Multiple Providers**: Support for Google Translate and Azure Translator
- **Language Auto-Detection**: Automatic language detection from browser settings

### QR Code System
- **Network IP Detection**: Automatic network IP detection using WebRTC
- **Public/Private URLs**: Support for both public and private session access
- **Mobile Optimization**: Responsive design for mobile devices

### Session Management
- **Real-Time Updates**: Live participant count and transcript updates
- **Session Persistence**: Automatic session recovery and state management
- **Guest Access**: Support for unauthenticated guest participation

## 🚀 Deployment

### Vercel Deployment
1. Push code to GitHub
2. Connect project in Vercel
3. Configure environment variables
4. Deploy

### Environment Variables Verification
After deployment, verify these environment variables are correctly set:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
- `OPENAI_API_KEY`

## 💡 Cost Optimization

### STT Costs
- **OpenAI Whisper**: $0.006/minute (host only, regardless of participants)
- **Deepgram**: $0.0043/minute (requires Growth plan for WebSocket streaming)

### Translation Costs
- **Google Translate**: $20/1M characters (~$1.2 for 1-hour lecture)
- **Azure Translator**: ~50% cheaper than Google Translate
- **Optimization**: Only translate when translation tab is active

## 🐛 Troubleshooting

### Common Issues
1. **STT Not Working**: Check OpenAI API key configuration
2. **QR Code Not Generating**: Verify network connectivity and IP detection
3. **Translation Failing**: Ensure Google Translate API key is set
4. **Session Not Saving**: Check Supabase connection and permissions

### Development Tips
- Use browser developer tools to monitor WebSocket connections
- Check Supabase logs for database errors
- Monitor API usage to optimize costs

## 📄 License

MIT License

## 🤝 Contributing

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📞 Support

For support and questions, please open an issue on GitHub or contact the development team.

---

**LiveTranscribe** - Making lectures accessible to everyone, everywhere. 🌍

this branch is change-demini