-- Rizky Jaya App beta 0.0.4 - payroll fleksibel, hapus aman, dan statistik tahunan.
-- Jalankan file ini di SQL Editor setelah upgrade 202605310007 pada database beta yang sudah ada.
begin;

-- // FEATURE: Memperluas rate karyawan untuk Harian, Bulanan, dan Borongan.
alter table public.employee_pay_rates add column if not exists salary_type text not null default 'harian';
alter table public.employee_pay_rates add column if not exists monthly_rate numeric(14,2) not null default 0;
alter table public.employee_pay_rates add column if not exists allowed_absence_days integer not null default 4;
alter table public.employee_pay_rates add column if not exists absence_deduction numeric(14,2) not null default 0;

do $$ begin
  alter table public.employee_pay_rates add constraint employee_pay_rates_salary_type_check check (salary_type in ('harian', 'bulanan', 'borongan'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.employee_pay_rates add constraint employee_pay_rates_monthly_rate_check check (monthly_rate >= 0 and allowed_absence_days >= 0 and absence_deduction >= 0);
exception when duplicate_object then null; end $$;

-- // FEATURE: Slip menyimpan tipe dan penjelasan kalkulasi agar audit gaji transparan.
alter table public.payroll_slips add column if not exists salary_type text not null default 'harian';
alter table public.payroll_slips add column if not exists absent_days integer not null default 0;
alter table public.payroll_slips add column if not exists automatic_deduction numeric(14,2) not null default 0;
alter table public.payroll_slips add column if not exists calculation_notes text;

do $$ begin
  alter table public.payroll_slips add constraint payroll_slips_salary_type_check check (salary_type in ('harian', 'bulanan', 'borongan'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.payroll_slips add constraint payroll_slips_absent_days_check check (absent_days >= 0 and automatic_deduction >= 0);
exception when duplicate_object then null; end $$;

-- // FEATURE: Transaksi borongan rinci, mencakup per barang, per tujuan, atau kategori/ukuran truk.
create table if not exists public.payroll_job_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  employee_id uuid not null,
  work_date date not null,
  item_kind text not null check (item_kind in ('per_barang', 'per_tujuan', 'kategori_truk')),
  description text not null check (length(trim(description)) > 0),
  quantity numeric(12,2) not null default 1 check (quantity > 0),
  unit_rate numeric(14,2) not null check (unit_rate > 0),
  total_amount numeric(14,2) generated always as (quantity * unit_rate) stored,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, employee_id) references public.employees(organization_id, id) on delete restrict
);
create index if not exists idx_payroll_job_items_employee_date on public.payroll_job_items(organization_id, employee_id, work_date desc);

drop trigger if exists payroll_job_items_updated_at on public.payroll_job_items;
create trigger payroll_job_items_updated_at before update on public.payroll_job_items
for each row execute function public.set_updated_at();

alter table public.payroll_job_items enable row level security;
drop policy if exists payroll_job_items_owner_all on public.payroll_job_items;
create policy payroll_job_items_owner_all on public.payroll_job_items for all to authenticated
using (public.is_owner(organization_id)) with check (public.is_owner(organization_id) and created_by = auth.uid());

grant select, insert, update, delete on public.payroll_job_items to authenticated;

-- // FEATURE: Penghapusan karyawan permanen yang tidak merusak histori laporan.
create or replace function public.delete_employee_safely(p_organization_id uuid, p_employee_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_owner(p_organization_id) then
    raise exception 'Hanya Owner dapat menghapus karyawan.';
  end if;
  if not exists (select 1 from public.employees e where e.organization_id = p_organization_id and e.id = p_employee_id) then
    raise exception 'Karyawan tidak ditemukan.';
  end if;
  if exists (select 1 from public.attendance_records where organization_id = p_organization_id and employee_id = p_employee_id)
     or exists (select 1 from public.payroll_slips where organization_id = p_organization_id and employee_id = p_employee_id)
     or exists (select 1 from public.payroll_job_items where organization_id = p_organization_id and employee_id = p_employee_id)
     or exists (select 1 from public.transport_jobs where organization_id = p_organization_id and (driver_id = p_employee_id or helper_1_id = p_employee_id or helper_2_id = p_employee_id))
     or exists (select 1 from public.vehicles where organization_id = p_organization_id and (default_driver_id = p_employee_id or default_helper_1_id = p_employee_id or default_helper_2_id = p_employee_id)) then
    raise exception 'Karyawan sudah memiliki histori absensi, gaji, atau transportasi. Data tidak dapat dihapus agar laporan tetap valid.';
  end if;
  delete from public.employee_pay_rates where organization_id = p_organization_id and employee_id = p_employee_id;
  delete from public.employees where organization_id = p_organization_id and id = p_employee_id;
end;
$$;
revoke all on function public.delete_employee_safely(uuid, uuid) from public;
grant execute on function public.delete_employee_safely(uuid, uuid) to authenticated;

-- // FEATURE: Grafik pengeluaran tahunan selalu mengembalikan Januari-Desember, termasuk bulan nol transaksi.
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
  )
  select m.month_no, coalesce(sum(c.amount), 0)::numeric as total_amount
    from months m left join costs c on c.month_no = m.month_no
   group by m.month_no order by m.month_no;
$$;
revoke all on function public.transport_cost_by_month(uuid, integer) from public;
grant execute on function public.transport_cost_by_month(uuid, integer) to authenticated;

-- // FEATURE: Item borongan ikut memberi refresh realtime saat Owner membuka aplikasi.
do $$ begin
  alter publication supabase_realtime add table public.payroll_job_items;
exception when duplicate_object then null; when undefined_object then null; end $$;

commit;
