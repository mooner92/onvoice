import { createClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  // 배포 환경에서는 올바른 도메인 사용
  const isProduction = process.env.NODE_ENV === 'production' || origin.includes('vercel.app')
  const baseUrl = isProduction ? 'https://onvoice.vercel.app' : origin

  console.log('🔐 Auth callback received:', { 
    code: code ? 'present' : 'missing', 
    next, 
    origin,
    baseUrl,
    isProduction,
    fullUrl: request.url,
    headers: Object.fromEntries(request.headers.entries())
  })

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      console.log('✅ Auth exchange successful')
      
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
      console.error('❌ Auth exchange error:', error)
    }
  } else {
    console.log('❌ No auth code provided')
  }

  // Return the user to an error page with instructions
  console.log('❌ Auth failed, redirecting to error page')
  return NextResponse.redirect(`${baseUrl}/auth/auth-code-error`)
} 