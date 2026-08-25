"use client";

import { ArrowLeft, CheckCircle2, Eye, EyeOff, LockKeyhole, Mail, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { FormEvent, useState } from "react";
import { supabase } from "../lib/supabase";

function BrandMark() {
  return <div className="brand-mark auth-brand-mark" aria-hidden="true"><span /><span /><span /></div>;
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.63-2.36l-3.24-2.54c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.39 13.93A6.02 6.02 0 0 1 6.07 12c0-.67.12-1.32.32-1.93V7.45H3.04A10 10 0 0 0 2 12c0 1.61.38 3.14 1.04 4.55l3.35-2.62Z" />
      <path fill="#EA4335" d="M12 5.94c1.47 0 2.78.5 3.81 1.49l2.86-2.86A9.58 9.58 0 0 0 12 2a10 10 0 0 0-8.96 5.45l3.35 2.62C7.18 7.7 9.39 5.94 12 5.94Z" />
    </svg>
  );
}

export function AuthScreen() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  async function signInWithGoogle() {
    setGoogleLoading(true);
    setMessage(null);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    });

    if (error) {
      setMessage({ type: "error", text: "اتصال به گوگل انجام نشد. چند لحظه دیگر دوباره امتحان کن." });
      setGoogleLoading(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { full_name: fullName.trim() },
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) {
        setMessage({ type: "error", text: error.message });
      } else if (!data.session) {
        setPendingEmail(email.trim());
        setPassword("");
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error?.code === "email_not_confirmed") {
        setMessage({ type: "error", text: "ایمیل هنوز تأیید نشده؛ صندوق ورودی و پوشه Spam را بررسی کن." });
      } else if (error) {
        setMessage({ type: "error", text: "ایمیل یا رمز درست نیست. اگر حساب را با گوگل ساخته‌ای، یک‌بار با گوگل وارد شو و از بخش حساب برایش رمز بساز." });
      }
    }
    setLoading(false);
  }

  async function resendConfirmation() {
    if (!pendingEmail) return;
    setResending(true);
    setMessage(null);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: pendingEmail,
      options: { emailRedirectTo: window.location.origin },
    });
    setMessage(error
      ? { type: "error", text: "ارسال دوباره انجام نشد. یک دقیقه صبر کن و دوباره امتحان کن." }
      : { type: "success", text: "درخواست ارسال دوباره ثبت شد؛ صندوق ورودی و پوشه Spam را بررسی کن." });
    setResending(false);
  }

  function changeMode(nextMode: "login" | "signup") {
    setMode(nextMode);
    setPendingEmail("");
    setMessage(null);
  }

  return (
    <main className="auth-page" dir="rtl">
      <section className="auth-visual">
        <div className="auth-visual-content">
          <div className="auth-logo"><BrandMark /><strong>دارایی‌بان</strong></div>
          <div className="auth-copy">
            <span><Sparkles size={16} /> دستیار مالی فارسی</span>
            <h1>پول‌هایت را<br />واضح‌تر ببین.</h1>
            <p>تراکنش‌ها، بدهی‌ها، بودجه و دارایی‌هایت در یک فضای امن و مرتب.</p>
          </div>
          <div className="auth-preview-card">
            <div className="preview-card-top"><span>رشد دارایی این ماه</span><strong>+۸٫۲٪</strong></div>
            <div className="preview-bars"><i /><i /><i /><i /><i /><i /></div>
          </div>
          <div className="security-note"><ShieldCheck size={17} /> اطلاعات هر حساب کاملاً از دیگران جداست.</div>
        </div>
      </section>

      <section className="auth-form-side">
        <div className="auth-form-wrap">
          <div className="auth-mobile-logo"><BrandMark /><strong>دارایی‌بان</strong></div>
          <p className="auth-kicker">{mode === "login" ? "خوش برگشتی" : "شروع مدیریت مالی"}</p>
          <h2>{mode === "login" ? "وارد حساب خودت شو" : "حساب رایگان بساز"}</h2>
          <p className="auth-subtitle">
            {mode === "login" ? "برای دیدن داشبورد مالی، اطلاعاتت را وارد کن." : "کمتر از یک دقیقه تا داشبورد شخصی تو مانده."}
          </p>

          <div className="auth-tabs" role="tablist">
            <button className={mode === "login" ? "active" : ""} onClick={() => changeMode("login")} type="button">ورود</button>
            <button className={mode === "signup" ? "active" : ""} onClick={() => changeMode("signup")} type="button">ثبت‌نام</button>
          </div>

          <button className="auth-google" disabled={googleLoading || loading} onClick={() => void signInWithGoogle()} type="button">
            <GoogleIcon />
            <span>{googleLoading ? "در حال اتصال به گوگل..." : "ادامه با حساب گوگل"}</span>
          </button>

          <div className="auth-divider"><span>یا با ایمیل</span></div>

          {pendingEmail && mode === "signup" ? <section className="auth-confirmation" role="status" aria-live="polite">
            <div className="auth-confirmation-icon"><CheckCircle2 size={28} /></div>
            <h3>ایمیلت را بررسی کن</h3>
            <p>اگر این ایمیل تازه باشد، لینک تأیید تا چند دقیقه دیگر برای <strong dir="ltr">{pendingEmail}</strong> می‌رسد.</p>
            <small>پوشه Spam یا Promotions را هم ببین. اگر قبلاً با همین ایمیل از گوگل وارد شده‌ای، ایمیل جداگانه‌ای ارسال نمی‌شود؛ با گوگل وارد شو و داخل حساب یک رمز بساز.</small>
            {message && <div className={`auth-message ${message.type}`}>{message.text}</div>}
            <button className="auth-resend" disabled={resending} onClick={() => void resendConfirmation()} type="button"><RefreshCw className={resending ? "spin" : ""} size={17} />{resending ? "در حال ارسال..." : "ارسال دوباره ایمیل تأیید"}</button>
            <button className="auth-back-login" onClick={() => changeMode("login")} type="button">بعد از تأیید، ورود به حساب <ArrowLeft size={17} /></button>
          </section> : <form className="auth-form" onSubmit={submit}>
            {mode === "signup" && (
              <label>
                <span>نام و نام خانوادگی</span>
                <div className="field-wrap"><Sparkles size={18} /><input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="مثلاً سابیفای مرداد" required /></div>
              </label>
            )}
            <label>
              <span>ایمیل</span>
              <div className="field-wrap"><Mail size={18} /><input type="email" inputMode="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" dir="ltr" required /></div>
            </label>
            <label>
              <span>رمز عبور</span>
              <div className="field-wrap">
                <LockKeyhole size={18} />
                <input type={showPassword ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="حداقل ۸ کاراکتر" dir="ltr" required />
                <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "پنهان کردن رمز" : "نمایش رمز"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
              </div>
            </label>

            {message && <div className={`auth-message ${message.type}`} role="status" aria-live="polite">{message.text}</div>}

            <button className="auth-submit" disabled={loading || googleLoading} type="submit">
              {loading ? "کمی صبر کن..." : mode === "login" ? "ورود به دارایی‌بان" : "ساخت حساب"}
              {!loading && <ArrowLeft size={19} />}
            </button>
          </form>}

          <p className="auth-terms">با ساخت حساب، نگهداری امن و شخصی اطلاعات مالی خودت را می‌پذیری.</p>
        </div>
      </section>
    </main>
  );
}
