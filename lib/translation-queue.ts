import type { TranslationJob } from "./types"
import { saveTranslationToCache, PRIORITY_LANGUAGES } from "./translation-cache"

// Google Translate 언어 코드 매핑
const GOOGLE_LANGUAGE_MAP: Record<string, string> = {
  'ko': 'ko', 'en': 'en', 'ja': 'ja', 'zh': 'zh-cn', 'es': 'es',
  'fr': 'fr', 'de': 'de', 'pt': 'pt', 'ru': 'ru', 'it': 'it',
  'pl': 'pl', 'nl': 'nl', 'da': 'da', 'sv': 'sv', 'no': 'no',
  'fi': 'fi', 'cs': 'cs', 'sk': 'sk', 'sl': 'sl', 'et': 'et',
  'lv': 'lv', 'lt': 'lt', 'hu': 'hu', 'bg': 'bg', 'ro': 'ro',
  'el': 'el', 'tr': 'tr', 'ar': 'ar', 'id': 'id', 'uk': 'uk'
}

// GPT 언어 이름 매핑 (더 정확한 번역을 위해)
const GPT_LANGUAGE_NAMES: Record<string, string> = {
  'ko': 'Korean',
  'ja': 'Japanese', 
  'zh': 'Chinese',
  'es': 'Spanish',
  'fr': 'French',
  'de': 'German',
  'pt': 'Portuguese',
  'ru': 'Russian',
  'it': 'Italian',
  'pl': 'Polish',
  'nl': 'Dutch',
  'da': 'Danish',
  'sv': 'Swedish',
  'no': 'Norwegian',
  'fi': 'Finnish',
  'cs': 'Czech',
  'sk': 'Slovak',
  'sl': 'Slovenian',
  'et': 'Estonian',
  'lv': 'Latvian',
  'lt': 'Lithuanian',
  'hu': 'Hungarian',
  'bg': 'Bulgarian',
  'ro': 'Romanian',
  'el': 'Greek',
  'tr': 'Turkish',
  'ar': 'Arabic',
  'id': 'Indonesian',
  'uk': 'Ukrainian',
  'hi': 'Hindi',
  'en': 'English'
}

// GPT-4 번역 (최고 품질)
async function translateWithGPT(text: string, targetLanguage: string): Promise<{ text: string; quality: number } | null> {
  try {
    const openaiApiKey = process.env.OPENAI_API_KEY
    if (!openaiApiKey) {
      console.log('OpenAI API key not found, skipping GPT translation')
      return null
    }

    const targetLangName = GPT_LANGUAGE_NAMES[targetLanguage]
    if (!targetLangName) {
      console.log(`Unsupported language for GPT: ${targetLanguage}`)
      return null
    }

    // 컨텍스트에 맞는 프롬프트 작성
    const prompt = `You are a professional translator specializing in live lecture and presentation content. 

Please translate the following text to ${targetLangName}. This is from a live speech/lecture, so:
- Maintain the speaker's tone and intent
- Fix any obvious speech recognition errors naturally
- Use appropriate formal/informal register for academic context
- Keep technical terms accurate
- Make it sound natural in the target language

Text to translate: "${text}"

Provide ONLY the translation without any explanation.`

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // 더 저렴하고 빠른 모델
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: Math.min(Math.ceil(text.length * 3), 500), // 적응적 토큰 수
        temperature: 0.3, // 일관성을 위해 낮은 temperature
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('GPT API error:', response.status, errorText)
      return null
    }

    const data = await response.json()
    
    if (data.choices && data.choices[0] && data.choices[0].message) {
      const translatedText = data.choices[0].message.content.trim()
      console.log('✅ GPT translation successful')
      return {
        text: translatedText,
        quality: 0.95 // GPT는 높은 품질 점수
      }
    }

    return null
  } catch (error) {
    console.error('GPT translation error:', error)
    return null
  }
}

// 🆕 GPT 통합 번역 (비용 최적화)
async function translateWithGPTBatch(text: string, targetLanguages: string[]): Promise<Record<string, { text: string; quality: number }> | null> {
  try {
    const openaiApiKey = process.env.OPENAI_API_KEY
    if (!openaiApiKey) {
      console.log('OpenAI API key not found, skipping GPT batch translation')
      return null
    }

    // 지원되는 언어만 필터링
    const supportedLanguages = targetLanguages.filter(lang => GPT_LANGUAGE_NAMES[lang])
    if (supportedLanguages.length === 0) {
      return null
    }

    // 언어 리스트 생성
    const languageList = supportedLanguages.map(lang => `${lang}: ${GPT_LANGUAGE_NAMES[lang]}`).join(', ')
    
    const prompt = `You are a professional translator specializing in live lecture and presentation content.

Please translate the following text to ALL these languages: ${languageList}

Guidelines:
- Maintain the speaker's tone and intent
- Fix any obvious speech recognition errors naturally  
- Use appropriate formal/informal register for academic context
- Keep technical terms accurate
- Make it sound natural in each target language

Text to translate: "${text}"

Return ONLY a JSON object with language codes as keys:
${JSON.stringify(Object.fromEntries(supportedLanguages.map(lang => [lang, `[${GPT_LANGUAGE_NAMES[lang]} translation here]`])), null, 2)}`

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: Math.min(Math.ceil(text.length * supportedLanguages.length * 2), 1000),
        temperature: 0.3,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('GPT Batch API error:', response.status, errorText)
      return null
    }

    const data = await response.json()
    
    if (data.choices && data.choices[0] && data.choices[0].message) {
      const content = data.choices[0].message.content.trim()
      
      // GPT 응답을 안전하게 파싱
      try {
        // JSON 파싱 시도
        const translations = JSON.parse(content)
        const result: Record<string, { text: string; quality: number }> = {}
        
        for (const [lang, translation] of Object.entries(translations)) {
          result[lang] = {
            text: translation as string,
            quality: 0.95
          }
        }
        
        return result
      } catch (parseError) {
        console.error('Failed to parse GPT batch response:', parseError)
        console.log('Raw response:', content)
        
        // JSON이 불완전한 경우 정규식으로 파싱 시도
        const result: Record<string, { text: string; quality: number }> = {}
        
        // 각 언어별로 패턴 매칭
        const patterns = [
          { lang: 'ko', regex: /"ko":\s*"([^"]*)"/ },
          { lang: 'zh', regex: /"zh":\s*"([^"]*)"/ },
          { lang: 'hi', regex: /"hi":\s*"([^"]*)"/ },
          { lang: 'ja', regex: /"ja":\s*"([^"]*)"/ },
          { lang: 'es', regex: /"es":\s*"([^"]*)"/ },
          { lang: 'fr', regex: /"fr":\s*"([^"]*)"/ },
          { lang: 'de', regex: /"de":\s*"([^"]*)"/ },
          { lang: 'ar', regex: /"ar":\s*"([^"]*)"/ }
        ]
        
        let foundAny = false
        for (const { lang, regex } of patterns) {
          const match = content.match(regex)
          if (match && match[1]) {
            result[lang] = {
              text: match[1],
              quality: 0.9 // 약간 낮은 품질 점수
            }
            foundAny = true
          }
        }
        
        if (foundAny) {
          console.log('Successfully extracted translations using regex:', Object.keys(result))
          return result
        }
        
        throw new Error('Could not parse GPT response')
      }
    }

    return null
  } catch (error) {
    console.error('GPT batch translation error:', error)
    return null
  }
}

// Google Translate 번역 (폴백)
async function translateWithGoogle(text: string, targetLanguage: string): Promise<{ text: string; quality: number } | null> {
  try {
    const targetLang = GOOGLE_LANGUAGE_MAP[targetLanguage]
    if (!targetLang) return null

    const encodedText = encodeURIComponent(text)
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodedText}`
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })
    
    if (response.ok) {
      const data = await response.json()
      if (data && data[0] && data[0][0] && data[0][0][0]) {
        return {
          text: data[0][0][0],
          quality: 0.75
        }
      }
    }
    return null
  } catch (error) {
    console.error('Google Translate error:', error)
    return null
  }
}

// 로컬 번역 (최종 fallback)
function getLocalTranslation(text: string, targetLang: string): { text: string; quality: number } {
  const translations: Record<string, Record<string, string>> = {
    'hello': { 'ko': '안녕하세요', 'ja': 'こんにちは', 'zh': '你好', 'es': 'hola', 'fr': 'bonjour', 'de': 'hallo' },
    'welcome': { 'ko': '환영합니다', 'ja': 'ようこそ', 'zh': '欢迎', 'es': 'bienvenido', 'fr': 'bienvenue', 'de': 'willkommen' },
    'thank you': { 'ko': '감사합니다', 'ja': 'ありがとう', 'zh': '谢谢', 'es': 'gracias', 'fr': 'merci', 'de': 'danke' },
    'lecture': { 'ko': '강의', 'ja': '講義', 'zh': '讲座', 'es': 'conferencia', 'fr': 'conférence', 'de': 'vorlesung' },
    'presentation': { 'ko': '발표', 'ja': 'プレゼンテーション', 'zh': '演示', 'es': 'presentación', 'fr': 'présentation', 'de': 'präsentation' }
  }
  
  let translatedText = text.toLowerCase()
  let hasTranslation = false
  
  for (const [englishWord, langTranslations] of Object.entries(translations)) {
    if (langTranslations[targetLang]) {
      const regex = new RegExp(`\\b${englishWord}\\b`, 'gi')
      if (regex.test(translatedText)) {
        translatedText = translatedText.replace(regex, langTranslations[targetLang])
        hasTranslation = true
      }
    }
  }
  
  if (!hasTranslation) {
    const languageNames: Record<string, string> = {
      'ko': '한국어', 'ja': '日本語', 'zh': '中文', 'es': 'Español', 
      'fr': 'Français', 'de': 'Deutsch', 'it': 'Italiano', 
      'pt': 'Português', 'ru': 'Русский', 'ar': 'العربية'
    }
    const langName = languageNames[targetLang] || targetLang.toUpperCase()
    translatedText = `[${langName}] ${text}`
  } else {
    translatedText = translatedText.charAt(0).toUpperCase() + translatedText.slice(1)
  }
  
  return {
    text: translatedText,
    quality: hasTranslation ? 0.6 : 0.3
  }
}

// 번역 수행 (GPT → Google → Local 순서)
async function performTranslation(text: string, targetLanguage: string): Promise<{ text: string; engine: string; quality: number }> {
  // 1단계: GPT-4 시도 (최고 품질)
  const gptResult = await translateWithGPT(text, targetLanguage)
  if (gptResult) {
    return {
      text: gptResult.text,
      engine: 'gpt',
      quality: gptResult.quality
    }
  }

  // 2단계: Google Translate 시도  
  const googleResult = await translateWithGoogle(text, targetLanguage)
  if (googleResult) {
    return {
      text: googleResult.text,
      engine: 'google',
      quality: googleResult.quality
    }
  }

  // 3단계: 로컬 번역
  const localResult = getLocalTranslation(text, targetLanguage)
  return {
    text: localResult.text,
    engine: 'local',
    quality: localResult.quality
  }
}

// 🆕 하이브리드 번역 수행 (배치 + 개별 fallback)
async function performBatchTranslation(
  text: string, 
  targetLanguages: string[]
): Promise<Record<string, { text: string; engine: string; quality: number }>> {
  const results: Record<string, { text: string; engine: string; quality: number }> = {}
  
  // 1단계: GPT 배치 번역 시도 (55% 비용 절약)
  try {
    const batchResult = await translateWithGPTBatch(text, targetLanguages)
    if (batchResult && Object.keys(batchResult).length > 0) {
      console.log(`🚀 GPT batch translation succeeded for ${Object.keys(batchResult).length}/${targetLanguages.length} languages`)
      
      // 성공한 번역 저장
      for (const [lang, translation] of Object.entries(batchResult)) {
        results[lang] = {
          text: translation.text,
          engine: 'gpt-batch',
          quality: translation.quality
        }
      }
    }
  } catch (error) {
    console.error('GPT batch translation failed:', error)
  }
  
  // 2단계: 실패한 언어들에 대해 개별 처리
  const failedLanguages = targetLanguages.filter(lang => !results[lang])
  
  if (failedLanguages.length > 0) {
    console.log(`🔄 Falling back to individual translation for ${failedLanguages.length} languages`)
    
    // 병렬로 개별 번역 처리 (3개씩)
    for (let i = 0; i < failedLanguages.length; i += 3) {
      const batch = failedLanguages.slice(i, i + 3)
      
      await Promise.all(batch.map(async (lang) => {
        try {
          const result = await performTranslation(text, lang)
          results[lang] = result
        } catch (error) {
          console.error(`Individual translation failed for ${lang}:`, error)
          // 최후의 수단: 로컬 번역
          const localResult = getLocalTranslation(text, lang)
          results[lang] = {
            text: localResult.text,
            engine: 'local',
            quality: localResult.quality
          }
        }
      }))
      
      // 배치 간 짧은 딜레이
      if (i + 3 < failedLanguages.length) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }
  }
  
  return results
}

// 번역 큐 매니저 클래스
class TranslationQueueManager {
  // 🆕 텍스트별 큐로 변경 (언어별이 아닌!)
  private textQueues = new Map<string, { 
    text: string; 
    languages: Set<string>; 
    jobs: TranslationJob[];
    priority: number;
  }>()
  private processing = new Set<string>()
  private timers = new Map<string, NodeJS.Timeout>()
  
  // 싱글톤 인스턴스
  private static instance: TranslationQueueManager | null = null
  
  static getInstance(): TranslationQueueManager {
    if (!TranslationQueueManager.instance) {
      TranslationQueueManager.instance = new TranslationQueueManager()
    }
    return TranslationQueueManager.instance
  }
  
  // 번역 작업 추가 - 텍스트별로 그룹화
  addJob(job: TranslationJob): void {
    const textKey = job.text
    
    if (!this.textQueues.has(textKey)) {
      this.textQueues.set(textKey, {
        text: job.text,
        languages: new Set(),
        jobs: [],
        priority: job.priority || 5
      })
    }
    
    const textGroup = this.textQueues.get(textKey)!
    textGroup.languages.add(job.targetLanguage)
    textGroup.jobs.push(job)
    textGroup.priority = Math.max(textGroup.priority, job.priority || 5) // 최고 우선순위 사용
    
    console.log(`📝 Added job for "${job.text.substring(0, 30)}..." → ${job.targetLanguage} (total languages: ${textGroup.languages.size})`)
    
    this.scheduleProcessing(textKey)
  }
  
  // 배치 처리 스케줄링 - 텍스트 기반
  private scheduleProcessing(textKey: string): void {
    if (this.processing.has(textKey)) return
    
    // 기존 타이머가 있으면 취소
    if (this.timers.has(textKey)) {
      clearTimeout(this.timers.get(textKey)!)
    }
    
    const textGroup = this.textQueues.get(textKey)
    if (!textGroup) return
    
    // 언어 수에 따라 대기 시간 조정 (더 많은 언어 = 더 긴 대기 = 더 좋은 배치)
    const languageCount = textGroup.languages.size
    const basePriority = textGroup.priority
    
    // 우선순위 세션은 500ms, 일반은 1000ms 기본 + 언어당 200ms 추가 대기
    const isHighPriority = basePriority > 15 // 세션 우선순위 (10) + 언어 우선순위 (5+)
    const baseDelay = isHighPriority ? 500 : 1000
    const extraDelay = Math.min(languageCount * 200, 2000) // 최대 2초 추가
    const delay = baseDelay + extraDelay
    
    console.log(`⏰ Scheduling batch processing for "${textGroup.text.substring(0, 30)}..." with ${languageCount} languages in ${delay}ms`)
    
    const timer = setTimeout(() => {
      this.processBatch(textKey)
    }, delay)
    
    this.timers.set(textKey, timer)
  }
  
  // 배치 처리 - 텍스트별 모든 언어를 한 번에!
  private async processBatch(textKey: string): Promise<void> {
    if (this.processing.has(textKey)) return
    
    this.processing.add(textKey)
    
    try {
      const textGroup = this.textQueues.get(textKey)
      if (!textGroup || textGroup.languages.size === 0) return
      
      const languageArray = Array.from(textGroup.languages)
      console.log(`🚀 Processing batch translation for "${textGroup.text.substring(0, 50)}..." → [${languageArray.join(', ')}]`)
      
      try {
        // 🎯 진정한 배치 번역! 한 텍스트의 모든 언어를 한 번에 처리
        const batchResults = await performBatchTranslation(textGroup.text, languageArray)
        
        // 결과를 캐시에 저장
        for (const [language, result] of Object.entries(batchResults)) {
          await saveTranslationToCache(
            textGroup.text,
            language,
            result.text,
            result.engine,
            result.quality
          )
          
          console.log(`✅ Batch translated "${textGroup.text.substring(0, 30)}..." → ${language} using ${result.engine}`)
        }
        
        console.log(`🎉 Completed batch translation for "${textGroup.text.substring(0, 30)}..." (${Object.keys(batchResults).length} languages)`)
        
        // 🆕 번역 완료 시 transcript 상태 업데이트
        await this.updateTranscriptStatus(textGroup.jobs)
        
      } catch (error) {
        console.error(`❌ Batch translation failed for "${textGroup.text.substring(0, 50)}...":`, error)
        
        // 실패시 개별 처리로 폴백
        console.log(`🔄 Falling back to individual translations for ${languageArray.length} languages`)
        
        for (const language of languageArray) {
          try {
            const result = await performTranslation(textGroup.text, language)
            
            await saveTranslationToCache(
              textGroup.text,
              language,
              result.text,
              result.engine,
              result.quality
            )
            
            console.log(`✅ Individual translated "${textGroup.text.substring(0, 30)}..." → ${language} using ${result.engine}`)
          } catch (individualError) {
            console.error(`❌ Individual translation failed for ${language}:`, individualError)
          }
        }
        
        // fallback 번역 완료 시에도 transcript 상태 업데이트
        await this.updateTranscriptStatus(textGroup.jobs)
      }
      
      // 텍스트 큐에서 제거
      this.textQueues.delete(textKey)
      
    } finally {
      this.processing.delete(textKey)
      this.timers.delete(textKey)
    }
  }
  
  // 🆕 번역 완료 시 transcript 상태 업데이트
  private async updateTranscriptStatus(jobs: TranslationJob[]): Promise<void> {
    // transcript ID가 있는 작업들만 필터링
    const transcriptIds = jobs
      .map(job => job.transcriptId)
      .filter((id): id is string => !!id)
    
    if (transcriptIds.length === 0) return
    
    try {
      // Supabase 클라이언트 import 필요
      const { createClient } = await import("@supabase/supabase-js")
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
      
      // 해당 transcript들의 상태를 'completed'로 업데이트
      const { error } = await supabase
        .from('transcripts')
        .update({ translation_status: 'completed' })
        .in('id', transcriptIds)
      
      if (error) {
        console.error('❌ Failed to update transcript status:', error)
      } else {
        console.log(`✅ Updated ${transcriptIds.length} transcript(s) status to completed`)
      }
      
    } catch (error) {
      console.error('❌ Error updating transcript status:', error)
    }
  }

  // 큐 상태 조회
  getQueueStats(): Record<string, number> {
    const stats: Record<string, number> = {}
    let totalTexts = 0
    let totalLanguages = 0
    
    for (const [textKey, textGroup] of this.textQueues) {
      totalTexts++
      totalLanguages += textGroup.languages.size
      stats[`"${textKey.substring(0, 20)}..."${textKey.length > 20 ? '...' : ''}`] = textGroup.languages.size
    }
    
    return {
      totalTexts,
      totalLanguages,
      ...stats
    }
  }
}

// 싱글톤 인스턴스 export
export const translationQueue = TranslationQueueManager.getInstance()

// 번역 작업 추가 함수
export function addTranslationJob(
  text: string,
  targetLanguage: string,
  sessionId?: string,
  priority?: number,
  transcriptId?: string // 🆕 transcript ID 추가
): string {
  const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  
  const job: TranslationJob = {
    id: jobId,
    text,
    targetLanguage,
    sessionId,
    transcriptId, // 🆕 transcript ID 포함
    priority: priority || calculatePriority(targetLanguage, sessionId),
    status: 'pending',
    createdAt: Date.now()
  }
  
  translationQueue.addJob(job)
  return jobId
}

// 우선순위 계산
function calculatePriority(targetLanguage: string, sessionId?: string): number {
  let priority = 5
  
  if (PRIORITY_LANGUAGES.includes(targetLanguage)) {
    priority += (PRIORITY_LANGUAGES.length - PRIORITY_LANGUAGES.indexOf(targetLanguage)) * 2
  }
  
  if (sessionId) {
    priority += 10
  }
  
  return priority
} 