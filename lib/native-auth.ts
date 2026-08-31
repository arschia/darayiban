import type { AuthResponse } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export const nativeAuthRedirectUrl = "app.darayiban.mobile://auth/callback";

export async function completeNativeAuth(url: string): Promise<AuthResponse> {
  const parsed = new URL(url);
  const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ""));
  const errorDescription = fragment.get("error_description") ?? parsed.searchParams.get("error_description");
  if (errorDescription) throw new Error(errorDescription);

  const accessToken = fragment.get("access_token");
  const refreshToken = fragment.get("refresh_token");
  if (accessToken && refreshToken) {
    return supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  }

  const code = parsed.searchParams.get("code");
  if (code) return supabase.auth.exchangeCodeForSession(code);
  throw new Error("نشست ورود از آدرس بازگشت دریافت نشد.");
}
