import { useState, useRef, useEffect, ReactNode } from 'react';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatbotCoreProps {
  transcript: string;
  sessionId: string;
  children: (props: {
    messages: ChatMessage[];
    input: string;
    setInput: (v: string) => void;
    loading: boolean;
    error: string | null;
    handleSend: () => void;
    handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    messagesEndRef: React.RefObject<HTMLDivElement | null>;
  }) => ReactNode;
}

export function ChatbotCore({ transcript, sessionId, children }: ChatbotCoreProps) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;
    setError(null);
    setLoading(true);
    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: input }];
    setMessages(newMessages);
    setInput('');
    try {
      const res = await fetch(`/api/session/${sessionId}/chatbot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript,
          question: input,
          history: newMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      if (data.answer) {
        setMessages([...newMessages, { role: 'assistant', content: data.answer }]);
      } else {
        setError('No answer received.');
      }
    } catch (e) {
      setError('Failed to get response.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !loading) {
      handleSend();
    }
  };

  return children({
    messages,
    input,
    setInput,
    loading,
    error,
    handleSend,
    handleKeyDown,
    messagesEndRef,
  });
} 