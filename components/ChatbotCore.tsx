import { useRef, useEffect, ReactNode } from 'react'
import { useChat, Message } from 'ai/react'

interface ChatbotCoreProps {
  transcript: string
  sessionId: string
  children: (props: {
    messages: Message[]
    input: string
    handleInputChange: (e: React.ChangeEvent<HTMLInputElement> | React.ChangeEvent<HTMLTextAreaElement>) => void
    handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void
    isLoading: boolean
    error: Error | undefined
    messagesEndRef: React.RefObject<HTMLDivElement | null>
  }) => ReactNode
}

export function ChatbotCore({ transcript, sessionId, children }: ChatbotCoreProps) {
  const { messages, input, handleInputChange, handleSubmit, isLoading, error } = useChat({
    api: `/api/session/${sessionId}/chatbot`,
    body: {
      transcript,
    },
  })
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  // Add a ref to always have the latest transcript
  const transcriptRef = useRef(transcript)
  useEffect(() => {
    transcriptRef.current = transcript
  }, [transcript])

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  // const handleSend = async () => {
  //   if (!input.trim()) return;
  //   setError(null);
  //   setLoading(true);
  //   const newMessages: ChatMessage[] = [...messages, { role: 'user', content: input }];
  //   setMessages(newMessages);
  //   setInput('');
  //   try {
  //     const res = await fetch(`/api/session/${sessionId}/chatbot`, {
  //       method: 'POST',
  //       headers: { 'Content-Type': 'application/json' },
  //       body: JSON.stringify({
  //         transcript: transcriptRef.current, // always use the latest transcript
  //         question: input,
  //         history: newMessages.map(m => ({ role: m.role, content: m.content })),
  //       }),
  //     });
  //     const data = await res.json();
  //     if (data.answer) {
  //       setMessages([...newMessages, { role: 'assistant', content: data.answer }]);
  //     } else {
  //       setError('No answer received.');
  //     }
  //   } catch {
  //     setError('Failed to get response.');
  //   } finally {
  //     setLoading(false);
  //   }
  // };

  // const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
  //   if (e.key === 'Enter' && !loading) {
  //     handleSend();
  //   }
  // };

  return children({
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    error,
    messagesEndRef,
  })
}
