-- handle_new_user() is a SECURITY DEFINER trigger function; it must never be
-- callable through the API (/rest/v1/rpc/handle_new_user). Trigger execution
-- does not depend on EXECUTE privilege, so the on_auth_user_created trigger
-- keeps working after this revoke.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
