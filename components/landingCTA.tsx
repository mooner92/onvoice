import { ClerkLoading, ClerkLoaded, SignedIn, SignedOut } from "@clerk/nextjs";
import { Button } from "./ui/button";
import { Mic } from "lucide-react";
import { SignUpButton } from "./auth/authButtons";
import Link from "next/link";

export function LandingCTA() {
  return (
    <>
      <ClerkLoading>
        <SignUpButton size="lg" label="Start for Free" />
      </ClerkLoading>
      <ClerkLoaded>
        <SignedIn>
          <Button size="lg" asChild>
            <Link href="/host">
              <Mic className="mr-2 h-5 w-5" />
              Start as Host
            </Link>
          </Button>
        </SignedIn>
        <SignedOut>
          <SignUpButton size="lg" label="Start for Free" />
        </SignedOut>
      </ClerkLoaded>
    </>
  );
}
