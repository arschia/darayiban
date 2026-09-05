import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { sendPushToUser } from "../_shared/push.ts";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }
  const supplied = request.headers.get("x-cron-secret");
  if (!supplied) return json({ error: "unauthorized" }, 401);
  const { data: config, error: configError } = await db.rpc("get_push_config")
    .single<{ cron_secret: string }>();
  if (configError || !config?.cron_secret || supplied !== config.cron_secret) {
    return json({ error: "unauthorized" }, 401);
  }
  const { data: rules, error } = await db.rpc("assistant_due_spending_rules");
  if (error) return json({ error: "rules_unavailable" }, 500);
  let sent = 0, failed = 0;
  for (const rule of rules ?? []) {
    const { data: claim, error: claimError } = await db.rpc(
      "assistant_claim_spending_alert",
      { p_rule_id: rule.rule_id },
    );
    if (claimError) {
      failed++;
      continue;
    }
    if (!claim) continue;
    try {
      const result = await sendPushToUser(db, claim.user_id, {
        title: claim.title,
        body: claim.body,
        tag: claim.tag,
        url: "/?assistant=",
      });
      const saved = await db.from("notification_deliveries").update({
        status: result.sent > 0
          ? "sent"
          : result.total === 0
          ? "skipped"
          : "failed",
        sent_at: result.sent > 0 ? new Date().toISOString() : null,
        error_message: result.failed > 0 ? "push_delivery_failed" : null,
      }).eq("id", claim.delivery_id).eq("user_id", claim.user_id);
      if (saved.error) failed++;
      else sent += result.sent;
    } catch {
      failed++;
      await db.from("notification_deliveries").update({
        status: "failed",
        error_message: "push_delivery_failed",
      }).eq("id", claim.delivery_id).eq("user_id", claim.user_id);
    }
  }
  return json({ ok: true, checked: rules?.length ?? 0, sent, failed });
});
