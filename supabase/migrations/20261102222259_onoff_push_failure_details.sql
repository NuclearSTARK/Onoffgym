alter table public.gym_push_deliveries add column last_error text;
do $$ declare definition text;begin
 definition:=pg_get_functiondef('public.onoff_push_history(uuid)'::regprocedure);
 definition:=replace(definition,'count(d.subscription_id)::integer as total','coalesce(jsonb_agg(distinct d.last_error) filter(where d.last_error is not null),''[]''::jsonb) as "failureReasons", count(d.subscription_id)::integer as total');
 execute definition;
end $$;
