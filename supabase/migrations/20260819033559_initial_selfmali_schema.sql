create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  base_currency text not null default 'IRR',
  locale text not null default 'fa-IR',
  timezone text not null default 'Asia/Tehran',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('expense','income','both')),
  icon text,
  created_at timestamptz not null default now(),
  unique(user_id, name)
);

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  bank_name text,
  account_type text not null default 'bank' check (account_type in ('bank','cash','wallet','crypto','other')),
  currency text not null default 'IRR',
  card_last4 text,
  account_hint text,
  current_balance numeric(22,4),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  destination_account_id uuid references public.accounts(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  direction text not null check (direction in ('expense','income','transfer')),
  transaction_type text not null default 'other',
  amount numeric(22,4) not null check (amount >= 0),
  currency text not null default 'IRR',
  balance_after numeric(22,4),
  description text,
  counterparty text,
  bank_name text,
  occurred_at timestamptz not null default now(),
  source text not null default 'manual' check (source in ('manual','iphone_shortcut','import','system')),
  external_ref text,
  raw_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.obligations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('debt','receivable')),
  title text not null,
  counterparty text,
  original_amount numeric(22,4) not null check (original_amount >= 0),
  remaining_amount numeric(22,4) not null check (remaining_amount >= 0),
  currency text not null default 'IRR',
  due_date date,
  status text not null default 'open' check (status in ('open','partial','settled','cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.obligation_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  obligation_id uuid not null references public.obligations(id) on delete cascade,
  amount numeric(22,4) not null check (amount > 0),
  paid_at timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_type text not null check (asset_type in ('cash','fiat','crypto','gold','silver','fund','stock','other')),
  symbol text not null,
  name text not null,
  quantity numeric(30,10) not null default 0,
  currency text,
  manual_unit_price numeric(30,10),
  pricing_provider text,
  target_percent numeric(7,4) check (target_percent is null or (target_percent >= 0 and target_percent <= 100)),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.asset_prices (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  quote_currency text not null default 'IRR',
  price numeric(30,10) not null,
  provider text not null,
  fetched_at timestamptz not null default now(),
  unique(symbol, quote_currency, provider)
);

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category_id uuid references public.categories(id) on delete set null,
  amount numeric(22,4) not null check (amount >= 0),
  currency text not null default 'IRR',
  period_start date not null,
  period_end date not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create table if not exists public.automation_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'iPhone Shortcut',
  token_hash text not null unique,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.ingest_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null default 'iphone_shortcut',
  status text not null check (status in ('received','parsed','ignored','failed')),
  bank_name text,
  transaction_id uuid references public.transactions(id) on delete set null,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists transactions_user_occurred_idx on public.transactions(user_id, occurred_at desc);
create index if not exists transactions_user_direction_idx on public.transactions(user_id, direction);
create index if not exists obligations_user_due_idx on public.obligations(user_id, due_date);
create index if not exists assets_user_idx on public.assets(user_id);
create index if not exists budgets_user_period_idx on public.budgets(user_id, period_start, period_end);
create index if not exists ingest_events_user_created_idx on public.ingest_events(user_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger set_accounts_updated_at before update on public.accounts for each row execute function public.set_updated_at();
create trigger set_transactions_updated_at before update on public.transactions for each row execute function public.set_updated_at();
create trigger set_obligations_updated_at before update on public.obligations for each row execute function public.set_updated_at();
create trigger set_assets_updated_at before update on public.assets for each row execute function public.set_updated_at();
create trigger set_budgets_updated_at before update on public.budgets for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;

  insert into public.categories(user_id, name, kind, icon) values
    (new.id, 'خوراک', 'expense', 'utensils'),
    (new.id, 'رفت‌وآمد', 'expense', 'car'),
    (new.id, 'خرید', 'expense', 'shopping-bag'),
    (new.id, 'قبوض', 'expense', 'receipt'),
    (new.id, 'تفریح', 'expense', 'sparkles'),
    (new.id, 'انتقال وجه', 'both', 'arrow-left-right'),
    (new.id, 'حقوق', 'income', 'wallet'),
    (new.id, 'سایر', 'both', 'circle-ellipsis')
  on conflict (user_id, name) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.accounts enable row level security;
alter table public.transactions enable row level security;
alter table public.obligations enable row level security;
alter table public.obligation_payments enable row level security;
alter table public.assets enable row level security;
alter table public.asset_prices enable row level security;
alter table public.budgets enable row level security;
alter table public.automation_tokens enable row level security;
alter table public.ingest_events enable row level security;

create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "categories_own_all" on public.categories for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "accounts_own_all" on public.accounts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "transactions_own_all" on public.transactions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "obligations_own_all" on public.obligations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "obligation_payments_own_all" on public.obligation_payments for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "assets_own_all" on public.assets for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "budgets_own_all" on public.budgets for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "automation_tokens_own_all" on public.automation_tokens for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "ingest_events_own_select" on public.ingest_events for select using (auth.uid() = user_id);
create policy "asset_prices_authenticated_read" on public.asset_prices for select to authenticated using (true);
