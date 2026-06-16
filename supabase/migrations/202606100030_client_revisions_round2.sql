-- Revisi client round 2:
-- 1) Foto absensi Admin default opsional tanpa toggle UI.
-- 2) Payroll menyimpan hari efektif pecahan agar 1/2 hari tidak hilang.
-- 3) Master tujuan pengiriman untuk select ulang dan ringkasan yang konsisten.
-- 4) Pengeluaran umum dapat menyimpan path foto nota opsional.
-- 5) Simbol '-' merah: tidak masuk sekaligus ambil gaji bulan berjalan.

begin;

-- Foto admin dibuat opsional permanen di database. Aplikasi tidak lagi menampilkan toggle.
alter table public.attendance_records
  drop constraint if exists attendance_records_detail_photo_check;
update public.organizations
   set admin_attendance_requires_photo = false
 where coalesce(admin_attendance_requires_photo, false) = true;

-- Hari efektif pecahan dipisahkan dari jumlah record hadir agar laporan lama tetap aman.
alter table public.payroll_slips
  add column if not exists attended_day_units numeric(10,2) not null default 0;
update public.payroll_slips
   set attended_day_units = attended_days
 where attended_day_units = 0 and attended_days > 0;

-- Foto nota pengeluaran umum disimpan sebagai path Storage, bukan byte gambar di database.
alter table public.transport_general_expenses
  add column if not exists receipt_path text;

-- Master tujuan pengiriman. normalized_name menjaga "Bintang  Jaya" dan "bintang jaya" tetap satu data.
create table if not exists public.transport_destinations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null,
  normalized_name text not null,
  is_active boolean not null default true,
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, normalized_name),
  check (length(trim(name)) > 0),
  check (length(trim(normalized_name)) > 0)
);

create index if not exists idx_transport_destinations_org_active
  on public.transport_destinations(organization_id, is_active, name);

alter table public.transport_jobs
  add column if not exists destination_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'transport_jobs_organization_id_destination_id_fkey'
  ) then
    alter table public.transport_jobs
      add constraint transport_jobs_organization_id_destination_id_fkey
      foreign key (organization_id, destination_id)
      references public.transport_destinations(organization_id, id)
      on delete restrict;
  end if;
end $$;

-- Backfill master tujuan dari histori trip yang sudah ada.
insert into public.transport_destinations (organization_id, name, normalized_name, created_by, updated_by)
select distinct on (tj.organization_id, lower(regexp_replace(trim(tj.destination), '\\s+', ' ', 'g')))
       tj.organization_id,
       regexp_replace(trim(tj.destination), '\\s+', ' ', 'g') as name,
       lower(regexp_replace(trim(tj.destination), '\\s+', ' ', 'g')) as normalized_name,
       tj.created_by,
       tj.updated_by
  from public.transport_jobs tj
 where trim(coalesce(tj.destination, '')) <> ''
order by tj.organization_id, lower(regexp_replace(trim(tj.destination), '\\s+', ' ', 'g')), tj.created_at
on conflict (organization_id, normalized_name) do nothing;

update public.transport_jobs tj
   set destination_id = td.id
  from public.transport_destinations td
 where tj.organization_id = td.organization_id
   and lower(regexp_replace(trim(tj.destination), '\\s+', ' ', 'g')) = td.normalized_name
   and tj.destination_id is null;

alter table public.transport_destinations enable row level security;

drop policy if exists transport_destinations_member_select on public.transport_destinations;
create policy transport_destinations_member_select on public.transport_destinations
  for select to authenticated
  using (public.is_operational_admin(organization_id));

drop policy if exists transport_destinations_member_insert on public.transport_destinations;
create policy transport_destinations_member_insert on public.transport_destinations
  for insert to authenticated
  with check (public.is_operational_admin(organization_id));

drop policy if exists transport_destinations_member_update on public.transport_destinations;
create policy transport_destinations_member_update on public.transport_destinations
  for update to authenticated
  using (public.is_operational_admin(organization_id))
  with check (public.is_operational_admin(organization_id));

drop policy if exists transport_destinations_owner_delete on public.transport_destinations;
create policy transport_destinations_owner_delete on public.transport_destinations
  for delete to authenticated
  using (public.is_owner(organization_id));

drop trigger if exists trg_transport_destinations_updated_at on public.transport_destinations;
create trigger trg_transport_destinations_updated_at before update on public.transport_destinations
  for each row execute function public.set_updated_at();

drop trigger if exists transport_destinations_stamp_actor on public.transport_destinations;
create trigger transport_destinations_stamp_actor before insert or update on public.transport_destinations
  for each row execute function public.stamp_actor_fields();

-- Beberapa database existing beta belum punya audit helper `public.log_audit_event()`.
-- Trigger audit dibuat hanya jika function tersebut memang tersedia, agar upgrade aman dijalankan.
do $$
begin
  if to_regprocedure('public.log_audit_event()') is not null then
    drop trigger if exists audit_transport_destinations on public.transport_destinations;
    create trigger audit_transport_destinations after insert or update or delete on public.transport_destinations
      for each row execute function public.log_audit_event();
  end if;
end $$;

revoke all on public.transport_destinations from anon;
grant select, insert, update, delete on public.transport_destinations to authenticated;

-- Replace RPC absensi cepat dengan dukungan marker '-' merah.
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
  v_month_start date := date_trunc('month', p_attendance_date)::date;
  v_status public.attendance_status;
  v_paid_at timestamptz;
  v_fraction numeric(4,2) := 1;
  v_notes text := 'Input cepat';
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
      v_fraction := 1;
    when 'setengah_hari' then
      v_status := 'hadir'::public.attendance_status;
      v_paid_at := null;
      v_fraction := 0.5;
      v_notes := 'Input cepat - setengah hari';
    when 'masuk_ambil_gaji' then
      v_status := 'hadir'::public.attendance_status;
      v_paid_at := v_now;
      v_fraction := 1;
      v_notes := 'Input cepat - gaji sudah diambil';
    when 'tidak_masuk_ambil_gaji' then
      v_status := 'tidak_hadir'::public.attendance_status;
      v_paid_at := v_now;
      v_fraction := 0;
      v_notes := 'Input cepat - tidak masuk dan ambil gaji';
    when 'tidak_masuk' then
      v_status := 'tidak_hadir'::public.attendance_status;
      v_paid_at := null;
      v_fraction := 0;
    else
      raise exception 'Pilihan absensi cepat tidak valid.';
  end case;

  insert into public.attendance_records (
    organization_id, employee_id, attendance_date, status, input_method,
    attendance_fraction, paid_at, paid_by, notes, created_by, updated_by
  ) values (
    p_organization_id, p_employee_id, p_attendance_date, v_status, 'quick',
    v_fraction, v_paid_at, case when v_paid_at is null then null else auth.uid() end,
    v_notes, auth.uid(), auth.uid()
  )
  on conflict (organization_id, employee_id, attendance_date) do update
    set status = excluded.status,
        attendance_fraction = excluded.attendance_fraction,
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

  -- Marker '-' berarti karyawan tidak masuk pada tanggal itu, tetapi mengambil
  -- gaji yang belum dibayar pada bulan berjalan sampai tanggal tersebut.
  if p_marker = 'tidak_masuk_ambil_gaji' then
    update public.attendance_records
       set paid_at = v_now,
           paid_by = auth.uid(),
           updated_by = auth.uid(),
           updated_at = v_now
     where organization_id = p_organization_id
       and employee_id = p_employee_id
       and attendance_date >= v_month_start
       and attendance_date <= p_attendance_date
       and status in ('hadir'::public.attendance_status, 'terlambat'::public.attendance_status)
       and paid_at is null;
  end if;

  return v_id;
end;
$$;

revoke all on function public.record_quick_attendance(uuid, uuid, date, text) from public;
grant execute on function public.record_quick_attendance(uuid, uuid, date, text) to authenticated;

-- Approval transport ikut membawa destination_id agar koreksi Admin tetap konsisten dengan master tujuan.
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
             attendance_fraction = coalesce(nullif(r.payload->>'attendance_fraction', '')::numeric, attendance_fraction),
             paid_at = case when r.payload ? 'paid_at' then nullif(r.payload->>'paid_at', '')::timestamptz else paid_at end,
             paid_by = case when r.payload ? 'paid_by' then nullif(r.payload->>'paid_by', '')::uuid else paid_by end,
             updated_by = auth.uid(),
             updated_at = now()
       where id = r.entity_id and organization_id = r.organization_id;
      get diagnostics v_updated = row_count;
      if v_updated <> 1 then raise exception 'Data absensi tidak lagi tersedia untuk diperbarui.'; end if;
    elsif r.request_type = 'transport_job_edit'::public.change_request_type then
      update public.transport_jobs
         set vehicle_id = nullif(r.payload->>'vehicle_id', '')::uuid,
             operation_date = (r.payload->>'operation_date')::date,
             destination_id = nullif(r.payload->>'destination_id', '')::uuid,
             destination = r.payload->>'destination',
             driver_id = nullif(r.payload->>'driver_id', '')::uuid,
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

do $$
begin
  begin alter publication supabase_realtime add table public.transport_destinations; exception when duplicate_object then null; end;
end $$;

commit;
