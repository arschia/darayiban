import { createClient } from "@supabase/supabase-js";

// These are public browser credentials, not privileged database secrets. Keeping
// a production fallback lets Vercel prerender the app even when its Git
// integration has not injected NEXT_PUBLIC_* variables yet. Environment values
// still take precedence for local development and future project migrations.
const defaultSupabaseUrl = "https://iilpkekzjbwqlvjtcbqs.supabase.co";
const defaultSupabasePublishableKey =
  "sb_publishable_u8xauuLIw8TwZHzDFzzpxQ_n-g3vkH_";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? defaultSupabaseUrl;
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  defaultSupabasePublishableKey;

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export const smsEndpoint = `${supabaseUrl}/functions/v1/ingest-sms`;
