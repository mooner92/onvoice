import { ChatbotCore } from './ChatbotCore'

export default function ChatbotInline({ transcript, sessionId }: { transcript: string; sessionId: string }) {
  return (
    <ChatbotCore transcript={transcript} sessionId={sessionId}>
      {({ messages, input, handleInputChange, handleSubmit, isLoading, error, messagesEndRef }) => (
        <div className='mx-auto mt-8 max-w-xl rounded-2xl border bg-white p-4 shadow-lg dark:bg-gray-900'>
          <div className='mb-3 flex items-center gap-2'>
            <svg width='24' height='24' fill='none' viewBox='0 0 24 24'>
              <path
                fill='#2563eb'
                d='M12 3C6.477 3 2 6.797 2 11c0 1.61.67 3.11 1.85 4.36-.13.7-.46 1.97-.98 3.13a.5.5 0 0 0 .65.66c1.2-.5 2.36-1.1 3.09-1.5A12.7 12.7 0 0 0 12 17c5.523 0 10-3.797 10-8s-4.477-8-10-8Z'
              />
            </svg>
            <span className='text-base font-semibold text-blue-700'>Session Chatbot</span>
          </div>
          <div className='mb-2 h-64 overflow-y-auto rounded-2xl bg-gray-50 px-1 py-2 dark:bg-gray-800'>
            {messages.length === 0 && (
              <div className='mt-8 text-center text-sm text-gray-400'>
                Ask anything about this session&apos;s transcript!
              </div>
            )}
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} mb-2`}>
                <div
                  className={
                    msg.role === 'user'
                      ? 'max-w-[80%] rounded-2xl bg-blue-600 px-4 py-2 text-right text-white shadow'
                      : 'max-w-[80%] rounded-2xl border border-gray-200 bg-white px-4 py-2 text-left text-gray-900 shadow'
                  }
                  style={{ wordBreak: 'break-word', fontSize: 15 }}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {isLoading && <div className='text-center text-sm text-gray-400'>Thinking...</div>}
            <div ref={messagesEndRef} />
          </div>
          <form onSubmit={handleSubmit}>
            <div className='mt-2 flex gap-2'>
              <input
                className='flex-1 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm focus:ring-2 focus:ring-blue-200 focus:outline-none'
                type='text'
                value={input}
                onChange={handleInputChange}
                placeholder='Type your question...'
                disabled={isLoading}
                style={{ minHeight: 40 }}
              />
              <button
                className='rounded-2xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-50'
                type='submit'
                disabled={isLoading || !input.trim()}
                style={{ minHeight: 40 }}
              >
                Send
              </button>
            </div>
          </form>
          {error && <div className='mt-2 text-sm text-red-500'>{error.message}</div>}
        </div>
      )}
    </ChatbotCore>
  )
}
