-- Jalankan file ini HANYA jika schema versi sebelumnya sudah pernah dipasang di project Supabase lama.
-- Jangan jalankan seed ulang pada database yang sudah memiliki transaksi produksi.

begin;

-- Keamanan: admin hanya dapat membuat absensi untuk tanggal hari berjalan; Owner dapat koreksi historis.
drop policy if exists attendance_member_insert on public.attendance_records;
create policy attendance_member_insert on public.attendance_records for insert to authenticated
with check (
  created_by = auth.uid()
  and (public.is_owner(organization_id) or (public.is_operational_admin(organization_id) and attendance_date = current_date))
);

-- Status aktif/nonaktif profil hanya dikelola oleh server-side manage-admin.
drop policy if exists profiles_update_self on public.profiles;
revoke update on public.profiles from authenticated;
grant select on public.profiles to authenticated;

-- Perjelas aktor audit, termasuk perubahan membership yang dibuat server-side oleh Owner.
create or replace function public.audit_record_changes()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_id uuid;
  v_actor uuid;
begin
  v_org := coalesce((to_jsonb(new)->>'organization_id')::uuid, (to_jsonb(old)->>'organization_id')::uuid);
  v_id := coalesce((to_jsonb(new)->>'id')::uuid, (to_jsonb(old)->>'id')::uuid, (to_jsonb(new)->>'user_id')::uuid, (to_jsonb(old)->>'user_id')::uuid);
  v_actor := coalesce(auth.uid(), (to_jsonb(new)->>'created_by')::uuid, (to_jsonb(old)->>'created_by')::uuid);
  insert into public.audit_logs(organization_id, actor_id, table_name, record_id, action, old_data, new_data)
  values (v_org, v_actor, tg_table_name, v_id, tg_op,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end;
$$;

-- Pastikan view rekap memakai invoker agar RLS tetap berlaku.
create or replace view public.v_transport_expense_summary
with (security_invoker = true) as
with fuel_totals as (
  select transport_job_id, sum(amount)::numeric(14,2) as fuel_total
  from public.fuel_expenses group by transport_job_id
), other_totals as (
  select transport_job_id, sum(amount)::numeric(14,2) as other_total
  from public.vehicle_expenses group by transport_job_id
)
select
  j.organization_id, j.id as transport_job_id, j.operation_date, j.vehicle_id,
  v.fleet_code, v.plate_number, j.destination,
  coalesce(f.fuel_total, 0)::numeric(14,2) as fuel_total,
  coalesce(x.other_total, 0)::numeric(14,2) as other_total,
  (coalesce(f.fuel_total, 0) + coalesce(x.other_total, 0))::numeric(14,2) as grand_total
from public.transport_jobs j
join public.vehicles v on v.id = j.vehicle_id
left join fuel_totals f on f.transport_job_id = j.id
left join other_totals x on x.transport_job_id = j.id;
grant select on public.v_transport_expense_summary to authenticated;

create or replace function public.transport_summary(
  p_organization_id uuid,
  p_start_date date,
  p_end_date date
)
returns table(active_vehicles bigint, job_count bigint, fuel_total numeric, other_total numeric, grand_total numeric, tax_due_soon bigint)
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
    where s.organization_id = p_organization_id and s.operation_date between p_start_date and p_end_date
  )
  select
    (select count(*) from public.vehicles v where v.organization_id = p_organization_id and v.is_active = true),
    count(*)::bigint,
    coalesce(sum(expenses.fuel_total), 0)::numeric,
    coalesce(sum(expenses.other_total), 0)::numeric,
    coalesce(sum(expenses.grand_total), 0)::numeric,
    (select count(*) from public.vehicles v where v.organization_id = p_organization_id and v.is_active = true and v.tax_due_date between current_date and current_date + 60)
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
    from public.fuel_expenses f join public.transport_jobs j on j.id = f.transport_job_id
    where j.organization_id = p_organization_id and j.operation_date between p_start_date and p_end_date
    union all
    select initcap(replace(v.category::text, '_', ' ')), v.amount
    from public.vehicle_expenses v join public.transport_jobs j on j.id = v.transport_job_id
    where j.organization_id = p_organization_id and j.operation_date between p_start_date and p_end_date
  )
  select costs.category, sum(costs.amount)::numeric from costs group by costs.category order by sum(costs.amount) desc;
end;
$$;

revoke all on function public.transport_summary(uuid, date, date) from public;
revoke all on function public.transport_cost_by_category(uuid, date, date) from public;
grant execute on function public.transport_summary(uuid, date, date) to authenticated;
grant execute on function public.transport_cost_by_category(uuid, date, date) to authenticated;

commit;
