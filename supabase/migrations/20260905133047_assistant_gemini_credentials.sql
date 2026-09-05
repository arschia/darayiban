-- The secret value is provisioned separately in Vault, never in source control.
create or replace function public.assistant_model_credentials()
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'darayiban_gemini_api_key'
  limit 1;
$$;

revoke all on function public.assistant_model_credentials() from public, anon, authenticated;
grant execute on function public.assistant_model_credentials() to service_role;
