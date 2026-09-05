export const MODEL = "gemini-3.8-flash";
export const MAX_PROMPT = 4000;
export function toRial(value: unknown): number {
  if (
    typeof value !== "number" || !Number.isFinite(value) || value < 0 ||
    value > 1e14
  ) throw new Error("invalid_amount");
  const rial = Math.round(value * 10);
  if (!Number.isSafeInteger(rial)) throw new Error("invalid_amount");
  return rial;
}
export function localContext(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (key: string) => parts.find((part) => part.type === key)!.value;
  const today = `${get("year")}-${get("month")}-${get("day")}`;
  const start = new Date(`${today}T00:00:00+03:30`);
  const persianDay = Number(
    new Intl.DateTimeFormat("en-US-u-ca-persian", {
      timeZone: "Asia/Tehran",
      day: "numeric",
    }).format(now),
  );
  return {
    now: now.toISOString(),
    today,
    timezone: "Asia/Tehran",
    persian_date: new Intl.DateTimeFormat("fa-IR", {
      timeZone: "Asia/Tehran",
      dateStyle: "full",
    }).format(now),
    today_start: start.toISOString(),
    tomorrow_start: new Date(start.getTime() + 86400000).toISOString(),
    persian_month_start: new Date(start.getTime() - (persianDay - 1) * 86400000)
      .toISOString(),
  };
}
export function safeData(value: unknown): unknown {
  if (typeof value === "string") {
    return value.slice(0, 800).replace(
      /(?:\d[ -]?){12,}/g,
      "[شماره حساب پوشانده شد]",
    );
  }
  if (Array.isArray(value)) return value.map(safeData);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        key === "id" && typeof item === "string" &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
            .test(item)
          ? item
          : safeData(item),
      ]),
    );
  }
  return value;
}
export function publicError(code: string) {
  if (/record_changed/.test(code)) {
    return "این مورد بعد از بررسی تغییر کرده؛ اطلاعات تازه را ببین و دوباره درخواست بده.";
  }
  if (/rate_limit/.test(code)) {
    return "سهمیه درخواست دستیار فعلاً پر شده. کمی بعد دوباره تلاش کن.";
  }
  if (/request_in_progress/.test(code)) {
    return "یک درخواست دیگر در حال انجامه. کمی صبر کن و گفتگو را تازه‌سازی کن.";
  }
  if (/conversation_full/.test(code)) {
    return "این گفتگو به سقف پیام رسیده؛ یک گفتگوی تازه باز کن.";
  }
  if (/record_not_found|action_not_found/.test(code)) {
    return "مورد خواسته‌شده در حساب تو پیدا نشد.";
  }
  return "درخواست کامل نشد. تغییرات ثبت‌شده را در گفتگو بررسی کن و دوباره تلاش کن.";
}
