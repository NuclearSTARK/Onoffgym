-- A class may be published with free-text movements. Keep unmatched results in
-- class history; add them to the personal 1RM catalogue only after a known link.
do $repair$
declare definition text;
begin
 definition:=pg_get_functiondef('public.onoff_commit(uuid,text,jsonb)'::regprocedure);
 if position($old$if item->>'kind'='1RM' then$old$ in definition)>0 then
  definition:=replace(definition,$old$if item->>'kind'='1RM' then$old$,$new$if item->>'kind'='1RM' and coalesce(item->>'movementId','')<>'' then$new$);
 elsif position($new$if item->>'kind'='1RM' and coalesce(item->>'movementId','')<>'' then$new$ in definition)=0 then
  raise exception 'Expected 1RM record branch was not found';
 end if;
 execute definition;
end $repair$;
