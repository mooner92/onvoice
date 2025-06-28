"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Mic, Globe, QrCode, Zap, Download, LogOut, Menu, X } from "lucide-react"
import Link from "next/link"
import { useAuth } from "@/components/auth/AuthProvider"
import { LoginButton } from "@/components/auth/LoginButton"
import Image from "next/image"
import { useState } from "react"

export default function HomePage() {
  const { user, signOut } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Mic className="h-8 w-8 text-blue-600" />
              <span className="text-2xl font-bold text-gray-900">LiveTranscribe</span>
            </div>
            
            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center space-x-6">
              <Link href="#features" className="text-gray-600 hover:text-blue-600">
                Features
              </Link>
              <Link href="#how-it-works" className="text-gray-600 hover:text-blue-600">
                How It Works
              </Link>
              {user ? (
                <>
                  <Link href="/my-sessions" className="text-gray-600 hover:text-blue-600">
                    My Sessions
                  </Link>
                  <Link href="/host" className="text-gray-600 hover:text-blue-600">
                    Host Session
                  </Link>
                  <div className="flex items-center space-x-2">
                    <div className="flex items-center space-x-2">
                      {user.user_metadata?.avatar_url && (
                        <Image 
                          src={user.user_metadata.avatar_url} 
                          alt="Profile" 
                          className="w-8 h-8 rounded-full"
                          width={32}
                          height={32}
                        />
                      )}
                      <span className="text-sm text-gray-700">{user.user_metadata?.full_name || user.email}</span>
                    </div>
                    <Button variant="outline" size="sm" onClick={signOut}>
                      <LogOut className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              ) : (
                <LoginButton />
              )}
            </nav>

            {/* Mobile Menu Button */}
            <div className="md:hidden">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </Button>
            </div>
          </div>

          {/* Mobile Navigation */}
          {mobileMenuOpen && (
            <div className="md:hidden mt-4 pb-4 border-t">
              <nav className="flex flex-col space-y-4 pt-4">
                <Link 
                  href="#features" 
                  className="text-gray-600 hover:text-blue-600 py-2"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Features
                </Link>
                <Link 
                  href="#how-it-works" 
                  className="text-gray-600 hover:text-blue-600 py-2"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  How It Works
                </Link>
                {user ? (
                  <>
                    <Link 
                      href="/my-sessions" 
                      className="text-gray-600 hover:text-blue-600 py-2 font-medium"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      📋 My Sessions
                    </Link>
                    <Link 
                      href="/host" 
                      className="text-gray-600 hover:text-blue-600 py-2 font-medium"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      🎤 Host Session
                    </Link>
                    <div className="flex items-center space-x-3 py-2 border-t pt-4">
                      {user.user_metadata?.avatar_url && (
                        <Image 
                          src={user.user_metadata.avatar_url} 
                          alt="Profile" 
                          className="w-8 h-8 rounded-full"
                          width={32}
                          height={32}
                        />
                      )}
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900">
                          {user.user_metadata?.full_name || user.email}
                        </div>
                        <div className="text-xs text-gray-500">Signed in</div>
                      </div>
                      <Button variant="outline" size="sm" onClick={signOut}>
                        <LogOut className="h-4 w-4" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="py-2 border-t pt-4">
                    <LoginButton />
                  </div>
                )}
              </nav>
            </div>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-5xl font-bold text-gray-900 mb-6">
            Real-Time Lecture Transcription
            <span className="block text-blue-600">& Translation Service</span>
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
            Make your lectures accessible to everyone with instant transcription and translation. No app installation
            required - just scan a QR code and start following along in real-time.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {user ? (
              <>
                <Button size="lg" asChild className="text-lg px-8 py-3">
                  <Link href="/host">
                    <Mic className="mr-2 h-5 w-5" />
                    Start as Host
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild className="text-lg px-8 py-3 bg-transparent">
                  <Link href="/demo">
                    <QrCode className="mr-2 h-5 w-5" />
                    Try Demo
                  </Link>
                </Button>
              </>
            ) : (
              <div className="flex flex-col items-center space-y-4">
                <p className="text-lg text-gray-600">Please sign in to start using LiveTranscribe</p>
                <LoginButton />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">Key Features</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <Card>
              <CardHeader>
                <QrCode className="h-12 w-12 text-blue-600 mb-4" />
                <CardTitle>QR Code Access</CardTitle>
                <CardDescription>Instant access via QR code scan - no app installation required</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">
                  Attendees simply scan the QR code displayed on screen to join the session instantly from any device.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Zap className="h-12 w-12 text-blue-600 mb-4" />
                <CardTitle>Real-Time Processing</CardTitle>
                <CardDescription>Live transcription and translation as you speak</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">
                  Advanced AI-powered speech recognition provides instant, accurate transcriptions with minimal delay.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Globe className="h-12 w-12 text-blue-600 mb-4" />
                <CardTitle>Multi-Language Support</CardTitle>
                <CardDescription>Translate to multiple languages simultaneously</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">
                  Support for 50+ languages with high-quality translation, making content accessible globally.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Download className="h-12 w-12 text-blue-600 mb-4" />
                <CardTitle>Save & Access Later</CardTitle>
                <CardDescription>30 days free storage, then £5.99/month for unlimited access</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">
                  All your session transcripts are automatically saved and accessible across all devices.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">How It Works</h2>
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h3 className="text-2xl font-bold text-gray-900 mb-6">For Hosts</h3>
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <div className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">
                    1
                  </div>
                  <p className="text-gray-600">Access web dashboard from any device</p>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">
                    2
                  </div>
                  <p className="text-gray-600">Connect microphone and start session</p>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">
                    3
                  </div>
                  <p className="text-gray-600">Display QR code on presentation screen</p>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">
                    4
                  </div>
                  <p className="text-gray-600">Speak normally - everything is transcribed live</p>
                </div>
              </div>
            </div>
            <div>
              <h3 className="text-2xl font-bold text-gray-900 mb-6">For Attendees</h3>
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <div className="bg-green-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">
                    1
                  </div>
                  <p className="text-gray-600">Scan QR code with smartphone camera</p>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="bg-green-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">
                    2
                  </div>
                  <p className="text-gray-600">Quick sign-in via web browser</p>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="bg-green-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">
                    3
                  </div>
                  <p className="text-gray-600">Select preferred language and settings</p>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="bg-green-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">
                    4
                  </div>
                  <p className="text-gray-600">Follow along with live captions</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-blue-600">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-white mb-6">Ready to Make Your Content Accessible?</h2>
          <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
            Start your first session today and experience the power of real-time transcription and translation.
          </p>
          <Button size="lg" variant="secondary" asChild className="text-lg px-8 py-3">
            <Link href="/host">
              <Mic className="mr-2 h-5 w-5" />
              Start Your First Session
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-center space-x-2 mb-8">
            <Mic className="h-8 w-8 text-blue-400" />
            <span className="text-2xl font-bold">LiveTranscribe</span>
          </div>
          <div className="text-center text-gray-400">
            <p>&copy; 2024 LiveTranscribe. Making lectures accessible to everyone.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
