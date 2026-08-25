alter table public.transactions
  add column if not exists external_ref text,
  add column if not exists bank_name text,
  add column if not exists source text not null default 'manual';

create unique index if not exists transactions_user_external_ref_uidx
  on public.transactions (user_id, external_ref)
  where external_ref is not null;

create index if not exists transactions_user_time_desc_idx
  on public.transactions (user_id, transaction_time desc);

drop policy if exists "accounts_own_all" on public.accounts;
create policy "accounts_own_all" on public.accounts
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "categories_own_all" on public.categories;
create policy "categories_own_all" on public.categories
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "budgets_own_all" on public.budgets;
create policy "budgets_own_all" on public.budgets
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "obligations_own_all" on public.obligations;
create policy "obligations_own_all" on public.obligations
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "obligation_payments_own_all" on public.obligation_payments;
create policy "obligation_payments_own_all" on public.obligation_payments
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "automation_tokens_own_all" on public.automation_tokens;
create policy "automation_tokens_own_all" on public.automation_tokens
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "ingest_events_own_select" on public.ingest_events;
create policy "ingest_events_own_select" on public.ingest_events
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "asset_prices_authenticated_read" on public.asset_prices;
create policy "asset_prices_authenticated_read" on public.asset_prices
  for select to authenticated
  using (true);

drop policy if exists "Users can view own transactions" on public.transactions;
drop policy if exists "Users can insert own transactions" on public.transactions;
drop policy if exists "Users can update own transactions" on public.transactions;
drop policy if exists "Users can delete own transactions" on public.transactions;
create policy "transactions_own_all" on public.transactions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can view own debts_credits" on public.debts_credits;
drop policy if exists "Users can insert own debts_credits" on public.debts_credits;
drop policy if exists "Users can update own debts_credits" on public.debts_credits;
drop policy if exists "Users can delete own debts_credits" on public.debts_credits;
create policy "debts_credits_own_all" on public.debts_credits
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can view own assets" on public.assets;
drop policy if exists "Users can insert own assets" on public.assets;
drop policy if exists "Users can update own assets" on public.assets;
drop policy if exists "Users can delete own assets" on public.assets;
create policy "assets_own_all" on public.assets
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can view own budget_targets" on public.budget_targets;
drop policy if exists "Users can insert own budget_targets" on public.budget_targets;
drop policy if exists "Users can update own budget_targets" on public.budget_targets;
drop policy if exists "Users can delete own budget_targets" on public.budget_targets;
create policy "budget_targets_own_all" on public.budget_targets
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.accounts, public.categories, public.budgets,
  public.obligations, public.obligation_payments, public.automation_tokens,
  public.ingest_events, public.profiles, public.asset_prices, public.transactions,
  public.debts_credits, public.assets, public.budget_targets from anon;

grant select, insert, update, delete on table
  public.accounts, public.categories, public.budgets, public.obligations,
  public.obligation_payments, public.automation_tokens, public.transactions,
  public.debts_credits, public.assets, public.budget_targets to authenticated;

grant select, update on table public.profiles to authenticated;
grant select on table public.ingest_events, public.asset_prices to authenticated;
