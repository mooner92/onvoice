import { NextRequest, NextResponse } from "next/server"

// Next.js doesn't support WebSocket directly in API routes
// We need to use a different approach or external WebSocket server

export async function GET(req: NextRequest) {
  return NextResponse.json({
    error: "WebSocket not supported in Next.js API routes",
    message: "Use a separate WebSocket server or upgrade to a framework that supports WebSockets",
    suggestion: "Consider using Socket.IO or a separate Node.js WebSocket server"
  }, { status: 501 })
}

export async function POST(req: NextRequest) {
  return NextResponse.json({
    error: "Use WebSocket connection instead",
    message: "This endpoint requires WebSocket for real-time communication"
  }, { status: 400 })
} 