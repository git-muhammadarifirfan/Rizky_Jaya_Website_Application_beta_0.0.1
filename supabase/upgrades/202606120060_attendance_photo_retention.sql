-- Rizky Jaya App - Attendance Photo Retention Beta 0.0.21
-- Tujuan:
-- 1. Menghapus bukti foto absensi yang umur tanggal absensinya sudah lebih dari 1 bulan + 1 minggu (37 hari).
-- 2. Membersihkan metadata path foto dari attendance_records, change_requests, dan audit_logs.
-- 3. Menyediakan RPC cleanup_old_attendance_photos agar bisa dipanggil otomatis dari aplikasi atau scheduler Supabase.
--
-- Catatan:
-- - Data absensi TIDAK dihapus. Yang dihapus hanya foto dan path fotonya.
-- - Bucket yang dibersihkan hanya attendance-photos.
-- - Function dibuat SECURITY DEFINER supaya cleanup tetap bisa menghapus storage.objects tanpa membuka policy delete ke Admin.

begin;

-- // PERFORMANCE: Cleanup hanya memindai record yang memang punya foto lama.
create index if not exists idx_attendance_records_photo_retention
  on public.attendance_records(organization_id, attendance_date, photo_path)
  where photo_path is not null;

-- // FEATURE: Retensi foto absensi.
-- p_retention_days default 37 = 1 bulan + 1 minggu.
-- p_organization_id wajib diisi ketika dipanggil dari aplikasi. Scheduler internal boleh memakai null untuk semua organisasi.
create or replace function public.cleanup_old_attendance_photos(
  p_organization_id uuid default null,
  p_retention_days integer default 37
)
returns table(
  deleted_storage_objects integer,
  cleared_attendance_rows integer,
  scrubbed_change_requests integer,
  scrubbed_audit_logs integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_retention_days integer := greatest(coalesce(p_retention_days, 37), 1);
  v_cutoff_date date := ((now() at time zone 'Asia/Jakarta')::date - greatest(coalesce(p_retention_days, 37), 1));
  v_paths text[];
  v_deleted_storage integer := 0;
  v_cleared_rows integer := 0;
  v_scrubbed_requests integer := 0;
  v_scrubbed_audits integer := 0;
begin
  -- // SECURITY: Pemanggilan dari client harus terikat organisasi login.
  -- Cron/SQL internal biasanya berjalan tanpa auth.uid(), sehingga boleh lintas organisasi.
  if auth.uid() is not null then
    if p_organization_id is null then
      raise exception 'p_organization_id wajib diisi untuk cleanup dari aplikasi.';
    end if;

    if not public.is_owner(p_organization_id) and not public.is_attendance_admin(p_organization_id) then
      raise exception 'Anda tidak punya akses cleanup foto absensi organisasi ini.';
    end if;
  end if;

  select coalesce(array_agg(distinct ar.photo_path), array[]::text[])
    into v_paths
  from public.attendance_records ar
  where ar.photo_path is not null
    and ar.attendance_date <= v_cutoff_date
    and (p_organization_id is null or ar.organization_id = p_organization_id);

  if coalesce(array_length(v_paths, 1), 0) = 0 then
    return query select 0, 0, 0, 0;
    return;
  end if;

  -- // STORAGE: Hapus metadata object dari bucket private attendance-photos.
  -- Supabase Storage mengacu ke storage.objects sebagai metadata utama object.
  delete from storage.objects so
  where so.bucket_id = 'attendance-photos'
    and so.name = any(v_paths);
  get diagnostics v_deleted_storage = row_count;

  -- // DATABASE: Lepas relasi foto dari record absensi lama, tetapi data absensinya tetap utuh.
  update public.attendance_records ar
     set photo_path = null,
         updated_at = now(),
         updated_by = coalesce(auth.uid(), ar.updated_by)
   where ar.photo_path = any(v_paths)
     and ar.attendance_date <= v_cutoff_date
     and (p_organization_id is null or ar.organization_id = p_organization_id);
  get diagnostics v_cleared_rows = row_count;

  -- // DATABASE: Bersihkan path foto dari approval yang mungkin masih menyimpan payload lama.
  update public.change_requests cr
     set payload = cr.payload - 'photo_path'
   where cr.request_type = 'attendance_edit'
     and cr.payload ? 'photo_path'
     and cr.payload->>'photo_path' = any(v_paths)
     and (p_organization_id is null or cr.organization_id = p_organization_id);
  get diagnostics v_scrubbed_requests = row_count;

  -- // PRIVACY: Trigger audit menyimpan old_data/new_data. Path foto lama ikut dihapus
  -- supaya tidak ada referensi foto yang tertinggal di tabel audit.
  update public.audit_logs al
     set old_data = case
           when al.old_data ? 'photo_path' then jsonb_set(al.old_data, '{photo_path}', 'null'::jsonb, true)
           else al.old_data
         end,
         new_data = case
           when al.new_data ? 'photo_path' then jsonb_set(al.new_data, '{photo_path}', 'null'::jsonb, true)
           else al.new_data
         end
   where al.table_name = 'attendance_records'
     and (p_organization_id is null or al.organization_id = p_organization_id)
     and (
       al.old_data->>'photo_path' = any(v_paths)
       or al.new_data->>'photo_path' = any(v_paths)
     );
  get diagnostics v_scrubbed_audits = row_count;

  return query select v_deleted_storage, v_cleared_rows, v_scrubbed_requests, v_scrubbed_audits;
end;
$$;

revoke all on function public.cleanup_old_attendance_photos(uuid, integer) from public;
grant execute on function public.cleanup_old_attendance_photos(uuid, integer) to authenticated;

commit;
