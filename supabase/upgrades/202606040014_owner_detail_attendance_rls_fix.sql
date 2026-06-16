-- Rizky Jaya App
-- Hotfix 202606040014: Owner detail attendance RLS + photo upload access
-- Jalankan SETELAH migration 202606040013_history_realtime_export_performance.sql.
--
-- // ROOT CAUSE:
-- Migration absensi lama membatasi INSERT attendance_records dan upload foto
-- hanya untuk Admin Absensi melalui public.is_attendance_admin(...).
-- Setelah fitur Owner dapat mengisi absensi detail ditambahkan, kebijakan itu
-- harus mengizinkan Owner di organisasi yang sama.

begin;

-- // SECURITY:
-- Admin Absensi tetap hanya dapat membuat absensi detail pada hari berjalan.
-- Owner dapat membuat absensi detail/backfill pada organisasinya sendiri.
-- Tanggal Admin divalidasi dari input_time server dalam zona WIB.
drop policy if exists attendance_member_insert on public.attendance_records;

create policy attendance_member_insert
on public.attendance_records
for insert
to authenticated
with check (
  created_by = auth.uid()
  and (
    public.is_owner(organization_id)
    or (
      public.is_attendance_admin(organization_id)
      and attendance_date = (input_time at time zone 'Asia/Jakarta')::date
    )
  )
);

-- // FEATURE:
-- Koreksi record detail langsung hanya dilakukan Owner.
-- Admin tetap mengajukan koreksi melalui tabel change_requests/approval Owner.
drop policy if exists attendance_admin_update_today on public.attendance_records;
drop policy if exists attendance_owner_update on public.attendance_records;

create policy attendance_owner_update
on public.attendance_records
for update
to authenticated
using (
  public.is_owner(organization_id)
)
with check (
  public.is_owner(organization_id)
);

-- // FEATURE:
-- Owner sekarang dapat mengunggah foto bukti ketika melakukan input absensi
-- detail. Admin Absensi tetap memiliki akses upload seperti sebelumnya.
drop policy if exists attendance_photos_insert on storage.objects;

create policy attendance_photos_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'attendance-photos'
  and (
    public.is_owner(((storage.foldername(name))[1])::uuid)
    or public.is_attendance_admin(((storage.foldername(name))[1])::uuid)
  )
);

commit;
