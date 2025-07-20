import { NextRequest, NextResponse } from 'next/server'
import { translationQueue } from '@/lib/translation-queue'

export async function POST(req: NextRequest) {
  try {
    console.log('🧹 Clearing translation queue...')
    
    // 번역 큐 초기화
    translationQueue.clear()
    
    console.log('✅ Translation queue cleared successfully')
    
    return NextResponse.json({ 
      success: true, 
      message: 'Translation queue cleared successfully',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ Error clearing translation queue:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to clear translation queue' 
    }, { status: 500 })
  }
} 