-- A changed price or number of uses needs a fresh member confirmation.
do $patch$
declare definition text;needle text:='if product.id is null then raise exception ''현재 교환할 수 없는 상품이에요.'';end if;';
begin
 definition:=pg_get_functiondef('public.onoff_points(uuid,jsonb)'::regprocedure);
 if position(needle in definition)=0 then raise exception 'Point offer guard target missing';end if;
 definition:=replace(definition,needle,needle||E'\n  if coalesce((p->>''expectedPrice'')::integer,-1)<>product.price or coalesce((p->>''expectedUses'')::integer,-1)<>product.uses then raise exception ''상품 조건이 변경됐어요. 상점을 새로 열어 확인해주세요.'';end if;');
 execute definition;
end $patch$;
