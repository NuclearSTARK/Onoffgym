do $$ declare definition text;begin
 definition:=pg_get_functiondef('public.onoff_coach_operation(uuid,text,jsonb)'::regprocedure);
 definition:=replace(definition,'if op=''workouts'' then','if op=''workouts'' then if jsonb_typeof(p->''workouts'') is distinct from ''array'' or coalesce(jsonb_array_length(p->''workouts''),0)=0 then return false; end if;');
 definition:=replace(definition,'elsif op=''records'' then','elsif op=''records'' then if jsonb_typeof(p->''records'') is distinct from ''array'' or coalesce(jsonb_array_length(p->''records''),0)=0 then return false; end if;');
 execute definition;
end $$;
