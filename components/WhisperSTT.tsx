'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
// @ts-ignore
import levenshtein from 'js-levenshtein'
import { createVAD, VoiceActivityDetector, VADState, audioBlobToFloat32Array } from '../lib/vad-utils'

interface WhisperSTTProps {
  sessionId: string
  isRecording: boolean
  onTranscriptUpdate: (transcript: string, isPartial: boolean) => void
  onError: (error: string) => void
  lang?: string
  vadConfig?: {
    threshold?: number
    silenceThreshold?: number
    speechThreshold?: number
    smoothingWindow?: number
    minBlobSize?: number
    enabled?: boolean // VAD 활성화/비활성화 옵션
  }
}

interface AudioSegment {
  id: string
  audioBlob: Blob
  startTime: number
  endTime: number
  queue: 'A' | 'B'
}

interface SpeechSegment {
  id: string
  audioBlob: Blob
  startTime: number
  endTime: number
  confidence: number
  duration: number
}

interface STTResult {
  id: string
  text: string
  startTime: number
  endTime: number
  confidence: number
  queue: 'A' | 'B'
  timestamp: number
}

class TextBuffer {
  private segments: STTResult[] = []
  private finalText: string = ''
  private lastSentenceEnd: number = 0
  private sessionId: string = ''

  addResult(result: STTResult) {
    // 중복 세그먼트 체크 - 같은 내용의 세그먼트가 이미 있는지 확인 (더 관대하게)
    const isDuplicate = this.segments.some(segment => {
      // 시간 겹침 체크 (더 관대하게)
      const timeOverlap = Math.abs(segment.startTime - result.startTime) < 1000 // 1초 이내
      
      // 내용 유사도 체크 (더 엄격하게)
      const similarity = this.calculateSimilarity(segment.text, result.text)
      
      return timeOverlap && similarity > 0.9 // 90% 이상 유사해야만 중복으로 간주
    })
    
    if (isDuplicate) {
      console.log('🔄 Duplicate segment detected, skipping:', result.text)
      return
    }
    
    this.segments.push(result)
    this.mergeResults()
    this.detectSentenceBoundaries()
  }

  setSessionId(sessionId: string) {
    this.sessionId = sessionId
  }

  private mergeResults() {
    // 시간순으로 정렬
    this.segments.sort((a, b) => a.startTime - b.startTime)
    
    let mergedText = ''
    let currentTime = 0
    let lastProcessedSegment: STTResult | null = null

    for (let i = 0; i < this.segments.length; i++) {
      const segment = this.segments[i]
      
      // 이전 세그먼트와 시간 겹침 체크 (더 엄격하게)
      const hasTimeOverlap = lastProcessedSegment && 
        segment.startTime < lastProcessedSegment.endTime
      
      if (hasTimeOverlap) {
        // 시간 겹침이 있는 경우 - 더 정교한 중복 제거
        const overlap = this.removeOverlapAdvanced(mergedText, segment.text, lastProcessedSegment)
        const cleanOverlap = this.cleanIncompleteWords(overlap)
        if (cleanOverlap && cleanOverlap.length > 2) {
          mergedText += ' ' + cleanOverlap
          currentTime = segment.endTime
          lastProcessedSegment = segment
        }
      } else {
        // 새로운 구간 - 겹침 없음
        mergedText += ' ' + segment.text
        currentTime = segment.endTime
        lastProcessedSegment = segment
      }
    }

    this.finalText = mergedText.trim()
  }

  private removeOverlapAdvanced(existingText: string, newText: string, lastSegment: STTResult | null): string {
    // 1. 완전 동일한 텍스트 체크
    if (existingText === newText) {
      console.log('🔄 Exact duplicate detected, skipping')
      return ''
    }
    
    // 2. 빈 텍스트나 너무 짧은 텍스트 체크
    if (!newText.trim() || newText.trim().length < 3) {
      console.log('🔄 Text too short or empty, skipping')
      return ''
    }
    
    // 3. 불완전한 단어로 시작하는지 체크 (더 엄격하게)
    const words = newText.split(' ')
    if (words[0] && (words[0].endsWith('-') || words[0].length < 2)) {
      console.log('🔄 Incomplete word at start detected, skipping')
      return ''
    }
    
    // 4. 기존 텍스트의 마지막 부분과 새로운 텍스트의 시작 부분 비교
    const existingWords = existingText.split(' ')
    const newWords = newText.split(' ')
    
    // 마지막 3-5개 단어와 새로운 텍스트의 처음 3-5개 단어 비교
    for (let i = 3; i <= Math.min(5, existingWords.length, newWords.length); i++) {
      const lastExisting = existingWords.slice(-i).join(' ')
      const firstNew = newWords.slice(0, i).join(' ')
      
      if (lastExisting === firstNew) {
        // 겹치는 부분 제거하고 나머지 반환
        const remaining = newWords.slice(i).join(' ')
        console.log(`🔄 Overlap detected: "${lastExisting}" - remaining: "${remaining}"`)
        return remaining
      }
    }
    
    // 5. 부분 겹침 검사 (더 정교하게)
    for (let i = 2; i <= Math.min(4, newWords.length); i++) {
      for (let j = 0; j <= newWords.length - i; j++) {
        const phrase = newWords.slice(j, j + i).join(' ')
        if (existingText.includes(phrase)) {
          // 겹치는 부분 제거하고 나머지 반환
          const remaining = newWords.slice(j + i).join(' ')
          console.log(`🔄 Partial overlap detected: "${phrase}" - remaining: "${remaining}"`)
          return remaining
        }
      }
    }
    
    // 6. Levenshtein 거리 기반 유사도 검사
    const similarity = this.calculateSimilarity(existingText, newText)
    if (similarity > 0.8) { // 80%로 더 관대하게
      console.log(`🔄 High similarity detected (${similarity.toFixed(2)}), skipping duplicate text`)
      return ''
    }
    
    // 7. 마지막 문장이 반복되는지 체크
    const lastSentence = this.getLastSentence(existingText)
    if (lastSentence && newText.includes(lastSentence)) {
      console.log(`🔄 Last sentence repeat detected: "${lastSentence}"`)
      return newText.replace(lastSentence, '').trim()
    }
    
    // 8. 일반적인 hallucination 패턴 체크
    const hallucinationPatterns = [
      'thank you for watching',
      'thanks for watching',
      'please like and subscribe',
      'don\'t forget to subscribe',
      'see you next time',
      'goodbye',
      'bye bye',
      'this is a live speech transcription',
      'this is a live conversation',
      'please transcribe accurately',
      'with proper spelling and punctuation',
      'use proper spelling for technical terms',
      'avoid filler words',
      'do not add any additional text'
    ]
    
    const lowerNewText = newText.toLowerCase()
    for (const pattern of hallucinationPatterns) {
      if (lowerNewText.includes(pattern)) {
        console.log(`🔄 Hallucination pattern detected: "${pattern}"`)
        return newText.replace(new RegExp(pattern, 'gi'), '').trim()
      }
    }
    
    return newText
  }

  private cleanIncompleteWords(text: string): string {
    if (!text.trim()) return ''
    
    const words = text.trim().split(' ')
    const cleanWords = []
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i]
      
      // 마지막 단어가 불완전한 경우 (하이픈으로 끝나거나 너무 짧은 경우)
      if (i === words.length - 1) {
        if (word.endsWith('-') || word.length < 2) {
          // 마지막 불완전한 단어 제거
          continue
        }
      }
      
      // 중간 단어가 불완전한 경우 (하이픈으로 끝나는 경우)
      if (word.endsWith('-') && i < words.length - 1) {
        // 다음 단어와 합쳐서 완성된 단어인지 확인
        const nextWord = words[i + 1]
        if (nextWord && !nextWord.startsWith('-')) {
          // 다음 단어와 합쳐서 완성된 단어로 처리
          cleanWords.push(word + nextWord)
          i++ // 다음 단어 건너뛰기
          continue
        }
      }
      
      cleanWords.push(word)
    }
    
    return cleanWords.join(' ')
  }

  private getLastSentence(text: string): string {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0)
    return sentences.length > 0 ? sentences[sentences.length - 1].trim() : ''
  }

  private calculateSimilarity(text1: string, text2: string): number {
    if (text1.length === 0 || text2.length === 0) return 0
    
    const distance = levenshtein(text1.toLowerCase(), text2.toLowerCase())
    const maxLength = Math.max(text1.length, text2.length)
    
    return 1 - (distance / maxLength)
  }

  private detectSentenceBoundaries() {
    // 더 정확한 문장 경계 감지
    const sentenceEndings = /[.!?]\s+/g
    const matches = [...this.finalText.matchAll(sentenceEndings)]
    
    if (matches.length > 0) {
      const lastMatch = matches[matches.length - 1]
      const sentenceEndIndex = lastMatch.index! + lastMatch[0].length
      
      if (sentenceEndIndex > this.lastSentenceEnd) {
        const newSentence = this.finalText.substring(this.lastSentenceEnd, sentenceEndIndex).trim()
        if (newSentence && newSentence.length > 5) { // 최소 길이 체크
          console.log(`📝 New sentence detected: "${newSentence}"`)
          // 새로운 문장을 DB에 저장
          this.saveSentence(newSentence)
          this.lastSentenceEnd = sentenceEndIndex
        }
      }
    }
    
    // 추가: 긴 텍스트에서 강제로 문장 분리 (마침표가 없는 경우)
    const currentPartial = this.finalText.substring(this.lastSentenceEnd).trim()
    if (currentPartial.length > 100 && !currentPartial.includes('.')) {
      // 100자 이상이고 마침표가 없으면 강제로 문장으로 처리
      console.log(`📝 Force sentence split for long text: "${currentPartial.substring(0, 50)}..."`)
      this.saveSentence(currentPartial)
      this.lastSentenceEnd = this.finalText.length
    }
  }

    private saveSentence(sentence: string) {
    // DB 저장 로직
    console.log('💾 Saving sentence:', sentence)
    
    if (!this.sessionId) {
      console.warn('⚠️ No session ID available for saving sentence')
      return
    }
    
    // 먼저 세션 시작을 확인
    fetch('/api/stt-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'start',
        sessionId: this.sessionId,
      }),
    }).then(() => {
      // 세션 시작 후 문장 저장
      return fetch('/api/stt-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'transcript',
          sessionId: this.sessionId,
          transcript: sentence,
          isPartial: false,
        }),
      })
    }).catch(error => {
      console.error('❌ Failed to save sentence:', error)
    })
  }

  getCurrentText(): string {
    return this.finalText
  }

  getPartialText(): string {
    // 마지막 문장 종료 이후의 텍스트만 반환 (부분 결과)
    return this.finalText.substring(this.lastSentenceEnd).trim()
  }
}

export function WhisperSTT({ sessionId, isRecording, onTranscriptUpdate, onError, lang = 'en', vadConfig = {} }: WhisperSTTProps) {
  const [isRecordingState, setIsRecordingState] = useState(false)
  const [status, setStatus] = useState('Initializing...')
  const [hasPermission, setHasPermission] = useState(false)
  const [vadStatus, setVadStatus] = useState<VADState | null>(null)
  
  // 세션 기반 시간 추적 (Fast Refresh 문제 해결)
  const sessionStartTimeRef = useRef<number>(0)
  const currentSessionIdRef = useRef<string>('')

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const textBufferRef = useRef<TextBuffer>(new TextBuffer())
  
  // VAD 관련 상태
  const vadRef = useRef<VoiceActivityDetector | null>(null)
  const speechBufferRef = useRef<Blob[]>([])
  const isRecordingSpeechRef = useRef(false)
  const speechStartTimeRef = useRef<number>(0)
  const lastVadUpdateRef = useRef<number>(0)
  const lastSegmentTimeRef = useRef<number | null>(null)
  
  // 중복 세그먼트 방지를 위한 Set
  const processedSegments = useRef<Set<string>>(new Set())
  const pendingRequests = useRef<Set<string>>(new Set())
  
  // 상태 관리
  const isActiveRef = useRef(false)
  const mountedRef = useRef(true)

  // VAD 기반 음성 세그먼트 처리 (VAD 비활성화 옵션)
  const processVADAudio = useCallback(async (audioBlob: Blob) => {
    if (!mountedRef.current || !isActiveRef.current) return

    // VAD 비활성화: 시간 기반 처리로 변경
    if (!vadRef.current) {
      // 기존 시간 기반 처리 방식
      audioChunksRef.current.push(audioBlob)
      
      // 10초마다 세그먼트 처리
      const currentTime = Date.now()
      if (!lastSegmentTimeRef.current) {
        lastSegmentTimeRef.current = currentTime
      }
      
      if (currentTime - lastSegmentTimeRef.current >= 10000) { // 10초
        console.log('⏰ Time-based segment processing (VAD disabled)')
        await processTimeBasedSegment()
        lastSegmentTimeRef.current = currentTime
      }
      return
    }

    try {
      // 새로운 블롭 기반 VAD 처리 (WebM/Opus 형식에 최적화)
      const vadState = vadRef.current.processAudioBlob(audioBlob)
      
      // VAD 상태 업데이트 (UI 표시용)
      if (Date.now() - lastVadUpdateRef.current > 100) { // 100ms마다 업데이트
        setVadStatus(vadState)
        lastVadUpdateRef.current = Date.now()
      }

      // 음성 시작 감지
      if (vadState.isSpeech && !isRecordingSpeechRef.current) {
        console.log('🎤 Speech detected, starting speech recording...')
        isRecordingSpeechRef.current = true
        speechStartTimeRef.current = Date.now()
        speechBufferRef.current = []
      }

      // 음성 버퍼링
      if (isRecordingSpeechRef.current) {
        speechBufferRef.current.push(audioBlob)
      }

      // 음성 종료 감지
      if (!vadState.isSpeech && isRecordingSpeechRef.current) {
        // 무음 지속 시간 체크
        if (vadState.silenceDuration >= 1.5) { // 1.5초 무음 후 음성 종료로 판단
          console.log('🔇 Speech ended, processing speech segment...')
          await processSpeechSegment()
        }
      }

      // 음성 구간이 너무 길어지면 강제로 처리 (최대 15초로 단축)
      if (isRecordingSpeechRef.current && vadState.speechDuration >= 15) {
        console.log('⏰ Speech segment too long, forcing processing...')
        await processSpeechSegment()
      }

    } catch (error) {
      // VAD 처리 오류는 무시하고 계속 진행 (오디오 녹음은 계속됨)
      console.warn('⚠️ VAD processing warning (continuing):', error)
    }
  }, [])

  // 시간 기반 세그먼트 처리 (VAD 비활성화 시)
  const processTimeBasedSegment = async () => {
    if (audioChunksRef.current.length === 0) return

    try {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
      const segmentId = `time-segment-${Date.now()}`
      
      console.log(`⏰ Processing time-based segment: ${segmentId} (${audioBlob.size} bytes)`)
      
      // Whisper API로 전송
      const segment: AudioSegment = {
        id: segmentId,
        audioBlob,
        startTime: Date.now() - 10000, // 10초 전
        endTime: Date.now(),
        queue: 'A'
      }
      
      await sendToWhisper(segment)
      
      // 버퍼 초기화
      audioChunksRef.current = []
      
    } catch (error) {
      console.error('❌ Time-based segment processing error:', error)
    }
  }

  // 음성 세그먼트 처리
  const processSpeechSegment = async () => {
    if (!isRecordingSpeechRef.current || speechBufferRef.current.length === 0) return

    try {
      const speechEndTime = Date.now()
      const speechDuration = (speechEndTime - speechStartTimeRef.current) / 1000

      // 최소 길이 체크 (1초 미만은 무시)
      if (speechDuration < 1.0) {
        console.log('⚠️ Speech segment too short, skipping...')
        resetSpeechRecording()
        return
      }

      // 음성 세그먼트 생성
      const speechSegment: SpeechSegment = {
        id: `speech-${Date.now()}`,
        audioBlob: new Blob(speechBufferRef.current, { type: 'audio/webm' }),
        startTime: speechStartTimeRef.current,
        endTime: speechEndTime,
        confidence: vadStatus?.confidence || 0.5,
        duration: speechDuration
      }

      console.log(`🎤 Processing speech segment: ${speechDuration.toFixed(1)}s, confidence: ${speechSegment.confidence.toFixed(2)}`)

      // Whisper API로 전송
      await sendSpeechToWhisper(speechSegment)

      // 음성 녹음 상태 리셋
      resetSpeechRecording()

    } catch (error) {
      console.error('❌ Speech segment processing error:', error)
      resetSpeechRecording()
    }
  }

  // 음성 녹음 상태 리셋
  const resetSpeechRecording = () => {
    isRecordingSpeechRef.current = false
    speechBufferRef.current = []
    speechStartTimeRef.current = 0
  }

  // 오디오 세그먼트 생성 - Web Audio API를 사용한 정확한 시간 기반 추출
  const createAudioSegment = async (startTime: number, endTime: number, queue: 'A' | 'B'): Promise<AudioSegment | null> => {
    const segmentStartTime = Date.now()
    
    try {
      // 중복 세그먼트 방지: 같은 시간대의 세그먼트는 건너뛰기
      const segmentKey = `${queue}-${Math.floor(startTime / 16000)}`
      if (processedSegments.current.has(segmentKey)) {
        console.log(`⏭️ Segment already processed: ${segmentKey}`)
        return null
      }
      
      // 현재까지의 모든 오디오 청크를 하나로 합치기
      const blobStartTime = Date.now()
      const fullAudioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
      const blobTime = Date.now() - blobStartTime
      
      // 최소 길이 체크 (Whisper API 요구사항)
      if (fullAudioBlob.size < 1000) {
        console.log('⚠️ Audio too small, skipping...')
        return null
      }
      
      // 최대 길이 체크 (Whisper API 제한: 25MB)
      if (fullAudioBlob.size > 25 * 1024 * 1024) {
        console.log('⚠️ Audio too large, skipping...')
        return null
      }
      
      // Web Audio API를 사용하여 정확한 시간 기반 세그먼트 추출
      const extractStartTime = Date.now()
      const audioSegment = await extractTimeSegment(fullAudioBlob, startTime, endTime)
      const extractTime = Date.now() - extractStartTime
      
      if (!audioSegment) {
        console.log('⚠️ Failed to extract time segment')
        return null
      }
      
      // 오디오 레벨 체크 - 무음 구간 필터링 (더 관대하게)
      const levelCheckStartTime = Date.now()
      const hasAudio = await checkAudioLevel(audioSegment)
      const levelCheckTime = Date.now() - levelCheckStartTime
      
      if (!hasAudio) {
        console.log('🔇 Silent segment detected, skipping Whisper API call')
        // 처리된 세그먼트로 기록하되 Whisper 호출은 하지 않음
        processedSegments.current.add(segmentKey)
        return null
      }
      
      const totalSegmentTime = Date.now() - segmentStartTime
      console.log(`📊 Audio segment created: ${queue} - Size: ${audioSegment.size} bytes, Time: ${startTime}-${endTime}ms`)
      console.log(`⏱️ Segment creation time: ${totalSegmentTime}ms (Blob: ${blobTime}ms, Extract: ${extractTime}ms, Level: ${levelCheckTime}ms)`)
      
      // 처리된 세그먼트 기록
      processedSegments.current.add(segmentKey)
      
      return {
        id: `${queue}-${Date.now()}`,
        audioBlob: audioSegment,
        startTime,
        endTime,
        queue
      }
    } catch (error) {
      const errorTime = Date.now() - segmentStartTime
      console.error(`❌ Failed to create audio segment after ${errorTime}ms:`, error)
      return null
    }
  }

  // 오디오 레벨 체크 - 무음 구간 감지
  const checkAudioLevel = async (audioBlob: Blob): Promise<boolean> => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const arrayBuffer = await audioBlob.arrayBuffer()
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
      
      // 오디오 데이터 분석
      const channelData = audioBuffer.getChannelData(0) // 첫 번째 채널
      const length = channelData.length
      
      // RMS (Root Mean Square) 계산으로 오디오 레벨 측정
      let sum = 0
      for (let i = 0; i < length; i++) {
        sum += channelData[i] * channelData[i]
      }
      const rms = Math.sqrt(sum / length)
      
      // 임계값 설정 (조정 가능)
      const threshold = 0.005 // 0.5% - 더 낮춰서 실제 음성도 감지하도록
      
      console.log(`🔊 Audio level: ${rms.toFixed(4)} (threshold: ${threshold})`)
      
      audioContext.close()
      return rms > threshold
    } catch (error) {
      console.error('❌ Audio level check failed:', error)
      // 에러 발생 시 안전하게 true 반환 (Whisper 호출 허용)
      return true
    }
  }

  // Web Audio API를 사용한 정확한 시간 기반 세그먼트 추출
  const extractTimeSegment = async (fullAudioBlob: Blob, startTime: number, endTime: number): Promise<Blob | null> => {
    try {
      // AudioContext 생성
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      
      // 오디오 파일을 ArrayBuffer로 변환
      const arrayBuffer = await fullAudioBlob.arrayBuffer()
      
      // 오디오 데이터 디코딩
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
      
      // 전체 오디오 길이 (밀리초)
      const totalDuration = (audioBuffer.length / audioBuffer.sampleRate) * 1000
      
      // 요청된 시간이 전체 오디오 길이를 초과하는지 확인
      if (startTime >= totalDuration) {
        console.log(`⚠️ Start time ${startTime}ms exceeds total duration ${totalDuration}ms`)
        audioContext.close()
        return null
      }
      
      // 실제 끝 시간 계산 (요청된 끝 시간과 전체 길이 중 작은 값)
      const actualEndTime = Math.min(endTime, totalDuration)
      
      // 샘플 인덱스 계산
      const sampleRate = audioBuffer.sampleRate
      const startSample = Math.floor(startTime / 1000 * sampleRate)
      const endSample = Math.floor(actualEndTime / 1000 * sampleRate)
      const segmentLength = endSample - startSample
      
      // 세그먼트가 너무 짧으면 건너뛰기
      if (segmentLength < sampleRate * 0.5) { // 0.5초 미만
        console.log(`⚠️ Segment too short: ${segmentLength / sampleRate}s`)
        audioContext.close()
        return null
      }
      
      // 새로운 AudioBuffer 생성 (세그먼트용)
      const segmentBuffer = audioContext.createBuffer(
        audioBuffer.numberOfChannels,
        segmentLength,
        sampleRate
      )
      
      // 각 채널의 데이터 복사
      for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
        const channelData = audioBuffer.getChannelData(channel)
        const segmentData = segmentBuffer.getChannelData(channel)
        
        for (let i = 0; i < segmentLength; i++) {
          const sourceIndex = startSample + i
          if (sourceIndex < channelData.length) {
            segmentData[i] = channelData[sourceIndex]
          }
        }
      }
      
      // AudioBuffer를 WAV Blob으로 변환
      const segmentBlob = await audioBufferToWavBlob(segmentBuffer)
      
      // AudioContext 정리
      audioContext.close()
      
      console.log(`✅ Extracted segment: ${startTime}-${actualEndTime}ms (${segmentLength / sampleRate}s) - Size: ${segmentBlob.size} bytes`)
      return segmentBlob
      
    } catch (error) {
      console.error('❌ Failed to extract time segment:', error)
      return null
    }
  }

  // AudioBuffer를 WAV Blob으로 변환
  const audioBufferToWavBlob = async (audioBuffer: AudioBuffer): Promise<Blob> => {
    const length = audioBuffer.length
    const sampleRate = audioBuffer.sampleRate
    const channels = audioBuffer.numberOfChannels
    
    // Float32Array를 Int16Array로 변환 (16비트 PCM)
    const interleaved = new Int16Array(length * channels)
    
    for (let i = 0; i < length; i++) {
      for (let channel = 0; channel < channels; channel++) {
        // Float32 (-1 to 1)를 Int16 (-32768 to 32767)로 변환
        const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(channel)[i]))
        interleaved[i * channels + channel] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF
      }
    }
    
    // WAV 파일 헤더 생성
    const wavBlob = createWavBlob(interleaved, sampleRate, channels)
    return wavBlob
  }

  // WAV Blob 생성
  const createWavBlob = (samples: Int16Array, sampleRate: number, channels: number): Blob => {
    const buffer = new ArrayBuffer(44 + samples.length * 2)
    const view = new DataView(buffer)
    
    // WAV 헤더 작성
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i))
      }
    }
    
    // RIFF 헤더
    writeString(0, 'RIFF')
    view.setUint32(4, 36 + samples.length * 2, true) // 파일 크기
    writeString(8, 'WAVE')
    
    // fmt 청크
    writeString(12, 'fmt ')
    view.setUint32(16, 16, true) // fmt 청크 크기
    view.setUint16(20, 1, true) // PCM 포맷
    view.setUint16(22, channels, true) // 채널 수
    view.setUint32(24, sampleRate, true) // 샘플레이트
    view.setUint32(28, sampleRate * channels * 2, true) // 바이트레이트
    view.setUint16(32, channels * 2, true) // 블록 얼라인
    view.setUint16(34, 16, true) // 비트퍼샘플
    
    // data 청크
    writeString(36, 'data')
    view.setUint32(40, samples.length * 2, true) // 데이터 크기
    
    // 샘플 데이터 작성
    for (let i = 0; i < samples.length; i++) {
      view.setInt16(44 + i * 2, samples[i], true)
    }
    
    return new Blob([buffer], { type: 'audio/wav' })
  }

  // 음성 세그먼트를 Whisper API로 전송
  const sendSpeechToWhisper = async (segment: SpeechSegment) => {
    const requestStartTime = Date.now()
    
    // 중복 API 호출 방지
    const requestKey = `${segment.id}-${segment.audioBlob.size}`
    if (pendingRequests.current.has(requestKey)) {
      console.log(`⏭️ Request already pending: ${requestKey}`)
      return
    }
    
    pendingRequests.current.add(requestKey)
    
    try {
      console.log(`🎤 Sending speech segment ${segment.id} to Whisper... (Size: ${segment.audioBlob.size} bytes, Duration: ${segment.duration.toFixed(1)}s)`)
      
      const formDataStartTime = Date.now()
      const formData = new FormData()
      formData.append('file', segment.audioBlob, 'speech.wav')
      formData.append('model', 'whisper-1')
      // ISO-639-1 형식으로 언어 코드 변환
      const languageCode = lang ? lang.split('-')[0] : 'en'
      formData.append('language', languageCode)
      formData.append('response_format', 'verbose_json')
      formData.append('temperature', '0.2') // 약간의 문맥 고려 허용
      const formDataTime = Date.now() - formDataStartTime
      
      console.log(`📦 FormData preparation: ${formDataTime}ms`)
      
      const apiCallStartTime = Date.now()
      const response = await fetch('/api/whisper', {
        method: 'POST',
        body: formData,
      })
      
      if (!response.ok) {
        throw new Error(`Whisper API error: ${response.status}`)
      }
      
      const result = await response.json()
      const apiCallTime = Date.now() - apiCallStartTime
      
      console.log(`⏱️ Whisper API call completed: ${apiCallTime}ms`)
      
      // 프롬프트 텍스트 필터링
      const filteringStartTime = Date.now()
      let filteredText = result.text
      
      const promptPatterns = [
        'thankyou',
        'This is a live speech transcription',
        'Use proper grammar',
        'Transcribe exactly what is spoken',
        'Use proper spelling',
        'Avoid filler words',
        'Use proper punctuation'
      ]
      
      for (const pattern of promptPatterns) {
        filteredText = filteredText.replace(new RegExp(pattern, 'gi'), '').trim()
      }
      
      // 반복 텍스트 필터링 강화
      const repetitivePatterns = [
        /(\b\w+\b)(?:\s+\1){2,}/gi, // 같은 단어가 3번 이상 반복
        /(\b\w+\s+\w+\b)(?:\s+\1){1,}/gi, // 같은 2단어 조합이 2번 이상 반복
        /(\b\w+\s+\w+\s+\w+\b)(?:\s+\1){1,}/gi, // 같은 3단어 조합이 2번 이상 반복
      ]
      
      for (const pattern of repetitivePatterns) {
        filteredText = filteredText.replace(pattern, (match: string, group: string) => {
          // 반복을 제거하고 원본 그룹만 유지
          return group
        })
      }
      
      // 특정 반복 패턴 직접 제거 (더 엄격하게)
      const specificRepetitions = [
        /korean\s+war/gi,
        /and\s+then/gi,
        /squeak\s+and\s+ding/gi,
        /amen/gi,
        /door/gi,
        /for\s+free/gi,
        /doing\s+it/gi,
        /yeah/gi,
        /okay/gi,
        /hello/gi,
        /hi/gi,
        /um/gi,
        /uh/gi,
        /ah/gi,
        /oh/gi
      ]
      
      for (const pattern of specificRepetitions) {
        filteredText = filteredText.replace(pattern, (match: string) => {
          // 첫 번째 발생만 유지하고 나머지는 제거
          const words = match.split(/\s+/)
          return words[0] + (words[1] ? ' ' + words[1] : '')
        })
      }
      
      // 과도한 반복 텍스트 완전 제거
      const excessiveRepetitions = [
        /^(yeah\s*){3,}$/gi,
        /^(okay\s*){3,}$/gi,
        /^(hello\s*){3,}$/gi,
        /^(hi\s*){3,}$/gi,
        /^(hello,\s*hello\s*){5,}/gi,
        /^(hello\s*hello\s*){5,}/gi,
        /^(I'm going to go ahead and get started\s*){2,}/gi
      ]
      
      for (const pattern of excessiveRepetitions) {
        if (pattern.test(filteredText)) {
          console.log('⚠️ Excessive repetition detected, skipping text')
          pendingRequests.current.delete(requestKey)
          return
        }
      }
      
      // 특정 반복 구문 완전 제거
      if (filteredText.includes('hello, hello, hello, hello, hello, hello, hello, hello, hello, hello, hello, hello, hello, hello, hello, hello')) {
        console.log('⚠️ Excessive hello repetition detected, skipping text')
        pendingRequests.current.delete(requestKey)
        return
      }
      
      // scratching noises 반복 제거
      if (filteredText.includes('**scratching noises** **scratching noises** **scratching noises**')) {
        console.log('⚠️ Excessive scratching noises detected, skipping text')
        pendingRequests.current.delete(requestKey)
        return
      }
      
      // 불완전한 단어들로 시작하는 텍스트 제거
      if (/^[A-Za-z]\s/.test(filteredText) && filteredText.length < 10) {
        console.log('⚠️ Incomplete word at start detected, skipping text')
        pendingRequests.current.delete(requestKey)
        return
      }
      
      // 빈 텍스트나 너무 짧은 텍스트 체크
      if (!filteredText || filteredText.length < 1) {
        console.log('⚠️ Empty or too short text after filtering')
        pendingRequests.current.delete(requestKey)
        return
      }
      
      const filteringTime = Date.now() - filteringStartTime
      console.log(`🔍 Text filtering: ${filteringTime}ms`)
      
      // STT 결과 처리
      const processingStartTime = Date.now()
      const sttResult: STTResult = {
        id: segment.id,
        text: filteredText,
        startTime: segment.startTime,
        endTime: segment.endTime,
        confidence: result.confidence || segment.confidence,
        queue: 'A', // VAD 기반이므로 단일 큐
        timestamp: Date.now()
      }
      
      // 텍스트 버퍼에 추가
      textBufferRef.current.addResult(sttResult)
      
      // UI 업데이트
      const currentText = textBufferRef.current.getCurrentText()
      const partialText = textBufferRef.current.getPartialText()
      
      onTranscriptUpdate(currentText, partialText.length > 0)
      
      const processingTime = Date.now() - processingStartTime
      const totalTime = Date.now() - requestStartTime
      
      console.log(`✅ Whisper result for ${segment.id}: "${filteredText}"`)
      console.log(`⏱️ Total processing time: ${totalTime}ms (API: ${apiCallTime}ms, Filter: ${filteringTime}ms, Process: ${processingTime}ms)`)
      
      // 요청 완료 후 pendingRequests에서 제거
      pendingRequests.current.delete(requestKey)
      // 중요: audioChunksRef 초기화 (누적 방지)
      audioChunksRef.current = []
      
    } catch (error) {
      const errorTime = Date.now() - requestStartTime
      
      // 서버 연결 오류인 경우 특별 처리
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        console.error(`❌ Server connection error after ${errorTime}ms:`, error.message)
        onError('Server connection failed. Please check if the development server is running.')
      } else {
        console.error(`❌ Whisper API error after ${errorTime}ms:`, error)
        onError(`Whisper API error: ${error}`)
      }
      
      // 에러 발생 시에도 pendingRequests에서 제거
      pendingRequests.current.delete(requestKey)
      // 중요: audioChunksRef 초기화 (누적 방지)
      audioChunksRef.current = []
    }
  }

  // Whisper API로 전송 (기존 호환성을 위한 래퍼)
  const sendToWhisper = async (segment: AudioSegment) => {
    const requestStartTime = Date.now()
    
    // 중복 API 호출 방지
    const requestKey = `${segment.id}-${segment.audioBlob.size}`
    if (pendingRequests.current.has(requestKey)) {
      console.log(`⏭️ Request already pending: ${requestKey}`)
      return
    }
    
    pendingRequests.current.add(requestKey)
    
    try {
      console.log(`🎤 Sending segment ${segment.id} to Whisper... (Size: ${segment.audioBlob.size} bytes)`)
      
      const formDataStartTime = Date.now()
      const formData = new FormData()
      formData.append('file', segment.audioBlob, 'audio.wav')
      formData.append('model', 'whisper-1')
      // ISO-639-1 형식으로 언어 코드 변환
      const languageCode = lang ? lang.split('-')[0] : 'en'
      formData.append('language', languageCode)
      formData.append('response_format', 'verbose_json')
      // 프롬프트 제거 - "Use proper grammar" 문제 해결
      // formData.append('prompt', 'This is a live conversation. Transcribe exactly what is spoken. Use proper spelling for technical terms like "ChatGPT", "AI", "machine learning", "artificial intelligence". Avoid filler words like "um", "uh", "like". Use proper punctuation. Do not add any additional text or commentary.')
      formData.append('temperature', '0.2') // 약간의 문맥 고려 허용
      const formDataTime = Date.now() - formDataStartTime
      
      console.log(`📦 FormData preparation: ${formDataTime}ms`)
      
      const apiCallStartTime = Date.now()
      const response = await fetch('/api/whisper', {
        method: 'POST',
        body: formData,
      })
      
      if (!response.ok) {
        throw new Error(`Whisper API error: ${response.status}`)
      }
      
      const result = await response.json()
      const apiCallTime = Date.now() - apiCallStartTime
      
              console.log(`⏱️ Whisper API call completed: ${apiCallTime}ms`)
        
        // 프롬프트 텍스트 필터링
        const filteringStartTime = Date.now()
        let filteredText = result.text
        
        const promptPatterns = [
          'thankyou',
          'This is a live speech transcription',
          'Use proper grammar',
          'Transcribe exactly what is spoken',
          'Use proper spelling',
          'Avoid filler words',
          'Use proper punctuation'
        ]
        
        for (const pattern of promptPatterns) {
          filteredText = filteredText.replace(new RegExp(pattern, 'gi'), '').trim()
        }
      
      // 반복 텍스트 필터링 강화
      const repetitivePatterns = [
        /(\b\w+\b)(?:\s+\1){2,}/gi, // 같은 단어가 3번 이상 반복
        /(\b\w+\s+\w+\b)(?:\s+\1){1,}/gi, // 같은 2단어 조합이 2번 이상 반복
        /(\b\w+\s+\w+\s+\w+\b)(?:\s+\1){1,}/gi, // 같은 3단어 조합이 2번 이상 반복
      ]
      
      for (const pattern of repetitivePatterns) {
        filteredText = filteredText.replace(pattern, (match: string, group: string) => {
          // 반복을 제거하고 원본 그룹만 유지
          return group
        })
      }
      
      // 특정 반복 패턴 직접 제거 (더 엄격하게)
      const specificRepetitions = [
        /korean\s+war/gi,
        /and\s+then/gi,
        /squeak\s+and\s+ding/gi,
        /amen/gi,
        /door/gi,
        /for\s+free/gi,
        /doing\s+it/gi,
        /yeah/gi,
        /okay/gi,
        /hello/gi,
        /hi/gi,
        /um/gi,
        /uh/gi,
        /ah/gi,
        /oh/gi
      ]
      
      for (const pattern of specificRepetitions) {
        filteredText = filteredText.replace(pattern, (match: string) => {
          // 첫 번째 발생만 유지하고 나머지는 제거
          const words = match.split(/\s+/)
          return words[0] + (words[1] ? ' ' + words[1] : '')
        })
      }
      
      // 과도한 반복 텍스트 완전 제거
      const excessiveRepetitions = [
        /^(yeah\s*){3,}$/gi,
        /^(okay\s*){3,}$/gi,
        /^(hello\s*){3,}$/gi,
        /^(hi\s*){3,}$/gi,
        /^(hello,\s*hello\s*){5,}/gi,
        /^(hello\s*hello\s*){5,}/gi,
        /^(I'm going to go ahead and get started\s*){2,}/gi
      ]
      
      for (const pattern of excessiveRepetitions) {
        if (pattern.test(filteredText)) {
          console.log('⚠️ Excessive repetition detected, skipping text')
          pendingRequests.current.delete(requestKey)
          return
        }
      }
      
      // 특정 반복 구문 완전 제거
      if (filteredText.includes('hello, hello, hello, hello, hello, hello, hello, hello, hello, hello, hello, hello, hello, hello, hello, hello')) {
        console.log('⚠️ Excessive hello repetition detected, skipping text')
        pendingRequests.current.delete(requestKey)
        return
      }
      
      // scratching noises 반복 제거
      if (filteredText.includes('**scratching noises** **scratching noises** **scratching noises**')) {
        console.log('⚠️ Excessive scratching noises detected, skipping text')
        pendingRequests.current.delete(requestKey)
        return
      }
      
      // 불완전한 단어들로 시작하는 텍스트 제거
      if (/^[A-Za-z]\s/.test(filteredText) && filteredText.length < 10) {
        console.log('⚠️ Incomplete word at start detected, skipping text')
        pendingRequests.current.delete(requestKey)
        return
      }
      
      // 빈 텍스트나 너무 짧은 텍스트 체크
      if (!filteredText || filteredText.length < 1) {
        console.log('⚠️ Empty or too short text after filtering')
        pendingRequests.current.delete(requestKey)
        return
      }
        
                 const filteringTime = Date.now() - filteringStartTime
         console.log(`🔍 Text filtering: ${filteringTime}ms`)
      
      // STT 결과 처리
      const processingStartTime = Date.now()
      const sttResult: STTResult = {
        id: segment.id,
        text: filteredText,
        startTime: segment.startTime,
        endTime: segment.endTime,
        confidence: result.confidence || 0.8,
        queue: segment.queue,
        timestamp: Date.now()
      }
      
      // 텍스트 버퍼에 추가
      textBufferRef.current.addResult(sttResult)
      
      // UI 업데이트
      const currentText = textBufferRef.current.getCurrentText()
      const partialText = textBufferRef.current.getPartialText()
      
      onTranscriptUpdate(currentText, partialText.length > 0)
      
      const processingTime = Date.now() - processingStartTime
      const totalTime = Date.now() - requestStartTime
      
      console.log(`✅ Whisper result for ${segment.id}: "${filteredText}"`)
      console.log(`⏱️ Total processing time: ${totalTime}ms (API: ${apiCallTime}ms, Filter: ${filteringTime}ms, Process: ${processingTime}ms)`)
      
      // 요청 완료 후 pendingRequests에서 제거
      pendingRequests.current.delete(requestKey)
      // 중요: audioChunksRef 초기화 (누적 방지)
      audioChunksRef.current = []
      
    } catch (error) {
      const errorTime = Date.now() - requestStartTime
      
      // 서버 연결 오류인 경우 특별 처리
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        console.error(`❌ Server connection error after ${errorTime}ms:`, error.message)
        onError('Server connection failed. Please check if the development server is running.')
      } else {
        console.error(`❌ Whisper API error after ${errorTime}ms:`, error)
        onError(`Whisper API error: ${error}`)
      }
      
      // 에러 발생 시에도 pendingRequests에서 제거
      pendingRequests.current.delete(requestKey)
      // 중요: audioChunksRef 초기화 (누적 방지)
      audioChunksRef.current = []
    }
  }

  // 마이크 권한 요청
  const requestMicrophonePermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      })
      
      setHasPermission(true)
      setStatus('Permission granted')
      
      // MediaRecorder 설정 - 더 나은 품질로 설정
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 128000 // 128kbps for better quality
      })
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
          // VAD 처리를 위해 즉시 전달
          processVADAudio(event.data)
        }
      }
      
      mediaRecorderRef.current = mediaRecorder
      
      return true
    } catch (error) {
      console.error('❌ Microphone permission error:', error)
      setHasPermission(false)
      setStatus('Permission denied')
      onError('Microphone permission denied')
      return false
    }
  }

  // 녹음 시작
  const startRecording = async () => {
    if (!hasPermission) {
      const granted = await requestMicrophonePermission()
      if (!granted) {
        onError('Microphone permission denied')
        return
      }
    }

    if (!mediaRecorderRef.current) {
      onError('MediaRecorder not initialized')
      return
    }

    try {
      // MediaRecorder 상태 확인 및 정리
      if (mediaRecorderRef.current.state === 'recording') {
        console.log('🔄 MediaRecorder is already recording, stopping first...')
        mediaRecorderRef.current.stop()
        // 잠시 대기 후 다시 시작
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      // 세션 초기화
      console.log(`🚀 Initializing STT session: ${sessionId}`)
      await fetch('/api/stt-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'start',
          sessionId: sessionId,
        }),
      })

      // 텍스트 버퍼에 세션 ID 설정
      textBufferRef.current.setSessionId(sessionId)
      
      // 세션 기반 초기화
      if (currentSessionIdRef.current !== sessionId) {
        console.log(`🔄 New session detected, initializing VAD: ${sessionId}`)
        sessionStartTimeRef.current = Date.now()
        currentSessionIdRef.current = sessionId
        
        // VAD 활성화 (안정적인 설정으로)
        vadRef.current = createVAD({
          sampleRate: 16000,
          threshold: 0.8, // 매우 엄격한 임계값 (80% 이상)
          silenceThreshold: 3.0, // 3초 무음 후 종료
          speechThreshold: 2.0, // 2초 이상 음성 요구
          smoothingWindow: 10, // 더 큰 윈도우로 안정화
          minBlobSize: 5000 // 5KB 이상이면 음성으로 간주 (매우 엄격)
        })
        console.log('🎤 VAD enabled with very strict settings')
      }
      
      // 녹음 시작
      audioChunksRef.current = []
      processedSegments.current.clear()
      pendingRequests.current.clear()
      
      // VAD 상태 리셋
      if (vadRef.current) {
        vadRef.current.reset()
      }
      resetSpeechRecording()
      
      isActiveRef.current = true
      setIsRecordingState(true)
      setStatus('Recording with VAD...')
      
      // MediaRecorder 상태 재확인 후 시작
      if (mediaRecorderRef.current.state === 'inactive') {
        mediaRecorderRef.current.start(500) // 500ms마다 데이터 수집 (더 빠른 VAD 처리)
      } else {
        console.log('⚠️ MediaRecorder not in inactive state, recreating...')
        // MediaRecorder 재생성
        const stream = mediaRecorderRef.current.stream
        const newMediaRecorder = new MediaRecorder(stream, {
          mimeType: 'audio/webm;codecs=opus',
          audioBitsPerSecond: 128000
        })
        
        newMediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data)
            // VAD 처리를 위해 즉시 전달
            processVADAudio(event.data)
          }
        }
        
        mediaRecorderRef.current = newMediaRecorder
        mediaRecorderRef.current.start(500)
      }
      
      console.log('🎤 Recording started with Whisper STT')
      
    } catch (error) {
      console.error('❌ Failed to start recording:', error)
      onError(`Failed to start recording: ${error}`)
    }
  }

  // 녹음 중지
  const stopRecording = () => {
    if (!isActiveRef.current) return

    console.log('🛑 Stopping Whisper STT recording...')
    
    isActiveRef.current = false
    setIsRecordingState(false)
    setStatus('Stopped')

    // MediaRecorder 정지
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }

    // 진행 중인 음성 세그먼트 처리
    if (isRecordingSpeechRef.current && speechBufferRef.current.length > 0) {
      console.log('🔄 Processing final speech segment...')
      processSpeechSegment().then(() => {
        // 세션 종료
        fetch('/api/stt-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'end',
            sessionId: sessionId,
          }),
        }).catch(error => {
          console.error('❌ Failed to end session:', error)
        })
      })
    } else {
      // 세션 종료
      fetch('/api/stt-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'end',
          sessionId: sessionId,
        }),
      }).catch(error => {
        console.error('❌ Failed to end session:', error)
      })
    }

    console.log('✅ Whisper STT recording stopped')
  }

  // 세션 상태 변경 처리
  useEffect(() => {
    if (isRecording && sessionId) {
      isActiveRef.current = true
      textBufferRef.current.setSessionId(sessionId)
      startRecording()
    } else if (!isRecording) {
      isActiveRef.current = false
      stopRecording()
    }
  }, [isRecording, sessionId])

  // 컴포넌트 마운트/언마운트 관리
  useEffect(() => {
    mountedRef.current = true
    
    // Fast Refresh 문제 방지: 세션 기반 초기화
    sessionStartTimeRef.current = 0
    currentSessionIdRef.current = ''
    
    return () => {
      mountedRef.current = false
      // 정리 작업
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        try {
          mediaRecorderRef.current.stop()
        } catch (error) {
          console.log('MediaRecorder stop error during cleanup:', error)
        }
      }
      
      // VAD 정리
      if (vadRef.current) {
        vadRef.current.reset()
      }
      
      // 상태 초기화
      isActiveRef.current = false
      audioChunksRef.current = []
      speechBufferRef.current = []
      processedSegments.current.clear()
      pendingRequests.current.clear()
      resetSpeechRecording()
    }
  }, [])

  // isRecording prop 변경 시 처리
  useEffect(() => {
    if (!mountedRef.current) return
    
    if (isRecording && !isRecordingState) {
      console.log('🎤 Starting recording (prop changed)')
      startRecording()
    } else if (!isRecording && isRecordingState) {
      console.log('🛑 Stopping recording (prop changed)')
      stopRecording()
    }
  }, [isRecording, isRecordingState])

  return (
    <div className='space-y-3'>
      {/* Status Display */}
      <div className='flex items-center space-x-2 text-sm'>
        <div
          className={`h-3 w-3 rounded-full ${
            isRecording ? 'animate-pulse bg-green-500' : hasPermission ? 'bg-yellow-500' : 'bg-gray-500'
          }`}
        />
        <span
          className={isRecording ? 'font-medium text-green-600' : hasPermission ? 'text-yellow-600' : 'text-gray-600'}
        >
          {isRecording ? '🎤 Recording with VAD + Whisper' : status}
        </span>
        <span className='rounded bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700'>VAD + Whisper-1</span>
      </div>

      {/* VAD Status */}
      {isRecording && (
        <div className='rounded border bg-green-50 p-2 text-xs'>
          {vadRef.current ? (
            // VAD 활성화 상태
            vadStatus && (
              <>
                <div className='flex items-center justify-between'>
                  <span className='font-medium text-green-800'>
                    {vadStatus.isSpeech ? '🎤 Speech Detected' : '🔇 Listening for Speech'}
                  </span>
                  <span className='text-green-700'>
                    Confidence: {(vadStatus.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <div className='mt-1 text-green-700'>
                  <span>Duration: {vadStatus.duration.toFixed(1)}s</span>
                  {vadStatus.isSpeech && (
                    <span className='ml-2'>• Speech: {vadStatus.speechDuration.toFixed(1)}s</span>
                  )}
                  {!vadStatus.isSpeech && (
                    <span className='ml-2'>• Silence: {vadStatus.silenceDuration.toFixed(1)}s</span>
                  )}
                </div>
                <div className='mt-1 text-xs text-green-600'>
                  {vadStatus.isSpeech ? 'Recording speech segment...' : 'Waiting for speech...'}
                </div>
                <div className='mt-1 text-xs text-orange-600'>
                  VAD: Active • Threshold: 80% • Min Size: 5KB • Min Duration: 2s
                </div>
              </>
            )
          ) : (
            // VAD 비활성화 상태 (fallback)
            <>
              <div className='flex items-center justify-between'>
                <span className='font-medium text-blue-800'>
                  ⏰ Time-based Processing
                </span>
                <span className='text-blue-700'>
                  Every 10s
                </span>
              </div>
              <div className='mt-1 text-blue-700'>
                <span>Processing: Fixed 10-second segments</span>
              </div>
              <div className='mt-1 text-xs text-blue-600'>
                VAD: Disabled • Using traditional time-based approach
              </div>
            </>
          )}
        </div>
      )}

      {/* Controls */}
      {!hasPermission && (
        <button
          onClick={requestMicrophonePermission}
          className='w-full rounded-lg bg-blue-100 px-3 py-2 text-sm text-blue-800 hover:bg-blue-200'
        >
          🎤 Grant Microphone Permission
        </button>
      )}

      {/* Debug Info */}
      {process.env.NODE_ENV === 'development' && (
        <div className='rounded border bg-gray-50 p-2 text-xs'>
          <p className='text-gray-600'>🔍 Debug Info:</p>
          <p className='text-gray-600'>• Permission: {hasPermission ? 'Granted' : 'Not granted'}</p>
          <p className='text-gray-600'>• Recording: {isRecording ? 'Yes' : 'No'}</p>
          <p className='text-gray-600'>• Session: {sessionId || 'None'}</p>
          <p className='text-gray-600'>• Active: {isActiveRef.current ? 'Yes' : 'No'}</p>
          <p className='text-gray-600'>• VAD: {vadRef.current ? 'Active (strict settings)' : 'Not initialized'}</p>
          <p className='text-gray-600'>• Speech Recording: {isRecordingSpeechRef.current ? 'Yes' : 'No'}</p>
          <p className='text-gray-600'>• Status: {status}</p>
        </div>
      )}
    </div>
  )
} 