import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'

export default function SignInWithGoogleSkeleton({ size = 'default' }: { size?: 'default' | 'sm' | 'lg' }) {
  return (
    <Button size={size} className='font-roboto font-medium' disabled>
      <Loader2 className='fh-4 w-4 animate-spin' />
      Loading...
    </Button>
  )
}
