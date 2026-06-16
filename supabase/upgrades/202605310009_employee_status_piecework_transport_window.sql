-- Rizky Jaya App beta 0.0.5 - status karyawan aman dan borongan lapangan fleksibel.
-- Jalankan di SQL Editor setelah upgrade 202605310008 pada database beta yang sudah ada.
begin;

-- // FEATURE: Hard delete tidak digunakan oleh aplikasi versi ini.
-- employees.is_active dipakai untuk menonaktifkan atau mengaktifkan kembali
-- pekerja sehingga histori absensi, payroll, dan transportasi tetap utuh.
drop function if exists public.delete_employee_safely(uuid, uuid);

-- // FEATURE: Borongan toko bahan bangunan dapat memakai satuan lapangan bebas.
alter table public.payroll_job_items
  add column if not exists unit_label text not null default 'job';

update public.payroll_job_items
set unit_label = case item_kind
  when 'per_barang' then 'satuan'
  when 'per_tujuan' then 'tujuan'
  when 'kategori_truk' then 'rit'
  else unit_label
end
where unit_label = 'job';

alter table public.payroll_job_items
  drop constraint if exists payroll_job_items_item_kind_check;

alter table public.payroll_job_items
  add constraint payroll_job_items_item_kind_check
  check (
    item_kind in (
      'per_barang',
      'per_tujuan',
      'kategori_truk',
      'mingguan_proyek',
      'harian_proyek',
      'muat_bongkar',
      'pengiriman',
      'per_volume',
      'lainnya'
    )
  );

alter table public.payroll_job_items
  drop constraint if exists payroll_job_items_unit_label_check;

alter table public.payroll_job_items
  add constraint payroll_job_items_unit_label_check
  check (length(trim(unit_label)) between 1 and 30);

commit;
