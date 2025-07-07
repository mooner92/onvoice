import { useRef, useEffect, ReactNode } from 'react';
import { useChat, Message } from 'ai/react';

interface ChatbotCoreProps {
  transcript: string;
  sessionId: string;
  children: (props: {
    messages: Message[];
    input: string;
    handleInputChange: (e: React.ChangeEvent<HTMLInputElement> | React.ChangeEvent<HTMLTextAreaElement>) => void;
    handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
    isLoading: boolean;
    error: Error | undefined;
    messagesEndRef: React.RefObject<HTMLDivElement | null>;
  }) => ReactNode;
}

export function ChatbotCore({ transcript, sessionId, children }: ChatbotCoreProps) {
  const { messages, input, handleInputChange, handleSubmit, isLoading, error } = useChat({
    api: `/api/session/${sessionId}/chatbot`,
    body: {
      transcript,
    },
  });
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  return children({
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    error,
    messagesEndRef,
  });
} 