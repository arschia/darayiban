alter table public.transactions
  add column if not exists tags text[] not null default '{}'::text[],
  add column if not exists deleted_at timestamptz,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists currency text not null default 'IRR';

alter table public.budgets
  add column if not exists tag text;

create index if not exists transactions_user_active_time_idx
  on public.transactions (user_id, deleted_at, transaction_time desc);
