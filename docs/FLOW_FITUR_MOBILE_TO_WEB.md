# Flow Aplikasi dan Mapping Fitur Mobile ke Web

Dokumen ini dipakai sebagai checklist agar fitur mobile yang relevan tersedia di dashboard web.

## Role dan Akses

| Role | Akses Utama |
|---|---|
| Owner | Dashboard bisnis, karyawan, absensi penuh, payroll, transport, daftar harga, laporan, pengaturan, approval. |
| Admin Absensi | Dashboard admin, input absensi sesuai mode, input/lihat karyawan, input transport, daftar harga, riwayat, notifikasi ke Owner. |

## Flow Utama

1. User login dengan akun yang sudah terhubung ke organisasi.
2. Web membaca `organization_users`, `profiles`, dan `organizations` untuk menentukan role.
3. Semua halaman mengambil data dari tabel produksi yang sama dengan aplikasi mobile.
4. Perubahan data masuk realtime melalui channel tabel organisasi.
5. Admin yang mengubah data sensitif mengirim pengajuan ke `change_requests`.
6. Owner menyetujui/menolak lewat halaman Pengaturan/Inbox Approval.
7. Laporan diekspor ke Excel/PDF dan dicatat di `report_exports`.

## Absensi

| Fitur Mobile | Implementasi Web |
|---|---|
| Tab Status | Halaman Absensi → Status. Menampilkan semua karyawan aktif, status hari ini, jam, metode, dan status ambil gaji. |
| Tab Absen Detail | Halaman Absensi → Absen. List semua karyawan dengan tombol Absen. Tombol membuka modal status, tanggal, foto, keterangan. |
| Tab Absen Cepat | Halaman Absensi → Absen Cepat. Tabel bulan, nama di kiri, tanggal di kanan, klik sel untuk memilih marker. |
| Marker cepat | `masuk`, `setengah_hari`, `masuk_ambil_gaji`, `tidak_masuk`, `tidak_masuk_ambil_gaji`. |
| Mode admin | `quick`, `detail`, atau `both` dibaca dari organisasi. |
| Koreksi admin | Masuk ke `change_requests` untuk approval Owner. |

## Payroll

| Fitur Mobile | Implementasi Web |
|---|---|
| Pilih periode | Input bulan pada halaman Gaji. |
| Slip per karyawan | Tabel payroll + modal detail perhitungan. |
| Harian | Hadir/terlambat dikali rate harian dan fraksi absensi. |
| Bulanan | Gaji bulanan minus potongan otomatis bila tidak masuk melewati jatah. |
| Borongan | Item pekerjaan disimpan di `payroll_job_items`. |
| Generate Slip | Tombol Generate per karyawan atau Hitung massal. |
| Tandai dibayar | Update slip dan record absensi harian yang belum dibayar. |
| PDF/Excel | Export slip PDF dan laporan payroll Excel/PDF. |

## Transportasi

| Fitur Mobile | Implementasi Web |
|---|---|
| Ringkasan transport | Grafik biaya 6 bulan, komposisi biaya, tujuan terbanyak, total armada/trip/biaya. |
| Master armada | CRUD armada, plat, tahun, pajak, sopir default. |
| Keberangkatan | Input/edit tanggal, armada, tujuan, sopir/helper, status, odometer. |
| Biaya trip | Modal biaya trip untuk BBM dan servis/sparepart. |
| Biaya umum | Input pengeluaran umum transportasi. |
| Approval koreksi admin | Admin edit trip existing dikirim ke `change_requests`. |

## Laporan

- Rekap Absensi Harian/Bulanan.
- Rekap Payroll.
- Rekap Slip Gaji.
- Detail Aktivitas/Approval.
- Master Armada.
- Daftar Keberangkatan.
- Pengeluaran Transportasi.
- Daftar Harga Barang.
- Export gabungan workbook multi-sheet.

## Data Terintegrasi

- `employees`
- `employee_pay_rates`
- `attendance_records`
- `payroll_periods`
- `payroll_slips`
- `payroll_job_items`
- `vehicles`
- `transport_destinations`
- `transport_jobs`
- `fuel_expenses`
- `vehicle_expenses`
- `transport_general_expenses`
- `product_prices`
- `change_requests`
- `report_exports`
