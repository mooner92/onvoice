"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Calendar, Clock, Search, Download, Play, Crown, Lock, Mic, Users, Zap, Trash2 } from "lucide-react"
import Link from "next/link"
import { useAuth } from "@/components/auth/AuthProvider"
import { createClient } from "@/lib/supabase"
import { Session, UserSession } from "@/lib/types"

interface SavedSession extends Session {
  role: 'speaker' | 'audience'
  saved_at: string
  expires_at?: string
  is_premium: boolean
  transcript_count: number
}

export default function MySessionsPage() {
  const { user } = useAuth()
  const supabase = createClient()
  
  const [searchTerm, setSearchTerm] = useState("")
  const [filterRole, setFilterRole] = useState("all")
  const [filterStatus, setFilterStatus] = useState("all")
  const [sortBy, setSortBy] = useState("date")
  const [sessions, setSessions] = useState<SavedSession[]>([])
  const [loading, setLoading] = useState(true)
  const [userProfile, setUserProfile] = useState<any>(null)

  // Load user sessions
  useEffect(() => {
    const loadSessions = async () => {
      if (!user) return

      try {
        // Load user profile
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', user.id)
          .single()

        setUserProfile(profile)

        // Load speaker sessions (sessions where user is host)
        const { data: speakerSessions } = await supabase
          .from('sessions')
          .select(`
            *,
            transcripts(count)
          `)
          .eq('host_id', user.id)

        // Load audience sessions (sessions where user participated)
        const { data: audienceSessions } = await supabase
          .from('user_sessions')
          .select(`
            *,
            sessions(*)
          `)
          .eq('user_id', user.id)
          .eq('role', 'audience')

        const formattedSessions: SavedSession[] = []

        // Format speaker sessions
        speakerSessions?.forEach(session => {
          formattedSessions.push({
            ...session,
            role: 'speaker' as const,
            saved_at: session.created_at,
            expires_at: undefined, // Speaker sessions never expire
            is_premium: true, // Speaker sessions are always premium
            transcript_count: session.transcripts?.[0]?.count || 0
          })
        })

        // Format audience sessions
        audienceSessions?.forEach(userSession => {
          if (userSession.sessions) {
            formattedSessions.push({
              ...userSession.sessions,
              role: 'audience' as const,
              saved_at: userSession.saved_at,
              expires_at: userSession.expires_at,
              is_premium: userSession.is_premium,
              transcript_count: 0 // Will be calculated separately
            })
          }
        })

        setSessions(formattedSessions)
      } catch (error) {
        console.error('Error loading sessions:', error)
      } finally {
        setLoading(false)
      }
    }

    loadSessions()
  }, [user, supabase])

  const getStatusColor = (session: SavedSession) => {
    if (session.role === 'speaker') {
      return "bg-purple-100 text-purple-800"
    }
    
    if (session.expires_at && new Date(session.expires_at) < new Date()) {
      return "bg-red-100 text-red-800"
    }
    
    if (session.is_premium) {
      return "bg-blue-100 text-blue-800"
    }
    
    return "bg-green-100 text-green-800"
  }

  const getStatusText = (session: SavedSession) => {
    if (session.role === 'speaker') {
      return "Speaker"
    }
    
    if (session.expires_at && new Date(session.expires_at) < new Date()) {
      return "Expired"
    }
    
    if (session.is_premium) {
      return "Premium"
    }
    
    return "Free"
  }

  const getStatusIcon = (session: SavedSession) => {
    if (session.role === 'speaker') {
      return <Mic className="h-3 w-3" />
    }
    
    if (session.expires_at && new Date(session.expires_at) < new Date()) {
      return <Lock className="h-3 w-3" />
    }
    
    if (session.is_premium) {
      return <Crown className="h-3 w-3" />
    }
    
    return null
  }

  const filteredSessions = sessions.filter((session) => {
    const matchesSearch =
      session.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      session.host_name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesRole = filterRole === "all" || session.role === filterRole
    const matchesStatus = filterStatus === "all" || getStatusText(session).toLowerCase() === filterStatus
    return matchesSearch && matchesRole && matchesStatus
  })

  const sortedSessions = [...filteredSessions].sort((a, b) => {
    switch (sortBy) {
      case "date":
        return new Date(b.saved_at).getTime() - new Date(a.saved_at).getTime()
      case "title":
        return a.title.localeCompare(b.title)
      case "duration":
        return (b.transcript_count || 0) - (a.transcript_count || 0)
      default:
        return 0
    }
  })

  const deleteSession = async (sessionId: string) => {
    if (!user) return

    try {
      await supabase
        .from('user_sessions')
        .delete()
        .eq('user_id', user.id)
        .eq('session_id', sessionId)

      setSessions(prev => prev.filter(s => s.id !== sessionId))
    } catch (error) {
      console.error('Error deleting session:', error)
    }
  }

  const upgradeToPremium = () => {
    // Implement premium upgrade logic
    console.log('Upgrade to premium')
  }

  if (!user) {
    return <div>Loading...</div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center space-x-2">
              <Mic className="h-8 w-8 text-blue-600" />
              <span className="text-2xl font-bold text-gray-900">LiveTranscribe</span>
            </Link>
            <Badge variant="outline">My Sessions</Badge>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">My Sessions</h1>
          <p className="text-gray-600">Access your lecture transcripts and translations</p>
        </div>

        {/* Subscription Status */}
        <Card className="mb-6 border-blue-200 bg-blue-50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-blue-900">
                  {userProfile?.subscription_status === 'premium' ? 'Premium Plan' : 'Free Plan'}
                </h3>
                <p className="text-sm text-blue-700">
                  {userProfile?.subscription_status === 'premium' 
                    ? 'Unlimited access to all features'
                    : `${sessions.filter(s => s.role === 'audience').length} sessions saved • 30 days remaining`
                  }
                </p>
              </div>
              {userProfile?.subscription_status !== 'premium' && (
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={upgradeToPremium}>
                  <Crown className="mr-2 h-4 w-4" />
                  Upgrade to Premium
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Filters and Search */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search sessions or hosts..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <Select value={filterRole} onValueChange={setFilterRole}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="speaker">Speaker</SelectItem>
              <SelectItem value="audience">Audience</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="speaker">Speaker</SelectItem>
              <SelectItem value="free">Free</SelectItem>
              <SelectItem value="premium">Premium</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Sessions List */}
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-500 mt-2">Loading sessions...</p>
            </div>
          ) : sortedSessions.length === 0 ? (
            <div className="text-center py-12">
              <Mic className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">No sessions found</p>
              <p className="text-sm text-gray-400 mt-1">Start a session or join one to see it here</p>
            </div>
          ) : (
            sortedSessions.map((session) => (
              <Card key={session.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">{session.title}</h3>
                        <Badge className={`text-xs ${getStatusColor(session)}`}>
                          <div className="flex items-center space-x-1">
                            {getStatusIcon(session)}
                            <span>{getStatusText(session)}</span>
                          </div>
                        </Badge>
                      </div>

                      <p className="text-gray-600 mb-3">
                        {session.role === 'speaker' ? 'You hosted this session' : `by ${session.host_name}`}
                      </p>

                      <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                        <div className="flex items-center space-x-1">
                          <Calendar className="h-4 w-4" />
                          <span>{new Date(session.created_at).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <Clock className="h-4 w-4" />
                          <span>{session.transcript_count} words</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <span>{session.primary_language}</span>
                        </div>
                        {session.role === 'audience' && session.expires_at && (
                          <div className="flex items-center space-x-1">
                            <span>
                              {new Date(session.expires_at) > new Date() 
                                ? `Expires ${new Date(session.expires_at).toLocaleDateString()}`
                                : 'Expired'
                              }
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/session/${session.id}`}>
                          <Play className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button size="sm" variant="outline">
                        <Download className="h-4 w-4" />
                      </Button>
                      {session.role === 'audience' && (
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          onClick={() => deleteSession(session.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Premium Features */}
        {userProfile?.subscription_status !== 'premium' && (
          <Card className="mt-8 border-purple-200 bg-purple-50">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Crown className="h-5 w-5 text-purple-600" />
                <span>Upgrade to Premium</span>
              </CardTitle>
              <CardDescription>
                Get unlimited access to all your sessions and premium features
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-4 mb-4">
                <div className="flex items-center space-x-2">
                  <Zap className="h-4 w-4 text-purple-600" />
                  <span className="text-sm">Unlimited session storage</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Users className="h-4 w-4 text-purple-600" />
                  <span className="text-sm">AI-powered summaries</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Download className="h-4 w-4 text-purple-600" />
                  <span className="text-sm">Export in multiple formats</span>
                </div>
              </div>
              <Button className="w-full bg-purple-600 hover:bg-purple-700" onClick={upgradeToPremium}>
                <Crown className="mr-2 h-4 w-4" />
                Upgrade Now - £5.99/month
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
