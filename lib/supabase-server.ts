import { createClient } from '@supabase/supabase-js'

/**
 * 서버 사이드에서만 사용할 수 있는 Supabase 클라이언트 생성
 * 서비스 롤 키를 사용하여 RLS를 우회하지만, 수동 권한 검증이 필요
 */
export function createServerSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not defined')
  }

  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not defined')
  }

  // 서비스 롤 키가 anon 키와 같은지 확인 (보안 검증)
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (serviceRoleKey === anonKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY should not be the same as NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

/**
 * 클라이언트 사이드에서 사용할 수 있는 Supabase 클라이언트 생성
 * anon 키를 사용하여 RLS가 적용됨
 */
export function createClientSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not defined')
  }

  if (!anonKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not defined')
  }

  return createClient(supabaseUrl, anonKey)
} 