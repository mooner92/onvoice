'use client'

import Link from 'next/link'
import { ArrowLeftIcon } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import SignInWithGoogle from '@/components/auth/SignInWithGoogle'

export default function OauthSignIn() {
  const searchParams = useSearchParams()
  const redirectUrlComplete = searchParams.get('redirect_url') || '/'

  // Render a button for each supported OAuth provider
  // you want to add to your app. This example uses only Google.
  return (
    <main className='flex h-screen w-full flex-col items-center justify-center gap-6 bg-gradient-to-br from-blue-50 to-indigo-100'>
      {/** Back button */}
      <Link href='/' className='absolute top-8 left-8 flex items-center gap-2'>
        <ArrowLeftIcon className='h-4 w-4' />
        <span className='text-sm font-medium'>Back to Home</span>
      </Link>
      <div className='flex flex-col items-center gap-2'>
        <h2 className='text-2xl font-bold'>Welcome to OnVoice</h2>
        <p className='text-muted-foreground text-sm'>Sign in to your account to continue</p>
      </div>
      <SignInWithGoogle size='lg' redirectUrlComplete={redirectUrlComplete} />
      <p className='text-muted-foreground text-xs'>
        By continuing, you agree to our{' '}
        <Link className='text-blue-500 hover:underline' href='/terms'>
          Terms of Service
        </Link>{' '}
        and{' '}
        <Link className='text-blue-500 hover:underline' href='/privacy'>
          Privacy Policy
        </Link>
      </p>
    </main>
  )
}
