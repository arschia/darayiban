import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { notifyOnce } from "../_shared/push.ts";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function localParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

function toman(value: number) {
  return new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 }).format(value / 10);
}

async function dailyExpense(userId: string, date: string) {
  const start = new Date(`${date}T00:00:00+03:30`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  const { data, error } = await db
    .from("transactions")
    .select("amount")
    .eq("user_id", userId)
    .eq("type", "withdrawal")
    .is("deleted_at", null)
    .gte("transaction_time", start.toISOString())
    .lt("transaction_time", end.toISOString());
  if (error) throw error;
  return {
    count: data?.length ?? 0,
    total: (data ?? []).reduce((sum, item) => sum + Number(item.amount ?? 0), 0),
  };
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const { data: config, error: configError } = await db.rpc("get_push_config").single();
  const suppliedSecret = request.headers.get("x-cron-secret") ?? "";
  if (configError || !config?.cron_secret || suppliedSecret !== config.cron_secret) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const now = new Date();
  const { data: preferences, error } = await db
    .from("notification_preferences")
    .select("user_id,daily_summary_time,timezone")
    .eq("daily_summary_enabled", true);
  if (error) return json({ ok: false, error: "preferences_unavailable" }, 500);

  let sent = 0;
  let checked = 0;
  for (const preference of preferences ?? []) {
    const timezone = preference.timezone || "Asia/Tehran";
    const local = localParts(now, timezone);
    const [targetHour, targetMinute] = String(preference.daily_summary_time)
      .split(":")
      .map(Number);
    const currentMinutes = local.hour * 60 + local.minute;
    const targetMinutes = targetHour * 60 + targetMinute;
    if (currentMinutes < targetMinutes || currentMinutes >= targetMinutes + 10) continue;
    checked += 1;

    const expense = await dailyExpense(preference.user_id, local.date);
    const result = await notifyOnce(db, {
      userId: preference.user_id,
      kind: "daily_summary",
      dedupeKey: `daily-summary:${local.date}`,
      title: "گزارش مالی امروز",
      body: expense.count
        ? `امروز ${expense.count.toLocaleString("fa-IR")} برداشت و در مجموع ${toman(expense.total)} تومان هزینه داشتی.`
        : "امروز هنوز هزینه‌ای برایت ثبت نشده است.",
      tag: `daily-summary-${local.date}`,
      url: "/",
    });
    sent += result.sent;
  }

  return json({ ok: true, checked, sent });
});
