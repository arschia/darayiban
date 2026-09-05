"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  Check,
  LoaderCircle,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { dateTime, money } from "./finance-types";
import "./assistant.css";

type Conversation = { id: string; title: string };
type Run = {
  id: string;
  prompt: string;
  answer: string | null;
  status: string;
  created_at: string;
};
type Action = {
  id: string;
  run_id: string;
  entity: string;
  summary: string;
  undone_at: string | null;
};
type Rule = {
  id: string;
  title: string;
  threshold: number;
  enabled: boolean;
  starts_on: string;
  ends_on: string | null;
  tag: string | null;
};

const examples = [
  "با توجه به درآمد و بدهی‌هام، برای این ماه برنامه بده",
  "تراکنش‌های بدون برچسب رو بررسی کن",
  "اگر هزینه امروز از ۵۰۰ هزار تومان بیشتر شد، خبرم کن",
];

async function invoke(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(
    "financial-assistant",
    { body },
  );
  if (error) {
    const context = (error as { context?: Response }).context;
    if (context) {
      const result = await context.json().catch(() => null);
      if (result?.message) throw new Error(result.message);
    }
    throw new Error("ارتباط با دستیار برقرار نشد. دوباره تلاش کن.");
  }
  if (data?.error) throw new Error(data.message || "درخواست انجام نشد.");
  return data;
}

export function AssistantView(
  { userId, onChanged, onNotifications, pushEnabled }: {
    userId: string;
    onChanged: () => Promise<unknown>;
    onNotifications: () => void;
    pushEnabled: boolean;
  },
) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [undoing, setUndoing] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const loadSequence = useRef(0);
  const retry = useRef<
    { prompt: string; requestId: string; conversationId: string } | null
  >(null);

  const load = useCallback(async (id: string | null) => {
    const sequence = ++loadSequence.current;
    const [threads, alerts, history] = await Promise.all([
      supabase.from("assistant_conversations").select("id,title").eq(
        "user_id",
        userId,
      ).order("created_at", { ascending: false }).limit(50),
      supabase.from("assistant_spending_rules").select(
        "id,title,threshold,enabled,starts_on,ends_on,tag",
      ).eq("user_id", userId).order("created_at", { ascending: false }),
      id
        ? supabase.from("assistant_runs").select(
          "id,prompt,answer,status,created_at",
        ).eq("user_id", userId).eq("conversation_id", id).order("created_at", {
          ascending: true,
        }).limit(100)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (sequence !== loadSequence.current) return;
    if (threads.error || alerts.error || history.error) {
      throw new Error("اطلاعات دستیار بارگذاری نشد.");
    }
    setConversations(threads.data ?? []);
    setRules(alerts.data ?? []);
    setRuns(history.data ?? []);
    const ids = (history.data ?? []).map((run) => run.id);
    if (ids.length) {
      const receipts = await supabase.from("assistant_actions").select(
        "id,run_id,entity,summary,undone_at",
      ).eq("user_id", userId).in("run_id", ids).order("created_at");
      if (sequence !== loadSequence.current) return;
      if (receipts.error) throw new Error("گزارش تغییرات بارگذاری نشد.");
      setActions(receipts.data ?? []);
    } else setActions([]);
  }, [userId]);

  useEffect(() => {
    let alive = true;
    const id = new URLSearchParams(window.location.search).get("assistant");
    const validId = id && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
    async function start() {
      try {
        const status = await invoke({ operation: "status" });
        if (!alive) return;
        setReady(status.configured === true);
        setConversationId(validId);
        await load(validId);
      } catch (issue) {
        if (alive) {
          setError(
            issue instanceof Error ? issue.message : "دستیار در دسترس نیست.",
          );
        }
      } finally {
        if (alive) setLoading(false);
      }
    }
    void start();
    return () => {
      alive = false;
    };
  }, [load]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [runs, busy]);

  function address(id: string | null) {
    const url = new URL(window.location.href);
    url.searchParams.set("assistant", id ?? "");
    window.history.replaceState(null, "", url);
  }

  async function selectConversation(id: string | null) {
    if (busy) return;
    setError(null);
    setConversationId(id);
    address(id);
    retry.current = null;
    try {
      await load(id);
    } catch (issue) {
      setError((issue as Error).message);
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = prompt.trim();
    if (!text || busy || !ready) return;
    const request = retry.current?.prompt === text ? retry.current : {
      prompt: text,
      requestId: crypto.randomUUID(),
      conversationId: conversationId ?? crypto.randomUUID(),
    };
    retry.current = request;
    setBusy(true);
    setError(null);
    setPrompt("");
    setConversationId(request.conversationId);
    address(request.conversationId);
    setRuns((previous) =>
      previous.some((item) => item.id === request.requestId)
        ? previous
        : [...previous, {
          id: request.requestId,
          prompt: text,
          answer: null,
          status: "running",
          created_at: new Date().toISOString(),
        }]
    );
    try {
      const result = await invoke({ operation: "chat", ...request });
      if (result.status === "running") {
        setError(
          "درخواست هنوز در حال انجامه. کمی بعد «تازه‌سازی گفتگو» رو بزن.",
        );
      } else retry.current = null;
    } catch (issue) {
      setError((issue as Error).message);
      setPrompt(text);
    } finally {
      await load(request.conversationId).catch(() =>
        setError("نتیجه بارگذاری نشد. گفتگو را تازه‌سازی کن.")
      );
      await onChanged();
      setBusy(false);
    }
  }

  async function undo(action: Action) {
    setUndoing(action.id);
    setError(null);
    try {
      await invoke({ operation: "undo", actionId: action.id });
      await load(conversationId);
      await onChanged();
    } catch (issue) {
      setError((issue as Error).message);
    } finally {
      setUndoing(null);
    }
  }

  async function toggleRule(rule: Rule) {
    setError(null);
    const result = await supabase.from("assistant_spending_rules").update({
      enabled: !rule.enabled,
    }).eq("id", rule.id).eq("user_id", userId);
    if (result.error) setError("وضعیت هشدار ذخیره نشد.");
    else {await load(conversationId).catch((issue: Error) =>
        setError(issue.message)
      );}
  }

  return (
    <section className="assistant-page" aria-label="دستیار مالی">
      <header className="assistant-heading">
        <div>
          <span className="assistant-eyebrow">
            <Sparkles size={18} /> دستیار دارایی‌بان
          </span>
          <h1>با حساب‌وکتابت حرف بزن</h1>
          <p>برنامه بریز، تراکنش‌ها رو مرتب کن و برای هزینه‌هات هشدار بذار.</p>
        </div>
        <button
          type="button"
          className="secondary-button"
          disabled={busy}
          onClick={() => void selectConversation(null)}
        >
          <Plus size={18} /> گفتگوی تازه
        </button>
      </header>
      <div className="assistant-layout">
        <div className="assistant-chat">
          <div className="assistant-toolbar">
            <label>
              گفتگو<select
                aria-label="انتخاب گفتگو"
                value={conversationId &&
                    conversations.some((item) => item.id === conversationId)
                  ? conversationId
                  : ""}
                disabled={busy}
                onChange={(event) =>
                  void selectConversation(event.target.value || null)}
              >
                <option value="">گفتگوی تازه</option>
                {conversations.map((item) => (
                  <option value={item.id} key={item.id}>{item.title}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void load(conversationId).catch((issue: Error) =>
                  setError(issue.message)
                )}
            >
              تازه‌سازی گفتگو
            </button>
          </div>
          <div
            className="assistant-messages"
            role="log"
            aria-live="polite"
            aria-busy={busy || loading}
          >
            {loading
              ? <p className="assistant-muted">در حال بارگذاری گفتگو...</p>
              : !runs.length && (
                <div className="assistant-welcome">
                  <Sparkles size={30} />
                  <h2>از کجا شروع کنیم؟</h2>
                  <p>
                    می‌تونم اطلاعات مالی ثبت‌شده‌ات رو بررسی کنم و تغییراتی که
                    می‌خوای انجام بدم.
                  </p>
                  <div className="assistant-examples">
                    {examples.map((text) => (
                      <button
                        type="button"
                        key={text}
                        onClick={() => setPrompt(text)}
                      >
                        {text}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            {runs.map((run) => (
              <div key={run.id} className="assistant-exchange">
                <article className="assistant-bubble assistant-user">
                  <span>تو</span>
                  <p>{run.prompt}</p>
                </article>
                <article className="assistant-bubble assistant-reply">
                  <span>
                    <Sparkles size={16} /> دستیار
                  </span>
                  <p>
                    {run.answer || (run.status === "running"
                      ? "در حال بررسی اطلاعات و انجام درخواست..."
                      : "پاسخ کامل نشد. تغییرات ثبت‌شده را در پایین ببین.")}
                  </p>
                  {actions.filter((action) => action.run_id === run.id).map((
                    action,
                  ) => (
                    <div className="assistant-receipt" key={action.id}>
                      <Check size={17} />
                      <span>{action.summary}</span>
                      <button
                        type="button"
                        disabled={Boolean(action.undone_at) ||
                          undoing !== null || busy}
                        onClick={() => void undo(action)}
                      >
                        <RotateCcw size={14} />
                        {action.undone_at
                          ? "برگردانده شد"
                          : undoing === action.id
                          ? "در حال بازگردانی"
                          : "برگرداندن"}
                      </button>
                    </div>
                  ))}
                  <small>{dateTime(run.created_at)}</small>
                </article>
              </div>
            ))}
            <div ref={bottom} />
          </div>
          {error && <div className="assistant-error" role="alert">{error}</div>}
          {!loading && !ready && (
            <div className="assistant-setup" role="status">
              دستیار هنوز فعال نشده. اتصال سرویس هوش مصنوعی باید توسط مدیر
              برنامه تکمیل بشه.
            </div>
          )}
          <form className="assistant-composer" onSubmit={send}>
            <label className="assistant-input-label" htmlFor="assistant-prompt">
              پیامت به دستیار
            </label>
            <textarea
              id="assistant-prompt"
              rows={3}
              maxLength={4000}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="مثلاً این سه خرید مربوط به رفت‌وآمد بودن؛ برچسبشون رو عوض کن..."
              disabled={busy || loading}
            />
            <div>
              <small>
                اطلاعات لازم برای پاسخ با سرویس هوش مصنوعی پردازش می‌شه. تغییرات
                قابل بازگردانی هستن.
              </small>
              <button
                className="primary-button"
                type="submit"
                disabled={busy || loading || !ready || !prompt.trim()}
              >
                {busy
                  ? <LoaderCircle className="spin" size={18} />
                  : <Send size={18} />}
                <span>{busy ? "در حال بررسی" : "ارسال"}</span>
              </button>
            </div>
          </form>
        </div>
        <aside className="assistant-aside">
          <section className="assistant-info">
            <h2>تصویر مالی تو</h2>
            <p>
              دستیار به تراکنش‌ها، دارایی‌ها، موجودی حساب‌ها، بودجه‌ها و بدهی‌های
              همین حساب دسترسی داره.
            </p>
            <p>
              ارزش دارایی‌ها بر اساس اطلاعات ثبت‌شده‌ست؛ قیمت لحظه‌ای بازار نیست.
            </p>
          </section>
          <section className="assistant-info">
            <h2>
              <Bell size={19} /> هشدارهای هزینه
            </h2>
            <p>حتی وقتی گفتگو بسته‌ست، هزینه‌های ثبت‌شده بررسی می‌شن.</p>
            {!pushEnabled && (
              <button
                className="secondary-button"
                type="button"
                onClick={onNotifications}
              >
                فعال‌کردن اعلان این دستگاه
              </button>
            )}
            {rules.length
              ? rules.map((rule) => (
                <div className="assistant-rule" key={rule.id}>
                  <strong>{rule.title}</strong>
                  <span>
                    بیشتر از {money(rule.threshold / 10)}{" "}
                    تومان{rule.tag ? ` · ${rule.tag}` : ""}
                  </span>
                  <small>
                    {rule.ends_on
                      ? `از ${rule.starts_on} تا ${rule.ends_on}`
                      : `هر روز، از ${rule.starts_on}`}
                  </small>
                  <button
                    type="button"
                    aria-pressed={rule.enabled}
                    onClick={() =>
                      void toggleRule(rule)}
                  >
                    {rule.enabled ? "فعال · توقف هشدار" : "متوقف · فعال‌سازی"}
                  </button>
                </div>
              ))
              : (
                <p className="assistant-muted">
                  هنوز هشداری با دستیار نساختی.
                </p>
              )}
          </section>
        </aside>
      </div>
    </section>
  );
}
