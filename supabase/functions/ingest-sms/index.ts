import { normalizeDigits, detectBank, parseMessage } from "./parser.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { notifyOnce } from "../_shared/push.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-selfmali-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
  });
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function localDateInTehran(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Tehran",
  }).formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function toman(value: number) {
  return new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 }).format(value / 10);
}

async function maybeNotifyDailyLimit(
  userId: string,
  transactionTime: string,
) {
  const { data: preference, error: preferenceError } = await db
    .from("notification_preferences")
    .select("daily_limit,daily_limit_enabled")
    .eq("user_id", userId)
    .maybeSingle();
  if (preferenceError || !preference?.daily_limit_enabled || !preference.daily_limit) return;

  const localDate = localDateInTehran(transactionTime);
  const start = new Date(`${localDate}T00:00:00+03:30`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  const { data: expenses, error: expenseError } = await db
    .from("transactions")
    .select("amount")
    .eq("user_id", userId)
    .eq("type", "withdrawal")
    .is("deleted_at", null)
    .gte("transaction_time", start.toISOString())
    .lt("transaction_time", end.toISOString());
  if (expenseError) throw expenseError;

  const total = (expenses ?? []).reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
  const limit = Number(preference.daily_limit);
  if (total < limit) return;

  await notifyOnce(db, {
    userId,
    kind: "daily_limit",
    dedupeKey: `daily-limit:${localDate}`,
    title: "هشدار سقف هزینه روزانه",
    body: `هزینه امروز به ${toman(total)} تومان رسید و از سقف ${toman(limit)} تومان عبور کرد.`,
    tag: `daily-limit-${localDate}`,
    url: "/",
  });
}

export async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (request.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  try {
    const rawToken = request.headers.get("x-selfmali-token")?.trim();
    if (!rawToken) return json({ ok: false, error: "missing_token" }, 401);

    const tokenHash = await sha256Hex(rawToken);
    const { data: tokenRow, error: tokenError } = await db
      .from("automation_tokens")
      .select("id,user_id")
      .eq("token_hash", tokenHash)
      .is("revoked_at", null)
      .maybeSingle();
    if (tokenError || !tokenRow) {
      return json({ ok: false, error: "invalid_token" }, 401);
    }

    const body = await request.json().catch(() => ({}));
    // Validate the phone's saved connection without inventing a transaction.
    if (body?.operation === "status") return json({ ok: true, user_id: tokenRow.user_id });
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    const deviceTime = typeof body?.device_time === "string" ? body.device_time : undefined;
    const providedBank = typeof body?.bank_name === "string" ? body.bank_name : undefined;
    if (!message) return json({ ok: false, error: "missing_message" }, 400);

    const normalized = normalizeDigits(message);
    const fingerprint = await sha256Hex(`${tokenRow.user_id}:${normalized}`);
    const parsed = parseMessage(message, deviceTime, providedBank);

    await db
      .from("automation_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", tokenRow.id);

    if (parsed.ignored) {
      await db.from("ingest_events").insert({
        user_id: tokenRow.user_id,
        source: "iphone_shortcut",
        status: "ignored",
        bank_name: detectBank(normalized, providedBank),
        error_message: parsed.reason,
      });
      return json({ ok: true, ignored: true, reason: parsed.reason });
    }

    const transaction = {
      user_id: tokenRow.user_id,
      type: parsed.type,
      amount: parsed.amount,
      currency: parsed.currency,
      description: parsed.description,
      from_card: parsed.fromCard,
      to_card: parsed.toCard,
      transaction_time: parsed.transactionTime,
      category: parsed.category,
      external_ref: fingerprint,
      bank_name: parsed.bankName,
      source: "iphone_shortcut",
    };

    const { data: inserted, error: insertError } = await db
      .from("transactions")
      .insert(transaction)
      .select("id")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        await db.from("ingest_events").insert({
          user_id: tokenRow.user_id,
          source: "iphone_shortcut",
          status: "ignored",
          bank_name: parsed.bankName,
          error_message: "duplicate_message",
        });
        return json({ ok: true, ignored: true, reason: "duplicate_message" });
      }
      await db.from("ingest_events").insert({
        user_id: tokenRow.user_id,
        source: "iphone_shortcut",
        status: "failed",
        bank_name: parsed.bankName,
        error_message: insertError.message,
      });
      return json({ ok: false, error: "insert_failed" }, 500);
    }

    await db.from("ingest_events").insert({
      user_id: tokenRow.user_id,
      source: "iphone_shortcut",
      status: "parsed",
      bank_name: parsed.bankName,
      transaction_id: inserted.id,
    });

    if (parsed.balance !== null) {
      const { error: balanceError } = await db.rpc("record_bank_balance", {
        p_user_id: tokenRow.user_id,
        p_bank_name: parsed.bankName,
        p_account_hint: parsed.fromCard ?? parsed.toCard ?? "",
        p_balance: parsed.balance,
        p_currency: "IRR",
        p_reported_at: parsed.transactionTime,
        p_transaction_id: inserted.id,
      });
      if (balanceError) console.error("bank_balance_update_failed", balanceError.message);
    }

    if (parsed.type === "withdrawal") {
      EdgeRuntime.waitUntil(
        maybeNotifyDailyLimit(tokenRow.user_id, parsed.transactionTime).catch((error) =>
          console.error("daily_limit_notification_failed", error),
        ),
      );
    }

    return json({
      ok: true,
      transaction_id: inserted.id,
      parsed,
    });
  } catch (error) {
    return json(
      { ok: false, error: error instanceof Error ? error.message : "unknown_error" },
      500,
    );
  }
}

Deno.serve(handler);
