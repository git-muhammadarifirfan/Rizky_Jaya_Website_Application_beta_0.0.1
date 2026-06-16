-- Rizky Jaya App - kode karyawan otomatis dan workflow persetujuan perubahan.
-- Jalankan setelah migration 202605310005_realtime_attendance_profile.sql pada project baru.

begin;

-- Kode baru selalu ditentukan server agar Owner tidak perlu mengetik dan tidak terjadi duplikat saat multi-device.
create or replace function public.assign_employee_code()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_next integer;
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext(new.organization_id::text));
    select coalesce(max((regexp_match(e.employee_code, '^KRY-([0-9]+)$'))[1]::integer), 0) + 1
      into v_next
      from public.employees e
     where e.organization_id = new.organization_id
       and e.employee_code ~ '^KRY-[0-9]+$';
    new.employee_code := 'KRY-' || lpad(v_next::text, 4, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_employee_auto_code on public.employees;
create trigger trg_employee_auto_code before insert on public.employees
for each row execute function public.assign_employee_code();

do $$ begin
  create type public.change_request_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.change_request_type as enum ('attendance_edit', 'transport_job_edit');
exception when duplicate_object then null; end $$;

create table if not exists public.change_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  request_type public.change_request_type not null,
  entity_id uuid not null,
  payload jsonb not null,
  reason text,
  status public.change_request_status not null default 'pending',
  requested_by uuid not null references public.profiles(id) on delete restrict,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolution_note text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_change_requests_org_status on public.change_requests(organization_id, status, created_at desc);
create unique index if not exists idx_change_requests_one_pending
  on public.change_requests(organization_id, request_type, entity_id, requested_by)
  where status = 'pending';

drop trigger if exists trg_change_requests_updated_at on public.change_requests;
create trigger trg_change_requests_updated_at before update on public.change_requests
for each row execute function public.set_updated_at();

alter table public.change_requests enable row level security;
drop policy if exists change_requests_owner_select on public.change_requests;
create policy change_requests_owner_select on public.change_requests for select to authenticated
using (public.is_owner(organization_id));
drop policy if exists change_requests_requester_select on public.change_requests;
create policy change_requests_requester_select on public.change_requests for select to authenticated
using (requested_by = auth.uid() and public.is_attendance_admin(organization_id));
drop policy if exists change_requests_admin_insert on public.change_requests;
create policy change_requests_admin_insert on public.change_requests for insert to authenticated
with check (
  requested_by = auth.uid()
  and public.is_attendance_admin(organization_id)
  and (
    (request_type = 'attendance_edit'::public.change_request_type and exists (
      select 1 from public.attendance_records a where a.id = entity_id and a.organization_id = change_requests.organization_id
    ))
    or
    (request_type = 'transport_job_edit'::public.change_request_type and exists (
      select 1 from public.transport_jobs j where j.id = entity_id and j.organization_id = change_requests.organization_id and j.is_locked = false
    ))
  )
);

-- Admin membuat absensi baru; koreksi record tersimpan hanya diterapkan oleh RPC approval Owner.
drop policy if exists attendance_admin_update_today on public.attendance_records;

-- Detail/status keberangkatan yang sudah tersimpan juga hanya diubah Owner/RPC approval.
drop policy if exists jobs_member_update on public.transport_jobs;
create policy jobs_member_update on public.transport_jobs for update to authenticated
  using (public.is_owner(organization_id))
  with check (public.is_owner(organization_id));

create or replace function public.resolve_change_request(p_request_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  r public.change_requests%rowtype;
  v_updated integer;
begin
  select * into r from public.change_requests where id = p_request_id for update;
  if r.id is null then raise exception 'Pengajuan tidak ditemukan.'; end if;
  if not public.is_owner(r.organization_id) then raise exception 'Hanya Owner dapat memproses pengajuan.'; end if;
  if r.status <> 'pending'::public.change_request_status then raise exception 'Pengajuan ini sudah diproses.'; end if;

  if p_approve then
    if r.request_type = 'attendance_edit'::public.change_request_type then
      update public.attendance_records
         set status = (r.payload->>'status')::public.attendance_status,
             photo_path = nullif(r.payload->>'photo_path', ''),
             notes = nullif(r.payload->>'notes', ''),
             updated_by = auth.uid(),
             updated_at = now()
       where id = r.entity_id and organization_id = r.organization_id;
      get diagnostics v_updated = row_count;
      if v_updated <> 1 then raise exception 'Data absensi tidak lagi tersedia untuk diperbarui.'; end if;
    elsif r.request_type = 'transport_job_edit'::public.change_request_type then
      update public.transport_jobs
         set vehicle_id = (r.payload->>'vehicle_id')::uuid,
             operation_date = (r.payload->>'operation_date')::date,
             destination = r.payload->>'destination',
             driver_id = (r.payload->>'driver_id')::uuid,
             helper_1_id = nullif(r.payload->>'helper_1_id', '')::uuid,
             helper_2_id = nullif(r.payload->>'helper_2_id', '')::uuid,
             status = (r.payload->>'status')::public.transport_job_status,
             odometer_start = nullif(r.payload->>'odometer_start', '')::integer,
             odometer_end = nullif(r.payload->>'odometer_end', '')::integer,
             notes = nullif(r.payload->>'notes', ''),
             updated_by = auth.uid(),
             updated_at = now()
       where id = r.entity_id and organization_id = r.organization_id and is_locked = false;
      get diagnostics v_updated = row_count;
      if v_updated <> 1 then raise exception 'Keberangkatan sudah dikunci atau tidak tersedia.'; end if;
    end if;
  end if;

  update public.change_requests
     set status = case when p_approve then 'approved'::public.change_request_status else 'rejected'::public.change_request_status end,
         resolution_note = nullif(trim(coalesce(p_note, '')), ''),
         resolved_by = auth.uid(),
         resolved_at = now(),
         updated_at = now()
   where id = r.id;
end;
$$;

revoke all on function public.resolve_change_request(uuid, boolean, text) from public;
grant execute on function public.resolve_change_request(uuid, boolean, text) to authenticated;
grant select, insert on public.change_requests to authenticated;
grant usage on type public.change_request_status, public.change_request_type to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'change_requests') then
    alter publication supabase_realtime add table public.change_requests;
  end if;
end $$;

commit;
