import { Button } from "@/components/ui/button";
import { ClerkLoaded, ClerkLoading, SignInButton } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";

export function LoginButton({ className = "" }: { className?: string }) {
  return (
    <>
      <ClerkLoading>
        <Button disabled className={`w-full ${className}`}>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        </Button>
      </ClerkLoading>
      <ClerkLoaded>
        <SignInButton>
          <Button className={`w-full ${className}`}>Sign In</Button>
        </SignInButton>
      </ClerkLoaded>
    </>
  );
}
