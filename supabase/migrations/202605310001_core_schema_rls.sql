-- Rizky Jaya App - Supabase PostgreSQL core schema and RLS
-- Scope: attendance, payroll, vehicles, transport expense tracking, exports, audit trail.
-- Run in a fresh Supabase project after reviewing organization name and policy decisions.
-- Authentication users are created through Supabase Auth. Do not store passwords in public tables.

begin;

create extension if not exists pgcrypto;

-- ===== ENUMS =====
do $$ begin
  create type public.user_role as enum ('owner', 'admin_operasional');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.attendance_status as enum ('hadir', 'tidak_hadir', 'izin', 'sakit', 'libur', 'terlambat');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.payroll_status as enum ('draft', 'siap_dibayar', 'dibayar', 'dibatalkan');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.transport_job_status as enum ('draft', 'berjalan', 'selesai', 'dibatalkan');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.vehicle_expense_category as enum ('mesin', 'servis', 'sparepart', 'aksesoris', 'tol', 'parkir', 'lainnya');
exception when duplicate_object then null; end $$;

-- ===== GENERIC HELPERS =====
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Uses authenticated session actor where available; service-side provisioning may supply explicit actor IDs.
create or replace function public.stamp_actor_fields()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.created_by := auth.uid();
    end if;
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

create or replace function public.force_attendance_server_time()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.input_time := now();
  end if;
  return new;
end;
$$;

-- ===== IDENTITY & ORGANIZATION =====
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) >= 2),
  currency_code text not null default 'IDR',
  timezone text not null default 'Asia/Jakarta',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  full_name text not null,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_users (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  role public.user_role not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index if not exists idx_organization_users_user on public.organization_users(user_id, organization_id);

-- Security-definer helpers prevent policy recursion and centralize role checks.
create or replace function public.is_org_member(p_organization_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_users ou
    join public.profiles p on p.id = ou.user_id
    where ou.organization_id = p_organization_id
      and ou.user_id = auth.uid()
      and p.is_active = true
  );
$$;

create or replace function public.is_owner(p_organization_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_users ou
    join public.profiles p on p.id = ou.user_id
    where ou.organization_id = p_organization_id
      and ou.user_id = auth.uid()
      and ou.role = 'owner'::public.user_role
      and p.is_active = true
  );
$$;

create or replace function public.is_operational_admin(p_organization_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_users ou
    join public.profiles p on p.id = ou.user_id
    where ou.organization_id = p_organization_id
      and ou.user_id = auth.uid()
      and ou.role in ('owner'::public.user_role, 'admin_operasional'::public.user_role)
      and p.is_active = true
  );
$$;

create or replace function public.owner_can_view_member_profile(p_user_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_users target
    join public.organization_users me on me.organization_id = target.organization_id
    join public.profiles owner_profile on owner_profile.id = me.user_id
    where target.user_id = p_user_id
      and me.user_id = auth.uid()
      and me.role = 'owner'::public.user_role
      and owner_profile.is_active = true
  );
$$;

-- ===== EMPLOYEES & ATTENDANCE =====
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  employee_code text not null,
  full_name text not null,
  phone text,
  position text,
  joined_date date,
  is_active boolean not null default true,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, employee_code),
  unique (organization_id, id)
);
create index if not exists idx_employees_org_active on public.employees(organization_id, is_active, full_name);

-- Payroll-sensitive information is separated from basic employee data.
create table if not exists public.employee_pay_rates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  employee_id uuid not null,
  daily_rate numeric(14,2) not null check (daily_rate >= 0),
  overtime_rate numeric(14,2) not null default 0 check (overtime_rate >= 0),
  valid_from date not null,
  valid_to date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from),
  foreign key (organization_id, employee_id) references public.employees(organization_id, id) on delete restrict
);
create index if not exists idx_pay_rates_employee_date on public.employee_pay_rates(employee_id, valid_from desc);

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  employee_id uuid not null,
  attendance_date date not null,
  status public.attendance_status not null,
  input_time timestamptz not null default now(),
  photo_path text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, employee_id, attendance_date),
  check ((status <> 'hadir') or photo_path is not null),
  check ((latitude is null and longitude is null) or (latitude is not null and longitude is not null)),
  foreign key (organization_id, employee_id) references public.employees(organization_id, id) on delete restrict
);
create index if not exists idx_attendance_org_date on public.attendance_records(organization_id, attendance_date desc);
create index if not exists idx_attendance_employee_date on public.attendance_records(employee_id, attendance_date desc);

-- ===== PAYROLL =====
create table if not exists public.payroll_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  period_name text not null,
  start_date date not null,
  end_date date not null,
  is_locked boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, start_date, end_date),
  check (end_date >= start_date)
);

create table if not exists public.payroll_slips (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  payroll_period_id uuid not null references public.payroll_periods(id) on delete restrict,
  employee_id uuid not null,
  attended_days integer not null default 0 check (attended_days >= 0),
  base_amount numeric(14,2) not null default 0 check (base_amount >= 0),
  bonus_amount numeric(14,2) not null default 0 check (bonus_amount >= 0),
  deduction_amount numeric(14,2) not null default 0 check (deduction_amount >= 0),
  net_amount numeric(14,2) generated always as (base_amount + bonus_amount - deduction_amount) stored,
  status public.payroll_status not null default 'draft',
  paid_at timestamptz,
  payment_method text,
  notes text,
  slip_file_path text,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payroll_period_id, employee_id),
  check (net_amount >= 0),
  check ((status <> 'dibayar') or paid_at is not null),
  foreign key (organization_id, employee_id) references public.employees(organization_id, id) on delete restrict
);
create index if not exists idx_payroll_slips_period_status on public.payroll_slips(payroll_period_id, status);

-- ===== TRANSPORTATION MASTER & OPERATIONS =====
create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  fleet_code text not null,
  plate_number text not null,
  vehicle_year integer not null check (vehicle_year between 1950 and extract(year from current_date)::integer + 1),
  tax_due_date date not null,
  default_driver_id uuid,
  default_helper_1_id uuid,
  default_helper_2_id uuid,
  is_active boolean not null default true,
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, fleet_code),
  unique (organization_id, plate_number),
  unique (organization_id, id),
  constraint vehicles_organization_id_default_driver_id_fkey foreign key (organization_id, default_driver_id) references public.employees(organization_id, id) on delete restrict,
  constraint vehicles_organization_id_default_helper_1_id_fkey foreign key (organization_id, default_helper_1_id) references public.employees(organization_id, id) on delete restrict,
  constraint vehicles_organization_id_default_helper_2_id_fkey foreign key (organization_id, default_helper_2_id) references public.employees(organization_id, id) on delete restrict,
  check (default_driver_id is null or default_driver_id <> default_helper_1_id),
  check (default_driver_id is null or default_driver_id <> default_helper_2_id),
  check (default_helper_1_id is null or default_helper_1_id <> default_helper_2_id)
);
create index if not exists idx_vehicles_org_active_tax on public.vehicles(organization_id, is_active, tax_due_date);

-- One record represents one delivery/operation. It preserves historical crew even if defaults change later.
create table if not exists public.transport_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  vehicle_id uuid not null,
  operation_date date not null default current_date,
  destination text not null,
  driver_id uuid not null,
  helper_1_id uuid,
  helper_2_id uuid,
  status public.transport_job_status not null default 'draft',
  odometer_start integer check (odometer_start is null or odometer_start >= 0),
  odometer_end integer check (odometer_end is null or odometer_end >= 0),
  notes text,
  is_locked boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transport_jobs_organization_id_vehicle_id_fkey foreign key (organization_id, vehicle_id) references public.vehicles(organization_id, id) on delete restrict,
  constraint transport_jobs_organization_id_driver_id_fkey foreign key (organization_id, driver_id) references public.employees(organization_id, id) on delete restrict,
  constraint transport_jobs_organization_id_helper_1_id_fkey foreign key (organization_id, helper_1_id) references public.employees(organization_id, id) on delete restrict,
  constraint transport_jobs_organization_id_helper_2_id_fkey foreign key (organization_id, helper_2_id) references public.employees(organization_id, id) on delete restrict,
  check (helper_1_id is null or driver_id <> helper_1_id),
  check (helper_2_id is null or driver_id <> helper_2_id),
  check (helper_1_id is null or helper_2_id is null or helper_1_id <> helper_2_id),
  check (odometer_end is null or odometer_start is null or odometer_end >= odometer_start)
);
create index if not exists idx_transport_jobs_org_date on public.transport_jobs(organization_id, operation_date desc, vehicle_id);

create table if not exists public.fuel_expenses (
  id uuid primary key default gen_random_uuid(),
  transport_job_id uuid not null references public.transport_jobs(id) on delete restrict,
  fuel_type text not null,
  liters numeric(10,2) check (liters is null or liters > 0),
  amount numeric(14,2) not null check (amount > 0),
  receipt_path text,
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_fuel_expenses_job on public.fuel_expenses(transport_job_id, created_at desc);

create table if not exists public.vehicle_expenses (
  id uuid primary key default gen_random_uuid(),
  transport_job_id uuid not null references public.transport_jobs(id) on delete restrict,
  category public.vehicle_expense_category not null,
  vendor_name text not null,
  amount numeric(14,2) not null check (amount > 0),
  receipt_path text,
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_vehicle_expenses_job on public.vehicle_expenses(transport_job_id, created_at desc);

-- ===== REPORTING & AUDIT =====
create table if not exists public.report_exports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  report_type text not null,
  date_from date,
  date_to date,
  file_path text,
  status text not null default 'requested' check (status in ('requested','processing','ready','failed')),
  requested_by uuid not null references auth.users(id) on delete restrict,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid,
  actor_id uuid references auth.users(id) on delete set null,
  table_name text not null,
  record_id uuid,
  action text not null check (action in ('INSERT','UPDATE','DELETE')),
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_org_time on public.audit_logs(organization_id, created_at desc);

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

-- Enforce active employee references for new/current vehicle assignments and transport jobs.
create or replace function public.validate_active_crew_references()
returns trigger
language plpgsql
as $$
declare
  candidate uuid;
begin
  foreach candidate in array array[new.driver_id, new.helper_1_id, new.helper_2_id] loop
    if candidate is not null and not exists (
      select 1 from public.employees e
      where e.id = candidate and e.organization_id = new.organization_id and e.is_active = true
    ) then
      raise exception 'Selected crew member must be active in this organization';
    end if;
  end loop;
  return new;
end;
$$;

create or replace function public.validate_active_vehicle_defaults()
returns trigger
language plpgsql
as $$
declare
  candidate uuid;
begin
  foreach candidate in array array[new.default_driver_id, new.default_helper_1_id, new.default_helper_2_id] loop
    if candidate is not null and not exists (
      select 1 from public.employees e
      where e.id = candidate and e.organization_id = new.organization_id and e.is_active = true
    ) then
      raise exception 'Default vehicle crew must be active in this organization';
    end if;
  end loop;
  return new;
end;
$$;

-- ===== UPDATED_AT TRIGGERS =====
drop trigger if exists organizations_updated_at on public.organizations;
create trigger organizations_updated_at before update on public.organizations for each row execute function public.set_updated_at();
drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists employees_updated_at on public.employees;
create trigger employees_updated_at before update on public.employees for each row execute function public.set_updated_at();
drop trigger if exists attendance_updated_at on public.attendance_records;
create trigger attendance_updated_at before update on public.attendance_records for each row execute function public.set_updated_at();
drop trigger if exists payroll_periods_updated_at on public.payroll_periods;
create trigger payroll_periods_updated_at before update on public.payroll_periods for each row execute function public.set_updated_at();
drop trigger if exists payroll_slips_updated_at on public.payroll_slips;
create trigger payroll_slips_updated_at before update on public.payroll_slips for each row execute function public.set_updated_at();
drop trigger if exists vehicles_updated_at on public.vehicles;
create trigger vehicles_updated_at before update on public.vehicles for each row execute function public.set_updated_at();
drop trigger if exists transport_jobs_updated_at on public.transport_jobs;
create trigger transport_jobs_updated_at before update on public.transport_jobs for each row execute function public.set_updated_at();
drop trigger if exists fuel_expenses_updated_at on public.fuel_expenses;
create trigger fuel_expenses_updated_at before update on public.fuel_expenses for each row execute function public.set_updated_at();
drop trigger if exists vehicle_expenses_updated_at on public.vehicle_expenses;
create trigger vehicle_expenses_updated_at before update on public.vehicle_expenses for each row execute function public.set_updated_at();

-- Server-side actor/time and active-reference enforcement.
drop trigger if exists attendance_force_server_time on public.attendance_records;
create trigger attendance_force_server_time before insert on public.attendance_records for each row execute function public.force_attendance_server_time();
drop trigger if exists attendance_stamp_actor on public.attendance_records;
create trigger attendance_stamp_actor before insert or update on public.attendance_records for each row execute function public.stamp_actor_fields();
drop trigger if exists employees_stamp_actor on public.employees;
create trigger employees_stamp_actor before insert or update on public.employees for each row execute function public.stamp_actor_fields();
drop trigger if exists payroll_slips_stamp_actor on public.payroll_slips;
create trigger payroll_slips_stamp_actor before insert or update on public.payroll_slips for each row execute function public.stamp_actor_fields();
drop trigger if exists vehicles_stamp_actor on public.vehicles;
create trigger vehicles_stamp_actor before insert or update on public.vehicles for each row execute function public.stamp_actor_fields();
drop trigger if exists vehicles_active_defaults on public.vehicles;
create trigger vehicles_active_defaults before insert or update on public.vehicles for each row execute function public.validate_active_vehicle_defaults();
drop trigger if exists jobs_stamp_actor on public.transport_jobs;
create trigger jobs_stamp_actor before insert or update on public.transport_jobs for each row execute function public.stamp_actor_fields();
drop trigger if exists jobs_active_crew on public.transport_jobs;
create trigger jobs_active_crew before insert or update on public.transport_jobs for each row execute function public.validate_active_crew_references();
drop trigger if exists fuel_stamp_actor on public.fuel_expenses;
create trigger fuel_stamp_actor before insert or update on public.fuel_expenses for each row execute function public.stamp_actor_fields();
drop trigger if exists vehicle_expenses_stamp_actor on public.vehicle_expenses;
create trigger vehicle_expenses_stamp_actor before insert or update on public.vehicle_expenses for each row execute function public.stamp_actor_fields();

-- ===== AUDIT TRIGGERS (transactional, append-only) =====
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['employees','employee_pay_rates','attendance_records','payroll_periods','payroll_slips','vehicles','transport_jobs','fuel_expenses','vehicle_expenses','organization_users']
  LOOP
    EXECUTE format('drop trigger if exists audit_%I on public.%I', t, t);
    EXECUTE format('create trigger audit_%I after insert or update or delete on public.%I for each row execute function public.audit_record_changes()', t, t);
  END LOOP;
END $$;

-- ===== REPORTING VIEWS =====
create or replace view public.v_transport_expense_summary
with (security_invoker = true) as
with fuel_totals as (
  select transport_job_id, sum(amount)::numeric(14,2) as fuel_total
  from public.fuel_expenses
  group by transport_job_id
), other_totals as (
  select transport_job_id, sum(amount)::numeric(14,2) as other_total
  from public.vehicle_expenses
  group by transport_job_id
)
select
  j.organization_id,
  j.id as transport_job_id,
  j.operation_date,
  j.vehicle_id,
  v.fleet_code,
  v.plate_number,
  j.destination,
  coalesce(f.fuel_total, 0)::numeric(14,2) as fuel_total,
  coalesce(x.other_total, 0)::numeric(14,2) as other_total,
  (coalesce(f.fuel_total, 0) + coalesce(x.other_total, 0))::numeric(14,2) as grand_total
from public.transport_jobs j
join public.vehicles v on v.id = j.vehicle_id
left join fuel_totals f on f.transport_job_id = j.id
left join other_totals x on x.transport_job_id = j.id;

-- ===== RLS =====
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_users enable row level security;
alter table public.employees enable row level security;
alter table public.employee_pay_rates enable row level security;
alter table public.attendance_records enable row level security;
alter table public.payroll_periods enable row level security;
alter table public.payroll_slips enable row level security;
alter table public.vehicles enable row level security;
alter table public.transport_jobs enable row level security;
alter table public.fuel_expenses enable row level security;
alter table public.vehicle_expenses enable row level security;
alter table public.report_exports enable row level security;
alter table public.audit_logs enable row level security;

-- Profiles: authenticated users may read permitted profiles; status changes only through the Owner edge function.
drop policy if exists profiles_read_self on public.profiles;
create policy profiles_read_self on public.profiles for select to authenticated using (id = auth.uid() or public.owner_can_view_member_profile(id));
drop policy if exists profiles_update_self on public.profiles;

-- Organization & membership.
drop policy if exists organizations_member_select on public.organizations;
create policy organizations_member_select on public.organizations for select to authenticated using (public.is_org_member(id));
drop policy if exists organizations_owner_update on public.organizations;
create policy organizations_owner_update on public.organizations for update to authenticated using (public.is_owner(id)) with check (public.is_owner(id));
drop policy if exists organization_users_member_select on public.organization_users;
create policy organization_users_member_select on public.organization_users for select to authenticated using (user_id = auth.uid() or public.is_owner(organization_id));

-- Employee basic master: admins may read for attendance and crew selection; only owner changes master.
drop policy if exists employees_member_select on public.employees;
create policy employees_member_select on public.employees for select to authenticated using (public.is_operational_admin(organization_id));
drop policy if exists employees_owner_write on public.employees;
create policy employees_owner_write on public.employees for all to authenticated using (public.is_owner(organization_id)) with check (public.is_owner(organization_id));

-- Payroll is owner-only.
drop policy if exists pay_rates_owner_all on public.employee_pay_rates;
create policy pay_rates_owner_all on public.employee_pay_rates for all to authenticated using (public.is_owner(organization_id)) with check (public.is_owner(organization_id));
drop policy if exists payroll_periods_owner_all on public.payroll_periods;
create policy payroll_periods_owner_all on public.payroll_periods for all to authenticated using (public.is_owner(organization_id)) with check (public.is_owner(organization_id));
drop policy if exists payroll_slips_owner_all on public.payroll_slips;
create policy payroll_slips_owner_all on public.payroll_slips for all to authenticated using (public.is_owner(organization_id)) with check (public.is_owner(organization_id));

-- Attendance: admins input/read; edits are constrained to records created by them today. Owner can correct all records.
drop policy if exists attendance_member_select on public.attendance_records;
create policy attendance_member_select on public.attendance_records for select to authenticated using (public.is_operational_admin(organization_id));
drop policy if exists attendance_member_insert on public.attendance_records;
create policy attendance_member_insert on public.attendance_records for insert to authenticated with check (created_by = auth.uid() and (public.is_owner(organization_id) or (public.is_operational_admin(organization_id) and attendance_date = current_date)));
drop policy if exists attendance_admin_update_today on public.attendance_records;
create policy attendance_admin_update_today on public.attendance_records for update to authenticated
  using (public.is_owner(organization_id) or (public.is_operational_admin(organization_id) and created_by = auth.uid() and attendance_date = current_date))
  with check (public.is_owner(organization_id) or (public.is_operational_admin(organization_id) and created_by = auth.uid() and attendance_date = current_date));
drop policy if exists attendance_owner_delete on public.attendance_records;
create policy attendance_owner_delete on public.attendance_records for delete to authenticated using (public.is_owner(organization_id));

-- Vehicles: admins can select an active truck; only owner can create/edit/deactivate vehicle master.
drop policy if exists vehicles_member_select on public.vehicles;
create policy vehicles_member_select on public.vehicles for select to authenticated using (public.is_operational_admin(organization_id));
drop policy if exists vehicles_owner_write on public.vehicles;
create policy vehicles_owner_write on public.vehicles for all to authenticated using (public.is_owner(organization_id)) with check (public.is_owner(organization_id));

-- Jobs: admins CRUD operational records while unlocked; owner controls all and can lock periods.
drop policy if exists jobs_member_select on public.transport_jobs;
create policy jobs_member_select on public.transport_jobs for select to authenticated using (public.is_operational_admin(organization_id));
drop policy if exists jobs_member_insert on public.transport_jobs;
create policy jobs_member_insert on public.transport_jobs for insert to authenticated with check (public.is_operational_admin(organization_id) and created_by = auth.uid() and is_locked = false);
drop policy if exists jobs_member_update on public.transport_jobs;
create policy jobs_member_update on public.transport_jobs for update to authenticated
  using (public.is_owner(organization_id) or (public.is_operational_admin(organization_id) and is_locked = false))
  with check (public.is_owner(organization_id) or (public.is_operational_admin(organization_id) and is_locked = false));
drop policy if exists jobs_owner_delete on public.transport_jobs;
create policy jobs_owner_delete on public.transport_jobs for delete to authenticated using (public.is_owner(organization_id));

-- Expenses: check authorization through parent job. Admin can input/edit costs only before job is locked; owner can control all.
drop policy if exists fuel_member_select on public.fuel_expenses;
create policy fuel_member_select on public.fuel_expenses for select to authenticated using (
  exists (select 1 from public.transport_jobs j where j.id = fuel_expenses.transport_job_id and public.is_operational_admin(j.organization_id))
);
drop policy if exists fuel_member_insert on public.fuel_expenses;
create policy fuel_member_insert on public.fuel_expenses for insert to authenticated with check (
  created_by = auth.uid() and exists (select 1 from public.transport_jobs j where j.id = fuel_expenses.transport_job_id and public.is_operational_admin(j.organization_id) and j.is_locked = false)
);
drop policy if exists fuel_member_update on public.fuel_expenses;
create policy fuel_member_update on public.fuel_expenses for update to authenticated using (
  exists (select 1 from public.transport_jobs j where j.id = fuel_expenses.transport_job_id and (public.is_owner(j.organization_id) or (public.is_operational_admin(j.organization_id) and j.is_locked = false)))
) with check (
  exists (select 1 from public.transport_jobs j where j.id = fuel_expenses.transport_job_id and (public.is_owner(j.organization_id) or (public.is_operational_admin(j.organization_id) and j.is_locked = false)))
);
drop policy if exists fuel_owner_delete on public.fuel_expenses;
create policy fuel_owner_delete on public.fuel_expenses for delete to authenticated using (
  exists (select 1 from public.transport_jobs j where j.id = fuel_expenses.transport_job_id and public.is_owner(j.organization_id))
);

drop policy if exists vehicle_expense_member_select on public.vehicle_expenses;
create policy vehicle_expense_member_select on public.vehicle_expenses for select to authenticated using (
  exists (select 1 from public.transport_jobs j where j.id = vehicle_expenses.transport_job_id and public.is_operational_admin(j.organization_id))
);
drop policy if exists vehicle_expense_member_insert on public.vehicle_expenses;
create policy vehicle_expense_member_insert on public.vehicle_expenses for insert to authenticated with check (
  created_by = auth.uid() and exists (select 1 from public.transport_jobs j where j.id = vehicle_expenses.transport_job_id and public.is_operational_admin(j.organization_id) and j.is_locked = false)
);
drop policy if exists vehicle_expense_member_update on public.vehicle_expenses;
create policy vehicle_expense_member_update on public.vehicle_expenses for update to authenticated using (
  exists (select 1 from public.transport_jobs j where j.id = vehicle_expenses.transport_job_id and (public.is_owner(j.organization_id) or (public.is_operational_admin(j.organization_id) and j.is_locked = false)))
) with check (
  exists (select 1 from public.transport_jobs j where j.id = vehicle_expenses.transport_job_id and (public.is_owner(j.organization_id) or (public.is_operational_admin(j.organization_id) and j.is_locked = false)))
);
drop policy if exists vehicle_expense_owner_delete on public.vehicle_expenses;
create policy vehicle_expense_owner_delete on public.vehicle_expenses for delete to authenticated using (
  exists (select 1 from public.transport_jobs j where j.id = vehicle_expenses.transport_job_id and public.is_owner(j.organization_id))
);

-- Exports and audit history are owner-only by default because they reveal totals and sensitive operations.
drop policy if exists report_exports_owner_all on public.report_exports;
create policy report_exports_owner_all on public.report_exports for all to authenticated using (public.is_owner(organization_id)) with check (public.is_owner(organization_id) and requested_by = auth.uid());
drop policy if exists audit_owner_read on public.audit_logs;
create policy audit_owner_read on public.audit_logs for select to authenticated using (organization_id is not null and public.is_owner(organization_id));

-- Block direct deletes on master data from clients: deactivate instead for audit integrity.
revoke delete on public.employees, public.vehicles, public.profiles from authenticated;

-- ===== API GRANTS (RLS remains the final authority) =====
revoke all on public.organizations, public.profiles, public.organization_users, public.employees,
  public.employee_pay_rates, public.attendance_records, public.payroll_periods, public.payroll_slips,
  public.vehicles, public.transport_jobs, public.fuel_expenses, public.vehicle_expenses,
  public.report_exports, public.audit_logs from anon;

grant usage on type public.user_role, public.attendance_status, public.payroll_status,
  public.transport_job_status, public.vehicle_expense_category to authenticated;
grant select on public.organizations, public.organization_users, public.employees, public.attendance_records,
  public.vehicles, public.transport_jobs, public.fuel_expenses, public.vehicle_expenses to authenticated;
grant select on public.profiles to authenticated;
grant insert, update, delete on public.attendance_records, public.transport_jobs, public.fuel_expenses, public.vehicle_expenses to authenticated;
grant insert, update on public.employees, public.employee_pay_rates, public.payroll_periods, public.payroll_slips, public.vehicles to authenticated;
grant select, insert, update, delete on public.employee_pay_rates, public.payroll_periods, public.payroll_slips, public.report_exports to authenticated;
grant select on public.audit_logs to authenticated;
grant select on public.v_transport_expense_summary to authenticated;

commit;
