export function normalizeDigits(input: string) {
  const fa = "۰۱۲۳۴۵۶۷۸۹";
  const ar = "٠١٢٣٤٥٦٧٨٩";
  return input
    .replace(/[۰-۹]/g, (digit) => String(fa.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(ar.indexOf(digit)))
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/٬/g, ",");
}

function numericAmount(value?: string | null) {
  if (!value) return null;
  const amount = Number(value.replace(/[,،\s]/g, ""));
  return Number.isFinite(amount) ? amount : null;
}

function parseBalance(text: string, fallbackUnit: "ریال" | "تومان") {
  const match = text.match(
    /(?:مانده|موجودی)(?:\s+(?:حساب|کارت))?\s*[:：]?\s*([0-9][0-9,،]*)\s*(ریال|تومان)?/i,
  );
  const amount = numericAmount(match?.[1]);
  if (amount === null) return null;
  const unit = match?.[2] === "تومان" ? "تومان" : match?.[2] === "ریال" ? "ریال" : fallbackUnit;
  return unit === "تومان" ? amount * 10 : amount;
}

function jalaliToGregorian(jy: number, jm: number, jd: number) {
  jy += 1595;
  let days =
    -355668 +
    365 * jy +
    Math.floor(jy / 33) * 8 +
    Math.floor(((jy % 33) + 3) / 4) +
    jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    days--;
    gy += 100 * Math.floor(days / 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const leap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
  const monthDays = [0, 31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 1;
  while (gm <= 12 && gd > monthDays[gm]) {
    gd -= monthDays[gm];
    gm++;
  }
  return { gy, gm, gd };
}

function parseBankTime(text: string, fallback?: string) {
  const dateMatch = text.match(/\b(14\d{2})\/(\d{1,2})\/(\d{1,2})\b/);
  const timeMatch = text.match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b/);
  if (dateMatch && timeMatch) {
    const { gy, gm, gd } = jalaliToGregorian(
      Number(dateMatch[1]),
      Number(dateMatch[2]),
      Number(dateMatch[3]),
    );
    const iso = `${gy}-${String(gm).padStart(2, "0")}-${String(gd).padStart(2, "0")}T${String(Number(timeMatch[1])).padStart(2, "0")}:${timeMatch[2]}:${timeMatch[3] ?? "00"}+03:30`;
    const parsed = new Date(iso);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  if (fallback) {
    const parsed = new Date(fallback);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
}

function cardHint(text: string, keyword: "از" | "به") {
  const line = text.match(new RegExp(`(?:^|\\n)${keyword}\\s+([^\\n]+)`, "m"));
  if (line?.[1]) return line[1].trim().slice(0, 80);
  const card = text.match(/(?:کارت|حساب)\s*(?:شماره)?\s*[:：-]?\s*([0-9*Xx-]{4,24})/i);
  return card?.[1] ?? null;
}

export function detectBank(text: string, provided?: string) {
  if (provided?.trim()) return provided.trim().slice(0, 60);
  const banks = ["سامان", "ملت", "ملی", "پاسارگاد", "پارسیان", "تجارت", "صادرات", "رفاه", "کشاورزی", "اقتصاد نوین", "آینده", "شهر"];
  return banks.find((bank) => text.includes(bank)) ?? "نامشخص";
}

export function parseMessage(raw: string, deviceTime?: string, providedBank?: string) {
  const text = normalizeDigits(raw).replace(/[\u200c\u200d\u00a0]/g, " ").replace(/[\u200e\u200f\u202a-\u202e]/g, "").replace(/\u2212/g, "-");
  if (/رمز|کد\s*(?:ورود|فعال|تأیید|تایید)|\bOTP\b/i.test(text)) {
    return { ignored: true, reason: "security_message" } as const;
  }
  // Only an amount on its own line can imply direction; card/account numbers cannot.
  const signed = text.match(/(?:^|\n)\s*([+-])\s*([0-9][0-9,،]*)\s*(ریال|تومان)?\s*(?=\n|$)/);
  const bankContext = /بانک|مانده|موجودی/.test(text);
  const expense = /برداشت|خرید|کسر|پرداخت|بدهکار|انتقال\s+وجه\s+از/.test(text) || Boolean(signed?.[1] === "-" && bankContext);
  const income = /واریز|افزایش موجودی|دریافت|بستانکار|انتقال\s+وجه\s+به/.test(text) || Boolean(signed?.[1] === "+" && bankContext);
  if (expense && income) return { ignored: true, reason: "ambiguous_direction" } as const;
  if (!expense && !income) {
    return { ignored: true, reason: "not_financial" } as const;
  }

  const amountPatterns = [
    /(?:برداشت|واریز|خرید|پرداخت|بدهکار|بستانکار|کسر)\s*(?:مبلغ\s*)?[:：]?\s*([0-9][0-9,،]*)\s*(ریال|تومان)?/i,
    /مبلغ\s*[:：]?\s*([0-9][0-9,،]*)\s*(ریال|تومان)?/i,
    /([0-9][0-9,،]*)\s*(ریال|تومان)/i,
  ];
  let amount: number | null = null;
  let amountUnit: "ریال" | "تومان" = "ریال";
  // A balance is not the transaction amount, even when it is the only field with a unit.
  const amountText = text.replace(/(?:مانده|موجودی)(?:\s+(?:حساب|کارت))?\s*[:：]?\s*[0-9][0-9,،]*\s*(?:ریال|تومان)?/g, "");
  for (const pattern of amountPatterns) {
    const match = amountText.match(pattern);
    amount = numericAmount(match?.[1]);
    if (amount !== null) {
      amountUnit = match?.[2] === "تومان" ? "تومان" : "ریال";
      break;
    }
  }
  if (amount === null && signed && bankContext) {
    amount = numericAmount(signed[2]);
    amountUnit = signed[3] === "تومان" ? "تومان" : "ریال";
  }
  if (amount === null) {
    return { ignored: true, reason: "amount_not_found" } as const;
  }
  if (amount <= 0 || !Number.isSafeInteger(amountUnit === "تومان" ? amount * 10 : amount)) {
    return { ignored: true, reason: "invalid_amount" } as const;
  }

  let category = "سایر";
  let description = expense ? "برداشت بانکی" : "واریز بانکی";
  if (/انتقال\s*وجه|کارت به کارت/.test(text)) {
    category = "انتقال وجه";
    description = "انتقال وجه";
  } else if (/خرید/.test(text)) {
    category = "خرید";
    description = "خرید با کارت";
  } else if (/قبض|صورتحساب/.test(text)) {
    category = "قبوض";
    description = "پرداخت قبض";
  } else if (/حقوق/.test(text)) {
    category = "حقوق";
    description = "واریز حقوق";
  }

  return {
    ignored: false as const,
    type: expense ? "withdrawal" : "deposit",
    amount: amountUnit === "تومان" ? amount * 10 : amount,
    currency: "IRR",
    description,
    fromCard: cardHint(text, "از"),
    toCard: cardHint(text, "به"),
    transactionTime: parseBankTime(text, deviceTime),
    category,
    bankName: detectBank(text, providedBank),
    balance: parseBalance(text, amountUnit),
  };
}
