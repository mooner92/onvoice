'use client'

import { Button } from '@/components/ui/button'
import { ClerkAPIError, OAuthStrategy } from '@clerk/types'
import { useSignIn, useUser } from '@clerk/nextjs'
import { useState } from 'react'
import { redirect } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export default function SignInWithGoogle({
  size = 'default',
  redirectUrlComplete,
}: {
  size?: 'default' | 'sm' | 'lg'
  redirectUrlComplete: string
}) {
  const [errors, setErrors] = useState<ClerkAPIError[]>()
  const [isPending, setIsPending] = useState(false)

  const { isLoaded: isLoadedSignIn, signIn } = useSignIn()
  const { isLoaded: isLoadedUser, user } = useUser()

  if (!isLoadedSignIn || !isLoadedUser)
    return (
      <Button size={size} className='font-roboto font-medium' disabled>
        <Loader2 className='fh-4 w-4 animate-spin' />
        Loading...
      </Button>
    )

  if (user) {
    redirect(redirectUrlComplete)
  }

  if (!signIn)
    return (
      <Button size={size} variant={'outline'} className='font-roboto font-medium' disabled>
        Error loading sign in
      </Button>
    )

  const signInWith = async (strategy: OAuthStrategy) => {
    setErrors(undefined)
    setIsPending(true)
    return (
      signIn
        .authenticateWithRedirect({
          strategy,
          redirectUrl: '/auth/sso-callback',
          redirectUrlComplete,
        })
        .then((res) => {
          console.log(res)
        })
        .catch((err: unknown) => {
          setIsPending(false)
          setErrors((err as { errors: ClerkAPIError[] }).errors)
        })
    )
  }

  return (
    <div className='flex flex-col items-center gap-2'>
      <Button
        size={size}
        className='font-roboto flex cursor-pointer items-center gap-2 font-medium [&_svg]:h-5 [&_svg]:w-5'
        onClick={() => signInWith('oauth_google')}
        disabled={isPending}
      >
        <svg className='h-5 w-5' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'>
          <path
            fill='#4285F4'
            d='M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z'
          ></path>
          <path
            fill='#34A853'
            d='M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z'
          ></path>
          <path
            fill='#FBBC05'
            d='M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z'
          ></path>
          <path
            fill='#EA4335'
            d='M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z'
          ></path>
        </svg>
        Continue with Google
      </Button>
      <div id='clerk-captcha'></div>
      {errors && (
        <ul className='text-sm text-red-500'>
          {errors.map((el, index) => (
            <li key={index}>{el.longMessage}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
