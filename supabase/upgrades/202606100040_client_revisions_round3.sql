-- Rizky Jaya App beta 0.0.8 - client revisions round 3
-- 1) Simbol Tidak Masuk + Ambil Gaji hanya berlaku pada tanggal yang dipilih.
-- 2) Gaji harian dihitung dari total hari efektif masuk, termasuk 1/2 hari.
-- 3) Simbol cepat disimpan eksplisit agar UI tidak salah membaca paid_at sebagai status simbol.
-- Jalankan setelah 202606100030_client_revisions_round2.sql.

begin;

-- // DATA MODEL: Simbol cepat disimpan terpisah dari paid_at. paid_at hanya
-- berarti pembayaran hari hadir, sedangkan quick_marker menentukan tampilan sel.
alter table public.attendance_records
  add column if not exists quick_marker text;

alter table public.attendance_records
  drop constraint if exists attendance_records_quick_marker_check;
alter table public.attendance_records
  add constraint attendance_records_quick_marker_check
  check (
    quick_marker is null or quick_marker in (
      'masuk', 'setengah_hari', 'masuk_ambil_gaji',
      'tidak_masuk', 'tidak_masuk_ambil_gaji'
    )
  );

create index if not exists idx_attendance_records_org_date_marker
  on public.attendance_records(organization_id, attendance_date, quick_marker);

-- // BUGFIX: Versi round2 sempat membuat marker '-' menutup seluruh gaji bulan berjalan.
-- Repair aman ini hanya melepas paid_at yang kemungkinan besar terset massal pada detik
-- yang sama dengan input "tidak masuk + ambil gaji", dan tidak menyentuh record yang
-- memang dipilih sebagai "Masuk + Ambil Gaji" dari menu absensi cepat.
with pickup as (
  select organization_id, employee_id, attendance_date, coalesce(updated_at, created_at) as marker_time
  from public.attendance_records
  where status = 'tidak_hadir'::public.attendance_status
    and notes ilike '%tidak masuk%ambil gaji%'
)
update public.attendance_records ar
   set paid_at = null,
       paid_by = null,
       updated_at = now()
  from pickup p
 where ar.organization_id = p.organization_id
   and ar.employee_id = p.employee_id
   and ar.attendance_date >= date_trunc('month', p.attendance_date)::date
   and ar.attendance_date <= p.attendance_date
   and ar.status in ('hadir'::public.attendance_status, 'terlambat'::public.attendance_status)
   and coalesce(ar.notes, '') not ilike '%gaji sudah diambil%'
   and ar.paid_at is not null
   and ar.paid_at between p.marker_time - interval '10 seconds' and p.marker_time + interval '10 seconds';

-- // BACKFILL: Data lama tetap punya simbol ketika dibaca oleh aplikasi baru.
update public.attendance_records
   set quick_marker = case
     when status = 'tidak_hadir'::public.attendance_status
          and notes ilike '%tidak masuk%ambil gaji%' then 'tidak_masuk_ambil_gaji'
     when status = 'tidak_hadir'::public.attendance_status then 'tidak_masuk'
     when status in ('hadir'::public.attendance_status, 'terlambat'::public.attendance_status)
          and attendance_fraction = 0.5 then 'setengah_hari'
     when status in ('hadir'::public.attendance_status, 'terlambat'::public.attendance_status)
          and coalesce(notes, '') ilike '%gaji sudah diambil%' then 'masuk_ambil_gaji'
     when status in ('hadir'::public.attendance_status, 'terlambat'::public.attendance_status)
          and paid_at is not null then 'masuk_ambil_gaji'
     when status in ('hadir'::public.attendance_status, 'terlambat'::public.attendance_status) then 'masuk'
     else null
   end
 where quick_marker is null;

-- // SAFETY: Status non-hadir tidak boleh menyimpan paid_at agar payroll tidak
-- menghitung hari tidak masuk sebagai hari sudah dibayar. quick_marker tetap dipertahankan.
create or replace function public.normalize_attendance_daily_pickup()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status not in ('hadir'::public.attendance_status, 'terlambat'::public.attendance_status) then
    new.paid_at := null;
    new.paid_by := null;
  end if;
  return new;
end;
$$;

drop trigger if exists attendance_records_normalize_daily_pickup on public.attendance_records;
create trigger attendance_records_normalize_daily_pickup
before insert or update on public.attendance_records
for each row execute function public.normalize_attendance_daily_pickup();

-- // RPC: Tidak Masuk + Ambil Gaji sekarang hanya menyimpan quick_marker pada
-- tanggal itu. Tidak ada update massal ke hari-hari sebelumnya.
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
  if p_marker not in ('masuk', 'setengah_hari', 'masuk_ambil_gaji', 'tidak_masuk', 'tidak_masuk_ambil_gaji') then
    raise exception 'Pilihan absensi cepat tidak valid.';
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
      v_paid_at := null;
      v_fraction := 0;
      v_notes := 'Input cepat - tidak masuk dan ambil gaji';
    when 'tidak_masuk' then
      v_status := 'tidak_hadir'::public.attendance_status;
      v_paid_at := null;
      v_fraction := 0;
  end case;

  insert into public.attendance_records (
    organization_id, employee_id, attendance_date, status, input_method,
    quick_marker, attendance_fraction, paid_at, paid_by, notes, created_by, updated_by
  ) values (
    p_organization_id, p_employee_id, p_attendance_date, v_status, 'quick',
    p_marker, v_fraction, v_paid_at, case when v_paid_at is null then null else auth.uid() end,
    v_notes, auth.uid(), auth.uid()
  )
  on conflict (organization_id, employee_id, attendance_date) do update
    set status = excluded.status,
        quick_marker = excluded.quick_marker,
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

-- // PAYROLL SYNC: Status slip harian hijau hanya jika semua hari efektif hadir
-- sudah memiliki paid_at. Perhitungan memakai sum(attendance_fraction), bukan count record.
create or replace function public.sync_daily_payroll_status_from_attendance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_employee_id uuid;
  v_attendance_date date;
begin
  if tg_op = 'DELETE' then
    v_organization_id := old.organization_id;
    v_employee_id := old.employee_id;
    v_attendance_date := old.attendance_date;
  else
    v_organization_id := new.organization_id;
    v_employee_id := new.employee_id;
    v_attendance_date := new.attendance_date;
  end if;

  update public.payroll_slips ps
     set status = case
           when totals.hadir_units > 0 and totals.sudah_diambil_units + 0.001 >= totals.hadir_units
             then 'dibayar'::public.payroll_status
           else 'draft'::public.payroll_status
         end,
         paid_at = case
           when totals.hadir_units > 0 and totals.sudah_diambil_units + 0.001 >= totals.hadir_units
             then coalesce(ps.paid_at, clock_timestamp())
           else null
         end,
         updated_by = coalesce(auth.uid(), ps.updated_by)
    from public.payroll_periods pp
    cross join lateral (
      select
        coalesce(sum(coalesce(ar.attendance_fraction, 1)) filter (
          where ar.status in ('hadir'::public.attendance_status, 'terlambat'::public.attendance_status)
        ), 0)::numeric as hadir_units,
        coalesce(sum(coalesce(ar.attendance_fraction, 1)) filter (
          where ar.status in ('hadir'::public.attendance_status, 'terlambat'::public.attendance_status)
            and ar.paid_at is not null
        ), 0)::numeric as sudah_diambil_units
      from public.attendance_records ar
      where ar.organization_id = v_organization_id
        and ar.employee_id = v_employee_id
        and ar.attendance_date between pp.start_date and pp.end_date
    ) totals
   where ps.organization_id = v_organization_id
     and ps.employee_id = v_employee_id
     and ps.salary_type = 'harian'
     and ps.payroll_period_id = pp.id
     and v_attendance_date between pp.start_date and pp.end_date;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists attendance_records_sync_daily_payroll on public.attendance_records;
create trigger attendance_records_sync_daily_payroll
after insert or update or delete on public.attendance_records
for each row execute function public.sync_daily_payroll_status_from_attendance();

-- // BACKFILL STATUS: Selaraskan status slip yang sudah ada dengan aturan baru.
with slip_totals as (
  select
    ps.id,
    coalesce(sum(coalesce(ar.attendance_fraction, 1)) filter (
      where ar.status in ('hadir'::public.attendance_status, 'terlambat'::public.attendance_status)
    ), 0)::numeric as hadir_units,
    coalesce(sum(coalesce(ar.attendance_fraction, 1)) filter (
      where ar.status in ('hadir'::public.attendance_status, 'terlambat'::public.attendance_status)
        and ar.paid_at is not null
    ), 0)::numeric as sudah_diambil_units
  from public.payroll_slips ps
  join public.payroll_periods pp
    on pp.id = ps.payroll_period_id and pp.organization_id = ps.organization_id
  left join public.attendance_records ar
    on ar.organization_id = ps.organization_id
   and ar.employee_id = ps.employee_id
   and ar.attendance_date between pp.start_date and pp.end_date
  where ps.salary_type = 'harian'
  group by ps.id
)
update public.payroll_slips ps
   set status = case
         when totals.hadir_units > 0 and totals.sudah_diambil_units + 0.001 >= totals.hadir_units
           then 'dibayar'::public.payroll_status
         else 'draft'::public.payroll_status
       end,
       paid_at = case
         when totals.hadir_units > 0 and totals.sudah_diambil_units + 0.001 >= totals.hadir_units
           then coalesce(ps.paid_at, clock_timestamp())
         else null
       end,
       updated_at = now()
  from slip_totals totals
 where ps.id = totals.id;


-- // APPROVAL SYNC: Koreksi absensi detail lewat Owner ikut membersihkan quick_marker
-- supaya simbol cepat lama tidak tertinggal setelah status diubah manual.
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
             quick_marker = case when r.payload ? 'quick_marker' then nullif(r.payload->>'quick_marker', '') else quick_marker end,
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

commit;
