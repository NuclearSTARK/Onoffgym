-- Attendance/record writes must take the shared point-state lock before the
-- actor row lock, matching onoff_points and the exclusive administrative reset.
do $patch$
declare definition text;
begin
 definition:=pg_get_functiondef('public.onoff_commit(uuid,text,jsonb)'::regprocedure);
 if position('onoff-point-state' in definition)=0 then
  definition:=regexp_replace(definition,E'begin\n',E'begin\n perform pg_advisory_xact_lock_shared(hashtextextended(''onoff-point-state'',0));\n','i');
  if position('onoff-point-state' in definition)=0 then raise exception 'Point synchronization target missing';end if;
  execute definition;
 end if;
end $patch$;
