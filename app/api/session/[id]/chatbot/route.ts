import { streamText } from 'ai'
import { openai } from '@ai-sdk/openai'

export const runtime = 'edge'

export async function POST(req: Request) {
  const {
    messages,
    transcript,
  }: {
    messages: { role: 'user' | 'assistant' | 'system'; content: string }[]
    transcript: string
  } = await req.json()

  const systemPrompt =
    "You are a helpful assistant for a live lecture. Use the information in the transcript below to answer questions. Reply in a clear, concise, and straightforward way, using simple language. Avoid long or overly complex answers. If you use external knowledge, briefly explain how it relates to the transcript context. For example, if the word 'coffee' is used, clarify its meaning in this session."

  const result = await streamText({
    model: openai.chat('gpt-4-turbo'),
    system: `${systemPrompt}\n\nHere is the transcript of the lecture:\n\n${transcript}`,
    messages: messages,
  })

  return result.toDataStreamResponse()
}
