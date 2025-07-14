"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { X, BookOpen, Clock, Share2 } from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

interface SaveSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  sessionTitle: string;
  onSaved?: () => void;
}

export function SaveSessionModal({
  isOpen,
  onClose,
  sessionId,
  sessionTitle,
}: SaveSessionModalProps) {
  const { isSignedIn, user } = useUser();
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const handleGoogleLogin = async () => {
    try {
      setIsLoading(true);

      // Store session info in localStorage for after login (sessionStorage는 도메인 변경시 사라질 수 있음)
      const currentSummaryPath = `/summary/${sessionId}`;
      const sessionData = {
        sessionId,
        sessionTitle,
        timestamp: Date.now(),
        returnUrl: window.location.href, // 현재 전체 URL 저장
      };

      localStorage.setItem("pendingSessionSave", JSON.stringify(sessionData));
      sessionStorage.setItem("pendingSessionSave", JSON.stringify(sessionData)); // 백업용

      console.log("💾 Storing session save data:", sessionData);
      console.log("🔐 Initiating Google login for session save");
      console.log("📍 Current URL:", window.location.href);
      console.log("🎯 Target return path:", currentSummaryPath);

      // Redirect to Google login with specific return path
      router.push(
        `/auth/sign-in?redirect_url=${window.location.origin}${currentSummaryPath}`
      );

      // Modal will close after successful login via useEffect in parent
    } catch (error) {
      console.error("Login failed:", error);
      alert("Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-md">
        <CardHeader className="relative">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
          <CardTitle className="text-xl font-semibold text-gray-900">
            Save this session?
          </CardTitle>
          <CardDescription>
            Save this session with Google login and access it later.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Session Preview */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="font-medium text-gray-900 mb-2">{sessionTitle}</h4>
            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex items-center space-x-2">
                <BookOpen className="h-4 w-4" />
                <span>Session content and summary</span>
              </div>
              <div className="flex items-center space-x-2">
                <Clock className="h-4 w-4" />
                <span>14 days free storage</span>
              </div>
              <div className="flex items-center space-x-2">
                <Share2 className="h-4 w-4" />
                <span>Access anytime</span>
              </div>
            </div>
          </div>

          {/* Benefits */}
          <div className="space-y-3">
            <h5 className="font-medium text-gray-900">Benefits of saving:</h5>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start space-x-2">
                <span className="text-green-600 mt-0.5">•</span>
                <span>Access My Sessions anytime</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-green-600 mt-0.5">•</span>
                <span>AI summary and translation</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-green-600 mt-0.5">•</span>
                <span>Convenient access on mobile</span>
              </li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <Button
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              {isLoading ? (
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Logging in...</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <svg className="h-4 w-4" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="currentColor"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  <span>Save with Google login</span>
                </div>
              )}
            </Button>

            <Button onClick={onClose} variant="outline" className="w-full">
              Later
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
