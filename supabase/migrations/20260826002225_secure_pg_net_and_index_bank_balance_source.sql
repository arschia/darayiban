drop extension if exists pg_net;
create extension pg_net with schema extensions;

create index if not exists bank_balances_source_transaction_idx
  on public.bank_balances(source_transaction_id);
