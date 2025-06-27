"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { QrCode, Smartphone, Users, Globe } from "lucide-react"
import Link from "next/link"

export default function DemoPage() {
  const [selectedDemo, setSelectedDemo] = useState<string | null>(null)

  const demoSessions = [
    {
      id: "DEMO01",
      title: "AI & Machine Learning Basics",
      description: "Introduction to artificial intelligence concepts",
      language: "English → Spanish",
      duration: "15 min",
      attendees: 12,
    },
    {
      id: "DEMO02",
      title: "Climate Change Science",
      description: "Understanding global warming and its effects",
      language: "English → French",
      duration: "12 min",
      attendees: 8,
    },
    {
      id: "DEMO03",
      title: "Digital Marketing Trends",
      description: "Latest strategies in online marketing",
      language: "English → German",
      duration: "18 min",
      attendees: 15,
    },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center space-x-2">
              <QrCode className="h-8 w-8 text-blue-600" />
              <span className="text-2xl font-bold text-gray-900">LiveTranscribe</span>
            </Link>
            <Badge variant="outline">Demo Sessions</Badge>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Try Our Demo Sessions</h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Experience real-time transcription and translation with our pre-recorded demo lectures. See how attendees
            would interact with live content.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {demoSessions.map((session) => (
            <Card
              key={session.id}
              className={`cursor-pointer transition-all hover:shadow-lg ${
                selectedDemo === session.id ? "ring-2 ring-blue-500" : ""
              }`}
              onClick={() => setSelectedDemo(session.id)}
            >
              <CardHeader>
                <div className="flex items-center justify-between mb-2">
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
          <div className="max-w-2xl mx-auto">
            <Card className="border-2 border-blue-200 bg-blue-50">
              <CardHeader className="text-center">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Smartphone className="h-8 w-8 text-blue-600" />
                </div>
                <CardTitle>Ready to Experience the Demo?</CardTitle>
                <CardDescription>
                  You&apos;ll join as an attendee and see real-time transcription and translation in action
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-white p-4 rounded-lg">
                  <h4 className="font-medium mb-2">What you&apos;ll experience:</h4>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>• Real-time speech-to-text transcription</li>
                    <li>• Live translation to your selected language</li>
                    <li>• Customizable display settings</li>
                    <li>• Mobile-optimized interface</li>
                    <li>• App installation prompt at the end</li>
                  </ul>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <Button asChild className="flex-1" size="lg">
                    <Link href={`/session/${selectedDemo}`}>
                      <Smartphone className="mr-2 h-5 w-5" />
                      Join Demo Session
                    </Link>
                  </Button>
                  <Button variant="outline" onClick={() => setSelectedDemo(null)} className="flex-1" size="lg">
                    Choose Different Demo
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {!selectedDemo && (
          <div className="text-center">
            <p className="text-gray-600 mb-6">Select a demo session above to get started</p>
            <Button variant="outline" asChild>
              <Link href="/">Back to Home</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
