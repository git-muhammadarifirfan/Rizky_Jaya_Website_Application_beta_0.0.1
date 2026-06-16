-- Rizky Jaya App - Optional Cron Scheduler for Attendance Photo Retention Beta 0.0.21
-- Jalankan file ini SETELAH 202606120060_attendance_photo_retention.sql.
-- File ini opsional. Jika pg_cron belum aktif di project Supabase, aplikasi tetap
-- menjalankan cleanup ringan saat user login melalui AttendancePhotoRetentionService.
--
-- Jadwal: setiap hari pukul 02:20 WIB.
-- pg_cron memakai UTC, jadi 02:20 WIB = 19:20 UTC hari sebelumnya.

-- Supabase umumnya mendukung pg_cron, tetapi tidak semua environment lokal memilikinya.
-- Karena itu extension dibuat dalam block aman agar migration utama tidak gagal.
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron tidak tersedia di environment ini: %', sqlerrm;
  end;
end $$;

-- Schedule hanya dibuat kalau schema/function cron tersedia.
do $cron_scheduler$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    begin
      perform cron.unschedule('rizky_jaya_attendance_photo_cleanup');
    exception when others then
      null;
    end;

    perform cron.schedule(
      'rizky_jaya_attendance_photo_cleanup',
      '20 19 * * *',
      'select * from public.cleanup_old_attendance_photos(null, 37);'
    );
  else
    raise notice 'cron.schedule tidak tersedia. Lewati scheduler otomatis; cleanup tetap berjalan dari aplikasi.';
  end if;
end $cron_scheduler$;
