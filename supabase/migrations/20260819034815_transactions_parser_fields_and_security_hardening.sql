alter table public.transactions add column if not exists source_card_hint text;
alter table public.transactions add column if not exists destination_card_hint text;
alter table public.transactions add column if not exists merchant text;

create unique index if not exists transactions_user_external_ref_uidx
  on public.transactions(user_id, external_ref)
  where external_ref is not null;
create index if not exists accounts_user_idx on public.accounts(user_id);
create index if not exists automation_tokens_user_idx on public.automation_tokens(user_id);
create index if not exists budgets_category_idx on public.budgets(category_id);
create index if not exists ingest_events_transaction_idx on public.ingest_events(transaction_id);
create index if not exists obligation_payments_obligation_idx on public.obligation_payments(obligation_id);
create index if not exists obligation_payments_user_idx on public.obligation_payments(user_id);
create index if not exists transactions_account_idx on public.transactions(account_id);
create index if not exists transactions_destination_account_idx on public.transactions(destination_account_id);
create index if not exists transactions_category_idx on public.transactions(category_id);

alter function public.set_updated_at() set search_path = public;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Recreate RLS policies using init-plan friendly auth lookup.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select using ((select auth.uid()) = id);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists categories_own_all on public.categories;
create policy categories_own_all on public.categories for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists accounts_own_all on public.accounts;
create policy accounts_own_all on public.accounts for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists transactions_own_all on public.transactions;
create policy transactions_own_all on public.transactions for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists obligations_own_all on public.obligations;
create policy obligations_own_all on public.obligations for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists obligation_payments_own_all on public.obligation_payments;
create policy obligation_payments_own_all on public.obligation_payments for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists assets_own_all on public.assets;
create policy assets_own_all on public.assets for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists budgets_own_all on public.budgets;
create policy budgets_own_all on public.budgets for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists automation_tokens_own_all on public.automation_tokens;
create policy automation_tokens_own_all on public.automation_tokens for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists ingest_events_own_select on public.ingest_events;
create policy ingest_events_own_select on public.ingest_events for select using ((select auth.uid()) = user_id);
