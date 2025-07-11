"use client"

import React, { createContext, useContext, useEffect, useState } from 'react'
import { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase'
import { logAuthDebugInfo, getSmartCallbackUrl } from '@/lib/auth-config'

interface AuthContextType {
  user: User | null
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signInWithGoogleToSummary: (summaryPath: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    // Get initial session
    const getSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        if (error) {
          console.error('Auth session error:', error)
          setUser(null)
        } else {
          setUser(session?.user ?? null)
        }
      } catch (error) {
        console.error('Auth error:', error)
        setUser(null)
      } finally {
        setLoading(false)
      }
    }

    getSession()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state change:', event, session?.user?.email)
        
        if (event === 'TOKEN_REFRESHED') {
          console.log('Token refreshed successfully')
        }
        
        if (event === 'SIGNED_OUT') {
          console.log('User signed out')
          setUser(null)
        } else {
          setUser(session?.user ?? null)
        }
        
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [supabase.auth])

  const signInWithGoogle = async () => {
    // Get current URL to redirect back after login
    const currentUrl = window.location.pathname + window.location.search
    
    // Use smart callback URL that works in both dev and production
    const redirectUrl = getSmartCallbackUrl(currentUrl)
    
    // Debug information
    logAuthDebugInfo()
    console.log('🔐 Google OAuth 시작')
    console.log('📍 현재 페이지:', currentUrl)
    console.log('🔗 콜백 URL:', redirectUrl)
    console.log('🌐 현재 Origin:', window.location.origin)
    console.log('💾 Summary 페이지인지 확인:', currentUrl.includes('/summary/'))
    
    // Summary 페이지에서 로그인하는 경우 특별 처리
    if (currentUrl.includes('/summary/')) {
      console.log('📋 Summary 페이지에서 로그인 시도')
    }
    
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent'
          }
        }
      })
      
      if (error) {
        console.error('OAuth error:', error)
        throw error
      }
      
      console.log('OAuth initiated successfully:', data)
    } catch (error) {
      console.error('Failed to initiate OAuth:', error)
      throw error
    }
  }

  const signInWithGoogleToSummary = async (summaryPath: string) => {
    // Use smart callback URL with specific summary path
    const redirectUrl = getSmartCallbackUrl(summaryPath)
    
    // Debug information
    logAuthDebugInfo()
    console.log('🔐 Google OAuth 시작 (Summary 전용)')
    console.log('📍 Summary 경로:', summaryPath)
    console.log('🔗 콜백 URL:', redirectUrl)
    console.log('🌐 현재 Origin:', window.location.origin)
    
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent'
          }
        }
      })
      
      if (error) {
        console.error('OAuth error:', error)
        throw error
      }
      
      console.log('OAuth initiated successfully:', data)
    } catch (error) {
      console.error('Failed to initiate OAuth:', error)
      throw error
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, signInWithGoogleToSummary, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
} 