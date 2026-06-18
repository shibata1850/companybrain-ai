import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

let adminClient: SupabaseClient | null = null;

/**
 * Server-only client with the service-role key. Bypasses RLS — never
 * import this from a client component.
 */
export function supabaseAdmin(): SupabaseClient {
  if (!adminClient) {
    adminClient = createClient(env.supabaseUrl(), env.supabaseServiceKey(), {
      auth: { persistSession: false },
    });
  }
  return adminClient;
}

export function storageBucket(): string {
  return env.storageBucket();
}
