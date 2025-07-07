import React, { useState, useRef } from 'react';
import { ChatbotCore } from './ChatbotCore';
import ReactMarkdown from 'react-markdown';

export default function ChatbotWidget({ transcript, sessionId }: { transcript: string; sessionId: string }) {
  const [open, setOpen] = useState(false);
  // Draggable position state
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const widgetRef = useRef<HTMLDivElement>(null);

  // Calculate initial position (bottom right)
  const getInitialPosition = () => {
    if (typeof window === 'undefined') return { x: 0, y: 0 };
    const padding = 32;
    const width = 370;
    const height = 520;
    return {
      x: window.innerWidth - width - padding,
      y: window.innerHeight - height - padding,
    };
  };

  // Set initial position on open
  const handleOpen = () => {
    setOpen(true);
    if (!position && typeof window !== 'undefined') {
      setPosition(getInitialPosition());
    }
  };

  // Mouse/touch event handlers
  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    setDragging(true);
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    if (widgetRef.current) {
      const rect = widgetRef.current.getBoundingClientRect();
      dragOffset.current = {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };
    }
    document.body.style.userSelect = 'none';
  };

  const handleDrag = (e: MouseEvent | TouchEvent) => {
    if (!dragging) return;
    let clientX, clientY;
    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ('clientX' in e) {
      clientX = e.clientX;
      clientY = e.clientY;
    } else {
      return;
    }
    setPosition(pos => {
      if (!pos) return pos;
      let x = clientX - dragOffset.current.x;
      let y = clientY - dragOffset.current.y;
      // Clamp to viewport
      const width = 370;
      const height = 520;
      x = Math.max(0, Math.min(window.innerWidth - width, x));
      y = Math.max(0, Math.min(window.innerHeight - height, y));
      return { x, y };
    });
  };

  const handleDragEnd = () => {
    setDragging(false);
    document.body.style.userSelect = '';
  };

  // Attach/remove global listeners
  React.useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', handleDrag);
      window.addEventListener('mouseup', handleDragEnd);
      window.addEventListener('touchmove', handleDrag, { passive: false });
      window.addEventListener('touchend', handleDragEnd);
    } else {
      window.removeEventListener('mousemove', handleDrag);
      window.removeEventListener('mouseup', handleDragEnd);
      window.removeEventListener('touchmove', handleDrag);
      window.removeEventListener('touchend', handleDragEnd);
    }
    return () => {
      window.removeEventListener('mousemove', handleDrag);
      window.removeEventListener('mouseup', handleDragEnd);
      window.removeEventListener('touchmove', handleDrag);
      window.removeEventListener('touchend', handleDragEnd);
    };
  }, [dragging]);

  return (
    <>
      {/* Floating Button */}
      <div style={{ position: 'fixed', bottom: 32, right: 32, zIndex: 1000 }}>
        {!open && (
          <button
            aria-label="Open Chatbot"
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg w-14 h-14 flex items-center justify-center text-2xl focus:outline-none border-4 border-white"
            onClick={handleOpen}
            style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.18)' }}
          >
            <svg width="28" height="28" fill="none" viewBox="0 0 24 24"><path fill="currentColor" d="M12 3C6.477 3 2 6.797 2 11c0 1.61.67 3.11 1.85 4.36-.13.7-.46 1.97-.98 3.13a.5.5 0 0 0 .65.66c1.2-.5 2.36-1.1 3.09-1.5A12.7 12.7 0 0 0 12 17c5.523 0 10-3.797 10-8s-4.477-8-10-8Z"/></svg>
          </button>
        )}
      </div>
      {/* Chat Window */}
      {open && (
        <div
          ref={widgetRef}
          style={{
            position: 'fixed',
            left: position ? position.x : undefined,
            top: position ? position.y : undefined,
            bottom: position ? undefined : 32,
            right: position ? undefined : 32,
            zIndex: 1001,
            width: 370,
            maxWidth: '95vw',
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            borderRadius: 20,
            background: 'rgba(255,255,255,0.98)',
            overflow: 'hidden',
            cursor: dragging ? 'grabbing' : 'default',
            touchAction: 'none',
          }}
        >
          <ChatbotCore transcript={transcript} sessionId={sessionId}>
            {({ messages, input, setInput, loading, error, handleSend, handleKeyDown, messagesEndRef }) => (
              <div className="flex flex-col h-[520px]" style={{ borderRadius: 20, background: 'rgba(255,255,255,0.98)' }}>
                {/* Header (Drag handle) */}
                <div
                  className="flex items-center justify-between px-5 py-3 bg-blue-600 select-none"
                  style={{ borderTopLeftRadius: 20, borderTopRightRadius: 20, cursor: 'grab', userSelect: 'none' }}
                  onMouseDown={handleDragStart}
                  onTouchStart={handleDragStart}
                >
                  <div className="flex items-center gap-2">
                    <svg width="24" height="24" fill="none" viewBox="0 0 24 24"><path fill="#fff" d="M12 3C6.477 3 2 6.797 2 11c0 1.61.67 3.11 1.85 4.36-.13.7-.46 1.97-.98 3.13a.5.5 0 0 0 .65.66c1.2-.5 2.36-1.1 3.09-1.5A12.7 12.7 0 0 0 12 17c5.523 0 10-3.797 10-8s-4.477-8-10-8Z"/></svg>
                    <span className="text-white font-semibold text-base">Session Chatbot</span>
                  </div>
                  <button
                    aria-label="Close Chatbot"
                    className="text-white text-2xl hover:bg-blue-700 rounded-full w-8 h-8 flex items-center justify-center focus:outline-none"
                    onClick={() => setOpen(false)}
                    style={{ transition: 'background 0.2s' }}
                  >
                    ×
                  </button>
                </div>
                {/* Messages */}
                <div className="flex-1 h-0 overflow-y-auto px-4 py-3" style={{ background: '#f7f8fa' }}>
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
                        {msg.role === 'assistant'
                          ? <div className="prose prose-sm"><ReactMarkdown>{msg.content}</ReactMarkdown></div>
                          : msg.content}
                      </div>
                    </div>
                  ))}
                  {loading && <div className="text-gray-400 text-sm text-center">Thinking...</div>}
                  <div ref={messagesEndRef} />
                </div>
                {/* Input */}
                <div className="p-3 border-t bg-white flex gap-2" style={{ borderBottomLeftRadius: 20, borderBottomRightRadius: 20 }}>
                  <input
                    className="flex-1 border border-gray-200 rounded-2xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-gray-50"
                    type="text"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type your question..."
                    disabled={loading}
                    style={{ minHeight: 40 }}
                  />
                  <button
                    className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-2xl text-sm font-semibold disabled:opacity-50 shadow"
                    onClick={handleSend}
                    disabled={loading || !input.trim()}
                    style={{ minHeight: 40 }}
                  >
                    Send
                  </button>
                </div>
                {error && <div className="text-red-500 text-sm px-4 pb-2">{error}</div>}
              </div>
            )}
          </ChatbotCore>
        </div>
      )}
    </>
  );
} 