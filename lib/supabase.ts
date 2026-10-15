import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/env";

// サイトと同じSupabaseに service role でつなぐ（サーバー側専用）
let client: SupabaseClient | null = null;

export function getAdmin(): SupabaseClient {
  if (!client) {
    client = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return client;
}
