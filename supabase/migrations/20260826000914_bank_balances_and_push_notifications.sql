
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create table if not exists public.bank_balances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bank_name text not null,
  account_hint text not null default '',
  balance numeric not null,
  currency text not null default 'IRR',
  reported_at timestamptz not null,
  source_transaction_id uuid references public.transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, bank_name, account_hint)
);

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  daily_limit numeric,
  daily_limit_enabled boolean not null default false,
  daily_summary_enabled boolean not null default false,
  daily_summary_time time not null default '21:00',
  timezone text not null default 'Asia/Tehran',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_daily_limit_positive check (daily_limit is null or daily_limit > 0)
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  dedupe_key text not null,
  title text not null,
  body text not null,
  status text not null default 'pending',
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key),
  constraint notification_delivery_status check (status in ('pending','sent','failed','skipped'))
);

create index if not exists bank_balances_user_updated_idx
  on public.bank_balances(user_id, updated_at desc);
create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions(user_id);
create index if not exists notification_deliveries_user_created_idx
  on public.notification_deliveries(user_id, created_at desc);

drop trigger if exists set_bank_balances_updated_at on public.bank_balances;
create trigger set_bank_balances_updated_at before update on public.bank_balances
for each row execute function public.set_updated_at();
drop trigger if exists set_notification_preferences_updated_at on public.notification_preferences;
create trigger set_notification_preferences_updated_at before update on public.notification_preferences
for each row execute function public.set_updated_at();

alter table public.bank_balances enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_deliveries enable row level security;

drop policy if exists bank_balances_select_own on public.bank_balances;
create policy bank_balances_select_own on public.bank_balances
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists notification_preferences_own_all on public.notification_preferences;
create policy notification_preferences_own_all on public.notification_preferences
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists push_subscriptions_own_all on public.push_subscriptions;
create policy push_subscriptions_own_all on public.push_subscriptions
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists notification_deliveries_select_own on public.notification_deliveries;
create policy notification_deliveries_select_own on public.notification_deliveries
for select to authenticated using ((select auth.uid()) = user_id);

revoke all on table public.bank_balances, public.notification_preferences,
  public.push_subscriptions, public.notification_deliveries from anon;
grant select on table public.bank_balances, public.notification_deliveries to authenticated;
grant select, insert, update, delete on table public.notification_preferences,
  public.push_subscriptions to authenticated;

create or replace function public.record_bank_balance(
  p_user_id uuid,
  p_bank_name text,
  p_account_hint text,
  p_balance numeric,
  p_currency text,
  p_reported_at timestamptz,
  p_transaction_id uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.bank_balances (
    user_id, bank_name, account_hint, balance, currency, reported_at, source_transaction_id
  )
  values (
    p_user_id, p_bank_name, coalesce(p_account_hint, ''), p_balance, p_currency, p_reported_at, p_transaction_id
  )
  on conflict (user_id, bank_name, account_hint)
  do update set
    balance = excluded.balance,
    currency = excluded.currency,
    reported_at = excluded.reported_at,
    source_transaction_id = excluded.source_transaction_id,
    updated_at = now()
  where excluded.reported_at >= public.bank_balances.reported_at;
$$;
revoke all on function public.record_bank_balance(uuid,text,text,numeric,text,timestamptz,uuid) from public, anon, authenticated;
grant execute on function public.record_bank_balance(uuid,text,text,numeric,text,timestamptz,uuid) to service_role;

-- Production secrets are created out-of-band in Supabase Vault:
-- darayiban_vapid_public, darayiban_vapid_private, darayiban_cron_secret,
-- and darayiban_project_url. Never commit their values to Git.

create or replace function public.get_push_config()
returns table(public_key text, private_key text, subject text, cron_secret text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select decrypted_secret from vault.decrypted_secrets where name = 'darayiban_vapid_public' limit 1),
    (select decrypted_secret from vault.decrypted_secrets where name = 'darayiban_vapid_private' limit 1),
    'https://selfmali.vercel.app'::text,
    (select decrypted_secret from vault.decrypted_secrets where name = 'darayiban_cron_secret' limit 1);
$$;
revoke all on function public.get_push_config() from public, anon, authenticated;
grant execute on function public.get_push_config() to service_role;

select cron.schedule(
  'darayiban-daily-summary',
  '*/5 * * * *',
  $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'darayiban_project_url' limit 1)
        || '/functions/v1/send-daily-summary',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'darayiban_cron_secret' limit 1)
      ),
      body := jsonb_build_object('invoked_at', now()),
      timeout_milliseconds := 10000
    );
  $cron$
);
