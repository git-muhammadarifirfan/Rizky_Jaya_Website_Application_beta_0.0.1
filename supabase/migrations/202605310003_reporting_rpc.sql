-- Rizky Jaya App - secured summary RPC for reports and owner dashboard.
-- Summary sources aggregate each expense exactly once per transport job.

begin;

create or replace function public.attendance_summary(
  p_organization_id uuid,
  p_start_date date,
  p_end_date date
)
returns table(status public.attendance_status, total bigint)
language plpgsql stable security invoker
as $$
begin
  if not public.is_operational_admin(p_organization_id) then
    raise exception 'Akses absensi ditolak.';
  end if;
  return query
  select ar.status, count(*)
  from public.attendance_records ar
  where ar.organization_id = p_organization_id
    and ar.attendance_date between p_start_date and p_end_date
  group by ar.status;
end;
$$;

create or replace function public.payroll_overview(
  p_organization_id uuid,
  p_period_id uuid
)
returns table(total_payroll numeric, paid_amount numeric, unpaid_amount numeric, slip_count bigint)
language plpgsql stable security invoker
as $$
begin
  if not public.is_owner(p_organization_id) then
    raise exception 'Akses gaji hanya untuk Owner.';
  end if;
  return query
  select
    coalesce(sum(ps.net_amount), 0),
    coalesce(sum(ps.net_amount) filter (where ps.status = 'dibayar'), 0),
    coalesce(sum(ps.net_amount) filter (where ps.status <> 'dibayar'), 0),
    count(*)
  from public.payroll_slips ps
  where ps.organization_id = p_organization_id
    and ps.payroll_period_id = p_period_id;
end;
$$;

create or replace function public.transport_summary(
  p_organization_id uuid,
  p_start_date date,
  p_end_date date
)
returns table(
  active_vehicles bigint,
  job_count bigint,
  fuel_total numeric,
  other_total numeric,
  grand_total numeric,
  tax_due_soon bigint
)
language plpgsql stable security invoker
as $$
begin
  if not public.is_owner(p_organization_id) then
    raise exception 'Statistik keuangan transportasi hanya untuk Owner.';
  end if;

  return query
  with expenses as (
    select s.fuel_total, s.other_total, s.grand_total
    from public.v_transport_expense_summary s
    where s.organization_id = p_organization_id
      and s.operation_date between p_start_date and p_end_date
  )
  select
    (select count(*) from public.vehicles v where v.organization_id = p_organization_id and v.is_active = true),
    count(*)::bigint,
    coalesce(sum(expenses.fuel_total), 0)::numeric,
    coalesce(sum(expenses.other_total), 0)::numeric,
    coalesce(sum(expenses.grand_total), 0)::numeric,
    (
      select count(*)
      from public.vehicles v
      where v.organization_id = p_organization_id
        and v.is_active = true
        and v.tax_due_date between current_date and current_date + 60
    )
  from expenses;
end;
$$;

create or replace function public.transport_cost_by_category(
  p_organization_id uuid,
  p_start_date date,
  p_end_date date
)
returns table(category text, total_amount numeric)
language plpgsql stable security invoker
as $$
begin
  if not public.is_owner(p_organization_id) then
    raise exception 'Statistik keuangan transportasi hanya untuk Owner.';
  end if;

  return query
  with costs as (
    select 'BBM'::text as category, f.amount
    from public.fuel_expenses f
    join public.transport_jobs j on j.id = f.transport_job_id
    where j.organization_id = p_organization_id
      and j.operation_date between p_start_date and p_end_date
    union all
    select initcap(replace(v.category::text, '_', ' ')) as category, v.amount
    from public.vehicle_expenses v
    join public.transport_jobs j on j.id = v.transport_job_id
    where j.organization_id = p_organization_id
      and j.operation_date between p_start_date and p_end_date
  )
  select costs.category, sum(costs.amount)::numeric
  from costs
  group by costs.category
  order by sum(costs.amount) desc;
end;
$$;

revoke all on function public.attendance_summary(uuid, date, date) from public;
revoke all on function public.payroll_overview(uuid, uuid) from public;
revoke all on function public.transport_summary(uuid, date, date) from public;
revoke all on function public.transport_cost_by_category(uuid, date, date) from public;
grant execute on function public.attendance_summary(uuid, date, date) to authenticated;
grant execute on function public.payroll_overview(uuid, uuid) to authenticated;
grant execute on function public.transport_summary(uuid, date, date) to authenticated;
grant execute on function public.transport_cost_by_category(uuid, date, date) to authenticated;

commit;
