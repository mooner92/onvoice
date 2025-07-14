import { ClerkLoading, ClerkLoaded, SignedIn, SignedOut } from '@clerk/nextjs';
import { SignInButton, SignUpButton } from './auth/auth-buttons';
import CustomUserButton from './auth/customUserButton';

export function NavAuthButtons() {
  return (
    <>
      <ClerkLoading>
        <div className="flex items-center gap-2">
          <SignInButton variant="outline" size="sm" />
          <SignUpButton size="sm" />
        </div>
      </ClerkLoading>
      <ClerkLoaded>
        <SignedIn>
          <div className="h-7 w-7">
            <CustomUserButton />
          </div>
        </SignedIn>
        <SignedOut>
          <div className="flex items-center gap-2">
            <SignInButton variant="outline" size="sm" />
            <SignUpButton size="sm" />
          </div>
        </SignedOut>
      </ClerkLoaded>
    </>
  );
}
