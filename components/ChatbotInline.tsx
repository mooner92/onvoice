import { ChatbotCore } from './ChatbotCore';

export default function ChatbotInline({ transcript, sessionId }: { transcript: string; sessionId: string }) {
  return (
    <ChatbotCore transcript={transcript} sessionId={sessionId}>
      {({ messages, input, handleInputChange, handleSubmit, isLoading, error, messagesEndRef }) => (
        <div className="border rounded-2xl p-4 max-w-xl mx-auto bg-white dark:bg-gray-900 mt-8 shadow-lg">
          <div className="flex items-center gap-2 mb-3">
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24"><path fill="#2563eb" d="M12 3C6.477 3 2 6.797 2 11c0 1.61.67 3.11 1.85 4.36-.13.7-.46 1.97-.98 3.13a.5.5 0 0 0 .65.66c1.2-.5 2.36-1.1 3.09-1.5A12.7 12.7 0 0 0 12 17c5.523 0 10-3.797 10-8s-4.477-8-10-8Z"/></svg>
            <span className="font-semibold text-base text-blue-700">Session Chatbot</span>
          </div>
          <div className="h-64 overflow-y-auto px-1 py-2 mb-2 bg-gray-50 dark:bg-gray-800 rounded-2xl">
            {messages.length === 0 && (
              <div className="text-gray-400 text-sm text-center mt-8">Ask anything about this session&apos;s transcript!</div>
            )}
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} mb-2`}>
                <div
                  className={
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-2xl px-4 py-2 max-w-[80%] text-right shadow'
                      : 'bg-white text-gray-900 rounded-2xl px-4 py-2 max-w-[80%] text-left border border-gray-200 shadow'
                  }
                  style={{ wordBreak: 'break-word', fontSize: 15 }}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {isLoading && <div className="text-gray-400 text-sm text-center">Thinking...</div>}
            <div ref={messagesEndRef} />
          </div>
          <form onSubmit={handleSubmit}>
            <div className="flex gap-2 mt-2">
              <input
                className="flex-1 border border-gray-200 rounded-2xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-gray-50"
                type="text"
                value={input}
                onChange={handleInputChange}
                placeholder="Type your question..."
                disabled={isLoading}
                style={{ minHeight: 40 }}
              />
              <button
                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-2xl text-sm font-semibold disabled:opacity-50 shadow"
                type="submit"
                disabled={isLoading || !input.trim()}
                style={{ minHeight: 40 }}
              >
                Send
              </button>
            </div>
          </form>
          {error && <div className="text-red-500 text-sm mt-2">{error.message}</div>}
        </div>
      )}
    </ChatbotCore>
  );
} 