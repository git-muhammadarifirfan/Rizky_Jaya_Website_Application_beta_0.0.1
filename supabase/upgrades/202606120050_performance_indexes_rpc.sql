-- Rizky Jaya App - Performance Optimization Beta 0.0.20
-- Tujuan:
-- 1. Menambah index untuk filter yang paling sering dipakai aplikasi.
-- 2. Menyediakan RPC owner_dashboard_summary agar dashboard Owner tidak perlu
--    menarik baris mentah employees, attendance_records, dan payroll_slips.
-- Aman dijalankan berkali-kali karena memakai IF NOT EXISTS dan CREATE OR REPLACE.

begin;

-- // PERFORMANCE: RLS dan membership lookup cepat pada semua query organisasi.
create index if not exists idx_organization_users_user_org_role
  on public.organization_users(user_id, organization_id, role);

-- // PERFORMANCE: Master karyawan sering difilter activeOnly dan diurutkan nama/kode.
create index if not exists idx_employees_org_active_full_name
  on public.employees(organization_id, is_active, full_name, id);
create index if not exists idx_employees_org_employee_code
  on public.employees(organization_id, employee_code, id);

-- // PERFORMANCE: Tarif aktif dibaca berdasarkan karyawan + validitas tanggal.
create index if not exists idx_employee_pay_rates_active_lookup
  on public.employee_pay_rates(organization_id, employee_id, valid_from desc, valid_to);

-- // PERFORMANCE: Absensi harian, rekap periode, dan payroll sama-sama memakai org/date/employee.
create index if not exists idx_attendance_records_org_date_status
  on public.attendance_records(organization_id, attendance_date, status);
create index if not exists idx_attendance_records_org_employee_date
  on public.attendance_records(organization_id, employee_id, attendance_date desc);
create index if not exists idx_attendance_records_org_date_employee
  on public.attendance_records(organization_id, attendance_date, employee_id);

-- // PERFORMANCE: Period/slip payroll sering dicari per bulan dan status pembayaran.
create index if not exists idx_payroll_periods_org_start_date_desc
  on public.payroll_periods(organization_id, start_date desc, id);
create index if not exists idx_payroll_slips_org_period_status
  on public.payroll_slips(organization_id, payroll_period_id, status, employee_id);
create index if not exists idx_payroll_job_items_org_employee_work_date
  on public.payroll_job_items(organization_id, employee_id, work_date desc);

-- // PERFORMANCE: Inbox approval sering dibuka berdasarkan status pending dan tipe pengajuan.
create index if not exists idx_change_requests_org_status_type_created
  on public.change_requests(organization_id, status, request_type, created_at desc);

-- // PERFORMANCE: Dashboard transport dan export tanggal banyak membaca range tanggal.
create index if not exists idx_vehicles_org_active_fleet
  on public.vehicles(organization_id, is_active, fleet_code, id);
create index if not exists idx_transport_jobs_org_date_status
  on public.transport_jobs(organization_id, operation_date desc, status, id);
create index if not exists idx_transport_destinations_org_normalized
  on public.transport_destinations(organization_id, normalized_name);
create index if not exists idx_transport_general_expenses_org_date_category
  on public.transport_general_expenses(organization_id, expense_date desc, category);

-- // PERFORMANCE: Katalog harga difilter aktif dan dicari nama/kode.
-- Guard memakai to_regclass agar patch tetap aman pada database lama yang
-- belum memasang modul katalog.
do $perf_product_indexes$
begin
  if to_regclass('public.product_prices') is not null then
    execute 'create index if not exists idx_product_prices_org_active_name on public.product_prices(organization_id, is_active, product_name, id)';
    execute 'create index if not exists idx_product_prices_org_code on public.product_prices(organization_id, product_code, id)';
  end if;
end;
$perf_product_indexes$;

-- // PERFORMANCE: Satu RPC dashboard menggantikan beberapa query baris mentah.
create or replace function public.owner_dashboard_summary(
  p_organization_id uuid,
  p_today date,
  p_period_start date,
  p_period_end date
)
returns table(
  employee_count bigint,
  present_today bigint,
  paid_payroll numeric,
  unpaid_payroll numeric,
  slip_count bigint,
  unpaid_slip_count bigint,
  active_vehicles bigint,
  transport_total numeric,
  chart_anchor date
)
language plpgsql stable security invoker
as $$
begin
  if not public.is_owner(p_organization_id) then
    raise exception 'Dashboard Owner hanya tersedia untuk Owner.';
  end if;

  return query
  with current_period as (
    select pp.id
    from public.payroll_periods pp
    where pp.organization_id = p_organization_id
      and pp.start_date = p_period_start
    limit 1
  ), latest_period as (
    select pp.start_date
    from public.payroll_periods pp
    where pp.organization_id = p_organization_id
    order by pp.start_date desc
    limit 1
  ), trip_costs as (
    select coalesce(sum(s.grand_total), 0)::numeric as grand_total
    from public.v_transport_expense_summary s
    where s.organization_id = p_organization_id
      and s.operation_date between p_period_start and p_period_end
  ), general_costs as (
    select coalesce(sum(g.amount), 0)::numeric as grand_total
    from public.transport_general_expenses g
    where g.organization_id = p_organization_id
      and g.expense_date between p_period_start and p_period_end
  )
  select
    (
      select count(*)::bigint
      from public.employees e
      where e.organization_id = p_organization_id
        and e.is_active = true
    ) as employee_count,
    (
      select count(*)::bigint
      from public.attendance_records ar
      where ar.organization_id = p_organization_id
        and ar.attendance_date = p_today
        and ar.status in ('hadir', 'terlambat')
    ) as present_today,
    coalesce((
      select sum(ps.net_amount)::numeric
      from public.payroll_slips ps
      where ps.organization_id = p_organization_id
        and ps.payroll_period_id = (select cp.id from current_period cp)
        and ps.status = 'dibayar'
    ), 0)::numeric as paid_payroll,
    coalesce((
      select sum(ps.net_amount)::numeric
      from public.payroll_slips ps
      where ps.organization_id = p_organization_id
        and ps.payroll_period_id = (select cp.id from current_period cp)
        and ps.status <> 'dibayar'
    ), 0)::numeric as unpaid_payroll,
    coalesce((
      select count(*)::bigint
      from public.payroll_slips ps
      where ps.organization_id = p_organization_id
        and ps.payroll_period_id = (select cp.id from current_period cp)
    ), 0)::bigint as slip_count,
    coalesce((
      select count(*)::bigint
      from public.payroll_slips ps
      where ps.organization_id = p_organization_id
        and ps.payroll_period_id = (select cp.id from current_period cp)
        and ps.status <> 'dibayar'
    ), 0)::bigint as unpaid_slip_count,
    (
      select count(*)::bigint
      from public.vehicles v
      where v.organization_id = p_organization_id
        and v.is_active = true
    ) as active_vehicles,
    (tc.grand_total + gc.grand_total)::numeric as transport_total,
    coalesce((select lp.start_date from latest_period lp), p_period_start)::date as chart_anchor
  from trip_costs tc cross join general_costs gc;
end;
$$;

revoke all on function public.owner_dashboard_summary(uuid, date, date, date) from public;
grant execute on function public.owner_dashboard_summary(uuid, date, date, date) to authenticated;

commit;
