import { createClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  // 배포 환경에서는 올바른 도메인 사용
  const isProduction = process.env.NODE_ENV === 'production' || origin.includes('vercel.app')
  
  // 로컬 환경에서 0.0.0.0으로 들어온 경우 localhost로 변환
  let baseUrl: string
  if (isProduction) {
    baseUrl = 'https://onvoice.vercel.app'
  } else {
    // 로컬 환경에서는 항상 localhost 사용
    baseUrl = origin.replace('0.0.0.0', 'localhost')
  }

  console.log('🔐 Auth callback received:', { 
    code: code ? 'present' : 'missing', 
    next, 
    origin,
    baseUrl,
    isProduction,
    fullUrl: request.url,
    error,
    errorDescription,
    allParams: Object.fromEntries(searchParams.entries()),
    headers: Object.fromEntries(request.headers.entries())
  })

  // OAuth 에러가 있는 경우 처리
  if (error) {
    console.error('❌ OAuth error received:', { error, errorDescription })
    const errorUrl = `${baseUrl}/auth/auth-code-error?error=${encodeURIComponent(error)}&description=${encodeURIComponent(errorDescription || '')}`
    return NextResponse.redirect(errorUrl)
  }

  if (code) {
    try {
      const supabase = await createClient()
      console.log('🔄 Attempting to exchange code for session...')
      
      const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
      
      if (!exchangeError && data.session) {
        console.log('✅ Auth exchange successful:', {
          userId: data.user?.id,
          email: data.user?.email,
          sessionExpiry: data.session.expires_at
        })
        
        // Summary 페이지인지 확인
        if (next.includes('/summary/')) {
          console.log('📋 Summary page redirect detected')
          // Summary 페이지로 리디렉션할 때 세션 저장 플래그 추가
          const redirectUrl = `${baseUrl}${next}?login_success=true`
          console.log('🎯 Redirecting to summary with login flag:', redirectUrl)
          return NextResponse.redirect(redirectUrl)
        }
        
        const redirectUrl = `${baseUrl}${next}`
        console.log('🎯 Redirecting to:', redirectUrl)
        return NextResponse.redirect(redirectUrl)
      } else {
        console.error('❌ Auth exchange error:', exchangeError)
        console.error('❌ Exchange response data:', data)
        
        // 더 자세한 에러 정보와 함께 에러 페이지로 리디렉션
        const errorUrl = `${baseUrl}/auth/auth-code-error?supabase_error=${encodeURIComponent(exchangeError?.message || 'Unknown error')}`
        return NextResponse.redirect(errorUrl)
      }
    } catch (error) {
      console.error('❌ Unexpected error during auth exchange:', error)
      const errorUrl = `${baseUrl}/auth/auth-code-error?unexpected_error=${encodeURIComponent(error instanceof Error ? error.message : 'Unknown error')}`
      return NextResponse.redirect(errorUrl)
    }
  } else {
    console.log('❌ No auth code provided')
    const errorUrl = `${baseUrl}/auth/auth-code-error?no_code=true`
    return NextResponse.redirect(errorUrl)
  }
} 