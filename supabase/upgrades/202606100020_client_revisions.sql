-- Revisi fitur Rizky Jaya beta 0.0.8:
-- 1/2 hari absensi cepat, foto absensi admin opsional, nota kiriman tanpa armada,
-- dokumen KTP/STNK permanen, dan ringkasan tujuan pengiriman.

begin;

alter table public.organizations
  add column if not exists admin_attendance_requires_photo boolean not null default false;

alter table public.attendance_records
  add column if not exists attendance_fraction numeric(4,2) not null default 1;

update public.attendance_records
set attendance_fraction = case
  when status in ('hadir', 'terlambat') then 1
  else 0
end
where attendance_fraction is null
   or attendance_fraction not in (0, 0.5, 1);

alter table public.attendance_records
  drop constraint if exists attendance_records_fraction_check;
alter table public.attendance_records
  add constraint attendance_records_fraction_check check (attendance_fraction in (0, 0.5, 1));

-- Foto detail kini divalidasi oleh aplikasi memakai organizations.admin_attendance_requires_photo.
-- Constraint lama dilepas agar Owner bisa mematikan foto pada masa awal operasional.
alter table public.attendance_records
  drop constraint if exists attendance_records_detail_photo_check;

alter table public.employees
  add column if not exists ktp_photo_path text;

alter table public.vehicles
  add column if not exists stnk_photo_path text;

alter table public.transport_jobs
  alter column vehicle_id drop not null;
alter table public.transport_jobs
  alter column driver_id drop not null;

create index if not exists transport_jobs_destination_idx
  on public.transport_jobs (organization_id, lower(destination));

insert into storage.buckets (id, name, public)
values ('master-documents', 'master-documents', false)
on conflict (id) do nothing;

drop policy if exists master_documents_owner_select on storage.objects;
drop policy if exists master_documents_owner_insert on storage.objects;
drop policy if exists master_documents_owner_update on storage.objects;
drop policy if exists master_documents_owner_delete on storage.objects;

create policy master_documents_owner_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'master-documents'
    and public.is_owner(((storage.foldername(name))[1])::uuid)
  );

create policy master_documents_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'master-documents'
    and public.is_owner(((storage.foldername(name))[1])::uuid)
  );

create policy master_documents_owner_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'master-documents'
    and public.is_owner(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'master-documents'
    and public.is_owner(((storage.foldername(name))[1])::uuid)
  );

create policy master_documents_owner_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'master-documents'
    and public.is_owner(((storage.foldername(name))[1])::uuid)
  );

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

  return v_id;
end;
$$;

revoke all on function public.record_quick_attendance(uuid, uuid, date, text) from public;
grant execute on function public.record_quick_attendance(uuid, uuid, date, text) to authenticated;


-- Approval lama diperluas agar koreksi admin ikut menyimpan hitungan 1/2 hari
-- dan tidak meninggalkan status ambil gaji pada record yang berubah menjadi tidak hadir.
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

commit;
