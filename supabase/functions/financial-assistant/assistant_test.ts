import assert from "node:assert/strict";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.112.3";
import { createFinanceTools } from "./tools.ts";
import { handler } from "./index.ts";
import { isStepCount, ToolLoopAgent } from "npm:ai@7.0.93";
import { MockLanguageModelV4 } from "npm:ai@7.0.93/test";

const userId = "10000000-0000-4000-8000-000000000001";
const runId = "20000000-0000-4000-8000-000000000002";
const recordId = "30000000-0000-4000-8000-000000000003";
const calls: { name: string; args: unknown[] }[] = [];
function fakeDb(rows: Record<string, unknown>[] = []) {
  const query = {
    select(...args: unknown[]) {
      calls.push({ name: "select", args });
      return query;
    },
    eq(...args: unknown[]) {
      calls.push({ name: "eq", args });
      return query;
    },
    is(...args: unknown[]) {
      calls.push({ name: "is", args });
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
      return Promise.resolve({ data: rows, error: null });
    },
  };
  return {
    from(name: string) {
      calls.push({ name: "from", args: [name] });
      return query;
    },
    rpc(name: string, args: unknown) {
      calls.push({ name, args: [args] });
      return Promise.resolve({ data: [{ action_id: "receipt" }], error: null });
    },
  } as unknown as SupabaseClient;
}
const options = { toolCallId: "call", messages: [], context: {} };

Deno.test("agent executes a financial tool and returns a persisted-step-ready answer", async () => {
  const usage = {
    inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 5, text: 5, reasoning: 0 },
  };
  const model = new MockLanguageModelV4({
    doGenerate: [
      {
        content: [{
          type: "tool-call",
          toolCallId: "summary-1",
          toolName: "summarize_finances",
          input: JSON.stringify({ start: null, end: null }),
        }],
        finishReason: { unified: "tool-calls", raw: undefined },
        usage,
        warnings: [],
      },
      {
        content: [{ type: "text", text: "گزارش آماده شد" }],
        finishReason: { unified: "stop", raw: undefined },
        usage,
        warnings: [],
      },
    ],
  });
  let steps = 0, input = 0;
  const agent = new ToolLoopAgent({
    model,
    tools: createFinanceTools(fakeDb(), userId, runId),
    stopWhen: isStepCount(3),
    onStepEnd: (step) => {
      steps++;
      input += step.usage.inputTokens ?? 0;
    },
  });
  const result = await agent.generate({ prompt: "هزینه‌هایم را جمع بزن" });
  assert.equal(result.text, "گزارش آماده شد");
  assert.equal(steps, 2);
  assert.equal(input, 20);
  assert.equal(model.doGenerateCalls.length, 2);
});

Deno.test("tool reads are scoped, card columns excluded, units normalized", async () => {
  calls.length = 0;
  const tools = createFinanceTools(
    fakeDb([{
      id: recordId,
      amount: 5000000,
      currency: "IRR",
      description: "purchase",
    }]),
    userId,
    runId,
  );
  const result = await tools.read_financial_records.execute!({
    entity: "transactions",
    offset: 0,
    start: null,
    end: null,
    ids: null,
  }, options);
  assert.ok(
    calls.some((call) =>
      call.name === "eq" && call.args[0] === "user_id" &&
      call.args[1] === userId
    ),
  );
  assert.ok(
    !String(calls.find((call) => call.name === "select")!.args[0]).includes(
      "from_card",
    ),
  );
  assert.equal(
    (result as { records: Record<string, unknown>[] }).records[0].amount_toman,
    500000,
  );
});
Deno.test("edits require a read and preserve optimistic concurrency context", async () => {
  calls.length = 0;
  const row = {
    id: recordId,
    amount: 5000000,
    currency: "IRR",
    category: null,
    tags: [],
  };
  const tools = createFinanceTools(fakeDb([row]), userId, runId);
  await assert.rejects(
    async () =>
      await tools.edit_financial_records.execute!({
        entity: "transactions",
        changes: [{ id: recordId, patch: { tags: ["اسنپ"] } }],
        summary: "tag",
      }, options),
    /read_record_first/,
  );
  await tools.read_financial_records.execute!({
    entity: "transactions",
    offset: 0,
    start: null,
    end: null,
    ids: [recordId],
  }, options);
  await tools.edit_financial_records.execute!({
    entity: "transactions",
    changes: [{ id: recordId, patch: { amount_toman: 200000 } }],
    summary: "edit",
  }, options);
  const args = calls.find((call) => call.name === "assistant_apply_changes")!
    .args[0] as {
      p_changes: { patch: Record<string, unknown>; expected: unknown }[];
      p_run_id: string;
    };
  assert.equal(args.p_run_id, runId);
  assert.equal(args.p_changes[0].patch.amount, 2000000);
  assert.deepEqual(args.p_changes[0].expected, row);
});
Deno.test("unapproved fields cannot cross the tool boundary", async () => {
  const tools = createFinanceTools(
    fakeDb([{ id: recordId, amount: 1000, currency: "IRR" }]),
    userId,
    runId,
  );
  await tools.read_financial_records.execute!({
    entity: "transactions",
    offset: 0,
    start: null,
    end: null,
    ids: [recordId],
  }, options);
  await assert.rejects(async () =>
    await tools.edit_financial_records.execute!({
      entity: "transactions",
      changes: [{ id: recordId, patch: { user_id: "another-user" } }],
      summary: "bad",
    }, options)
  );
});
Deno.test("HTTP endpoint rejects unauthenticated callers without database access", async () => {
  const response = await handler(
    new Request("https://example.test", {
      method: "POST",
      body: '{"operation":"chat"}',
    }),
  );
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "unauthorized");
  assert.equal(
    (await handler(new Request("https://example.test", { method: "GET" })))
      .status,
    405,
  );
  assert.equal(
    (await handler(new Request("https://example.test", { method: "OPTIONS" })))
      .status,
    204,
  );
});
Deno.test("valid session sees unavailable model; forged user_id is rejected", async () => {
  const originalFetch = globalThis.fetch;
  const keys = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "AI_GATEWAY_API_KEY"];
  const old = keys.map((key) => Deno.env.get(key));
  Deno.env.set("SUPABASE_URL", "https://test.supabase.co");
  Deno.env.set("SUPABASE_ANON_KEY", "test-key");
  Deno.env.delete("AI_GATEWAY_API_KEY");
  globalThis.fetch = async (input) => {
    assert.match(String(input), /\/auth\/v1\/user/);
    return new Response(
      JSON.stringify({
        id: userId,
        aud: "authenticated",
        role: "authenticated",
        email: "test@example.invalid",
        app_metadata: {},
        user_metadata: {},
        created_at: new Date().toISOString(),
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  };
  const request = (body: unknown) =>
    new Request("https://example.test", {
      method: "POST",
      headers: { Authorization: "Bearer fake-token" },
      body: JSON.stringify(body),
    });
  try {
    const status = await handler(request({ operation: "status" }));
    assert.equal((await status.json()).configured, false);
    const valid = {
      operation: "chat",
      requestId: crypto.randomUUID(),
      conversationId: crypto.randomUUID(),
      prompt: "بررسی کن",
    };
    assert.equal((await handler(request(valid))).status, 503);
    assert.equal(
      (await handler(request({ ...valid, user_id: "forged" }))).status,
      400,
    );
  } finally {
    globalThis.fetch = originalFetch;
    keys.forEach((key, index) =>
      old[index] === undefined
        ? Deno.env.delete(key)
        : Deno.env.set(key, old[index]!)
    );
  }
});
