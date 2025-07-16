import Link from 'next/link'
import { ArrowLeftIcon } from 'lucide-react'
import SignInWithGoogle from '@/components/auth/SignInWithGoogle'
import { Suspense } from 'react'
import SignInWithGoogleSkeleton from '@/components/auth/SignInWithGoogle.skeleton'

export default async function OauthSignIn({ searchParams }: { searchParams: Promise<{ redirect_url: string }> }) {
  const redirectUrlComplete = (await searchParams).redirect_url || '/'

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
      <Suspense fallback={<SignInWithGoogleSkeleton size='lg' />}>
        <SignInWithGoogle size='lg' redirectUrlComplete={redirectUrlComplete} />
      </Suspense>
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
