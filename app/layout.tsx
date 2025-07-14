import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './globals.css'
import { ClerkProvider } from '@clerk/nextjs'

const AdvercaseFontRegular = localFont({
  src: [
    {
      path: '../public/fonts/AdvercaseFont-Demo-Regular.otf',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../public/fonts/AdvercaseFont-Demo-Bold.otf',
      weight: '700',
      style: 'normal',
    },
  ],
  variable: '--font-advercase-sans',
})

export const metadata: Metadata = {
  title: 'LiveTranscribe - Real-Time Lecture Transcription & Translation',
  description:
    'Make your lectures accessible to everyone with instant transcription and translation. No app installation required - just scan a QR code and start following along in real-time.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <ClerkProvider>
      <html lang='en'>
        <body className={`${AdvercaseFontRegular.variable} antialiased`}>{children}</body>
      </html>
    </ClerkProvider>
  )
}
