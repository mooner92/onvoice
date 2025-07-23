import { translationQueue } from '../lib/translation-queue'

console.log('🚀 Starting translation queue manager...')

// 큐 상태 모니터링
setInterval(() => {
  const stats = translationQueue.getQueueStats()
  console.log('📊 Translation queue stats:', stats)
}, 10000) // 10초마다 상태 출력

// 프로세스 종료 시 정리
process.on('SIGINT', () => {
  console.log('🛑 Shutting down translation queue...')
  translationQueue.clear()
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('🛑 Shutting down translation queue...')
  translationQueue.clear()
  process.exit(0)
})

console.log('✅ Translation queue manager is running...')
console.log('Press Ctrl+C to stop')

// 무한 루프로 유지
setInterval(() => {
  // 큐가 계속 실행되도록 유지
}, 1000) 