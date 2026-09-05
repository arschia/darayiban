import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../supabase/functions/ingest-sms/parser.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { parseMessage } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const received = "2026-09-05T12:34:56Z";

for (const [name, message, type, amount, balance] of [
  ["Saman multipart message", "بانك سامان\nبرداشت مبلغ 333,740 خريدکالا\nاز 2137-800-5251414-1\nمانده 8,904,191\n1405/6/4\n01:11:41", "withdrawal", 333740, 8904191],
  ["colon without whitespace", "بانک سامان\nبرداشت:۱٬۲۵۰٬۰۰۰\nمانده:۴٬۰۰۰٬۰۰۰", "withdrawal", 1250000, 4000000],
  ["Arabic debit spelling", "بانك سامان\nبدهكار: 250,000 ریال\nمانده: 500,000 ریال", "withdrawal", 250000, 500000],
  ["credit and toman", "بانک سامان\nبستانکار: ۲۵۰٬۰۰۰ تومان\nمانده: ۵۰۰٬۰۰۰ تومان", "deposit", 2500000, 5000000],
  ["signed withdrawal", "بانک سامان\nحساب 1234\n−۵۰٬۰۰۰\nمانده ۱۰۰٬۰۰۰", "withdrawal", 50000, 100000],
  ["signed deposit", "بانک سامان\nحساب 1234\n+50,000\nمانده 100,000", "deposit", 50000, 100000],
]) {
  test(name, () => {
    const result = parseMessage(message, received);
    assert.equal(result.ignored, false);
    assert.equal(result.type, type);
    assert.equal(result.amount, amount);
    assert.equal(result.balance, balance);
  });
}

for (const message of [
  "رمز پویای برداشت 654321 برای مبلغ 50,000 ریال؛ مانده 100,000",
  "رمز یک‌بار مصرف خرید 123456 مبلغ 250,000 ریال",
  "کد ورود 123456 است",
  "جلسه ساعت 18 است",
  "بانک سامان\nمانده: 9,000 ریال",
  "بانک سامان\nبرداشت انجام شد\nمانده: 9,000 ریال",
  "بانک سامان\nکارت به کارت مبلغ 1,000 ریال",
  "بانک سامان\nبرداشت 100 ریال و واریز 100 ریال",
]) test(`does not invent a transaction: ${message.slice(0, 30)}`, () => assert.equal(parseMessage(message, received).ignored, true));

test("received timestamp survives delayed upload", () => {
  assert.equal(parseMessage("برداشت: 100 ریال", received).transactionTime, "2026-09-05T12:34:56.000Z");
});
