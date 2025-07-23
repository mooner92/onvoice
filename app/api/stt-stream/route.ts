import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { detectLanguage } from '@/lib/translation-cache'
import { saveTranslationToCache } from '@/lib/translation-cache'

// Gemini 검수 + 번역 함수 (직접 호출)
async function reviewAndTranslateWithGemini(
  originalText: string,
  detectedLanguage: string
): Promise<{
  reviewedText: string
  translations: Record<string, string>
  quality: number
}> {
  const geminiApiKey = process.env.GEMINI_API_KEY
  if (!geminiApiKey) {
    throw new Error('Gemini API key not found')
  }

  // 입력 언어를 제외한 나머지 3개 언어
  const allLanguages = ['ko', 'zh', 'hi', 'en']
  const targetLanguages = allLanguages.filter(lang => lang !== detectedLanguage)

  // 언어별 이름 매핑
  const languageNames: Record<string, string> = {
    ko: 'Korean',
    zh: 'Chinese',
    hi: 'Hindi',
    en: 'English'
  }

  // 검수 및 번역 프롬프트 구성
  let prompt = ''
  
  if (detectedLanguage === 'en') {
    prompt = `Here is the raw text from STT. Make MINIMAL corrections - only fix obvious grammar errors, remove filler words (ah, um, like), and add basic punctuation. Keep the original meaning and style intact.

Also translate the corrected text to ${targetLanguages.map(lang => languageNames[lang]).join(', ')}.

Original text: "${originalText}"

Please return a JSON response with this exact format:
{
  "reviewedText": "minimally corrected English text here",
  "translations": {
    "ko": "Korean translation here",
    "zh": "Chinese translation here", 
    "hi": "Hindi translation here"
  },
  "quality": 0.95
}`
  } else {
    const inputLanguageName = languageNames[detectedLanguage]
    prompt = `Here is the raw text from STT in ${inputLanguageName}. Make MINIMAL corrections - only fix obvious grammar errors, remove filler words, and add basic punctuation. Keep the original meaning and style intact.

Also translate the corrected text to ${targetLanguages.map(lang => languageNames[lang]).join(', ')}.

Original text: "${originalText}"

Please return a JSON response with this exact format:
{
  "reviewedText": "minimally corrected ${inputLanguageName} text here",
  "translations": {
    ${targetLanguages.map(lang => `"${lang}": "${languageNames[lang]} translation here"`).join(',\n    ')}
  },
  "quality": 0.95
}`
  }

  console.log(`🤖 Gemini review + translation for: "${originalText.substring(0, 50)}..." (${detectedLanguage} → ${targetLanguages.join(', ')})`)

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${geminiApiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1, // 더 낮은 temperature로 일관성 향상
          maxOutputTokens: Math.max(Math.ceil(originalText.length * 4), 800), // 토큰 수 줄임
        },
      }),
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    console.error('Gemini API error:', response.status, errorText)
    throw new Error('Gemini API request failed')
  }

  const data = await response.json()

  if (data.candidates && data.candidates[0] && data.candidates[0].content) {
    const candidate = data.candidates[0]

    if (candidate.content.parts && candidate.content.parts[0] && candidate.content.parts[0].text) {
      let content = candidate.content.parts[0].text.trim()

      // JSON 파싱 (마크다운 코드 블록 제거)
      if (content.startsWith('```json')) {
        content = content.replace(/^```json\s*/, '').replace(/\s*```$/, '')
      } else if (content.startsWith('```')) {
        content = content.replace(/^```\s*/, '').replace(/\s*```$/, '')
      }

      try {
        const result = JSON.parse(content)
        
        console.log(`✅ Gemini review + translation completed`)
        
        return {
          reviewedText: result.reviewedText || originalText,
          translations: result.translations || {},
          quality: result.quality || 0.9
        }
      } catch (parseError) {
        console.error('JSON parsing error:', parseError)
        throw new Error('Failed to parse Gemini response')
      }
    }
  }

  throw new Error('Invalid Gemini response structure')
}

// In-memory session storage for quick access with enhanced duplicate prevention
interface SessionData {
  fullTranscript: string
  lastUpdate: Date
  recentChunks: Array<{text: string, hash: string, timestamp: number}>
  processedHashes: Set<string>
}

const activeSessions = new Map<string, SessionData>()

// Advanced text similarity and hash functions
function generateTextHash(text: string): string {
  // Normalize text for better duplicate detection
  const normalized = text.toLowerCase()
    .replace(/[\s\p{P}]+/gu, ' ')
    .trim()
  
  // Simple hash function (could be upgraded to crypto.createHash)
  let hash = 0
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return hash.toString(36)
}

function calculateSimilarity(text1: string, text2: string): number {
  const normalize = (text: string) => text.toLowerCase().replace(/[\s\p{P}]+/gu, ' ').trim()
  const norm1 = normalize(text1)
  const norm2 = normalize(text2)
  
  if (norm1 === norm2) return 1.0
  
  // Simple substring similarity
  const shorter = norm1.length < norm2.length ? norm1 : norm2
  const longer = norm1.length < norm2.length ? norm2 : norm1
  
  if (longer.includes(shorter) && shorter.length > 10) {
    return shorter.length / longer.length
  }
  
  return 0
}

function isDuplicateOrSimilar(text: string, session: SessionData): boolean {
  const textHash = generateTextHash(text)
  const now = Date.now()
  
  // Check exact hash matches
  if (session.processedHashes.has(textHash)) {
    console.log('🚫 Exact duplicate detected (hash match)')
    return true
  }
  
  // Check recent chunks for similarity (last 10 seconds, 더 엄격하게)
  const recentChunks = session.recentChunks.filter(chunk => now - chunk.timestamp < 10000)
  
  for (const chunk of recentChunks) {
    const similarity = calculateSimilarity(text, chunk.text)
    if (similarity > 0.7) { // 70% similarity threshold (80% → 70%)
      console.log(`🚫 High similarity detected: ${similarity.toFixed(2)} with "${chunk.text.substring(0, 30)}..."`)
      return true
    }
    
    // 부분 포함 관계 확인 (새로 추가)
    if (text.includes(chunk.text.substring(0, 20)) || chunk.text.includes(text.substring(0, 20))) {
      console.log(`🚫 Partial inclusion detected with "${chunk.text.substring(0, 30)}..."`)
      return true
    }
  }
  
  // Check for exact text matches in recent chunks (새로 추가)
  const exactMatches = recentChunks.filter(chunk => 
    chunk.text.trim() === text.trim() || 
    chunk.text.trim().includes(text.trim()) ||
    text.trim().includes(chunk.text.trim())
  )
  
  if (exactMatches.length > 0) {
    console.log(`🚫 Exact text match detected with recent chunk`)
    return true
  }
  
  return false
}

// 🎯 오버랩 중복 제거 함수 (더 정교한 처리)
function removeOverlapDuplicates(newText: string, session: SessionData): string {
  const recentChunks = session.recentChunks.slice(-5) // 최근 5개 청크 확인 (3 → 5)
  
  for (const chunk of recentChunks) {
    const existingText = chunk.text
    
    // 오버랩 패턴 찾기
    const overlapPatterns = findOverlapPatterns(newText, existingText)
    
    if (overlapPatterns.length > 0) {
      // 가장 긴 오버랩 패턴 제거
      const longestOverlap = overlapPatterns.reduce((longest, current) => 
        current.length > longest.length ? current : longest
      )
      
      console.log(`🔄 Removing overlap: "${longestOverlap}"`)
      
      // 오버랩 제거
      const cleanedText = newText.replace(longestOverlap, '').trim()
      
      if (cleanedText) {
        console.log(`✅ After overlap removal: "${cleanedText}"`)
        return cleanedText
      } else {
        // 오버랩 제거 후 텍스트가 없으면 완전히 중복된 것으로 간주
        console.log(`🚫 Complete overlap detected - skipping`)
        return ''
      }
    }
  }
  
  return newText
}

// 🎯 오버랩 패턴 찾기 (더 정교한 처리)
function findOverlapPatterns(newText: string, existingText: string): string[] {
  const patterns: string[] = []
  const minOverlapLength = 3 // 최소 3자 이상의 오버랩만 고려 (5 → 3)
  
  // 기존 텍스트의 끝 부분과 새 텍스트의 시작 부분 비교
  for (let i = minOverlapLength; i <= Math.min(existingText.length, newText.length); i++) {
    const existingEnd = existingText.slice(-i)
    const newStart = newText.slice(0, i)
    
    if (existingEnd === newStart) {
      patterns.push(existingEnd)
    }
  }
  
  return patterns
}

// 🎯 스마트 텍스트 병합
function smartMergeText(newText: string, session: SessionData): string {
  const recentChunks = session.recentChunks.slice(-2) // 최근 2개 청크
  
  if (recentChunks.length === 0) {
    return newText
  }
  
  const lastChunk = recentChunks[recentChunks.length - 1]
  const existingText = lastChunk.text
  
  // 오버랩 제거
  const cleanedNewText = removeOverlapDuplicates(newText, session)
  
  if (cleanedNewText === newText) {
    // 오버랩이 없으면 그대로 반환
    return newText
  }
  
  // 오버랩이 제거된 경우, 기존 텍스트와 병합
  const mergedText = existingText + ' ' + cleanedNewText
  
  console.log(`🔗 Smart merge: "${existingText}" + "${cleanedNewText}" = "${mergedText}"`)
  
  return mergedText
}

export async function POST(req: NextRequest) {
  try {
    const { type, sessionId, transcript, isPartial } = await req.json()

    console.log(`🎯 STT Stream ${type}:`, {
      sessionId,
      hasTranscript: !!transcript,
      isPartial,
      timestamp: new Date().toLocaleTimeString(),
    })

    switch (type) {
      case 'start':
        // Initialize session with enhanced tracking
        if (!activeSessions.has(sessionId)) {
          activeSessions.set(sessionId, {
            fullTranscript: '',
            lastUpdate: new Date(),
            recentChunks: [],
            processedHashes: new Set()
          })
          console.log(`🚀 Enhanced STT session ${sessionId} initialized`)
        } else {
          // Reset session if already exists
          const session = activeSessions.get(sessionId)!
          session.recentChunks = []
          session.processedHashes.clear()
          console.log(`🔄 STT session ${sessionId} reset`)
        }
        return NextResponse.json({ success: true })

      case 'transcript':
        // Update session transcript
        const currentSession = activeSessions.get(sessionId)
        if (!currentSession) {
          console.error(`❌ Session ${sessionId} not found for transcript update`)
          return NextResponse.json({ error: 'Session not found' }, { status: 404 })
        }

        // Enhanced text validation
        const cleanedTranscript = transcript?.trim()
        if (!cleanedTranscript || cleanedTranscript.length < 2) {
          console.log(`⚠️ Skipping empty or too short transcript: "${cleanedTranscript}"`)
          return NextResponse.json({
            success: true,
            message: 'Transcript too short, skipped',
          })
        }

        // 🎯 스마트 오버랩 중복 제거
        const processedTranscript = smartMergeText(cleanedTranscript, currentSession)
        
        if (processedTranscript !== cleanedTranscript) {
          console.log(`🔄 Smart overlap removal applied: "${cleanedTranscript}" → "${processedTranscript}"`)
        }
        
        // Advanced duplicate detection (오버랩 제거 후)
        if (isDuplicateOrSimilar(processedTranscript, currentSession)) {
          console.log(`🚫 Advanced duplicate detection blocked: "${processedTranscript.substring(0, 30)}..."`)
          return NextResponse.json({
            success: true,
            message: 'Duplicate/similar transcript blocked by advanced detection',
            blocked: true
          })
        }

        // Quality check: Skip very repetitive or low-quality text
        const words = processedTranscript.split(/\s+/)
        const uniqueWords = new Set(words.map((w: string) => w.toLowerCase()))
        const repetitionRatio = uniqueWords.size / words.length
        
        if (repetitionRatio < 0.3 && words.length > 5) {
          console.log(`⚠️ Skipping highly repetitive text (ratio: ${repetitionRatio.toFixed(2)}): "${processedTranscript.substring(0, 30)}..."`)
          return NextResponse.json({
            success: true,
            message: 'Repetitive text filtered out',
            filtered: true
          })
        }

        if (!isPartial && processedTranscript) {
          // Add to session tracking with enhanced metadata
          const textHash = generateTextHash(processedTranscript)
          const timestamp = Date.now()
          
          currentSession.fullTranscript += processedTranscript + ' '
          currentSession.lastUpdate = new Date()
          
          // Track this chunk
          currentSession.recentChunks.push({ 
            text: processedTranscript, 
            hash: textHash, 
            timestamp 
          })
          currentSession.processedHashes.add(textHash)
          
          // Cleanup old chunks (keep only last 50 or last 5 minutes)
          currentSession.recentChunks = currentSession.recentChunks
            .filter(chunk => timestamp - chunk.timestamp < 300000) // 5 minutes
            .slice(-50) // Keep last 50 chunks
          
          // Cleanup old hashes (keep last 200)
          if (currentSession.processedHashes.size > 200) {
            const hashArray = Array.from(currentSession.processedHashes)
            currentSession.processedHashes = new Set(hashArray.slice(-150))
          }
          
          console.log(`📝 Enhanced final transcript added to session ${sessionId}:`, processedTranscript)
          console.log(`📊 Session stats: ${currentSession.recentChunks.length} recent chunks, ${currentSession.processedHashes.size} hashes tracked`)

          // Save EACH final sentence immediately to Supabase
          const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

          const dbInsertStart = Date.now()
          console.log(`💾 Inserting transcript to DB: "${processedTranscript.substring(0, 50)}..."`)

          const { data, error: insertError } = await supabase
            .from('transcripts')
            .insert([
              {
                session_id: sessionId,
                timestamp: new Date().toLocaleTimeString(),
                original_text: processedTranscript,
                created_at: new Date().toISOString(),
                is_final: true,
                review_status: 'pending', // 검수 대기 상태로 설정
                translation_status: 'pending', // 번역 대기 상태로 설정
              },
            ])
            .select()

          const dbInsertTime = Date.now() - dbInsertStart

          if (insertError) {
            console.error(`❌ DB insert error (${dbInsertTime}ms):`, insertError)
            return NextResponse.json({ error: 'Database error' }, { status: 500 })
          }

          console.log(`✅ Transcript saved (id): ${data?.[0]?.id} - DB insert: ${dbInsertTime}ms`)
          const transcriptId = data?.[0]?.id

          // 🚀 Gemini 검수 + 번역 실행 (백그라운드)
          console.log('🌍 Starting Gemini review + translation...')

          // 검수 및 번역 상태를 'processing'으로 업데이트
          const statusUpdateStart = Date.now()
          await supabase.from('transcripts').update({ 
            review_status: 'processing',
            translation_status: 'processing' 
          }).eq('id', transcriptId)
          const statusUpdateTime = Date.now() - statusUpdateStart

          console.log(`🔄 Review & translation status updated to 'processing' (${statusUpdateTime}ms)`)

          try {
            // 언어 감지
            const detectedLanguage = detectLanguage(cleanedTranscript)
            console.log(`🌍 Detected language: ${detectedLanguage}`)

            // Gemini 검수 + 번역 직접 호출
            const reviewStart = Date.now()
            const reviewResult = await reviewAndTranslateWithGemini(cleanedTranscript, detectedLanguage)
            const reviewTime = Date.now() - reviewStart

            console.log(
              `🚀 Gemini review + translation completed in ${reviewTime}ms for "${cleanedTranscript.substring(0, 30)}..."`,
            )

            // 1. transcripts 테이블에 검수된 텍스트 저장
            console.log(`💾 Updating transcript ${transcriptId} with reviewed text: "${reviewResult.reviewedText.substring(0, 30)}..."`)
            
            const { error: updateError } = await supabase
              .from('transcripts')
              .update({
                reviewed_text: reviewResult.reviewedText,
                detected_language: detectedLanguage,
                review_status: 'completed'
              })
              .eq('id', transcriptId)

            if (updateError) {
              console.error('❌ Error updating transcript with reviewed text:', updateError)
              throw new Error('Failed to update transcript')
            } else {
              console.log(`✅ Successfully updated transcript ${transcriptId} with reviewed text`)
            }

            // 2. 번역 결과를 translation_cache에 저장하고 ID 수집
            const cacheIds: Record<string, string> = {}
            const cachePromises = Object.entries(reviewResult.translations).map(async ([targetLang, translatedText]) => {
              if (translatedText && translatedText.trim()) {
                try {
                  const cacheId = await saveTranslationToCache(
                    reviewResult.reviewedText, // 검수된 텍스트를 원본으로 사용
                    targetLang,
                    translatedText,
                    'gemini-review',
                    reviewResult.quality
                  )
                  
                  if (cacheId) {
                    cacheIds[targetLang] = cacheId
                    console.log(`✅ Cached translation: ${targetLang} (ID: ${cacheId})`)
                  }
                } catch (cacheError) {
                  console.error(`❌ Cache error for ${targetLang}:`, cacheError)
                }
              }
            })

            await Promise.all(cachePromises)

            // 3. transcripts 테이블에 translation_cache_ids 업데이트
            if (Object.keys(cacheIds).length > 0) {
              console.log(`💾 Updating transcript ${transcriptId} with cache IDs:`, cacheIds)
              
              const { error: updateError } = await supabase
                .from('transcripts')
                .update({ 
                  translation_cache_ids: cacheIds,
                  translation_status: 'completed' 
                })
                .eq('id', transcriptId)

              if (updateError) {
                console.error('❌ Error updating translation_cache_ids:', updateError)
              } else {
                console.log(`✅ Successfully updated transcript ${transcriptId} with ${Object.keys(cacheIds).length} cache IDs`)
              }
            } else {
              console.log(`⚠️ No cache IDs to update for transcript ${transcriptId}`)
              // 번역 완료 상태로 업데이트
              await supabase.from('transcripts').update({ translation_status: 'completed' }).eq('id', transcriptId)
            }

            return NextResponse.json({
              success: true,
              transcriptId: transcriptId,
              originalText: cleanedTranscript,
              reviewedText: reviewResult.reviewedText,
              detectedLanguage: detectedLanguage,
              reviewCompleted: true,
              translationCompleted: true,
              translatedLanguages: Object.keys(reviewResult.translations || {}),
              reviewTime: reviewTime,
              totalTime: Date.now() - dbInsertStart,
              sessionStats: {
                totalChunks: currentSession.recentChunks.length,
                hashesTracked: currentSession.processedHashes.size,
                transcriptLength: currentSession.fullTranscript.length
              }
            })
          } catch (reviewError) {
            console.error('❌ Gemini review + translation failed:', reviewError)

            // 검수 및 번역 실패 시 상태를 pending으로 되돌림
            await supabase.from('transcripts').update({ 
              review_status: 'failed',
              translation_status: 'failed' 
            }).eq('id', transcriptId)

            // 검수 및 번역 실패해도 transcript 저장은 성공으로 처리
            return NextResponse.json({
              success: true,
              transcriptId: transcriptId,
              originalText: cleanedTranscript,
              reviewCompleted: false,
              translationCompleted: false,
              reviewError: reviewError instanceof Error ? reviewError.message : 'Unknown error',
              note: 'Transcript saved but review + translation failed',
            })
          }
        }

        return NextResponse.json({
          success: true,
          message: isPartial ? 'Partial transcript received' : 'Final transcript processed',
        })

      case 'end':
        // Enhanced session cleanup with stats
        const endSession = activeSessions.get(sessionId)
        const sessionStats = endSession ? {
          totalTranscriptLength: endSession.fullTranscript.length,
          chunksProcessed: endSession.recentChunks.length,
          hashesTracked: endSession.processedHashes.size,
          lastUpdate: endSession.lastUpdate
        } : null
        
        const ended = activeSessions.delete(sessionId)
        console.log(`🧹 Enhanced session ${sessionId} cleanup (${ended ? 'removed' : 'not found'})`)
        if (sessionStats) {
          console.log(`📊 Final session stats:`, sessionStats)
        }
        
        return NextResponse.json({ 
          success: true, 
          cleaned: ended,
          finalStats: sessionStats
        })

      default:
        return NextResponse.json({ error: "Invalid type. Use 'start', 'transcript', or 'end'" }, { status: 400 })
    }
  } catch (error) {
    console.error('❌ STT Stream error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Enhanced GET endpoint with detailed session analytics
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const sessionId = searchParams.get('sessionId')
    const includeStats = searchParams.get('includeStats') === 'true'

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 })
    }

    const session = activeSessions.get(sessionId)
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const response: {
      transcript: string
      lastUpdate: Date
      length: number
      analytics?: {
        totalChunks: number
        hashesTracked: number
        recentActivity: number
        chunkSizes: Array<{
          length: number
          timestamp: number
          ageSeconds: number
        }>
        averageChunkSize: number
      }
    } = {
      transcript: session.fullTranscript,
      lastUpdate: session.lastUpdate,
      length: session.fullTranscript.length,
    }

    if (includeStats) {
      const now = Date.now()
      response.analytics = {
        totalChunks: session.recentChunks.length,
        hashesTracked: session.processedHashes.size,
        recentActivity: session.recentChunks
          .filter(chunk => now - chunk.timestamp < 60000) // Last minute
          .length,
        chunkSizes: session.recentChunks.map(chunk => ({
          length: chunk.text.length,
          timestamp: chunk.timestamp,
          ageSeconds: Math.round((now - chunk.timestamp) / 1000)
        })),
        averageChunkSize: session.recentChunks.length > 0 ? 
          Math.round(session.recentChunks.reduce((sum, chunk) => sum + chunk.text.length, 0) / session.recentChunks.length) : 0
      }
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Enhanced STT Stream GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
