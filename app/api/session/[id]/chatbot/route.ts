import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { transcript, question, history = [] } = await req.json();

  // Build messages for GPT
  const systemPrompt =
    "You are a helpful assistant for a live lecture. Use the information in the transcript below to answer questions. Reply in a clear, concise, and straightforward way, using simple language. Avoid long or overly complex answers. If you use external knowledge, briefly explain how it relates to the transcript context. For example, if the word 'coffee' is used, clarify its meaning in this session.";

  // Build chat history for GPT
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Transcript:\n${transcript}` },
    ...history.map((item: { role: string; content: string }) => ({
      role: item.role,
      content: item.content,
    })),
    { role: 'user', content: question },
  ];

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4-turbo',
      messages,
      max_tokens: 512,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    return NextResponse.json({ error: 'Failed to fetch from OpenAI' }, { status: 500 });
  }

  const data = await response.json();
  return NextResponse.json({ answer: data.choices[0].message.content });
} 