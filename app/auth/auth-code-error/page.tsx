"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle, Home, RefreshCw } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"

export default function AuthCodeErrorPage() {
  const router = useRouter()

  useEffect(() => {
    console.log('🚨 Auth code error page loaded')
    console.log('🔗 Current URL:', window.location.href)
    console.log('🔍 URL params:', new URLSearchParams(window.location.search).toString())
  }, [])

  // URL 파라미터에서 에러 정보 추출
  const getErrorInfo = () => {
    if (typeof window === 'undefined') return null
    
    const params = new URLSearchParams(window.location.search)
    const error = params.get('error')
    const description = params.get('description')
    const supabaseError = params.get('supabase_error')
    const unexpectedError = params.get('unexpected_error')
    const noCode = params.get('no_code')
    
    if (error) {
      return {
        type: 'OAuth 에러',
        message: error,
        description: description || '알 수 없는 OAuth 에러가 발생했습니다.'
      }
    }
    
    if (supabaseError) {
      return {
        type: 'Supabase 인증 에러',
        message: supabaseError,
        description: '인증 서버에서 세션 생성에 실패했습니다.'
      }
    }
    
    if (unexpectedError) {
      return {
        type: '예상치 못한 에러',
        message: unexpectedError,
        description: '인증 과정에서 예상치 못한 오류가 발생했습니다.'
      }
    }
    
    if (noCode) {
      return {
        type: '인증 코드 누락',
        message: '인증 코드가 제공되지 않았습니다.',
        description: 'OAuth 인증 과정에서 코드가 전달되지 않았습니다.'
      }
    }
    
    return {
      type: '알 수 없는 에러',
      message: '인증 과정에서 문제가 발생했습니다.',
      description: '구체적인 에러 정보를 확인할 수 없습니다.'
    }
  }

  const errorInfo = getErrorInfo()

  const handleRetry = () => {
    // 이전 페이지로 돌아가거나 홈으로 이동
    if (document.referrer) {
      window.location.href = document.referrer
    } else {
      router.push('/')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-red-600" />
          </div>
          <CardTitle className="text-xl font-semibold text-gray-900">
            인증 오류
          </CardTitle>
          <CardDescription className="text-gray-600">
            로그인 과정에서 문제가 발생했습니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {errorInfo && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-2">
              <div className="font-medium text-red-800 text-sm">
                {errorInfo.type}
              </div>
              <div className="text-red-700 text-sm">
                {errorInfo.message}
              </div>
              <div className="text-red-600 text-xs">
                {errorInfo.description}
              </div>
            </div>
          )}
          
          <div className="text-sm text-gray-600 space-y-2">
            <p>다음과 같은 이유로 인증이 실패할 수 있습니다:</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>브라우저에서 쿠키가 차단됨</li>
              <li>네트워크 연결 문제</li>
              <li>인증 서버 일시적 오류</li>
              <li>잘못된 인증 코드</li>
              <li>Supabase 설정 문제</li>
            </ul>
          </div>
          
          <div className="flex flex-col gap-2">
            <Button onClick={handleRetry} className="w-full">
              <RefreshCw className="w-4 h-4 mr-2" />
              다시 시도
            </Button>
            <Button 
              variant="outline" 
              onClick={() => router.push('/')}
              className="w-full"
            >
              <Home className="w-4 h-4 mr-2" />
              홈으로 돌아가기
            </Button>
          </div>
          
          <div className="text-xs text-gray-500 text-center">
            문제가 계속되면 브라우저를 새로고침하거나 다른 브라우저를 사용해보세요.
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 