'use client'

import { UserButton } from '@clerk/nextjs'
import { Mic, QrCode } from 'lucide-react'

export default function CustomUserButton({ showName = false }: { showName?: boolean }) {
  return (
    <UserButton showName={showName}>
      <UserButton.MenuItems>
        <UserButton.Link label='My Sessions' labelIcon={<QrCode size={16} />} href='/my-sessions' />
        <UserButton.Link label='Host Session' labelIcon={<Mic size={16} />} href='/host' />
      </UserButton.MenuItems>
    </UserButton>
  )
}
