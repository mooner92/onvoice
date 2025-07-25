'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Mic, Globe, QrCode, Zap, Download, Menu, X, MouseIcon } from 'lucide-react'
import { PricingTable, SignedIn, SignedOut, UserButton } from '@clerk/nextjs'
import Link from 'next/link'
import { useState } from 'react'
import { NavAuthButtons } from '@/components/navAuthButtons'
import { LandingCTA } from '@/components/landingCTA'

export default function HomePage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <main className='min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100'>
      {/* Header */}
      <header className='sticky top-0 z-50 border-b bg-white/80 backdrop-blur-sm'>
        <div className='container mx-auto px-4 py-4'>
          <div className='flex items-center justify-between'>
            <div className='flex items-center space-x-2'>
              <Mic className='h-8 w-8 text-blue-600' />
              <span className='text-2xl font-bold text-gray-900'>OnVoice</span>
            </div>

            {/* Desktop Navigation */}
            <nav className='hidden items-center space-x-6 md:flex'>
              <Link href='#features' className='text-nowrap text-gray-600 hover:text-blue-600'>
                Features
              </Link>
              <Link href='#how-it-works' className='text-nowrap text-gray-600 hover:text-blue-600'>
                How It Works
              </Link>
              <NavAuthButtons />
            </nav>

            {/* Mobile Menu Button */}
            <div className='md:hidden'>
              <Button variant='ghost' size='sm' onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
                {mobileMenuOpen ? <X className='h-6 w-6' /> : <Menu className='h-6 w-6' />}
              </Button>
            </div>
          </div>

          {/* Mobile Navigation */}
          {mobileMenuOpen && (
            <div className='mt-4 border-t pb-4 md:hidden'>
              <nav className='flex min-w-0 flex-col space-y-2 pt-4 text-base font-medium text-gray-700'>
                <Link
                  href='#features'
                  className='inline-block whitespace-nowrap text-gray-600 hover:text-blue-600'
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Features
                </Link>
                <Link
                  href='#how-it-works'
                  className='inline-block whitespace-nowrap text-gray-600 hover:text-blue-600'
                  onClick={() => setMobileMenuOpen(false)}
                >
                  How It Works
                </Link>
                <SignedIn>
                  <Link
                    href='/my-sessions'
                    className='py-2 font-medium text-gray-600 hover:text-blue-600'
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    📋 My Sessions
                  </Link>
                  <Link
                    href='/host'
                    className='py-2 font-medium text-gray-600 hover:text-blue-600'
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    🎤 Host Session
                  </Link>
                  <div className='flex items-center space-x-3 border-t p-2'></div>
                  <UserButton
                    showName
                    appearance={{
                      elements: {
                        userButtonBox: {
                          flexDirection: 'row-reverse',
                        },
                      },
                    }}
                  />
                </SignedIn>
                <SignedOut>
                  <NavAuthButtons />
                </SignedOut>
              </nav>
            </div>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <section className='flex h-[calc(100vh-65px)] flex-col items-center justify-center py-32'>
        <div className='container mx-auto flex flex-col items-center justify-center px-4 text-center'>
          <h1 className='mb-6 text-5xl font-bold text-gray-900'>
            From spoken words to shared knowledge
            <span className='mt-4 block text-blue-600'>Instantly, Intelligently, & Inclusively</span>
          </h1>
          <p className='mx-auto mb-4 max-w-6xl text-xl text-gray-600'>
            Real-time speech transcription, accurate context-aware summaries, & seamless session sharing
          </p>
          <p className='mx-auto mb-8 max-w-3xl text-xl text-gray-600'>
            Transform your talks into accessible, searchable content instantly
          </p>
          <div className='flex flex-col justify-center gap-4 sm:flex-row'>
            <LandingCTA />
            <Button size='lg' variant='outline' asChild>
              <Link href='/demo'>
                <QrCode className='mr-2 h-5 w-5' />
                Try Demo
              </Link>
            </Button>
          </div>
        </div>
        <Link href='#features' className='relative top-32 flex justify-center hover:cursor-pointer'>
          <MouseIcon className='size-6 animate-bounce text-blue-600' />
        </Link>
      </section>

      {/* Features Section */}
      <section id='features' className='bg-white py-20'>
        <div className='container mx-auto px-4'>
          <h2 className='mb-12 text-center text-4xl font-bold text-gray-900'>Features</h2>
          <div className='grid gap-8 md:grid-cols-2 lg:grid-cols-3'>
            <Card>
              <CardHeader>
                <QrCode className='mb-4 h-12 w-12 text-blue-600' />
                <CardTitle>QR Code Access</CardTitle>
                <CardDescription>Instant access via QR code scan - no app installation required</CardDescription>
              </CardHeader>
              <CardContent>
                <p className='text-gray-600'>
                  Attendees can simply scan the QR code displayed on screen to instantly join the session from anywhere,
                  on any device.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Zap className='mb-4 h-12 w-12 text-blue-600' />
                <CardTitle>Real-Time Transcription</CardTitle>
                <CardDescription>Instant & accurate speech-to-text</CardDescription>
              </CardHeader>
              <CardContent>
                <p className='text-gray-600'>
                  Browser-based speech recognition captures your voice in real-time, providing immediate transcription
                  with automatic session persistence & recovery.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Globe className='mb-4 h-12 w-12 text-blue-600' />
                <CardTitle>Translation</CardTitle>
                <CardDescription>Multi-language support with intelligent caching</CardDescription>
              </CardHeader>
              <CardContent>
                <p className='text-gray-600'>
                  Currently supports English, Chinese, Korean, & Hindi in beta. More languages coming soon!
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <Download className='mb-4 h-12 w-12 text-blue-600' />
                <CardTitle>Save, Share, & Archive</CardTitle>
                <CardDescription>Complete session lifecycle management</CardDescription>
              </CardHeader>
              <CardContent>
                <p className='text-gray-600'>
                  Automatically save transcripts, generate shareable links, & archive sessions. Hosts get unlimited
                  storage, audience members get 30-day free access to saved sessions.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className='mb-4 text-4xl'>🤖</div>
                <CardTitle>AI Summaries</CardTitle>
                <CardDescription>Our summary model creates accurate context-aware session summaries</CardDescription>
              </CardHeader>
              <CardContent>
                <p className='text-gray-600'>
                  Transform hours of speech into accurate context-aware summaries. AI analyzes content by category
                  (education, business, medical, etc.) & generates multilingual summaries automatically.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className='mb-4 text-4xl'>💬</div>
                <CardTitle>Interactive Chatbot</CardTitle>
                <CardDescription>Chat with your session transcripts using AI</CardDescription>
              </CardHeader>
              <CardContent>
                <p className='text-gray-600'>
                  Ask questions about session content, get explanations, & interact with transcripts using AI-powered
                  chat functionality for better understanding.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id='how-it-works' className='bg-gray-50 py-20'>
        <div className='mx-auto max-w-6xl px-6'>
          <h2 className='mb-12 text-center text-4xl font-bold text-gray-900'>How It Works</h2>

          {/* Two-column grid */}
          <div className='mx-10 grid gap-8 md:grid-cols-2'>
            {/* --------------------------- HOSTS ------------------------- */}
            <div className='mr-0'>
              <h3 className='mb-6 text-2xl font-bold text-gray-900'>For Hosts</h3>

              <div className='space-y-6'>
                {[
                  'Sign in & create session with a title & category',
                  'Allow microphone access & start recording',
                  'Display a QR code for the audience to scan & join',
                  'Speak normally. Just Speak.',
                  'End the session & receive an accurate context-aware summary',
                ].map((text, i) => (
                  <div key={i} className='flex items-start gap-x-3'>
                    <span className='flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white'>
                      {i + 1}
                    </span>
                    <p className='text-gray-600'>{text}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ------------------------- ATTENDEES ----------------------- */}
            <div className='ml-12 md:max-w-[34rem] lg:max-w-[38rem]'>
              <h3 className='mb-6 text-2xl font-bold text-gray-900'>For Attendees</h3>

              <div className='space-y-6'>
                {[
                  'Scan the QR code with your smartphone camera',
                  'Access the session instantly – no login required',
                  'Choose translation language & customise settings',
                  'Follow along with live transcription & AI translations',
                  'Save the session (with Google login) for free 30-day access',
                ].map((text, i) => (
                  <div key={i} className='flex items-start gap-x-3'>
                    <span className='flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-600 text-sm font-bold text-white'>
                      {i + 1}
                    </span>
                    <p className='text-gray-600'>{text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
      {/* CTA Section */}
      <section className='bg-blue-600 py-20'>
        <div className='container mx-auto px-4 text-center'>
          <h2 className='mb-6 text-3xl font-bold text-white'>Ready to Make Your Content Accessible?</h2>
          <p className='mx-auto mb-8 max-w-2xl text-xl text-blue-100'>
            Start your first session today & experience Web Speech API transcription, Gemini 2.0 translation, & smart
            AI-powered summaries.
          </p>
          <div className='mx-auto flex max-w-screen-md justify-center'>
            <PricingTable newSubscriptionRedirectUrl='/host' />
          </div>
          {/* <Button
            size="lg"
            variant="secondary"
            asChild
            className="text-lg px-8 py-3"
          >
            <Link href="/host">
              <Mic className="mr-2 h-5 w-5" />
              Start Your First Session
            </Link>
          </Button> */}
        </div>
      </section>
      {/* Footer */}
      <footer className='bg-gray-900 py-12 text-white'>
        <div className='container mx-auto px-4'>
          <div className='mb-8 flex items-center justify-center space-x-2'>
            <Mic className='h-8 w-8 text-blue-400' />
            <span className='text-2xl font-bold'>OnVoice</span>
          </div>

          {/* Social Links */}
          {/* <div className="flex items-center justify-center space-x-6 mb-6">
            <a 
              href="https://github.com/your-username/onvoice" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-white transition-colors"
            >
              <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.374 0 0 5.373 0 12 0 17.302 3.438 21.8 8.207 23.387c.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
              </svg>
            </a>
            <a
              href="https://instagram.com/onvoice_official"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-white transition-colors"
            >
              <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
              </svg>
            </a>
            <a
              href="https://linkedin.com/company/onvoice"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-white transition-colors"
            >
              <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
              </svg>
            </a>
          </div> */}

          <div className='text-center text-gray-400'>
            <p>&copy; 2025 OnVoice </p>
            <p className='mt-2 text-sm'>Powered by Web Speech API • Gemini 2.0 • Real-time Translation</p>
          </div>
        </div>
      </footer>
    </main>
  )
}
