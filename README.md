# LiveTranscribe - Real-Time Lecture Transcription & Translation

LiveTranscribe는 실시간 강의 음성-텍스트 변환 및 번역 서비스입니다. 강의자는 블루투스 마이크를 통해 강연을 진행하고, 참석자들은 QR 코드를 스캔하여 실시간으로 자막과 번역을 볼 수 있습니다.

## 주요 기능

### 🎤 스피커 (강의자)
- **고품질 음성 인식**: OpenAI Whisper API를 사용한 서버 기반 STT (높은 정확도)
- **세션 관리**: 강의 제목, 설명, 언어 설정
- **QR 코드 자동 생성**: 참석자들이 쉽게 접속할 수 있는 실시간 QR 코드
- **세션 지속성**: 브라우저 종료 후 재접속 시 자동으로 기존 세션 복구
- **실시간 자막 표시**: 5초 단위로 음성을 서버에서 처리하여 텍스트로 변환
- **참석자 실시간 모니터링**: 현재 접속한 참석자 수 실시간 표시
- **평생 저장**: 스피커의 세션은 무제한으로 저장

### 👥 오디언스 (참석자)
- **QR 코드 접속**: 스마트폰으로 QR 코드 스캔하여 즉시 참여
- **인증 없이 접속 가능**: 온라인 세션용 공개 링크 지원
- **다국어 번역**: 50개 이상의 언어로 실시간 번역
- **개인화 설정**: 폰트 크기, 다크모드, 자동 스크롤 등
- **원거리 접속**: 온라인 컨퍼런스, 웨비나 등 원격 참여 지원
- **30일 무료 저장**: 참여한 세션을 30일간 무료로 저장 (로그인 시)

### 💰 구독 모델
- **무료 플랜**: 30일간 세션 저장, 기본 기능
- **프리미엄 플랜**: £5.99/월, 무제한 저장, AI 요약 등 고급 기능

## 기술 스택

- **Frontend**: Next.js 15, React 19, TypeScript
- **UI**: Tailwind CSS, Radix UI, react-qr-code
- **인증**: Supabase Auth (Google OAuth)
- **데이터베이스**: Supabase PostgreSQL
- **실시간 통신**: Supabase Realtime
- **음성 인식**: OpenAI Whisper API (서버 기반 STT)
- **QR 코드**: react-qr-code, qrcode
- **오디오 처리**: MediaRecorder API (WebRTC)

## 설치 및 설정

### 1. 프로젝트 클론
```bash
git clone <repository-url>
cd onvoice
pnpm install
pnpm dev
```

### 2. Supabase 설정
1. [Supabase](https://supabase.com)에서 새 프로젝트 생성
2. Authentication > Providers에서 Google OAuth 활성화
3. Google Cloud Console에서 OAuth 2.0 클라이언트 ID 생성
4. Supabase 프로젝트 설정에서 Google OAuth 설정

### 3. 환경 변수 설정
`.env.local` 파일을 생성하고 다음 내용을 추가:
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Google OAuth
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id

# OpenAI (Whisper API)
OPENAI_API_KEY=your_openai_api_key

# Next.js (선택사항)
NEXTAUTH_SECRET=your_nextauth_secret
NEXTAUTH_URL=http://localhost:3000
```

#### 환경 변수 획득 방법:

1. **Supabase Keys**: 
   - Supabase 대시보드 → Settings → API
   - URL과 anon/public key 복사
   - `SUPABASE_SERVICE_ROLE_KEY`는 service_role key 복사 (절대 노출 금지!)

2. **Google Client ID**: 
   - Google Cloud Console → APIs & Services → Credentials
   - Web application용 OAuth 2.0 Client ID 생성
   - 승인된 도메인에 본인 도메인 추가

3. **OpenAI API Key**:
   - OpenAI Platform → API Keys
   - 새 secret key 생성
   - 주의: Whisper API 사용을 위해서는 유료 OpenAI 계정 필요

### 4. 데이터베이스 스키마 설정
Supabase SQL Editor에서 `supabase-schema.sql` 파일의 내용을 실행하여 테이블과 정책을 생성합니다.

### 5. 개발 서버 실행
```bash
npm run dev
```

## 사용 방법

### 스피커로 세션 시작하기
1. 구글 계정으로 로그인
2. "Start as Host" 클릭
3. 세션 제목, 설명, 언어 설정
4. "Start Session" 클릭하여 음성 인식 시작
5. QR 코드를 화면에 표시하여 참석자들이 접속할 수 있도록 함

### 오디언스로 세션 참여하기
1. 스피커가 제공하는 QR 코드 스캔
2. 구글 계정으로 로그인
3. 원하는 언어 선택
4. 실시간 자막과 번역 확인

## 프로젝트 구조

```
onvoice/
├── app/                    # Next.js App Router
│   ├── auth/              # 인증 관련 페이지
│   ├── host/              # 스피커 대시보드
│   ├── session/           # 세션 참여 페이지
│   ├── my-sessions/       # 내 세션 관리
│   └── demo/              # 데모 페이지
├── components/            # React 컴포넌트
│   ├── auth/             # 인증 관련 컴포넌트
│   └── ui/               # UI 컴포넌트
├── lib/                  # 유틸리티 및 설정
│   ├── supabase.ts       # Supabase 클라이언트
│   ├── types.ts          # TypeScript 타입 정의
│   └── utils.ts          # 유틸리티 함수
└── supabase-schema.sql   # 데이터베이스 스키마
```

## 배포

### Vercel 배포
1. GitHub에 코드 푸시
2. Vercel에서 프로젝트 연결
3. 환경 변수 설정
4. 배포 완료

### 환경 변수 확인
배포 후 다음 환경 변수가 올바르게 설정되었는지 확인:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`

## 라이선스

MIT License

## 기여하기

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request
