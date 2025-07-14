'use client'

import { useEffect, useState } from 'react'
import QRCode from 'react-qr-code'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Copy, Download, Check, RefreshCw } from 'lucide-react'

interface QRCodeDisplayProps {
  value: string
  title?: string
  size?: number
  className?: string
}

export function QRCodeDisplay({ value, title = 'Scan to Join', size = 200, className = '' }: QRCodeDisplayProps) {
  const [copied, setCopied] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [displayValue, setDisplayValue] = useState(value)
  const [networkIP, setNetworkIP] = useState<string | null>(null)

  // Get network IP for mobile access
  useEffect(() => {
    const getNetworkIP = async () => {
      if (process.env.NODE_ENV === 'development' && value.includes('localhost')) {
        try {
          // Try to get local network IP using WebRTC
          const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
          })

          pc.createDataChannel('')
          await pc.createOffer().then((offer) => pc.setLocalDescription(offer))

          return new Promise<string>((resolve) => {
            pc.onicecandidate = (event) => {
              if (event.candidate) {
                const candidate = event.candidate.candidate
                const ipMatch = candidate.match(/(\d+\.\d+\.\d+\.\d+)/)
                if (ipMatch && !ipMatch[1].startsWith('127.')) {
                  pc.close()
                  resolve(ipMatch[1])
                }
              }
            }

            // Fallback after 2 seconds
            setTimeout(() => {
              pc.close()
              resolve('0.0.0.0') // Will use hostname from server
            }, 2000)
          })
        } catch (error) {
          console.warn('Failed to get network IP:', error)
          return '0.0.0.0'
        }
      }
      return null
    }

    getNetworkIP().then((ip) => {
      if (ip) {
        setNetworkIP(ip)
        // Replace localhost with network IP for mobile access
        const networkUrl = value.replace('localhost', ip)
        setDisplayValue(networkUrl)
      } else {
        setDisplayValue(value)
      }
      setIsLoading(false)
    })
  }, [value])

  useEffect(() => {
    if (!networkIP) {
      const timer = setTimeout(() => setIsLoading(false), 500)
      return () => clearTimeout(timer)
    }
  }, [networkIP])

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(displayValue)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  const downloadQR = () => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const svg = document.querySelector('#qr-code-svg') as SVGElement

    if (!ctx || !svg) return

    const svgData = new XMLSerializer().serializeToString(svg)
    const img = new Image()

    img.onload = () => {
      canvas.width = size
      canvas.height = size
      ctx.fillStyle = 'white'
      ctx.fillRect(0, 0, size, size)
      ctx.drawImage(img, 0, 0, size, size)

      const link = document.createElement('a')
      link.download = `qr-code-${Date.now()}.png`
      link.href = canvas.toDataURL()
      link.click()
    }

    img.src = `data:image/svg+xml;base64,${btoa(svgData)}`
  }

  if (isLoading) {
    return (
      <Card className={`w-fit ${className}`}>
        <CardContent className='p-6'>
          <div className='flex flex-col items-center space-y-4'>
            <div
              className='flex animate-pulse items-center justify-center rounded-lg bg-gray-100'
              style={{ width: size, height: size }}
            >
              <RefreshCw className='h-8 w-8 animate-spin text-gray-400' />
            </div>
            <p className='text-sm text-gray-500'>Generating QR Code...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={`w-fit ${className}`}>
      <CardContent className='p-6'>
        <div className='flex flex-col items-center space-y-4'>
          <div className='rounded-lg border-2 border-gray-200 bg-white p-4'>
            <QRCode id='qr-code-svg' value={displayValue} size={size} bgColor='#ffffff' fgColor='#000000' level='M' />
          </div>

          <div className='text-center'>
            <p className='font-medium text-gray-900'>{title}</p>
            <p className='mt-1 max-w-xs text-xs break-all text-gray-500'>
              {displayValue.length > 50 ? `${displayValue.substring(0, 50)}...` : displayValue}
            </p>
            {networkIP && <p className='mt-1 text-xs text-green-600'>📱 Mobile-friendly: {networkIP}</p>}
          </div>

          <div className='flex space-x-2'>
            <Button size='sm' variant='outline' onClick={copyToClipboard} className='flex items-center space-x-1'>
              {copied ? (
                <>
                  <Check className='h-4 w-4' />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className='h-4 w-4' />
                  <span>Copy URL</span>
                </>
              )}
            </Button>

            <Button size='sm' variant='outline' onClick={downloadQR} className='flex items-center space-x-1'>
              <Download className='h-4 w-4' />
              <span>Download</span>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
