-- Additive migration for the financial assistant. No existing financial rows are changed.
create table public.assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create table public.assistant_runs (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null,
  prompt text not null check (char_length(prompt) between 1 and 4000),
  answer text,
  model text not null,
  status text not null default 'running' check (status in ('running','completed','failed')),
  token_usage jsonb not null default '{}',
  estimated_cost_usd numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (conversation_id,user_id) references public.assistant_conversations(id,user_id) on delete cascade
);
create unique index assistant_one_active_run on public.assistant_runs(conversation_id) where status = 'running';
create index assistant_runs_user_time on public.assistant_runs(user_id,created_at desc);
create index assistant_runs_conversation on public.assistant_runs(conversation_id,created_at);
create index assistant_conversations_user_time on public.assistant_conversations(user_id,created_at desc);
create table public.assistant_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid not null,
  entity text not null,
  record_id uuid not null,
  before_values jsonb,
  after_values jsonb not null,
  summary text not null,
  undone_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (run_id,user_id) references public.assistant_runs(id,user_id) on delete cascade
);
create index assistant_actions_user_run on public.assistant_actions(user_id,run_id);
create table public.assistant_spending_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  threshold numeric not null check (threshold > 0 and threshold <= 1e15),
  tag text check (char_length(tag) <= 60),
  category text check (char_length(category) <= 100),
  starts_on date not null,
  ends_on date,
  timezone text not null default 'Asia/Tehran' check (timezone = 'Asia/Tehran'),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);
create index assistant_spending_rules_user on public.assistant_spending_rules(user_id);

alter table public.assistant_conversations enable row level security;
alter table public.assistant_runs enable row level security;
alter table public.assistant_actions enable row level security;
alter table public.assistant_spending_rules enable row level security;
create policy assistant_conversations_own on public.assistant_conversations for select to authenticated using ((select auth.uid())=user_id);
create policy assistant_runs_own on public.assistant_runs for select to authenticated using ((select auth.uid())=user_id);
create policy assistant_actions_own_select on public.assistant_actions for select to authenticated using ((select auth.uid())=user_id);
create policy assistant_actions_own_insert on public.assistant_actions for insert to authenticated with check ((select auth.uid())=user_id);
create policy assistant_actions_own_update on public.assistant_actions for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy assistant_rules_own on public.assistant_spending_rules for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
revoke all on public.assistant_conversations, public.assistant_runs, public.assistant_actions, public.assistant_spending_rules from anon, authenticated;
grant select on public.assistant_conversations, public.assistant_runs, public.assistant_actions to authenticated;
grant insert on public.assistant_actions to authenticated;
grant update (undone_at) on public.assistant_actions to authenticated;
grant select,insert,update,delete on public.assistant_spending_rules to authenticated;
grant all on public.assistant_conversations, public.assistant_runs, public.assistant_actions, public.assistant_spending_rules to service_role;

-- Service-only: authenticates at the Edge Function first, then creates a durable,
-- idempotent request under an atomic per-user rate/concurrency limit.
create function public.assistant_start_run(p_user_id uuid,p_id uuid,p_conversation_id uuid,p_prompt text,p_model text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result public.assistant_runs;
begin
  if p_user_id is null then raise exception 'unauthorized'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  select * into result from public.assistant_runs where id=p_id;
  if found then
    if result.user_id<>p_user_id or result.conversation_id<>p_conversation_id or result.prompt<>p_prompt then raise exception 'request_conflict'; end if;
    if result.status='running' and result.created_at<now()-interval '3 minutes' then
      update public.assistant_runs set status='failed',answer=coalesce(answer,'پاسخ در زمان مجاز کامل نشد. تغییرات ثبت‌شده را بررسی کن.'),updated_at=now() where id=p_id returning * into result;
    end if;
    return jsonb_build_object('run',to_jsonb(result),'created',false);
  end if;
  update public.assistant_runs set status='failed',answer=coalesce(answer,'پاسخ در زمان مجاز کامل نشد. تغییرات ثبت‌شده را بررسی کن.'),updated_at=now()
    where user_id=p_user_id and status='running' and created_at<now()-interval '3 minutes';
  if exists(select 1 from public.assistant_runs where user_id=p_user_id and status='running') then raise exception 'request_in_progress'; end if;
  if (select count(*) from public.assistant_runs where user_id=p_user_id and created_at>now()-interval '1 minute')>=8
    or (select count(*) from public.assistant_runs where user_id=p_user_id and created_at>now()-interval '24 hours')>=60 then raise exception 'rate_limit'; end if;
  insert into public.assistant_conversations(id,user_id,title) values(p_conversation_id,p_user_id,left(p_prompt,100)) on conflict(id) do nothing;
  if not exists(select 1 from public.assistant_conversations where id=p_conversation_id and user_id=p_user_id) then raise exception 'unauthorized'; end if;
  if (select count(*) from public.assistant_runs where conversation_id=p_conversation_id)>=100 then raise exception 'conversation_full'; end if;
  insert into public.assistant_runs(id,user_id,conversation_id,prompt,model) values(p_id,p_user_id,p_conversation_id,p_prompt,p_model) returning * into result;
  return jsonb_build_object('run',to_jsonb(result),'created',true);
end; $$;
revoke all on function public.assistant_start_run(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.assistant_start_run(uuid,uuid,uuid,text,text) to service_role;

-- Exact database aggregation, independent of the UI's 250-row limit.
create function public.assistant_financial_summary(p_start timestamptz default null,p_end timestamptz default null)
returns jsonb language sql stable security invoker set search_path='' as $$
  with scoped as (
    select *,case when currency='IRR' then amount/10 when currency='IRT' then amount end as toman
    from public.transactions where user_id=(select auth.uid()) and deleted_at is null
      and (p_start is null or transaction_time>=p_start) and (p_end is null or transaction_time<p_end)
  ), groups as (
    select coalesce(category,'بدون دسته') as category,count(*) as count,
      coalesce(sum(toman) filter(where type='withdrawal'),0) as expense_toman
    from scoped group by category
  ) select jsonb_build_object('transaction_count',(select count(*) from scoped),
    'income_toman',(select coalesce(sum(toman) filter(where type='deposit'),0) from scoped),
    'expense_toman',(select coalesce(sum(toman) filter(where type='withdrawal'),0) from scoped),
    'unsupported_currency_count',(select count(*) from scoped where toman is null),
    'by_category',(select coalesce(jsonb_agg(to_jsonb(groups)),'[]') from groups),'start',p_start,'end_exclusive',p_end);
$$;
revoke all on function public.assistant_financial_summary(timestamptz,timestamptz) from public,anon;
grant execute on function public.assistant_financial_summary(timestamptz,timestamptz) to authenticated;

-- Fixed allowlists + RLS + row locks + audit writes in the same transaction.
-- A batch either succeeds completely or makes no changes.
create function public.assistant_apply_changes(p_run_id uuid,p_entity text,p_changes jsonb,p_summary text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare allowed text[]; item jsonb; patch jsonb; old_row jsonb; new_row jsonb; before_patch jsonb;
  row_id uuid; action_id uuid; assignments text; columns_sql text; values_sql text; result jsonb='[]'; uid uuid=auth.uid();
begin
  if uid is null or not exists(select 1 from public.assistant_runs where id=p_run_id and user_id=uid and status='running' and created_at>now()-interval '3 minutes') then raise exception 'unauthorized_run'; end if;
  allowed := case p_entity
    when 'transactions' then array['description','category','tags','amount','type','transaction_time','currency']
    when 'budgets' then array['name','amount','currency','period_start','period_end','tag','notes']
    when 'obligations' then array['title','counterparty','original_amount','remaining_amount','currency','due_date','status','notes','kind']
    when 'assets' then array['asset_type','quantity','purchase_price','purchase_date','notes']
    when 'bank_balances' then array['balance','currency','reported_at']
    when 'budget_targets' then array['target_percentage','asset_type']
    when 'assistant_spending_rules' then array['title','threshold','tag','category','starts_on','ends_on','timezone','enabled']
    else null end;
  if allowed is null or jsonb_typeof(p_changes)<>'array' or jsonb_array_length(p_changes) not between 1 and 25 then raise exception 'invalid_changes'; end if;
  for item in select value from jsonb_array_elements(p_changes) loop
    patch=item->'patch';
    if jsonb_typeof(patch)<>'object' or patch='{}' or exists(select 1 from jsonb_object_keys(patch) k where not k=any(allowed)) then raise exception 'invalid_fields'; end if;
    row_id=nullif(item->>'id','')::uuid;
    if row_id is null then
      if p_entity not in ('budgets','obligations','assets','assistant_spending_rules') then raise exception 'creation_not_allowed'; end if;
      if p_entity='assistant_spending_rules' and (select count(*) from public.assistant_spending_rules where user_id=uid)>=30 then raise exception 'rule_limit'; end if;
      patch=patch || jsonb_build_object('user_id',uid);
      select string_agg(format('%I',key),','),string_agg(format('(jsonb_populate_record(null::public.%I,$1)).%I',p_entity,key),',') into columns_sql,values_sql from jsonb_object_keys(patch) key;
      execute format('insert into public.%I (%s) select %s returning to_jsonb(%I.*)',p_entity,columns_sql,values_sql,p_entity) using patch into new_row;
      row_id=(new_row->>'id')::uuid; before_patch=null;
      patch=new_row - array['created_at','updated_at'];
    else
      execute format('select to_jsonb(t) from public.%I t where id=$1 and user_id=$2 for update',p_entity) using row_id,uid into old_row;
      if old_row is null then raise exception 'record_not_found'; end if;
      if p_entity='transactions' and old_row->>'deleted_at' is not null then raise exception 'record_deleted'; end if;
      if coalesce(jsonb_typeof(item->'expected'),'null')<>'object' or not (old_row @> (item->'expected')) then raise exception 'record_changed'; end if;
      select jsonb_object_agg(key,old_row->key) into before_patch from jsonb_object_keys(patch) key;
      select string_agg(format('%I=(jsonb_populate_record(null::public.%I,$1)).%I',key,p_entity,key),',') into assignments from jsonb_object_keys(patch) key;
      execute format('update public.%I set %s where id=$2 and user_id=$3 returning to_jsonb(%I.*)',p_entity,assignments,p_entity) using patch,row_id,uid into new_row;
      select jsonb_object_agg(key,new_row->key) into patch from jsonb_object_keys(patch) key;
    end if;
    insert into public.assistant_actions(user_id,run_id,entity,record_id,before_values,after_values,summary)
      values(uid,p_run_id,p_entity,row_id,before_patch,patch,left(p_summary,300)) returning id into action_id;
    result=result || jsonb_build_array(jsonb_build_object('action_id',action_id,'record_id',row_id));
  end loop;
  return result;
end; $$;
revoke all on function public.assistant_apply_changes(uuid,text,jsonb,text) from public,anon;
grant execute on function public.assistant_apply_changes(uuid,text,jsonb,text) to authenticated;

create function public.assistant_undo_action(p_action_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare action public.assistant_actions; current_row jsonb; assignments text; uid uuid=auth.uid();
begin
  select * into action from public.assistant_actions where id=p_action_id and user_id=uid for update;
  if not found then raise exception 'action_not_found'; end if;
  if action.undone_at is not null then return; end if;
  if action.entity not in ('transactions','budgets','obligations','assets','bank_balances','budget_targets','assistant_spending_rules') then raise exception 'invalid_entity'; end if;
  execute format('select to_jsonb(t) from public.%I t where id=$1 and user_id=$2 for update',action.entity) using action.record_id,uid into current_row;
  if current_row is null or not (current_row @> action.after_values) then raise exception 'record_changed'; end if;
  if action.before_values is null then
    if action.entity not in ('budgets','obligations','assets','assistant_spending_rules') then raise exception 'invalid_creation'; end if;
    execute format('delete from public.%I where id=$1 and user_id=$2',action.entity) using action.record_id,uid;
  else
    -- Audit rows are immutable except undone_at. Never accept a patch from the caller.
    if exists(select 1 from jsonb_object_keys(action.before_values) k where k in ('id','user_id','created_at')) then raise exception 'invalid_audit'; end if;
    select string_agg(format('%I=(jsonb_populate_record(null::public.%I,$1)).%I',key,action.entity,key),',') into assignments from jsonb_object_keys(action.before_values) key;
    execute format('update public.%I set %s where id=$2 and user_id=$3',action.entity,assignments) using action.before_values,action.record_id,uid;
  end if;
  update public.assistant_actions set undone_at=now() where id=p_action_id and user_id=uid;
end; $$;
revoke all on function public.assistant_undo_action(uuid) from public,anon;
grant execute on function public.assistant_undo_action(uuid) to authenticated;

-- Only the authenticated scheduler can read across owners. Totals run in SQL,
-- include manual/SMS edits and never include deleted or unsupported currencies.
create function public.assistant_due_spending_rules()
returns table(rule_id uuid,user_id uuid,title text,threshold numeric,total numeric,local_date date)
language sql stable security invoker set search_path='' as $$
  select r.id,r.user_id,r.title,r.threshold,s.total,(now() at time zone r.timezone)::date
  from public.assistant_spending_rules r
  cross join lateral (
    select coalesce(sum(case when t.currency='IRT' then t.amount*10 else t.amount end),0) total
    from public.transactions t where t.user_id=r.user_id and t.type='withdrawal' and t.deleted_at is null and t.currency in ('IRR','IRT')
      and t.transaction_time>=(((now() at time zone r.timezone)::date)::timestamp at time zone r.timezone)
      and t.transaction_time<((((now() at time zone r.timezone)::date)+1)::timestamp at time zone r.timezone)
      and t.transaction_time<=now()
      and (r.tag is null or r.tag=any(t.tags)) and (r.category is null or r.category=t.category)
  ) s where r.enabled and (now() at time zone r.timezone)::date>=r.starts_on
    and (r.ends_on is null or (now() at time zone r.timezone)::date<=r.ends_on) and s.total>r.threshold;
$$;
revoke all on function public.assistant_due_spending_rules() from public,anon,authenticated;
grant execute on function public.assistant_due_spending_rules() to service_role;

alter table public.notification_deliveries add column if not exists attempts integer not null default 0;
alter table public.notification_deliveries add column if not exists last_attempt_at timestamptz;
create function public.assistant_claim_spending_alert(p_rule_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare rule record; delivery_id uuid; notification_body text;
begin
  select * into rule from public.assistant_due_spending_rules() where rule_id=p_rule_id;
  if not found then return null; end if;
  notification_body='هزینه ثبت‌شده امروز از سقف تعیین‌شده گذشت. مجموع: ' || trim(to_char(rule.total/10,'999,999,999,999,999,990')) || ' تومان';
  insert into public.notification_deliveries(user_id,kind,dedupe_key,title,body,status,attempts,last_attempt_at)
    values(rule.user_id,'assistant_spending','assistant-rule:'||rule.rule_id||':'||rule.local_date,rule.title,notification_body,'pending',1,now())
  on conflict(user_id,dedupe_key) do update set status='pending',attempts=public.notification_deliveries.attempts+1,last_attempt_at=now(),body=excluded.body
    where public.notification_deliveries.status in ('pending','failed','skipped') and public.notification_deliveries.attempts<8
      and public.notification_deliveries.last_attempt_at<now()-interval '5 minutes'
  returning id into delivery_id;
  if delivery_id is null then return null; end if;
  return jsonb_build_object('delivery_id',delivery_id,'user_id',rule.user_id,'title',rule.title,'body',notification_body,'tag','assistant-rule-'||rule.rule_id||'-'||rule.local_date);
end; $$;
revoke all on function public.assistant_claim_spending_alert(uuid) from public,anon,authenticated;
grant execute on function public.assistant_claim_spending_alert(uuid) to service_role;

select cron.schedule('darayiban-assistant-alerts','* * * * *',$cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='darayiban_project_url' limit 1)||'/functions/v1/assistant-spending-alerts',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='darayiban_cron_secret' limit 1)),
    body := '{}'::jsonb, timeout_milliseconds := 50000
  );
$cron$);
