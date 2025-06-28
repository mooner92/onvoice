# 개발 환경 테스트 가이드

## 🚀 빠른 시작

### 1. 환경 변수 설정 (선택사항)
`.env.local` 파일에 다음을 추가:
```env
# OpenAI API (STT용 - 없어도 테스트 가능)
OPENAI_API_KEY=your_openai_api_key

# Supabase (필수)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 2. 개발 서버 시작
```bash
npm run dev
```

서버가 시작되면:
- PC에서: http://localhost:3000
- 모바일에서: 자동으로 네트워크 IP 감지

## 🌐 배포 환경 URL 처리

### Vercel 배포 시:
- **Production URL**: `https://your-app.vercel.app`
- **QR 코드**: 자동으로 production URL 사용
- **모바일 접근**: 전 세계 어디서든 접근 가능
- **HTTPS**: 자동으로 SSL 인증서 적용

### 개발 vs 배포 URL 차이:
```
개발 환경:
- Host: http://localhost:3000/host
- QR 코드: http://192.168.x.x:3000/s/{sessionId}

배포 환경:
- Host: https://your-app.vercel.app/host  
- QR 코드: https://your-app.vercel.app/s/{sessionId}
```

## 📱 모바일 테스트 방법

### 1. 네트워크 확인
- PC와 휴대폰이 같은 WiFi에 연결되어 있는지 확인
- 방화벽이 3000 포트를 차단하지 않는지 확인

### 2. QR 코드 테스트
1. PC에서 http://localhost:3000 접속
2. 로그인 후 "Start as Host" 클릭
3. 세션 시작 후 QR 코드 확인
4. 휴대폰으로 QR 코드 스캔
5. 자동으로 네트워크 IP로 이동

### 3. STT 기능 테스트

#### OpenAI API 키가 있는 경우:
- 실제 음성이 텍스트로 변환됨
- 5초마다 chunk 단위로 처리

#### OpenAI API 키가 없는 경우:
- 플레이스홀더 텍스트가 표시됨
- 랜덤한 테스트 문장 생성
- 기본 기능 테스트에는 문제없음

## 🛠️ 문제 해결

### MediaRecorder 오류
```
NotSupportedError: Failed to execute 'start' on 'MediaRecorder'
```
**해결방법**: 
1. 브라우저가 자동으로 지원되는 MIME 타입을 찾아 사용
2. Safari의 경우 `audioBitsPerSecond` 옵션 없이 fallback
3. HTTPS 환경에서 테스트 (일부 브라우저는 HTTP에서 제한)

### STT API 오류
```
Error: STT API request failed
```
**해결방법**: 
1. OpenAI API 키 확인
2. 네트워크 연결 확인
3. API 키가 없어도 플레이스홀더로 테스트 가능

### 모바일 접속 불가
```
Connection refused
```
**해결방법**:
1. 같은 WiFi 네트워크 확인
2. 방화벽 설정 확인
3. QR 코드가 자동으로 네트워크 IP 감지

### QR 코드 네트워크 IP 문제
**자동 해결**: WebRTC를 사용하여 로컬 네트워크 IP 자동 감지
- localhost → 192.168.x.x 자동 변환
- 모바일에서 바로 접근 가능

## 📝 개발 모드 기능

### 자동 네트워크 감지
- localhost → 자동으로 네트워크 IP 사용
- 배포 환경에서는 실제 도메인 사용

### 디버그 로깅
- 브라우저 콘솔에서 상세 로그 확인
- MediaRecorder 상태
- STT API 응답
- 오디오 chunk 정보

### 오류 표시
- transcript 창에 오류 메시지 표시
- 실시간 디버깅 가능

## 🎯 테스트 시나리오

### 1. 기본 플로우
1. Host 세션 시작
2. QR 코드 생성 확인
3. 모바일로 QR 코드 스캔
4. Audience 페이지 접속 확인
5. 음성 입력 시 transcript 업데이트 확인

### 2. 다중 사용자
1. 여러 기기에서 같은 QR 코드 스캔
2. 참석자 수 실시간 업데이트 확인
3. 모든 기기에서 동일한 transcript 확인

### 3. 세션 지속성
1. Host가 브라우저 새로고침
2. 기존 세션 자동 복구 확인
3. 녹음 재개 기능 확인

## 🚀 배포 가이드

### Vercel 배포:
```bash
# 1. Vercel CLI 설치
npm i -g vercel

# 2. 배포
vercel

# 3. 환경 변수 설정
vercel env add OPENAI_API_KEY
vercel env add NEXT_PUBLIC_SUPABASE_URL  
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
```

### 배포 후 확인사항:
1. **HTTPS 동작**: 모든 API 호출이 HTTPS로 이루어지는지
2. **환경 변수**: Vercel 대시보드에서 환경 변수 확인
3. **QR 코드**: production URL로 정상 생성되는지
4. **모바일 접근**: 전 세계 어디서든 접근 가능한지

## 💡 팁

### 더 나은 테스트를 위해:
1. **HTTPS 사용**: ngrok 등을 사용하여 HTTPS 환경에서 테스트
2. **실제 API 키**: OpenAI API 키 설정으로 실제 STT 테스트
3. **다양한 브라우저**: Chrome, Safari, Firefox에서 테스트
4. **네트워크 환경**: 다양한 WiFi 환경에서 테스트

### 프로덕션 배포 시:
1. **도메인 설정**: 커스텀 도메인 연결
2. **Analytics**: Vercel Analytics 활성화
3. **모니터링**: 오류 추적 도구 연동
4. **성능**: 이미지 최적화 및 CDN 활용 