export type ViewId =
  | "dashboard"
  | "transactions"
  | "calendar"
  | "obligations"
  | "assets"
  | "budget"
  | "academy"
  | "install"
  | "notifications"
  | "trash";

export type Transaction = {
  id: string;
  type: "deposit" | "withdrawal";
  amount: number | string;
  description: string | null;
  from_card: string | null;
  to_card: string | null;
  transaction_time: string;
  category: string | null;
  tags: string[];
  bank_name: string | null;
  source: string | null;
  currency: string;
  deleted_at: string | null;
  updated_at: string;
};

export type Obligation = {
  id: string;
  kind: "debt" | "receivable";
  title: string;
  counterparty: string | null;
  original_amount: number | string;
  remaining_amount: number | string;
  currency: string;
  due_date: string | null;
  status: "open" | "partial" | "settled" | "cancelled";
  notes: string | null;
};

export type Asset = {
  id: string;
  asset_type: "gold" | "silver" | "usd" | "eur" | "usdt" | "btc" | "toman_cash";
  quantity: number | string;
  purchase_price: number | string | null;
  purchase_date: string | null;
  notes: string | null;
};

export type Budget = {
  id: string;
  name: string;
  amount: number | string;
  currency: string;
  period_start: string;
  period_end: string;
  tag: string | null;
  notes: string | null;
};

export type BudgetTarget = {
  id: string;
  asset_type: string;
  target_percentage: number | string;
};

export type AutomationToken = {
  id: string;
  label: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export type Profile = {
  id: string;
  full_name: string | null;
  base_currency: string;
  locale: string;
  timezone: string;
};

export type BankBalance = {
  id: string;
  bank_name: string;
  account_hint: string;
  balance: number | string;
  currency: string;
  reported_at: string;
  updated_at: string;
};

export type NotificationPreferences = {
  user_id: string;
  daily_limit: number | string | null;
  daily_limit_enabled: boolean;
  daily_summary_enabled: boolean;
  daily_summary_time: string;
  timezone: string;
};

export type NotificationDelivery = {
  id: string;
  kind: "daily_limit" | "daily_summary" | string;
  title: string;
  body: string;
  status: "pending" | "sent" | "failed" | "skipped";
  sent_at: string | null;
  created_at: string;
};

export const money = (value: number | string | null | undefined) =>
  new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 }).format(Number(value ?? 0));

export const shortDate = (value: string | Date) =>
  new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Tehran",
  }).format(new Date(value));

export const dateTime = (value: string | Date) =>
  new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tehran",
  }).format(new Date(value));

export const numberValue = (value: number | string | null | undefined) => Number(value ?? 0);

export const tomanValue = (value: number | string | null | undefined, currency = "IRR") =>
  currency === "IRT" ? numberValue(value) : numberValue(value) / 10;

export const rialValue = (toman: number | string | null | undefined) => numberValue(toman) * 10;

export function persianMonthKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-u-ca-persian", {
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  return `${year}-${month}`;
}

export function localDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Tehran",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return `${year}-${month}-${day}`;
}

const latinDigits = (value: string) => value
  .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
  .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));

function persianParts(value: Date, timeZone = "Asia/Tehran") {
  const parts = new Intl.DateTimeFormat("en-u-ca-persian", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(value);
  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  };
}

export function persianDateInput(value: string | Date) {
  const { year, month, day } = persianParts(new Date(value));
  return `${year}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
}

export function persianDateTimeInput(value: string | Date) {
  const date = new Date(value);
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Tehran",
  }).format(date);
  return `${persianDateInput(date)} ${time}`;
}

export function parsePersianDateInput(value: string) {
  const match = latinDigits(value.trim()).match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (!match) return null;
  const target = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  if (target.month < 1 || target.month > 12 || target.day < 1 || target.day > 31) return null;

  const start = Date.UTC(target.year + 620, 0, 1);
  const end = Date.UTC(target.year + 622, 11, 31);
  for (let timestamp = start; timestamp <= end; timestamp += 86_400_000) {
    const date = new Date(timestamp);
    const current = persianParts(date, "UTC");
    if (current.year === target.year && current.month === target.month && current.day === target.day) {
      return date.toISOString().slice(0, 10);
    }
  }
  return null;
}

export function parsePersianDateTimeInput(value: string) {
  const normalized = latinDigits(value.trim());
  const match = normalized.match(/^(\d{4}[\/-]\d{1,2}[\/-]\d{1,2})(?:\s+)(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const date = parsePersianDateInput(match[1]);
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  if (!date || hour > 23 || minute > 59) return null;
  const parsed = new Date(`${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+03:30`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function persianMonthRange(value = new Date()) {
  const current = persianParts(value);
  const start = parsePersianDateInput(`${current.year}/${current.month}/1`)!;
  const nextYear = current.month === 12 ? current.year + 1 : current.year;
  const nextMonth = current.month === 12 ? 1 : current.month + 1;
  const nextStart = parsePersianDateInput(`${nextYear}/${nextMonth}/1`)!;
  const endDate = new Date(`${nextStart}T00:00:00Z`);
  endDate.setUTCDate(endDate.getUTCDate() - 1);
  return { start, end: endDate.toISOString().slice(0, 10) };
}

export const assetNames: Record<Asset["asset_type"], string> = {
  gold: "طلا",
  silver: "نقره",
  usd: "دلار",
  eur: "یورو",
  usdt: "تتر",
  btc: "بیت‌کوین",
  toman_cash: "وجه نقد",
};
