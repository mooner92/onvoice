import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// 🎯 문장 완성도 체크 함수들 (엄격하게)
export function isCompleteSentence(text: string): boolean {
  if (!text || text.trim().length === 0) return false
  
  const trimmedText = text.trim()
  
  // 🎯 엄격한 완성도 체크
  // 1. 문장 끝 부호 체크 (필수)
  const sentenceEndings = ['.', '!', '?', '。', '！', '？']
  const hasEnding = sentenceEndings.some(ending => trimmedText.endsWith(ending))
  
  // 2. 최소 길이 체크 (더 엄격하게)
  const minLength = 8 // 최소 8자 이상
  const hasMinLength = trimmedText.length >= minLength
  
  // 3. 기본적인 문장 구조 체크 (더 엄격하게)
  const hasSubjectVerb = /[A-Za-z가-힣]+\s+[A-Za-z가-힣]+/.test(trimmedText) || 
                        trimmedText.split(' ').length >= 3 // 3단어 이상
  
  // 4. 특별한 패턴 체크 (완전한 인사말만)
  const specialPatterns = [
    /^(hello,?\s+everyone\.?|hi,?\s+everyone\.?|hey,?\s+everyone\.?)$/i,
    /^(good\s+morning|good\s+afternoon|good\s+evening)$/i,
    /^(thank\s+you\s+very\s+much\.?|thanks\s+a\s+lot\.?)$/i,
    /^(안녕하세요\.?|안녕하셨습니까\.?)$/,
    /^(감사합니다\.?|고맙습니다\.?)$/
  ]
  const isSpecialPattern = specialPatterns.some(pattern => {
    const match = pattern.test(trimmedText)
    return Boolean(match)
  })
  
  // 완전한 문장 조건: 끝 부호가 있고, 충분히 길고, 문장 구조가 있거나, 특별한 패턴
  return (hasEnding && hasMinLength && hasSubjectVerb) || 
         (hasEnding && isSpecialPattern)
}



// 문장을 완전한 문장들로 분리
export function splitIntoCompleteSentences(text: string): string[] {
  if (!text || text.trim().length === 0) return []
  
  // 문장 끝 부호로 분리
  const sentences = text.split(/(?<=[.!?。！？])\s+/)
  
  // 완전한 문장만 필터링
  return sentences.filter(sentence => isCompleteSentence(sentence))
}

// 중복 제거된 완전한 문장들 반환
export function getUniqueCompleteSentences(texts: string[]): string[] {
  const completeSentences = new Set<string>()
  
  for (const text of texts) {
    const sentences = splitIntoCompleteSentences(text)
    for (const sentence of sentences) {
      const normalized = sentence.trim().toLowerCase()
      completeSentences.add(normalized)
    }
  }
  
  return Array.from(completeSentences).map(s => s.trim())
}

// 문장 정규화 (비교용)
export function normalizeSentence(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ') // 여러 공백을 하나로
    .replace(/[^\w\s가-힣]/g, '') // 특수문자 제거 (비교용)
}

// 문장 유사도 체크
export function isSimilarSentence(text1: string, text2: string, threshold: number = 0.8): boolean {
  const normalized1 = normalizeSentence(text1)
  const normalized2 = normalizeSentence(text2)
  
  if (normalized1 === normalized2) return true
  
  // 부분 문자열 포함 체크
  if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
    return true
  }
  
  // 단어 기반 유사도 체크
  const words1 = normalized1.split(/\s+/)
  const words2 = normalized2.split(/\s+/)
  
  const commonWords = words1.filter(word => words2.includes(word))
  const similarity = commonWords.length / Math.max(words1.length, words2.length)
  
  return similarity >= threshold
}

// 🎯 간단한 로컬 문법 체크 (Gemini API 호출 줄이기)
export function simpleGrammarFix(text: string): string {
  if (!text || text.trim().length === 0) return text
  
  let fixed = text.trim()
  
  // 1. 이중 공백 제거
  fixed = fixed.replace(/\s+/g, ' ')
  
  // 2. 문장 시작 대문자
  fixed = fixed.replace(/^[a-z]/, (match) => match.toUpperCase())
  
  // 3. 문장 끝 부호 추가 (없는 경우)
  if (!fixed.match(/[.!?。！？]$/)) {
    // 문장 끝 패턴 체크
    const sentenceEndPatterns = [
      /(?:thank you|thanks|bye|goodbye|see you|that's all|that is all)$/i,
      /(?:입니다|니다|습니다|습니다|입니다|입니다|입니다|입니다|입니다|입니다)$/,
      /(?:입니다|니다|습니다|습니다|입니다|입니다|입니다|입니다|입니다|입니다)$/,
    ]
    
    const needsPeriod = sentenceEndPatterns.some(pattern => Boolean(pattern.test(fixed)))
    if (needsPeriod) {
      fixed += '.'
    }
  }
  
  // 4. 기본적인 문법 패턴 수정
  fixed = fixed
    .replace(/\bi\b/g, 'I') // 'i'를 'I'로
    .replace(/\bim\b/g, "I'm") // 'im'을 "I'm"으로
    .replace(/\bive\b/g, "I've") // 'ive'를 "I've"로
    .replace(/\bid\b/g, "I'd") // 'id'를 "I'd"로
    .replace(/\baint\b/g, "ain't") // 'aint'를 "ain't"로
    .replace(/\bgonna\b/g, "going to") // 'gonna'를 "going to"로
    .replace(/\bwanna\b/g, "want to") // 'wanna'를 "want to"로
    .replace(/\bgotta\b/g, "got to") // 'gotta'를 "got to"로
  
  return fixed
}

// 🎯 Gemini API 사용 여부 결정
export function shouldUseGemini(text: string): boolean {
  if (!text || text.trim().length < 10) return false
  
  const needsComplexCorrection = 
    text.includes('  ') || // 이중 공백
    !text.match(/[.!?。！？]$/) || // 문장 끝 부호 없음
    text.match(/[A-Za-z가-힣]{50,}/) || // 너무 긴 단어
    text.split(' ').length > 5 || // 5단어 이상
    text.match(/\b(?:im|ive|id|aint|gonna|wanna|gotta)\b/i) || // 비표준 축약형
    text.match(/[A-Z]{3,}/) || // 연속 대문자
    text.match(/[a-z]{20,}/) || // 연속 소문자
    text.includes('??') || // 연속 물음표
    text.includes('!!') // 연속 느낌표
  
  return needsComplexCorrection
}

// 🎯 프롬프트 캐시 (중복 요청 방지)
const promptCache = new Map<string, string>()

export function getCachedPrompt(text: string): string | null {
  const normalizedText = text.trim().toLowerCase()
  return promptCache.get(normalizedText) || null
}

export function setCachedPrompt(text: string, correctedText: string): void {
  const normalizedText = text.trim().toLowerCase()
  promptCache.set(normalizedText, correctedText)
  
  // 캐시 크기 제한 (메모리 절약)
  if (promptCache.size > 1000) {
    const firstKey = promptCache.keys().next().value
    if (firstKey) {
      promptCache.delete(firstKey)
    }
  }
}

// 🎯 캐시 통계
export function getPromptCacheStats(): { size: number; hitRate: number } {
  return {
    size: promptCache.size,
    hitRate: 0 // TODO: 히트율 계산 로직 추가
  }
}
