"use client";

import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { AuthScreen } from "./auth-screen";
import { FinanceApp } from "./finance-app";
import { supabase } from "../lib/supabase";

function SplashScreen() {
  return (
    <main className="app-loading" dir="rtl">
      <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>
      <strong>دارایی‌بان</strong>
      <span>در حال آماده‌سازی فضای مالی...</span>
    </main>
  );
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  if (loading) return <SplashScreen />;
  if (!session) return <AuthScreen />;
  return <FinanceApp session={session} />;
}
