drop policy if exists bank_balances_update_own on public.bank_balances;

create policy bank_balances_update_own
on public.bank_balances
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke all privileges on table public.bank_balances from authenticated;
grant select on table public.bank_balances to authenticated;
grant update (balance, currency, reported_at, source_transaction_id)
on table public.bank_balances to authenticated;
