// Opt-in live provider check using synthetic data only. Never runs in CI.
// GOOGLE_GENERATIVE_AI_API_KEY must come from the execution environment.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import ts from "typescript";
import { createGoogle } from "@ai-sdk/google";
import { isStepCount, ToolLoopAgent } from "ai";

const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
if (!key) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is required");
const target = new URL("../work/gemini-smoke/", import.meta.url);
await mkdir(target, { recursive: true });
for (const name of ["core", "tools"]) {
  let source = await readFile(
    new URL(
      `../supabase/functions/financial-assistant/${name}.ts`,
      import.meta.url,
    ),
    "utf8",
  );
  source = source.replace(
    /npm:(@[^/]+\/[^@"']+|[^@/"']+)@[^/"']+(\/[^"']*)?/g,
    (_match, pkg, path) => pkg + (path ?? ""),
  );
  source = source.replace(/(\.\/[a-z_]+)\.ts/g, "$1.mjs");
  await writeFile(
    new URL(`${name}.mjs`, target),
    ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    }).outputText,
  );
}
const { MODEL } = await import(new URL("core.mjs", target).href);
const { createFinanceTools } = await import(new URL("tools.mjs", target).href);
const userId = "10000000-0000-4000-8000-000000000001";
const row = {
  id: "30000000-0000-4000-8000-000000000003",
  type: "withdrawal",
  amount: 1500000,
  currency: "IRR",
  description: "کرایه تاکسی",
  category: "بدون دسته",
  tags: ["قدیمی"],
  transaction_time: new Date().toISOString(),
};
const edits = [];
const calls = [];
const query = {
  select() {
    return query;
  },
  eq(column, value) {
    if (column === "user_id") assert.equal(value, userId);
    return query;
  },
  is() {
    return query;
  },
  order() {
    return query;
  },
  gte() {
    return query;
  },
  lt() {
    return query;
  },
  in() {
    return query;
  },
  range() {
    return Promise.resolve({ data: [row], error: null });
  },
};
const db = {
  from(entity) {
    assert.equal(entity, "transactions");
    return query;
  },
  async rpc(name, args) {
    assert.equal(name, "assistant_apply_changes");
    assert.equal(args.p_entity, "transactions");
    edits.push(...args.p_changes);
    return {
      data: [{
        id: "40000000-0000-4000-8000-000000000004",
        summary: args.p_summary,
      }],
      error: null,
    };
  },
};
try {
  const agent = new ToolLoopAgent({
    model: createGoogle({ apiKey: key })(process.env.AI_MODEL || MODEL),
    providerOptions: { google: { thinkingConfig: { thinkingLevel: "low" } } },
    instructions:
      "این یک آزمون با داده ساختگی است. فقط ابزارهای خواندن و ویرایش تراکنش لازم است. قبل از ویرایش رکورد را بخوان. برچسب قبلی را حفظ کن. مبلغ را تغییر نده. فارسی پاسخ بده.",
    tools: createFinanceTools(
      db,
      userId,
      "20000000-0000-4000-8000-000000000002",
    ),
    stopWhen: isStepCount(4),
    maxOutputTokens: 768,
    maxRetries: 0,
    onStepEnd: (step) => {
      calls.push(...step.toolCalls.map((call) => call.toolName));
    },
  });
  const result = await agent.generate({
    prompt:
      "تراکنش کرایه تاکسی را از فهرست تراکنش‌ها پیدا کن و برچسب رفت‌وآمد را به آن اضافه کن. برچسب قبلی بماند و هیچ چیز دیگری عوض نشود.",
    abortSignal: AbortSignal.timeout(60000),
  });
  assert.ok(calls.includes("read_financial_records"));
  assert.ok(calls.includes("edit_financial_records"));
  assert.equal(edits.length, 1);
  assert.equal(edits[0].id, row.id);
  assert.deepEqual(new Set(edits[0].patch.tags), new Set(["قدیمی", "رفت‌وآمد"]));
  assert.equal(Object.keys(edits[0].patch).length, 1);
  console.log(
    JSON.stringify({
      ok: true,
      model: process.env.AI_MODEL || MODEL,
      calls,
      answer: result.text,
      usage: result.totalUsage,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      ok: false,
      status: error.statusCode,
      message: String(error.message).replaceAll(key, "[REDACTED]").slice(
        0,
        1800,
      ),
    }),
  );
  process.exitCode = 1;
}
