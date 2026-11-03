-- One-time reset explicitly requested for all members on 2026-11-03.
-- Products, reward rules/methods, configuration, memberships and workout records remain.
begin;
update public.gym_point_accounts set balance=0;
delete from public.gym_coupon_uses;
delete from public.gym_point_coupons;
delete from public.gym_point_grants;
delete from public.gym_point_ledger;
delete from public.gym_coupon_attempts;
commit;
select (select count(*) from public.gym_members) as members,
       (select count(*) from public.gym_point_accounts where balance<>0) as nonzero_accounts,
       (select count(*) from public.gym_point_ledger) as point_history,
       (select count(*) from public.gym_point_coupons) as coupons,
       (select count(*) from public.gym_point_grants) as grants,
       (select count(*) from public.gym_point_products where not deleted) as products,
       (select count(*) from public.gym_point_rules where not deleted) as rules;
