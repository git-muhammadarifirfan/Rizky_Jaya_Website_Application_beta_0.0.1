-- Rizky Jaya App - Client revision: quick attendance, wage pickup, general transport expense, and price catalog.
-- Run after 202605310010 (migration baru atau upgrade database yang sudah berjalan).

begin;

-- Owner chooses the attendance input mode visible to Admin Absensi.
alter table public.organizations
  add column if not exists admin_attendance_mode text not null default 'both';

do $$ begin
  alter table public.organizations
    add constraint organizations_admin_attendance_mode_check
    check (admin_attendance_mode in ('quick', 'detail', 'both'));
exception when duplicate_object then null; end $$;

-- One attendance row can also record daily wage collection exactly like the paper mark:
-- X = masuk, X merah = masuk + sudah ambil gaji, - = tidak masuk.
alter table public.attendance_records
  add column if not exists input_method text not null default 'detail',
  add column if not exists paid_at timestamptz,
  add column if not exists paid_by uuid references auth.users(id) on delete set null;

do $$ begin
  alter table public.attendance_records
    add constraint attendance_records_input_method_check
    check (input_method in ('detail', 'quick'));
exception when duplicate_object then null; end $$;

-- Replace the old mandatory-photo constraint: photo remains mandatory on the detailed input flow,
-- while quick-paper input is deliberately one tap without a camera step.
do $$
declare v_constraint text;
begin
  for v_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.attendance_records'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%photo_path%'
      and pg_get_constraintdef(oid) ilike '%hadir%'
  loop
    execute format('alter table public.attendance_records drop constraint if exists %I', v_constraint);
  end loop;
end $$;

alter table public.attendance_records drop constraint if exists attendance_records_detail_photo_check;
alter table public.attendance_records
  add constraint attendance_records_detail_photo_check
  check (status <> 'hadir'::public.attendance_status or photo_path is not null or input_method = 'quick');

-- Server owns timestamps; Owner may backfill quick-paper dates, Admin may input today only.
create or replace function public.force_attendance_server_time()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_recorded_at timestamptz;
begin
  if tg_op = 'INSERT' then
    v_recorded_at := clock_timestamp();
    new.input_time := v_recorded_at;
    if not (public.is_owner(new.organization_id) and new.input_method = 'quick') then
      new.attendance_date := (v_recorded_at at time zone 'Asia/Jakarta')::date;
    end if;
  end if;
  return new;
end;
$$;

-- Secure single-tap input for Owner and Admin. Owner may mark historical dates from the paper book.
create or replace function public.record_quick_attendance(
  p_organization_id uuid,
  p_employee_id uuid,
  p_attendance_date date,
  p_marker text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_now timestamptz := clock_timestamp();
  v_today date := (clock_timestamp() at time zone 'Asia/Jakarta')::date;
  v_status public.attendance_status;
  v_paid_at timestamptz;
begin
  if not public.is_owner(p_organization_id) and not public.is_attendance_admin(p_organization_id) then
    raise exception 'Tidak memiliki akses absensi cepat.';
  end if;
  if p_attendance_date > v_today then
    raise exception 'Tanggal yang akan datang belum dapat diisi.';
  end if;
  if not public.is_owner(p_organization_id) and p_attendance_date <> v_today then
    raise exception 'Admin Absensi hanya dapat mengisi tanggal hari ini.';
  end if;
  if not exists (
    select 1 from public.employees e
    where e.organization_id = p_organization_id and e.id = p_employee_id and e.is_active = true
  ) then
    raise exception 'Karyawan aktif tidak ditemukan.';
  end if;

  case p_marker
    when 'masuk' then
      v_status := 'hadir'::public.attendance_status;
      v_paid_at := null;
    when 'masuk_ambil_gaji' then
      v_status := 'hadir'::public.attendance_status;
      v_paid_at := v_now;
    when 'tidak_masuk' then
      v_status := 'tidak_hadir'::public.attendance_status;
      v_paid_at := null;
    else
      raise exception 'Pilihan absensi cepat tidak valid.';
  end case;

  insert into public.attendance_records (
    organization_id, employee_id, attendance_date, status, input_method,
    paid_at, paid_by, notes, created_by, updated_by
  ) values (
    p_organization_id, p_employee_id, p_attendance_date, v_status, 'quick',
    v_paid_at, case when v_paid_at is null then null else auth.uid() end,
    case when v_paid_at is null then 'Input cepat' else 'Input cepat - gaji sudah diambil' end,
    auth.uid(), auth.uid()
  )
  on conflict (organization_id, employee_id, attendance_date) do update
    set status = excluded.status,
        paid_at = excluded.paid_at,
        paid_by = excluded.paid_by,
        notes = case
          when public.attendance_records.photo_path is null then excluded.notes
          else public.attendance_records.notes
        end,
        input_method = case
          when public.attendance_records.photo_path is null then 'quick'
          else public.attendance_records.input_method
        end,
        updated_by = auth.uid(),
        updated_at = v_now
  returning id into v_id;

  return v_id;
end;
$$;
revoke all on function public.record_quick_attendance(uuid, uuid, date, text) from public;
grant execute on function public.record_quick_attendance(uuid, uuid, date, text) to authenticated;

-- Admin is permitted to correct an already-entered BBM amount, even if its trip has later been locked.
drop policy if exists fuel_member_update on public.fuel_expenses;
create policy fuel_member_update on public.fuel_expenses for update to authenticated
using (
  exists (
    select 1 from public.transport_jobs j
    where j.id = fuel_expenses.transport_job_id
      and public.is_operational_admin(j.organization_id)
  )
)
with check (
  exists (
    select 1 from public.transport_jobs j
    where j.id = fuel_expenses.transport_job_id
      and public.is_operational_admin(j.organization_id)
  )
);

-- Expense not tied to a trip or registered fleet, suitable for cash requests for materials/servicing.
create table if not exists public.transport_general_expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  expense_date date not null default current_date,
  amount numeric(14,2) not null check (amount > 0),
  category text not null check (category in ('bbm', 'bahan', 'servis', 'sparepart', 'mesin', 'aksesoris', 'lainnya')),
  vehicle_identity text,
  requester_name text not null,
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_transport_general_expense_org_date
  on public.transport_general_expenses(organization_id, expense_date desc);

alter table public.transport_general_expenses enable row level security;
drop policy if exists transport_general_member_select on public.transport_general_expenses;
create policy transport_general_member_select on public.transport_general_expenses for select to authenticated
using (public.is_operational_admin(organization_id));
drop policy if exists transport_general_member_insert on public.transport_general_expenses;
create policy transport_general_member_insert on public.transport_general_expenses for insert to authenticated
with check (public.is_operational_admin(organization_id) and created_by = auth.uid());
drop policy if exists transport_general_member_update on public.transport_general_expenses;
create policy transport_general_member_update on public.transport_general_expenses for update to authenticated
using (public.is_operational_admin(organization_id))
with check (public.is_operational_admin(organization_id));
drop policy if exists transport_general_owner_delete on public.transport_general_expenses;
create policy transport_general_owner_delete on public.transport_general_expenses for delete to authenticated
using (public.is_owner(organization_id));

drop trigger if exists trg_transport_general_expenses_updated_at on public.transport_general_expenses;
create trigger trg_transport_general_expenses_updated_at before update on public.transport_general_expenses
for each row execute function public.set_updated_at();

-- Simple catalog price list. Admin can view it; Owner owns the edits.
create table if not exists public.product_prices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  product_code text not null,
  product_name text not null,
  purchase_price numeric(14,2) not null default 0 check (purchase_price >= 0),
  special_sale_price numeric(14,2) not null default 0 check (special_sale_price >= 0),
  store_sale_price numeric(14,2) not null default 0 check (store_sale_price >= 0),
  retail_sale_price numeric(14,2) not null default 0 check (retail_sale_price >= 0),
  is_active boolean not null default true,
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, product_code)
);
create index if not exists idx_product_prices_org_name on public.product_prices(organization_id, product_name);

alter table public.product_prices enable row level security;
drop policy if exists product_prices_member_select on public.product_prices;
create policy product_prices_member_select on public.product_prices for select to authenticated
using (public.is_operational_admin(organization_id));
drop policy if exists product_prices_owner_write on public.product_prices;
create policy product_prices_owner_write on public.product_prices for all to authenticated
using (public.is_owner(organization_id))
with check (public.is_owner(organization_id));

drop trigger if exists trg_product_prices_updated_at on public.product_prices;
create trigger trg_product_prices_updated_at before update on public.product_prices
for each row execute function public.set_updated_at();

-- Actor dan audit tetap konsisten dengan transaksi lama.
drop trigger if exists transport_general_expenses_stamp_actor on public.transport_general_expenses;
create trigger transport_general_expenses_stamp_actor before insert or update on public.transport_general_expenses
for each row execute function public.stamp_actor_fields();
drop trigger if exists product_prices_stamp_actor on public.product_prices;
create trigger product_prices_stamp_actor before insert or update on public.product_prices
for each row execute function public.stamp_actor_fields();
drop trigger if exists audit_transport_general_expenses on public.transport_general_expenses;
create trigger audit_transport_general_expenses after insert or update or delete on public.transport_general_expenses
for each row execute function public.audit_record_changes();
drop trigger if exists audit_product_prices on public.product_prices;
create trigger audit_product_prices after insert or update or delete on public.product_prices
for each row execute function public.audit_record_changes();

-- Pengeluaran umum baru ikut masuk pada seluruh ringkasan/grafik Owner.
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
  with trip_costs as (
    select
      coalesce(sum(s.fuel_total), 0)::numeric as fuel_total,
      coalesce(sum(s.other_total), 0)::numeric as other_total,
      coalesce(sum(s.grand_total), 0)::numeric as grand_total
    from public.v_transport_expense_summary s
    where s.organization_id = p_organization_id
      and s.operation_date between p_start_date and p_end_date
  ), general_costs as (
    select
      coalesce(sum(g.amount) filter (where g.category = 'bbm'), 0)::numeric as fuel_total,
      coalesce(sum(g.amount) filter (where g.category <> 'bbm'), 0)::numeric as other_total,
      coalesce(sum(g.amount), 0)::numeric as grand_total
    from public.transport_general_expenses g
    where g.organization_id = p_organization_id
      and g.expense_date between p_start_date and p_end_date
  )
  select
    (select count(*) from public.vehicles v where v.organization_id = p_organization_id and v.is_active = true),
    (select count(*) from public.transport_jobs j where j.organization_id = p_organization_id and j.operation_date between p_start_date and p_end_date),
    t.fuel_total + g.fuel_total,
    t.other_total + g.other_total,
    t.grand_total + g.grand_total,
    (
      select count(*)
      from public.vehicles v
      where v.organization_id = p_organization_id
        and v.is_active = true
        and v.tax_due_date between current_date and current_date + 60
    )
  from trip_costs t cross join general_costs g;
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
    union all
    select case g.category
      when 'bbm' then 'BBM'
      when 'bahan' then 'Bahan'
      when 'servis' then 'Servis'
      when 'sparepart' then 'Sparepart'
      when 'mesin' then 'Mesin'
      when 'aksesoris' then 'Aksesoris'
      else 'Lainnya'
    end, g.amount
    from public.transport_general_expenses g
    where g.organization_id = p_organization_id
      and g.expense_date between p_start_date and p_end_date
  )
  select costs.category, sum(costs.amount)::numeric
  from costs
  group by costs.category
  order by sum(costs.amount) desc;
end;
$$;

create or replace function public.transport_cost_by_month(p_organization_id uuid, p_year integer)
returns table(month_no integer, total_amount numeric)
language sql
security invoker
stable
as $$
  with months as (
    select generate_series(1, 12)::integer as month_no
  ), costs as (
    select extract(month from j.operation_date)::integer as month_no, coalesce(sum(f.amount), 0)::numeric as amount
      from public.transport_jobs j
      join public.fuel_expenses f on f.transport_job_id = j.id
     where j.organization_id = p_organization_id and extract(year from j.operation_date)::integer = p_year
     group by 1
    union all
    select extract(month from j.operation_date)::integer as month_no, coalesce(sum(v.amount), 0)::numeric as amount
      from public.transport_jobs j
      join public.vehicle_expenses v on v.transport_job_id = j.id
     where j.organization_id = p_organization_id and extract(year from j.operation_date)::integer = p_year
     group by 1
    union all
    select extract(month from g.expense_date)::integer as month_no, coalesce(sum(g.amount), 0)::numeric as amount
      from public.transport_general_expenses g
     where g.organization_id = p_organization_id and extract(year from g.expense_date)::integer = p_year
     group by 1
  )
  select m.month_no, coalesce(sum(c.amount), 0)::numeric as total_amount
    from months m left join costs c on c.month_no = m.month_no
   group by m.month_no order by m.month_no;
$$;

revoke all on function public.transport_summary(uuid, date, date) from public;
revoke all on function public.transport_cost_by_category(uuid, date, date) from public;
revoke all on function public.transport_cost_by_month(uuid, integer) from public;
grant execute on function public.transport_summary(uuid, date, date) to authenticated;
grant execute on function public.transport_cost_by_category(uuid, date, date) to authenticated;
grant execute on function public.transport_cost_by_month(uuid, integer) to authenticated;

revoke all on public.transport_general_expenses, public.product_prices from anon;
grant select, insert, update, delete on public.transport_general_expenses, public.product_prices to authenticated;

-- Realtime refresh for the newly visible screens.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.transport_general_expenses; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.product_prices; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.organizations; exception when duplicate_object then null; end;
  end if;
end $$;

commit;
