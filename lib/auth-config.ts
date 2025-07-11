// 인증 관련 설정 유틸리티

/**
 * 현재 환경에 맞는 Site URL을 반환합니다.
 * 로컬 개발 환경과 배포 환경을 자동으로 감지합니다.
 */
export function getSiteUrl(): string {
  // 환경 변수에서 명시적으로 설정된 URL이 있으면 사용
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL
  }

  // 브라우저 환경에서는 현재 origin 사용
  if (typeof window !== 'undefined') {
    return window.location.origin
  }

  // 서버 환경에서는 환경에 따라 결정
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }

  // 기본값 (로컬 개발 환경)
  return 'http://localhost:3000'
}

/**
 * 인증 콜백 URL을 생성합니다.
 */
export function getAuthCallbackUrl(returnPath?: string): string {
  const siteUrl = getSiteUrl()
  const callbackUrl = `${siteUrl}/auth/callback`
  
  if (returnPath) {
    return `${callbackUrl}?next=${encodeURIComponent(returnPath)}`
  }
  
  return callbackUrl
}

/**
 * 현재 환경이 개발 환경인지 확인합니다.
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development'
}

/**
 * 현재 환경이 프로덕션 환경인지 확인합니다.
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}

/**
 * 디버깅 정보를 출력합니다.
 */
export function logAuthDebugInfo(): void {
  if (typeof window !== 'undefined') {
    console.log('🔍 Auth Debug Info:', {
      siteUrl: getSiteUrl(),
      currentOrigin: window.location.origin,
      currentPath: window.location.pathname,
      environment: process.env.NODE_ENV,
      isVercel: !!process.env.VERCEL_URL,
      vercelUrl: process.env.VERCEL_URL,
      customSiteUrl: process.env.NEXT_PUBLIC_SITE_URL,
      isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
      userAgent: navigator.userAgent
    })
  }
}

/**
 * 모바일 접근을 위한 네트워크 IP 감지
 */
export function getNetworkAccessibleUrl(): string {
  if (typeof window !== 'undefined') {
    const origin = window.location.origin
    
    // 이미 IP 주소나 도메인이면 그대로 반환
    if (!origin.includes('localhost')) {
      return origin
    }
    
    // localhost를 현재 네트워크 IP로 교체
    // 개발 서버에서 --hostname 0.0.0.0으로 실행되어야 함
    const port = window.location.port || '3000'
    return `http://172.31.249.137:${port}`
  }
  
  return getSiteUrl()
}

/**
 * 환경별 적절한 콜백 URL 생성
 * 개발 환경에서는 현재 접속 URL 기반으로, 배포 환경에서는 배포 URL 사용
 */
export function getSmartCallbackUrl(returnPath?: string): string {
  if (typeof window !== 'undefined') {
    const currentOrigin = window.location.origin
    const isDev = currentOrigin.includes('localhost') || currentOrigin.includes('172.31.249.137')
    const isProduction = currentOrigin.includes('vercel.app') || process.env.NODE_ENV === 'production'
    
    let baseUrl: string
    if (isProduction) {
      // 배포 환경: 항상 vercel URL 사용
      baseUrl = 'https://onvoice.vercel.app'
    } else if (isDev) {
      // 개발 환경: 현재 접속 URL 사용
      baseUrl = currentOrigin
    } else {
      // 기타 환경: 현재 URL 사용
      baseUrl = currentOrigin
    }
    
    const callbackUrl = `${baseUrl}/auth/callback`
    return returnPath ? `${callbackUrl}?next=${encodeURIComponent(returnPath)}` : callbackUrl
  }
  
  // 서버 환경에서는 기본 콜백 URL 사용
  return getAuthCallbackUrl(returnPath)
} 