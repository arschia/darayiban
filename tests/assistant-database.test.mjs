import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  localContext,
  safeData,
  toRial,
} from "../supabase/functions/financial-assistant/core.ts";

const A = "10000000-0000-4000-8000-000000000001";
const B = "20000000-0000-4000-8000-000000000002";
const ID = "30000000-0000-4000-8000-000000000003";
const OTHER = "40000000-0000-4000-8000-000000000004";
const CONVERSATION = "50000000-0000-4000-8000-000000000005";
const RUN = "60000000-0000-4000-8000-000000000006";
const today = localContext();

test("money conversion and Tehran midnight stay consistent", () => {
  assert.equal(toRial(500000), 5000000);
  assert.equal(toRial(0.1), 1);
  assert.throws(() => toRial(-1));
  assert.throws(() => toRial(NaN));
  assert.throws(() => toRial("۵۰۰"));
  assert.equal(
    localContext(new Date("2026-09-05T20:29:59Z")).today,
    "2026-09-05",
  );
  assert.equal(
    localContext(new Date("2026-09-05T20:30:00Z")).today,
    "2026-09-06",
  );
  assert.equal(
    safeData("کارت 6037 9912 3456 7890"),
    "کارت [شماره حساب پوشانده شد]",
  );
});

test("Gemini credentials can only be resolved by the server role", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      await readFile(
        new URL("./fixtures/finance-schema.sql", import.meta.url),
        "utf8",
      ),
    );
    await db.exec(
      "create schema vault; create table vault.decrypted_secrets(name text, decrypted_secret text); insert into vault.decrypted_secrets values ('unrelated','do-not-read'),('darayiban_gemini_api_key','test-only-secret');",
    );
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/20260905132518_assistant_gemini_credentials.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(
        db.query("select public.assistant_model_credentials()"),
        /permission denied/,
      );
      await assert.rejects(
        db.query("select * from vault.decrypted_secrets"),
        /permission denied/,
      );
      await db.exec("reset role");
    }
    await db.exec("set role service_role");
    const { rows } = await db.query(
      "select public.assistant_model_credentials() as secret",
    );
    assert.equal(rows[0].secret, "test-only-secret");
  } finally {
    await db.close();
  }
});

test("PostgreSQL assistant ownership, mutations, idempotency and alerts", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(
      await readFile(
        new URL("./fixtures/finance-schema.sql", import.meta.url),
        "utf8",
      ),
    );
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/20260905125343_financial_assistant.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.query("insert into auth.users values ($1),($2)", [A, B]);
    await db.query(
      "insert into public.transactions(user_id,type,amount,currency,transaction_time,description) select $1,'withdrawal',1000,'IRR',$2,'manual purchase' from generate_series(1,1205)",
      [A, today.today_start],
    );
    await db.query(
      "insert into public.transactions(id,user_id,type,amount,currency,transaction_time,description) values ($1,$2,'withdrawal',200,'IRT',$3,'taxi'),($4,$5,'withdrawal',900000,'IRR',$3,'private')",
      [ID, A, today.today_start, OTHER, B],
    );
    await db.query(
      "insert into public.transactions(user_id,type,amount,currency,transaction_time,deleted_at) values ($1,'withdrawal',999,'USD',$2,null),($1,'withdrawal',800000,'IRR',$2,now())",
      [A, today.today_start],
    );
    await db.query(
      "insert into public.assistant_conversations(id,user_id,title) values($1,$2,'test')",
      [CONVERSATION, A],
    );
    await db.query(
      "insert into public.assistant_runs(id,user_id,conversation_id,prompt,model) values($1,$2,$3,'label these transactions','mock')",
      [RUN, A, CONVERSATION],
    );
    async function asUser(id, fn) {
      await db.exec("begin;set local role authenticated");
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
        id,
      ]);
      try {
        return await fn();
      } finally {
        await db.exec("rollback");
      }
    }
    async function patch(changes, entity = "transactions") {
      return (await db.query(
        "select public.assistant_apply_changes($1,$2,$3,$4) result",
        [RUN, entity, JSON.stringify(changes), "تغییر آزمایشی"],
      )).rows[0].result;
    }
    const old = (await db.query(
      "select to_jsonb(t) row from public.transactions t where id=$1",
      [ID],
    )).rows[0].row;

    await t.test("aggregates more than 1000 rows, excludes other owners and trash, respects units", () =>
      asUser(A, async () => {
        const result = (await db.query(
          "select public.assistant_financial_summary($1,$2) result",
          [today.today_start, today.tomorrow_start],
        )).rows[0].result;
        assert.equal(result.transaction_count, 1207);
        assert.equal(result.expense_toman, 120700);
        assert.equal(result.unsupported_currency_count, 1);
        assert.equal(
          (await db.query(
            "select id from public.transactions where user_id=$1",
            [B],
          )).rows.length,
          0,
        );
      }));
    await t.test("anonymous callers cannot read history or call assistant writes", async () => {
      await db.exec("begin;set local role anon");
      try {
        await assert.rejects(
          () => db.query("select * from public.assistant_runs"),
          /permission denied/,
        );
      } finally {
        await db.exec("rollback");
      }
    });
    await t.test("users cannot invoke service-only scheduling or run creation", () =>
      asUser(A, async () => {
        await assert.rejects(
          () => db.query("select public.assistant_due_spending_rules()"),
          /permission denied/,
        );
      }));
    await t.test("a foreign record in a batch rolls back earlier edits and audit rows", () =>
      asUser(A, async () => {
        await db.exec("savepoint edit_batch");
        await assert.rejects(
          () =>
            patch([{ id: ID, patch: { tags: ["اسنپ"] }, expected: old }, {
              id: OTHER,
              patch: { tags: ["اسنپ"] },
              expected: {},
            }]),
          /record_not_found/,
        );
        await db.exec("rollback to edit_batch");
        assert.deepEqual(
          (await db.query("select tags from public.transactions where id=$1", [
            ID,
          ])).rows[0].tags,
          [],
        );
        assert.equal(
          (await db.query("select * from public.assistant_actions")).rows
            .length,
          0,
        );
      }));
    await t.test("edits are audited and undo restores only the changed fields", () =>
      asUser(A, async () => {
        const result = await patch([{
          id: ID,
          patch: { category: "حمل‌ونقل", tags: ["اسنپ"] },
          expected: old,
        }]);
        assert.equal(result.length, 1);
        await db.query(
          "update public.transactions set amount=300 where id=$1",
          [ID],
        );
        await db.query("select public.assistant_undo_action($1)", [
          result[0].action_id,
        ]);
        const row = (await db.query(
          "select amount,tags,category from public.transactions where id=$1",
          [ID],
        )).rows[0];
        assert.deepEqual(row.tags, []);
        assert.equal(Number(row.amount), 300);
        assert.equal(row.category, null);
        assert.ok(
          (await db.query("select undone_at from public.assistant_actions"))
            .rows[0].undone_at,
        );
      }));
    await t.test("stale edits and undo cannot overwrite a newer change", () =>
      asUser(A, async () => {
        const result = await patch([{
          id: ID,
          patch: { category: "حمل‌ونقل" },
          expected: old,
        }]);
        await db.query(
          "update public.transactions set category='کار' where id=$1",
          [ID],
        );
        await assert.rejects(
          () =>
            db.query("select public.assistant_undo_action($1)", [
              result[0].action_id,
            ]),
          /record_changed/,
        );
      }));
    await t.test("ownership fields and unapproved tables cannot be edited", () =>
      asUser(A, async () => {
        await assert.rejects(
          () => patch([{ id: ID, patch: { user_id: B }, expected: old }]),
          /invalid_fields/,
        );
      }));
    await t.test("creating a budget has an undo receipt", () =>
      asUser(A, async () => {
        const result = await patch([{
          patch: {
            name: "رفت‌وآمد",
            amount: 5000000,
            currency: "IRR",
            period_start: today.today,
            period_end: today.today,
            tag: "اسنپ",
          },
        }], "budgets");
        assert.equal(
          (await db.query("select * from public.budgets")).rows.length,
          1,
        );
        await db.query("select public.assistant_undo_action($1)", [
          result[0].action_id,
        ]);
        assert.equal(
          (await db.query("select * from public.budgets")).rows.length,
          0,
        );
      }));
    await t.test("today alerts count every transaction, distinguish > from >=, expire, and dedupe", async () => {
      await db.exec("begin");
      try {
        const rule = (await db.query(
          "insert into public.assistant_spending_rules(user_id,title,threshold,starts_on,ends_on) values($1,'today',1207000,$2,$2) returning id",
          [A, today.today],
        )).rows[0].id;
        assert.equal(
          (await db.query(
            "select * from public.assistant_due_spending_rules()",
          )).rows.length,
          0,
        );
        await db.query(
          "update public.assistant_spending_rules set threshold=1206999 where id=$1",
          [rule],
        );
        const due = (await db.query(
          "select * from public.assistant_due_spending_rules()",
        )).rows;
        assert.equal(due.length, 1);
        assert.equal(Number(due[0].total), 1207000);
        const claim = (await db.query(
          "select public.assistant_claim_spending_alert($1) result",
          [rule],
        )).rows[0].result;
        assert.ok(claim.delivery_id);
        assert.equal(
          (await db.query(
            "select public.assistant_claim_spending_alert($1) result",
            [rule],
          )).rows[0].result,
          null,
        );
        await db.query(
          "update public.notification_deliveries set status='failed',last_attempt_at=now()-interval '6 minutes' where id=$1",
          [claim.delivery_id],
        );
        assert.ok(
          (await db.query(
            "select public.assistant_claim_spending_alert($1) result",
            [rule],
          )).rows[0].result,
        );
        await db.query(
          "update public.assistant_spending_rules set starts_on=$1::date-1,ends_on=$1::date-1 where id=$2",
          [today.today, rule],
        );
        assert.equal(
          (await db.query(
            "select * from public.assistant_due_spending_rules()",
          )).rows.length,
          0,
        );
      } finally {
        await db.exec("rollback");
      }
    });
    await t.test("Tehran date bounds exclude yesterday and tomorrow and tag filters are exact", async () => {
      await db.exec("begin");
      try {
        await db.query(
          "insert into public.transactions(user_id,type,amount,currency,transaction_time,tags) values($1,'withdrawal',999000,'IRR',$2::timestamptz-interval '1 second',array['اسنپ']),($1,'withdrawal',888000,'IRR',$3,array['اسنپ'])",
          [A, today.today_start, today.tomorrow_start],
        );
        await db.query(
          "update public.transactions set tags=array['اسنپ'] where id=$1",
          [ID],
        );
        await db.query(
          "insert into public.assistant_spending_rules(user_id,title,threshold,starts_on,tag) values($1,'taxi',1999,$2,'اسنپ')",
          [A, today.today],
        );
        assert.equal(
          Number(
            (await db.query(
              "select * from public.assistant_due_spending_rules()",
            )).rows[0].total,
          ),
          2000,
        );
      } finally {
        await db.exec("rollback");
      }
    });
    await t.test("replayed request IDs return an existing run without starting another generation", async () => {
      await db.exec("begin;set local role service_role");
      try {
        const run = crypto.randomUUID(), conv = crypto.randomUUID();
        const args = [B, run, conv, "analyze", "mock"];
        const first = (await db.query(
          "select public.assistant_start_run($1,$2,$3,$4,$5) result",
          args,
        )).rows[0].result;
        const second = (await db.query(
          "select public.assistant_start_run($1,$2,$3,$4,$5) result",
          args,
        )).rows[0].result;
        assert.equal(first.created, true);
        assert.equal(second.created, false);
        assert.equal(first.run.id, second.run.id);
        await assert.rejects(
          () =>
            db.query("select public.assistant_start_run($1,$2,$3,$4,$5)", [
              B,
              crypto.randomUUID(),
              conv,
              "another",
              "mock",
            ]),
          /request_in_progress/,
        );
      } finally {
        await db.exec("rollback");
      }
    });
  } finally {
    await db.close();
  }
});
