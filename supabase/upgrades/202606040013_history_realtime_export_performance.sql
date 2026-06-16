-- Rizky Jaya App beta 0.0.18
-- Indeks tambahan untuk layar riwayat bertahap dan refresh realtime tanpa
-- mengubah struktur data/fungsionalitas yang sudah digunakan aplikasi.
-- Jalankan setelah 202606040012_attendance_payroll_sync_audit.sql.

begin;

-- // PERFORMANCE: riwayat Admin dan rekap status sering membaca absensi terbaru
-- berdasarkan organisasi dan rentang tanggal, tanpa memilih satu karyawan.
create index if not exists idx_attendance_records_org_date_desc
  on public.attendance_records (organization_id, attendance_date desc);

-- // PERFORMANCE: Admin membaca pengajuan miliknya dari yang paling terbaru;
-- indeks ini menjaga tombol "lihat semua" tetap responsif ketika data membesar.
create index if not exists idx_change_requests_org_requester_created_desc
  on public.change_requests (organization_id, requested_by, created_at desc);

commit;
