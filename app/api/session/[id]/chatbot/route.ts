export const runtime = 'edge';

export async function POST(req: Request) {
  const {
    messages,
    transcript,
  }: { messages: { role: 'user' | 'assistant' | 'system'; content: string }[]; transcript: string } = await req.json();

  const systemPrompt =
    "You are a helpful assistant for a live lecture. Use the information in the transcript below to answer questions. Reply in a clear, concise, and straightforward way, using simple language. Avoid long or overly complex answers. If you use external knowledge, briefly explain how it relates to the transcript context. For example, if the word 'coffee' is used, clarify its meaning in this session.";

  try {
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return new Response(
        JSON.stringify({ error: 'Gemini API key not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 사용자 메시지 추출 (마지막 메시지가 사용자의 질문)
    const userMessage = messages[messages.length - 1]?.content || '';
    
    // 사용자 언어 감지 (한글, 한자, 데바나가리)
    const isKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(userMessage);
    const isChinese = /[\u4e00-\u9fff]/.test(userMessage);
    const isHindi = /[\u0900-\u097F]/.test(userMessage);

    // 대화 기록을 컨텍스트로 구성
    const conversationHistory = messages
      .slice(0, -1) // 마지막 메시지 제외
      .map(msg => `${msg.role}: ${msg.content}`)
      .join('\n');

    // 언어별 시스템 프롬프트
    let enhancedSystemPrompt = '';
    let transcriptLabel = '';
    let userLabel = '';
    let assistantLabel = '';
    if (isKorean) {
      enhancedSystemPrompt = `당신은 실시간 강의를 위한 도움이 되는 AI 어시스턴트입니다. 아래 제공된 강의 스크립트를 기반으로 질문에 답변해주세요.\n\n답변 가이드라인:\n- 사용자가 한국어로 질문하면 반드시 한국어로 답변해주세요\n- 명확하고 이해하기 쉬운 언어를 사용하세요\n- 스크립트에 있는 내용을 중심으로 답변하되, 필요시 관련된 배경 지식도 간단히 설명해주세요\n- 답변은 2-4문장 정도로 적절한 길이를 유지하세요\n- 스크립트에서 언급된 구체적인 내용(인명, 장소, 개념 등)을 인용하여 답변의 근거를 명확히 하세요\n- 불확실한 내용에 대해서는 \"스크립트에 따르면...\" 같은 표현을 사용하세요`;
      transcriptLabel = '강의 스크립트:';
      userLabel = '사용자';
      assistantLabel = '어시스턴트';
    } else if (isChinese) {
      enhancedSystemPrompt = `你是一个为现场讲座提供帮助的AI助手。请根据下方提供的讲座文本回答问题。\n\n回答指南：\n- 如果用户用中文提问，请务必用中文回答\n- 使用清晰易懂的语言\n- 以讲座内容为主进行回答，如有需要可简要补充相关背景知识\n- 答案保持2-4句为宜\n- 引用讲座中的具体内容（人名、地点、概念等）以明确回答依据\n- 对于不确定的内容，请使用“根据讲座内容...”等表达`;
      transcriptLabel = '讲座文本：';
      userLabel = '用户';
      assistantLabel = '助手';
    } else if (isHindi) {
      enhancedSystemPrompt = `आप एक लाइव व्याख्यान के लिए सहायक AI असिस्टेंट हैं। कृपया नीचे दिए गए व्याख्यान ट्रांसक्रिप्ट के आधार पर प्रश्नों का उत्तर दें।\n\nउत्तर देने के निर्देश:\n- यदि उपयोगकर्ता हिंदी में पूछे तो उत्तर भी हिंदी में दें\n- स्पष्ट और सरल भाषा का प्रयोग करें\n- उत्तर मुख्यतः ट्रांसक्रिप्ट की जानकारी पर आधारित हो, आवश्यकता अनुसार संक्षिप्त पृष्ठभूमि भी दें\n- उत्तर 2-4 वाक्य तक सीमित रखें\n- ट्रांसक्रिप्ट में उल्लेखित नाम, स्थान, अवधारणा आदि को उद्धृत करें\n- अनिश्चित जानकारी के लिए "ट्रांसक्रिप्ट के अनुसार..." जैसे वाक्यांश का प्रयोग करें`;
      transcriptLabel = 'व्याख्यान ट्रांसक्रिप्ट:';
      userLabel = 'उपयोगकर्ता';
      assistantLabel = 'सहायक';
    } else {
      enhancedSystemPrompt = `You are a helpful AI assistant for live lectures. Answer questions based on the provided lecture transcript.\n\nGuidelines:\n- Respond in the same language as the user's question\n- Use clear and easy-to-understand language\n- Base your answers primarily on the transcript content, but add relevant background knowledge when helpful\n- Keep responses to 2-4 sentences for appropriate length\n- Quote specific content from the transcript (names, places, concepts) to support your answers\n- For uncertain content, use phrases like \"According to the transcript...\" \n- Provide context and explanation to make the information more meaningful`;
      transcriptLabel = 'Lecture transcript:';
      userLabel = 'User';
      assistantLabel = 'Assistant';
    }

    // Gemini 프롬프트 구성
    const prompt = `${enhancedSystemPrompt}\n\n${transcriptLabel}\n${transcript}\n\n${conversationHistory ? `${userLabel === 'User' ? 'Previous conversation' : '이전 대화'}:\n${conversationHistory}\n\n` : ''}${userLabel}: ${userMessage}\n\n${assistantLabel}:`;

    // Gemini API 호출
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to get response from Gemini' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      console.error('Invalid Gemini response structure:', data);
      return new Response(
        JSON.stringify({ error: 'Invalid response from Gemini' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const assistantResponse = data.candidates[0].content.parts[0].text;

    // AI SDK 호환 스트리밍 응답 생성
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        // 전체 텍스트를 한 번에 전송 (JSON 이스케이프 문제 방지)
        const escapedText = JSON.stringify(assistantResponse);
        const textChunk = `0:${escapedText}\n`;
        controller.enqueue(encoder.encode(textChunk));
        
        // 완료 신호 전송
        const finishChunk = `d:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0}}\n`;
        controller.enqueue(encoder.encode(finishChunk));
        
        controller.close();
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Gemini API error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to process request' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
} 