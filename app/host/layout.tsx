import { Badge } from '@/components/ui/badge';
// import { Skeleton } from "@/components/ui/skeleton";
import { ClerkLoaded, ClerkLoading } from '@clerk/nextjs';
import { Mic } from 'lucide-react';
import Link from 'next/link';
import CustomUserButton from '@/components/auth/customUserButton';

export default function HostLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center space-x-2">
              <Mic className="h-8 w-8 text-blue-600" />
              <span className="text-2xl font-bold text-gray-900">OnVoice</span>
            </Link>
            <div className="flex items-center gap-4">
              <Badge variant="outline">Host Dashboard</Badge>
              <ClerkLoading>
                <div className="h-7 w-7 animate-pulse rounded-full bg-gray-200" />
              </ClerkLoading>
              <ClerkLoaded>
                <div className="h-7 w-7">
                  <CustomUserButton />
                </div>
              </ClerkLoaded>
            </div>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
