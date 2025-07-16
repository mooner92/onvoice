import { AuthenticateWithRedirectCallback } from '@clerk/nextjs'
import { Loader2 } from 'lucide-react'

export default function SSOCallbackPage() {
  return (
    <main className='flex h-screen w-full flex-col items-center justify-center gap-6 bg-gradient-to-br from-blue-50 to-indigo-100'>
      <div className='flex flex-col items-center gap-4'>
        <Loader2 className='size-10 animate-spin' />
        <div className='flex flex-col items-center gap-2'>
          <h2 className='text-2xl font-bold'>Verifying your account...</h2>
          <p className='text-muted-foreground text-sm'>Please wait while we verify your account...</p>
          <div id='clerk-captcha'></div>
        </div>
      </div>
      <AuthenticateWithRedirectCallback />
    </main>
  )
}
