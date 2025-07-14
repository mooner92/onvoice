import { Button } from '@/components/ui/button';
import {
  ClerkLoaded,
  ClerkLoading,
  SignOutButton as ClerkSignOutButton,
} from '@clerk/nextjs';
import Link from 'next/link';

const urls = {
  signIn: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL || '/auth/sign-in',
  signUp: process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL || '/auth/sign-up',
};

export function SignInButton({
  className = '',
  size = 'default',
  label = 'Sign In',
  variant = 'default',
}: {
  className?: string;
  size?: 'default' | 'sm' | 'lg';
  label?: string;
  variant?: 'default' | 'outline' | 'ghost' | 'link';
}) {
  return (
    <Button size={size} className={className} variant={variant} asChild>
      <Link href={urls.signIn}>{label}</Link>
    </Button>
  );
}

export function SignUpButton({
  className = '',
  size = 'default',
  variant = 'default',
  label = 'Get Started',
}: {
  className?: string;
  size?: 'default' | 'sm' | 'lg';
  variant?: 'default' | 'outline' | 'ghost' | 'link';
  label?: string;
}) {
  return (
    <Button size={size} className={className} variant={variant} asChild>
      <Link href={urls.signUp}>{label}</Link>
    </Button>
  );
}

export function SignOutButton({
  className = '',
  size = 'default',
  variant = 'default',
  label = 'Sign Out',
}: {
  className?: string;
  size?: 'default' | 'sm' | 'lg';
  variant?: 'default' | 'outline' | 'ghost' | 'link';
  label?: string;
}) {
  return (
    <>
      <ClerkLoading>
        <Button disabled size={size} className={className} variant={variant}>
          {label}
        </Button>
      </ClerkLoading>
      <ClerkLoaded>
        <ClerkSignOutButton>
          <Button size={size} className={className} variant={variant}>
            {label}
          </Button>
        </ClerkSignOutButton>
      </ClerkLoaded>
    </>
  );
}
