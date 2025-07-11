# Supabase 인증 설정 가이드

## 로컬 개발 환경에서 OAuth 리디렉션 문제 해결

### 문제 상황
- 로컬 환경에서 Google 로그인 시 Vercel 배포 페이지로 리디렉션되는 문제
- 세션 저장 후 원하는 페이지로 돌아가지 않는 문제

### 해결 방법

1. **Supabase 대시보드 접속**
   - https://supabase.com/dashboard
   - 프로젝트 선택

2. **Authentication 설정**
   - 좌측 메뉴에서 `Authentication` → `Settings` 클릭
   - `Site URL` 확인 및 수정

3. **Site URL 설정**
   ```
   개발 환경: http://localhost:3000
   배포 환경: https://onvoice.vercel.app
   ```

4. **Redirect URLs 설정**
   - `Redirect URLs` 섹션에 다음 URL들 추가:
   ```
   http://localhost:3000/auth/callback
   https://onvoice.vercel.app/auth/callback
   ```

5. **OAuth Provider 설정 (Google)**
   - `Providers` 탭에서 Google 설정 확인
   - `Authorized redirect URIs`에 다음 추가:
   ```
   http://localhost:3000/auth/callback
   https://onvoice.vercel.app/auth/callback
   ```

### 환경 변수 설정 (옵션)

`.env.local` 파일에 다음 추가:
```env
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

배포 환경에서는:
```env
NEXT_PUBLIC_SITE_URL=https://onvoice.vercel.app
```

### 테스트 방법

1. 로컬 환경에서 세션 생성
2. 익명으로 세션 참여
3. 세션 종료 후 Summary 페이지에서 "세션 저장" 클릭
4. Google 로그인 후 원래 Summary 페이지로 돌아오는지 확인

### 추가 디버깅

브라우저 개발자 도구 콘솔에서 다음 로그 확인:
- `🔐 Signing in with Google`
- `📍 Current URL: ...`
- `🔗 Redirect URL: ...`
- `🔄 Post-login processing: ...` 