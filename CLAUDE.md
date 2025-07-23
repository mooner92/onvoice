# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
- `pnpm dev` - Start development server with turbo on 0.0.0.0
- `pnpm dev:mobile` - Start development server optimized for mobile testing
- `pnpm build` - Build the application for production
- `pnpm start` - Start production server
- `pnpm lint` - Run ESLint
- `pnpm typecheck` - Run TypeScript type checking
- `pnpm format` - Format code with Prettier

### Translation Queue Management
- `pnpm translation-queue` - Start the translation queue worker
- `pnpm process-translations` - Process pending translations manually

## Architecture Overview

This is a real-time lecture transcription and translation platform built with Next.js 15 and React 19.

### Core Components

**Speech Recognition System**:
- Web Speech API (browser-based STT) via `components/RealtimeSTT.tsx`
- Automatic restarts every 4.5 minutes to prevent API timeout
- Fallback support for multiple STT providers (OpenAI, Deepgram, Google)
- Real-time sentence detection and processing with duplicate prevention

**Translation Pipeline**:
- High-performance queue system in `lib/translation-queue.ts`
- Intelligent caching with `lib/translation-cache.ts`
- Multi-provider support (Google Translate, Gemini AI)
- Automatic language detection and batch processing

**Session Management**:
- Real-time collaboration via Supabase Realtime
- QR code generation for seamless participant joining
- Session persistence and auto-recovery
- Role-based access (speaker/audience)

### API Routes Structure

**Session Management**:
- `/api/session/create` - Create new sessions
- `/api/session/[id]/end` - End sessions
- `/api/session/[id]/save` - Save user sessions
- `/api/session/[id]/summary` - Generate AI summaries

**STT & Translation**:
- `/api/stt-stream` - Real-time STT streaming with Gemini review
- `/api/stt` - Basic STT endpoint
- `/api/translate` - Translation with caching
- `/api/complete-sentence` - Sentence completion detection
- `/api/process-pending-translations` - Batch translation processing

**Content Enhancement**:
- `/api/stt-review` - Gemini-powered STT text review
- `/api/gemini-sentence-detection` - Advanced sentence boundary detection

### Database Schema

Uses Supabase PostgreSQL with these core tables:
- `sessions` - Session metadata with status tracking
- `transcripts` - Real-time transcript storage with review status
- `translation_cache` - Intelligent translation caching system
- `user_sessions` - User participation tracking
- `session_participants` - Real-time participant management

Execute SQL files in `/sqls/` directory in order for proper schema setup.

### Key Type Definitions

Located in `lib/types.ts`:
- `Session` - Core session interface with categorization
- `Transcript` - Transcript with review and translation state
- `TranslationJob` - Queue-based translation processing
- `TranscriptLine` - Real-time transcript rendering

### Performance Optimizations

**STT Performance**:
- Browser-based Web Speech API (zero server cost)
- Sentence-level processing with duplicate prevention
- Automatic quality review via Gemini AI

**Translation Efficiency**:
- Smart caching reduces API calls by 50-70%
- Queue-based batch processing
- On-demand translation only when needed

**Real-time Updates**:
- Supabase Realtime for instant synchronization
- Optimistic UI updates
- Connection recovery and state persistence

### Environment Variables Required

Essential for development:
```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
```

Optional but recommended:
```env
OPENAI_API_KEY=
GOOGLE_TRANSLATE_API_KEY=
NEXT_PUBLIC_GOOGLE_CLIENT_ID=
```

### Mobile Development Notes

- Network IP auto-detection for QR codes in development
- HTTPS required for Web Speech API in production
- Responsive design optimized for mobile participation
- Cross-browser compatibility (Chrome, Safari, Firefox)

### Testing Strategy

- Use browser dev tools to monitor WebSocket connections
- Check Supabase logs for real-time synchronization issues
- Test QR code generation on same WiFi network for development
- Verify translation queue processing with background scripts