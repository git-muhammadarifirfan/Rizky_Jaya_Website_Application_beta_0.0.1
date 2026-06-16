# Revisi WebApp — UX, Chart, Approval, Absensi, dan Upload Image

Dokumen ini mencatat perubahan yang dilakukan pada revisi web dashboard agar perilaku web lebih sejajar dengan aplikasi Android, sekaligus memperbaiki beberapa masalah UI yang muncul saat testing lokal.

## 1. Chart Payroll dan Dashboard

- Format sumbu Y diperbaiki memakai formatter `moneyAxis()` agar tidak muncul angka pecah/overflow seperti `000003 jt`.
- Domain chart dibuat aman dengan `chartDomain()` supaya chart kosong tetap rapi.
- Grafik payroll ditambah:
  - donut status slip dibayar/belum dibayar;
  - trend payroll 6 bulan;
  - breakdown berdasarkan tipe gaji.
- Semua chart memakai animasi bawaan Recharts dan container responsif.

## 2. Notifikasi Admin ke Owner

- Icon bell sekarang membuka modal detail notifikasi.
- Owner bisa membaca payload/detail pengajuan.
- Pengajuan pending memiliki aksi `Terima` dan `Tolak`.
- Setelah aksi berhasil, data approval ikut refresh dari database.

## 3. Absensi

- Tab navigasi dibuat lebih jelas dengan icon, active state, hover, dan cursor clickable.
- Tab **Status** menampilkan daftar karyawan yang bisa diklik.
- Klik karyawan membuka modal detail minggu berjalan:
  - status hari ini;
  - jam masuk/pulang;
  - ringkasan status minggu berjalan;
  - catatan/metode input.
- Dashboard Owner memakai ringkasan absensi bulan berjalan, bukan hanya hari ini.
- Tab **Absen Cepat** diubah dari tabel horizontal panjang menjadi card + grid tanggal responsif agar tidak terasa seperti scroll mentah browser.

## 4. Scrollbar dan Navigasi

- Scrollbar global, modal, tabel, dan quick grid dibuat tipis, rounded, dan sesuai warna tema.
- Sidebar, topbar, quick action, report card, dan tab diberi visual affordance agar pengguna jelas bahwa elemen tersebut dapat diklik.

## 5. Transport

- Grafik biaya 6 bulan diperbaiki agar angka aman dan mudah dibaca.
- Ditambahkan donut komposisi biaya berdasarkan kategori.
- Ditambahkan chart trend line untuk analisis biaya transport.
- Kartu metric transport dibuat lebih mudah dipindai.

## 6. Laporan

- Halaman laporan dirombak menjadi ringkasan periode + kartu export.
- Setiap jenis laporan punya tombol Excel/PDF sendiri.
- Data preview karyawan aktif tetap tersedia untuk validasi cepat sebelum export.

## 7. Pengaturan dan Kelola Admin

- Blok **Mode Absensi Admin** dihapus dari UI pengaturan.
- Pengaturan dirombak menjadi layout akun, approval center, dan kelola admin.
- Tombol Tambah Admin / Nonaktifkan / Aktifkan memanggil Edge Function `manage-admin`.
- Edge Function baru ditambahkan di `supabase/functions/manage-admin/index.ts`.

> Catatan: pembuatan user admin membutuhkan service role, jadi harus dilakukan lewat Edge Function/server-side. Frontend tidak menyimpan service role key.

## 8. Search Daftar Barang

- Search bar dibuat ulang dengan style `.search-box`, icon, radius, dan focus state yang konsisten.
- Style ini bisa dipakai ulang di halaman lain.

## 9. Refresh dan Loading

- Saat session sedang diverifikasi, web menampilkan boot loader.
- Halaman login tidak lagi muncul sekilas setelah user sudah login.
- Page route memakai lazy loading dan skeleton loader agar initial load terasa lebih ringan.

## 10. Kompresi Upload Gambar

- Utility baru: `src/lib/image.ts`.
- Semua upload gambar melewati `compressImageFile()`.
- Gambar dikompres client-side ke WebP, maksimal sisi 1440px, target ±320 KB.
- File non-gambar tidak dikompres dan tetap diupload normal.

## Validasi Build

Perintah berikut sudah dijalankan dan berhasil:

```bash
npm run build
```

Output production tersedia di folder `dist/` dan siap untuk Vercel atau shared hosting.
