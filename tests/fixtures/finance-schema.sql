create schema auth;
create role anon;
create role authenticated;
create role service_role bypassrls;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated,anon,service_role;
grant execute on function auth.uid() to authenticated,anon,service_role;
create schema cron;
create function cron.schedule(text,text,text) returns bigint language sql as $$ select 1::bigint $$;
create table public.profiles ("id" uuid not null,
"full_name" text,
"base_currency" text not null default 'IRR'::text,
"locale" text not null default 'fa-IR'::text,
"timezone" text not null default 'Asia/Tehran'::text,
"created_at" timestamp with time zone not null default now(),
"updated_at" timestamp with time zone not null default now(),
primary key (id));
alter table public.profiles enable row level security;
create policy own on public.profiles for all to authenticated using ((select auth.uid())=id) with check ((select auth.uid())=id);
create table public.categories ("id" uuid not null default gen_random_uuid(),
"user_id" uuid not null,
"name" text not null,
"kind" text not null check (kind = ANY (ARRAY['expense'::text, 'income'::text, 'both'::text])),
"icon" text,
"created_at" timestamp with time zone not null default now(),
primary key (id));
alter table public.categories enable row level security;
create policy own on public.categories for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create table public.accounts ("id" uuid not null default gen_random_uuid(),
"user_id" uuid not null,
"name" text not null,
"bank_name" text,
"account_type" text not null default 'bank'::text check (account_type = ANY (ARRAY['bank'::text, 'cash'::text, 'wallet'::text, 'crypto'::text, 'other'::text])),
"currency" text not null default 'IRR'::text,
"card_last4" text,
"account_hint" text,
"current_balance" numeric,
"is_active" boolean not null default true,
"created_at" timestamp with time zone not null default now(),
"updated_at" timestamp with time zone not null default now(),
primary key (id));
alter table public.accounts enable row level security;
create policy own on public.accounts for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create table public.obligations ("id" uuid not null default gen_random_uuid(),
"user_id" uuid not null,
"kind" text not null check (kind = ANY (ARRAY['debt'::text, 'receivable'::text])),
"title" text not null,
"counterparty" text,
"original_amount" numeric not null check (original_amount >= 0::numeric),
"remaining_amount" numeric not null check (remaining_amount >= 0::numeric),
"currency" text not null default 'IRR'::text,
"due_date" date,
"status" text not null default 'open'::text check (status = ANY (ARRAY['open'::text, 'partial'::text, 'settled'::text, 'cancelled'::text])),
"notes" text,
"created_at" timestamp with time zone not null default now(),
"updated_at" timestamp with time zone not null default now(),
primary key (id));
alter table public.obligations enable row level security;
create policy own on public.obligations for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create table public.obligation_payments ("id" uuid not null default gen_random_uuid(),
"user_id" uuid not null,
"obligation_id" uuid not null,
"amount" numeric not null check (amount > 0::numeric),
"paid_at" timestamp with time zone not null default now(),
"note" text,
"created_at" timestamp with time zone not null default now(),
primary key (id));
alter table public.obligation_payments enable row level security;
create policy own on public.obligation_payments for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create table public.asset_prices ("id" uuid not null default gen_random_uuid(),
"symbol" text not null,
"quote_currency" text not null default 'IRR'::text,
"price" numeric not null,
"provider" text not null,
"fetched_at" timestamp with time zone not null default now(),
primary key (id));
create table public.budgets ("id" uuid not null default gen_random_uuid(),
"user_id" uuid not null,
"name" text not null,
"category_id" uuid,
"amount" numeric not null check (amount >= 0::numeric),
"currency" text not null default 'IRR'::text,
"period_start" date not null,
"period_end" date not null,
"notes" text,
"created_at" timestamp with time zone not null default now(),
"updated_at" timestamp with time zone not null default now(),
"tag" text,
primary key (id));
alter table public.budgets enable row level security;
create policy own on public.budgets for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create table public.automation_tokens ("id" uuid not null default gen_random_uuid(),
"user_id" uuid not null,
"label" text not null default 'iPhone Shortcut'::text,
"token_hash" text not null,
"last_used_at" timestamp with time zone,
"revoked_at" timestamp with time zone,
"created_at" timestamp with time zone not null default now(),
primary key (id));
alter table public.automation_tokens enable row level security;
create policy own on public.automation_tokens for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create table public.ingest_events ("id" uuid not null default gen_random_uuid(),
"user_id" uuid not null,
"source" text not null default 'iphone_shortcut'::text,
"status" text not null check (status = ANY (ARRAY['received'::text, 'parsed'::text, 'ignored'::text, 'failed'::text])),
"bank_name" text,
"transaction_id" uuid,
"error_message" text,
"created_at" timestamp with time zone not null default now(),
primary key (id));
alter table public.ingest_events enable row level security;
create policy own on public.ingest_events for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create table public.transactions ("id" uuid not null default gen_random_uuid(),
"user_id" uuid not null,
"type" text not null check (type = ANY (ARRAY['deposit'::text, 'withdrawal'::text])),
"amount" numeric not null,
"description" text,
"from_card" text,
"to_card" text,
"transaction_time" timestamp with time zone not null default now(),
"category" text,
"created_at" timestamp with time zone default now(),
"external_ref" text,
"bank_name" text,
"source" text not null default 'manual'::text,
"tags" text[] not null default '{}'::text[],
"deleted_at" timestamp with time zone,
"updated_at" timestamp with time zone not null default now(),
"currency" text not null default 'IRR'::text,
primary key (id));
alter table public.transactions enable row level security;
create policy own on public.transactions for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create table public.debts_credits ("id" uuid not null default gen_random_uuid(),
"user_id" uuid not null,
"type" text not null check (type = ANY (ARRAY['debt'::text, 'credit'::text])),
"person_name" text not null,
"amount" numeric not null,
"description" text,
"due_date" date,
"is_settled" boolean default false,
"created_at" timestamp with time zone default now(),
primary key (id));
alter table public.debts_credits enable row level security;
create policy own on public.debts_credits for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create table public.assets ("id" uuid not null default gen_random_uuid(),
"user_id" uuid not null,
"asset_type" text not null check (asset_type = ANY (ARRAY['gold'::text, 'silver'::text, 'usd'::text, 'eur'::text, 'usdt'::text, 'btc'::text, 'toman_cash'::text])),
"quantity" numeric not null,
"purchase_price" numeric,
"purchase_date" date,
"notes" text,
"created_at" timestamp with time zone default now(),
primary key (id));
alter table public.assets enable row level security;
create policy own on public.assets for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create table public.budget_targets ("id" uuid not null default gen_random_uuid(),
"user_id" uuid not null,
"asset_type" text not null,
"target_percentage" numeric not null check (target_percentage >= 0::numeric AND target_percentage <= 100::numeric),
"created_at" timestamp with time zone default now(),
primary key (id));
alter table public.budget_targets enable row level security;
create policy own on public.budget_targets for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create table public.bank_balances ("id" uuid not null default gen_random_uuid(),
"user_id" uuid not null,
"bank_name" text not null,
"account_hint" text not null default ''::text,
"balance" numeric not null,
"currency" text not null default 'IRR'::text,
"reported_at" timestamp with time zone not null,
"source_transaction_id" uuid,
"created_at" timestamp with time zone not null default now(),
"updated_at" timestamp with time zone not null default now(),
primary key (id));
alter table public.bank_balances enable row level security;
create policy own on public.bank_balances for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create table public.notification_preferences ("user_id" uuid not null,
"daily_limit" numeric check (daily_limit IS NULL OR daily_limit > 0::numeric),
"daily_limit_enabled" boolean not null default false,
"daily_summary_enabled" boolean not null default false,
"daily_summary_time" time without time zone not null default '21:00:00'::time without time zone,
"timezone" text not null default 'Asia/Tehran'::text,
"created_at" timestamp with time zone not null default now(),
"updated_at" timestamp with time zone not null default now(),
primary key (user_id));
alter table public.notification_preferences enable row level security;
create policy own on public.notification_preferences for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create table public.push_subscriptions ("id" uuid not null default gen_random_uuid(),
"user_id" uuid not null,
"endpoint" text not null,
"p256dh" text not null,
"auth" text not null,
"user_agent" text,
"created_at" timestamp with time zone not null default now(),
"last_used_at" timestamp with time zone not null default now(),
primary key (id));
alter table public.push_subscriptions enable row level security;
create policy own on public.push_subscriptions for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create table public.notification_deliveries ("id" uuid not null default gen_random_uuid(),
"user_id" uuid not null,
"kind" text not null,
"dedupe_key" text not null,
"title" text not null,
"body" text not null,
"status" text not null default 'pending'::text check (status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text, 'skipped'::text])),
"sent_at" timestamp with time zone,
"error_message" text,
"created_at" timestamp with time zone not null default now(),
primary key (id));
alter table public.notification_deliveries enable row level security;
create policy own on public.notification_deliveries for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create unique index fixture_delivery_dedupe on public.notification_deliveries(user_id,dedupe_key);
grant all on all tables in schema public to authenticated, service_role;

