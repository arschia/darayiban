import type { SupabaseClient } from "npm:@supabase/supabase-js@2.112.3";
import webpush from "npm:web-push@3.6.7";

type PushPayload = {
  title: string;
  body: string;
  tag: string;
  url?: string;
};

type PushResult = {
  total: number;
  sent: number;
  failed: number;
};

function errorStatus(error: unknown) {
  if (!error || typeof error !== "object" || !("statusCode" in error)) return null;
  const status = Number((error as { statusCode?: unknown }).statusCode);
  return Number.isFinite(status) ? status : null;
}

export async function sendPushToUser(
  db: SupabaseClient,
  userId: string,
  payload: PushPayload,
): Promise<PushResult> {
  const [{ data: config, error: configError }, { data: subscriptions, error: subscriptionError }] =
    await Promise.all([
      db.rpc("get_push_config").single(),
      db
        .from("push_subscriptions")
        .select("id,endpoint,p256dh,auth")
        .eq("user_id", userId),
    ]);

  if (configError || !config?.public_key || !config?.private_key || !config?.subject) {
    throw new Error("push_config_unavailable");
  }
  if (subscriptionError) throw subscriptionError;
  if (!subscriptions?.length) return { total: 0, sent: 0, failed: 0 };

  webpush.setVapidDetails(config.subject, config.public_key, config.private_key);
  let sent = 0;
  let failed = 0;

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify(payload),
          { TTL: 86_400, urgency: "normal" },
        );
        sent += 1;
        await db
          .from("push_subscriptions")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", subscription.id);
      } catch (error) {
        failed += 1;
        const status = errorStatus(error);
        if (status === 404 || status === 410) {
          await db.from("push_subscriptions").delete().eq("id", subscription.id);
        }
      }
    }),
  );

  return { total: subscriptions.length, sent, failed };
}

export async function notifyOnce(
  db: SupabaseClient,
  options: {
    userId: string;
    kind: string;
    dedupeKey: string;
    title: string;
    body: string;
    tag: string;
    url?: string;
  },
) {
  const { data: delivery, error: deliveryError } = await db
    .from("notification_deliveries")
    .insert({
      user_id: options.userId,
      kind: options.kind,
      dedupe_key: options.dedupeKey,
      title: options.title,
      body: options.body,
      status: "pending",
    })
    .select("id")
    .single();

  if (deliveryError?.code === "23505") return { duplicate: true, sent: 0 };
  if (deliveryError || !delivery) throw deliveryError ?? new Error("delivery_not_created");

  try {
    const result = await sendPushToUser(db, options.userId, {
      title: options.title,
      body: options.body,
      tag: options.tag,
      url: options.url,
    });
    const status = result.sent > 0 ? "sent" : result.total === 0 ? "skipped" : "failed";
    await db
      .from("notification_deliveries")
      .update({
        status,
        sent_at: result.sent > 0 ? new Date().toISOString() : null,
        error_message: result.failed > 0 ? `${result.failed} push delivery failed` : null,
      })
      .eq("id", delivery.id);
    return { duplicate: false, sent: result.sent };
  } catch (error) {
    await db
      .from("notification_deliveries")
      .update({
        status: "failed",
        error_message: error instanceof Error ? error.message.slice(0, 500) : "push_failed",
      })
      .eq("id", delivery.id);
    throw error;
  }
}
