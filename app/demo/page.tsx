'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { QrCode, Smartphone, Users, Globe } from 'lucide-react';
import Link from 'next/link';

export default function DemoPage() {
  const [selectedDemo, setSelectedDemo] = useState<string | null>(null);

  const demoSessions = [
    {
      id: 'DEMO01',
      title: 'AI & Machine Learning Basics',
      description: 'Introduction to artificial intelligence concepts',
      language: 'English → Spanish',
      duration: '15 min',
      attendees: 12,
    },
    {
      id: 'DEMO02',
      title: 'Climate Change Science',
      description: 'Understanding global warming and its effects',
      language: 'English → French',
      duration: '12 min',
      attendees: 8,
    },
    {
      id: 'DEMO03',
      title: 'Digital Marketing Trends',
      description: 'Latest strategies in online marketing',
      language: 'English → German',
      duration: '18 min',
      attendees: 15,
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center space-x-2">
              <QrCode className="h-8 w-8 text-blue-600" />
              <span className="text-2xl font-bold text-gray-900">OnVoice</span>
            </Link>
            <Badge variant="outline">Demo Sessions</Badge>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-12">
        <div className="mb-12 text-center">
          <h1 className="mb-4 text-4xl font-bold text-gray-900">
            Try Our Demo Sessions
          </h1>
          <p className="mx-auto max-w-2xl text-xl text-gray-600">
            Experience real-time transcription and translation with our
            pre-recorded demo lectures. See how attendees would interact with
            live content.
          </p>
        </div>

        <div className="mb-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {demoSessions.map((session) => (
            <Card
              key={session.id}
              className={`cursor-pointer transition-all hover:shadow-lg ${
                selectedDemo === session.id ? 'ring-2 ring-blue-500' : ''
              }`}
              onClick={() => setSelectedDemo(session.id)}
            >
              <CardHeader>
                <div className="mb-2 flex items-center justify-between">
                  <Badge variant="secondary">{session.id}</Badge>
                  <div className="flex items-center space-x-1 text-sm text-gray-500">
                    <Users className="h-4 w-4" />
                    <span>{session.attendees}</span>
                  </div>
                </div>
                <CardTitle className="text-lg">{session.title}</CardTitle>
                <CardDescription>{session.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Language:</span>
                    <div className="flex items-center space-x-1">
                      <Globe className="h-4 w-4 text-blue-600" />
                      <span className="font-medium">{session.language}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Duration:</span>
                    <span className="font-medium">{session.duration}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {selectedDemo && (
          <div className="mx-auto max-w-2xl">
            <Card className="border-2 border-blue-200 bg-blue-50">
              <CardHeader className="text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
                  <Smartphone className="h-8 w-8 text-blue-600" />
                </div>
                <CardTitle>Ready to Experience the Demo?</CardTitle>
                <CardDescription>
                  You&apos;ll join as an attendee and see real-time
                  transcription and translation in action
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg bg-white p-4">
                  <h4 className="mb-2 font-medium">
                    What you&apos;ll experience:
                  </h4>
                  <ul className="space-y-1 text-sm text-gray-600">
                    <li>• Real-time speech-to-text transcription</li>
                    <li>• Live translation to your selected language</li>
                    <li>• Customizable display settings</li>
                    <li>• Mobile-optimized interface</li>
                    <li>• App installation prompt at the end</li>
                  </ul>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button asChild className="flex-1" size="lg">
                    <Link href={`/session/${selectedDemo}`}>
                      <Smartphone className="mr-2 h-5 w-5" />
                      Join Demo Session
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setSelectedDemo(null)}
                    className="flex-1"
                    size="lg"
                  >
                    Choose Different Demo
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {!selectedDemo && (
          <div className="text-center">
            <p className="mb-6 text-gray-600">
              Select a demo session above to get started
            </p>
            <Button variant="outline" asChild>
              <Link href="/">Back to Home</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
