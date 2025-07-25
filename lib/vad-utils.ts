// VAD (Voice Activity Detection) Utilities
// 실시간 오디오 스트림에서 음성 활동을 감지하는 기능

export interface VADConfig {
  sampleRate: number
  frameSize: number // 분석 프레임 크기 (샘플 수)
  threshold: number // 음성 감지 임계값 (0-1)
  silenceThreshold: number // 무음 감지 임계값 (초)
  speechThreshold: number // 음성 감지 임계값 (초)
  smoothingWindow: number // 스무딩 윈도우 크기
  minBlobSize: number // 최소 오디오 블롭 크기 (바이트)
}

export interface VADState {
  isSpeech: boolean
  confidence: number
  duration: number
  lastSpeechTime: number
  silenceDuration: number
  speechDuration: number
}

export class VoiceActivityDetector {
  private config: VADConfig
  private state: VADState
  private blobSizeHistory: number[] = []
  private lastBlobTime: number = 0

  constructor(config: Partial<VADConfig> = {}) {
    this.config = {
      sampleRate: 16000,
      frameSize: 512,
      threshold: 0.15,
      silenceThreshold: 0.5,
      speechThreshold: 0.3,
      smoothingWindow: 5,
      minBlobSize: 1000, // 1KB 이상이면 음성으로 간주
      ...config
    }

    this.state = {
      isSpeech: false,
      confidence: 0,
      duration: 0,
      lastSpeechTime: 0,
      silenceDuration: 0,
      speechDuration: 0
    }
  }

  // 오디오 블롭 기반 VAD 처리 (WebM/Opus 형식에 최적화)
  processAudioBlob(audioBlob: Blob): VADState {
    const now = Date.now()
    
    // 블롭 크기 히스토리에 추가
    this.blobSizeHistory.push(audioBlob.size)
    
    // 히스토리 크기 제한
    if (this.blobSizeHistory.length > this.config.smoothingWindow) {
      this.blobSizeHistory.shift()
    }
    
    // 평균 블롭 크기 계산
    const avgBlobSize = this.blobSizeHistory.reduce((a, b) => a + b, 0) / this.blobSizeHistory.length
    
    // 음성 감지 신뢰도 계산 (블롭 크기 기반)
    const sizeRatio = avgBlobSize / this.config.minBlobSize
    const confidence = Math.min(sizeRatio, 1)
    
    // 음성/무음 판단 (더 엄격한 조건)
    const wasSpeech = this.state.isSpeech
    const isSpeechNow = confidence > this.config.threshold && avgBlobSize > this.config.minBlobSize * 0.8
    
    if (isSpeechNow && !wasSpeech) {
      // 음성 시작 (최소 지속 시간 확인)
      this.state.isSpeech = true
      this.state.lastSpeechTime = now
      this.state.speechDuration = 0
      this.state.silenceDuration = 0
    } else if (!isSpeechNow && wasSpeech) {
      // 음성 종료
      this.state.isSpeech = false
      this.state.silenceDuration = 0
    }
    
    // 지속 시간 업데이트
    if (this.state.isSpeech) {
      this.state.speechDuration = (now - this.state.lastSpeechTime) / 1000
    } else {
      this.state.silenceDuration += 0.5 // 블롭 간격 추정
    }
    
    this.state.confidence = confidence
    this.state.duration = this.state.isSpeech ? this.state.speechDuration : this.state.silenceDuration
    this.lastBlobTime = now
    
    return { ...this.state }
  }

  // 기존 Float32Array 기반 처리 (호환성을 위해 유지)
  processAudio(audioData: Float32Array): VADState {
    const now = Date.now()
    
    // 에너지 계산 (RMS)
    let sum = 0
    for (let i = 0; i < audioData.length; i++) {
      sum += audioData[i] * audioData[i]
    }
    const energy = Math.sqrt(sum / audioData.length)
    
    // 음성 감지 신뢰도 계산
    const confidence = Math.min(energy / this.config.threshold, 1)
    
    // 음성/무음 판단
    const wasSpeech = this.state.isSpeech
    const isSpeechNow = confidence > this.config.threshold
    
    if (isSpeechNow && !wasSpeech) {
      // 음성 시작
      this.state.isSpeech = true
      this.state.lastSpeechTime = now
      this.state.speechDuration = 0
      this.state.silenceDuration = 0
    } else if (!isSpeechNow && wasSpeech) {
      // 음성 종료
      this.state.isSpeech = false
      this.state.silenceDuration = 0
    }
    
    // 지속 시간 업데이트
    if (this.state.isSpeech) {
      this.state.speechDuration = (now - this.state.lastSpeechTime) / 1000
    } else {
      this.state.silenceDuration += 0.1 // 프레임 간격 추정
    }
    
    this.state.confidence = confidence
    this.state.duration = this.state.isSpeech ? this.state.speechDuration : this.state.silenceDuration
    
    return { ...this.state }
  }

  // 음성 구간이 완료되었는지 확인
  isSpeechComplete(): boolean {
    return this.state.isSpeech && this.state.speechDuration >= this.config.speechThreshold
  }

  // 무음 구간이 완료되었는지 확인
  isSilenceComplete(): boolean {
    return !this.state.isSpeech && this.state.silenceDuration >= this.config.silenceThreshold
  }

  // 현재 상태 리셋
  reset(): void {
    this.state = {
      isSpeech: false,
      confidence: 0,
      duration: 0,
      lastSpeechTime: 0,
      silenceDuration: 0,
      speechDuration: 0
    }
    this.blobSizeHistory = []
    this.lastBlobTime = 0
  }

  // 설정 업데이트
  updateConfig(newConfig: Partial<VADConfig>): void {
    this.config = { ...this.config, ...newConfig }
  }
}

// VAD 팩토리 함수
export function createVAD(config?: Partial<VADConfig>): VoiceActivityDetector {
  return new VoiceActivityDetector(config)
}

// 오디오 데이터를 Float32Array로 변환하는 유틸리티 (호환성을 위해 유지)
export async function audioBlobToFloat32Array(blob: Blob, sampleRate: number = 16000): Promise<Float32Array> {
  try {
    const arrayBuffer = await blob.arrayBuffer()
    
    // WebM/Opus 형식은 직접 디코딩이 어려우므로 간단한 RMS 계산만 수행
    if (blob.type.includes('webm') || blob.type.includes('opus')) {
      return createSimpleAudioData(arrayBuffer, sampleRate)
    }
    
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    
    try {
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
      const channelData = audioBuffer.getChannelData(0) // 첫 번째 채널
      
      // 샘플레이트 변환 (필요한 경우)
      if (audioBuffer.sampleRate !== sampleRate) {
        return resampleAudio(channelData, audioBuffer.sampleRate, sampleRate)
      }
      
      return channelData
    } finally {
      audioContext.close()
    }
  } catch (error) {
    console.warn('Audio decoding failed, using fallback method:', error)
    // 폴백: 간단한 오디오 데이터 생성
    return createSimpleAudioData(await blob.arrayBuffer(), sampleRate)
  }
}

// WebM/Opus 형식용 간단한 오디오 데이터 생성
function createSimpleAudioData(arrayBuffer: ArrayBuffer, sampleRate: number): Float32Array {
  // 512 샘플의 더미 데이터 생성 (VAD 프레임 크기에 맞춤)
  const dummyData = new Float32Array(512)
  
  // ArrayBuffer의 바이트 데이터를 기반으로 간단한 신호 생성
  const uint8Array = new Uint8Array(arrayBuffer)
  const length = Math.min(uint8Array.length, dummyData.length)
  
  for (let i = 0; i < length; i++) {
    // 바이트 값을 -1 ~ 1 범위로 정규화
    dummyData[i] = (uint8Array[i] - 128) / 128
  }
  
  // 나머지는 0으로 채움
  for (let i = length; i < dummyData.length; i++) {
    dummyData[i] = 0
  }
  
  return dummyData
}

// 오디오 리샘플링 (간단한 선형 보간)
function resampleAudio(audioData: Float32Array, originalSampleRate: number, targetSampleRate: number): Float32Array {
  const ratio = originalSampleRate / targetSampleRate
  const newLength = Math.round(audioData.length / ratio)
  const resampled = new Float32Array(newLength)
  
  for (let i = 0; i < newLength; i++) {
    const originalIndex = i * ratio
    const index1 = Math.floor(originalIndex)
    const index2 = Math.min(index1 + 1, audioData.length - 1)
    const fraction = originalIndex - index1
    
    resampled[i] = audioData[index1] * (1 - fraction) + audioData[index2] * fraction
  }
  
  return resampled
} 