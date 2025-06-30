import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const audio = formData.get("audio") as File
    const sessionId = formData.get("sessionId") as string

    console.log('STT API called with:', {
      audioSize: audio?.size,
      audioType: audio?.type,
      sessionId,
      timestamp: new Date().toLocaleTimeString()
    })

    if (!audio || !sessionId) {
      console.error('Missing required data:', { audio: !!audio, sessionId: !!sessionId })
      return NextResponse.json(
        { error: "Audio file and session ID are required" },
        { status: 400 }
      )
    }

    // Check if audio file has content
    if (audio.size === 0) {
      console.log('Empty audio file received')
      return NextResponse.json(
        { transcript: "", confidence: 0 },
        { status: 200 }
      )
    }

    console.log('Processing audio file:', {
      size: audio.size,
      type: audio.type,
      name: audio.name
    })

    // Check if OpenAI API key is available
    if (!process.env.OPENAI_API_KEY) {
      console.log("OpenAI API key not configured, using placeholder")
      
      // Generate realistic placeholder text that varies
      const placeholderTexts = [
        "Welcome to today's lecture on artificial intelligence.",
        "Machine learning is transforming various industries.",
        "Deep learning models require large amounts of data.",
        "Natural language processing enables human-computer interaction.",
        "Computer vision allows machines to interpret visual information.",
        "Reinforcement learning helps AI agents learn through trial and error.",
        "Neural networks are inspired by the human brain structure.",
        "Data preprocessing is crucial for model performance.",
        "Feature engineering can significantly improve results.",
        "Cross-validation helps prevent overfitting in models.",
      ]
      
      // Use timestamp to create some variation but consistency within same session
      const textIndex = Math.floor(Date.now() / 10000) % placeholderTexts.length
      const randomText = placeholderTexts[textIndex]
      
      return NextResponse.json({
        transcript: randomText,
        confidence: 0.9,
        isPlaceholder: true,
        message: "Using placeholder - configure OPENAI_API_KEY for real STT"
      })
    }

    let transcript = ""
    let confidence = 0

    try {
      // Call Whisper API with optimized settings
      const whisperFormData = new FormData()
      whisperFormData.append("file", audio, "audio.webm")
      whisperFormData.append("model", "whisper-1")
      // Remove language parameter for auto-detection (better accuracy)
      whisperFormData.append("response_format", "verbose_json")
      whisperFormData.append("temperature", "0") // For more consistent results

      const whisperResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: whisperFormData,
      })

      if (!whisperResponse.ok) {
        const errorText = await whisperResponse.text()
        console.error("Whisper API error:", errorText)
        
        // Fallback: return placeholder text for testing
        transcript = `[Audio received at ${new Date().toLocaleTimeString()}]`
        confidence = 0.5
      } else {
        const whisperData = await whisperResponse.json()
        transcript = whisperData.text?.trim() || ""
        confidence = whisperData.avg_logprob || 0.9
      }
    } catch (whisperError) {
      console.error("Whisper API request failed:", whisperError)
      // Fallback: return placeholder text for testing
      transcript = `[STT Error - Audio at ${new Date().toLocaleTimeString()}]`
      confidence = 0.1
    }

    // Only save non-empty transcripts
    if (transcript) {
      // Save to Supabase
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY! // Use service role key for server-side operations
      )

      const { error: dbError } = await supabase
        .from("transcripts")
        .insert([
          {
            session_id: sessionId,
            timestamp: new Date().toLocaleTimeString(),
            original_text: transcript,
            created_at: new Date().toISOString(),
          },
        ])

      if (dbError) {
        console.error("Database error:", dbError)
        // Still return the transcript even if DB save fails
      }
    }

    return NextResponse.json({
      transcript,
      confidence,
      duration: 0,
    })

  } catch (error) {
    console.error("STT API error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
} 