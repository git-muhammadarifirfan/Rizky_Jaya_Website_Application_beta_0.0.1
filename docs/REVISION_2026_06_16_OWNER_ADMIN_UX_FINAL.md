# Revision 2026-06-16 — Owner/Admin UX Final

Dokumen ini mencatat perubahan final untuk permintaan UX pada halaman karyawan, absensi, keberangkatan, armada, biaya umum, notifikasi, profil, dan konfirmasi hapus.

## Ringkasan perubahan

### 1. Data Karyawan

- Menambahkan tombol **Detail** pada tabel karyawan.
- Detail karyawan dibuka dalam modal lebar dengan layout dua kolom:
  - kolom utama untuk identitas, jabatan, nomor HP, tanggal masuk, tipe gaji, dan catatan;
  - kolom dokumen untuk preview **Foto KTP**.
- Jika `ktp_photo_path` kosong, UI menampilkan status **Tidak ada foto KTP**.
- Form tambah/edit karyawan sekarang mendukung upload/ganti foto KTP.
- File KTP disimpan ke bucket Supabase Storage `master-documents` pada folder `employees/ktp`.
- Preview gambar memakai signed URL sementara agar tetap aman untuk bucket privat.

File utama:

- `src/pages/Employees.tsx`
- `src/components/ui.tsx`
- `src/hooks/useAppData.ts`

### 2. Absensi

- Status absensi sekarang menampilkan jam di samping badge status.
- Jam diambil dari urutan data berikut:
  1. `input_time`
  2. `updated_at`
  3. `created_at`
- Status **Terlambat** ditampilkan dengan teks jam masuk, contoh: `Terlambat — Masuk 08.15 WIB`.
- Jika karyawan sudah punya record absensi, tombol berubah menjadi **Edit**.
- Modal absensi juga memakai judul dan tombol simpan yang sesuai untuk mode edit.
- Tombol manual kirim notifikasi ke Owner dihapus dari modal dan riwayat.

File utama:

- `src/pages/Attendance.tsx`
- `src/App.tsx`

### 3. Keberangkatan, Armada, dan Biaya Umum

- Menambahkan tombol **Preview** pada daftar keberangkatan, armada, dan biaya umum.
- Preview dibuka dengan modal yang berisi data ringkas tetapi jelas.
- Preview keberangkatan menampilkan:
  - tujuan;
  - tanggal;
  - armada;
  - sopir/helper;
  - odometer;
  - biaya BBM;
  - biaya kendaraan;
  - status kunci;
  - catatan.
- Preview armada menampilkan data kendaraan, sopir/helper default, status aktif, catatan, dan preview **Foto STNK**.
- Form armada sekarang mendukung upload/ganti foto STNK.
- File STNK disimpan ke bucket Supabase Storage `master-documents` pada folder `vehicles/stnk`.
- Preview biaya umum menampilkan nominal, kategori, tanggal, kendaraan, penanggung jawab, dan catatan.

File utama:

- `src/pages/Transport.tsx`
- `src/hooks/useAppData.ts`
- `src/components/ui.tsx`

### 4. Tombol status Owner untuk keberangkatan

- Tombol status dibuat lebih eksplisit dan mudah dipahami:
  - `draft` → **Mulai Berangkat**
  - `berjalan` → **Tandai Selesai**
  - `selesai` → **Buka Lagi**
  - `dibatalkan` → **Kembalikan Draft**
- Tombol kunci dibuat lebih jelas:
  - **Kunci Final**
  - **Buka Kunci**
- Label kunci di tabel diganti menjadi:
  - **Terkunci**
  - **Belum dikunci**

File utama:

- `src/pages/Transport.tsx`
- `src/styles/global.css`

### 5. Notifikasi

- Tombol/manual flow **kirim notifikasi ke Owner** dihapus.
- Notifikasi approval tetap muncul dari proses otomatis data koreksi.
- Bell notifikasi di topbar sekarang membuka panel samping berbentuk drawer, bukan modal tengah.
- Drawer berisi daftar notifikasi, detail payload, dan aksi approval untuk Owner.

File utama:

- `src/components/Shell.tsx`
- `src/pages/Settings.tsx`
- `src/App.tsx`
- `src/styles/global.css`

### 6. Profile menu dan logout

- Klik profile chip di topbar membuka dropdown.
- Dropdown berisi:
  - **Detail Profil**
  - **Log out**
- Log out tidak langsung keluar. Sistem menampilkan modal konfirmasi dengan desain konsisten.

File utama:

- `src/components/Shell.tsx`
- `src/components/ui.tsx`
- `src/styles/global.css`

### 7. Konfirmasi hapus konsisten

- Menghapus penggunaan konfirmasi browser standar untuk data yang dapat dihapus.
- Menambahkan `ConfirmDialog` reusable pada `src/components/ui.tsx`.
- Delete katalog barang dan item borongan sekarang memakai modal konfirmasi konsisten.

File utama:

- `src/components/ui.tsx`
- `src/pages/Catalog.tsx`
- `src/pages/Payroll.tsx`

## Catatan teknis Storage

Upload KTP dan STNK memakai bucket:

```txt
master-documents
```

Path penyimpanan:

```txt
employees/ktp/{organizationId}-{timestamp}-{filename}
vehicles/stnk/{organizationId}-{timestamp}-{filename}
```

Pastikan bucket dan policy Supabase Storage sudah mengizinkan role yang login untuk upload dan membaca signed URL. Komponen preview akan menampilkan fallback aman apabila path kosong, storage belum dikonfigurasi, atau policy menolak akses.

## Komponen reusable baru

### `StorageImagePreview`

Lokasi: `src/components/ui.tsx`

Fungsi:

- Membaca gambar dari Supabase Storage menggunakan signed URL 15 menit.
- Menampilkan fallback **Tidak ada foto** ketika path kosong.
- Menampilkan pesan error yang aman ketika storage gagal dibuka.

### `ConfirmDialog`

Lokasi: `src/components/ui.tsx`

Fungsi:

- Modal konfirmasi reusable untuk logout, hapus barang, hapus item borongan, dan aksi destruktif berikutnya.
- Mendukung mode `danger` agar warna dan pesan lebih jelas.

## Validasi build

Build produksi sudah diuji dengan perintah:

```bash
npm run build
```

Hasil:

```txt
✓ built successfully
```

## File yang paling penting direview

- `src/components/Shell.tsx`
- `src/components/ui.tsx`
- `src/pages/Employees.tsx`
- `src/pages/Attendance.tsx`
- `src/pages/Transport.tsx`
- `src/pages/Settings.tsx`
- `src/pages/Catalog.tsx`
- `src/pages/Payroll.tsx`
- `src/hooks/useAppData.ts`
- `src/styles/global.css`

## Catatan implementasi

- Desain mengikuti style yang sudah ada: Poppins, soft card, badge status, radius besar, dan warna teal/green/orange/red yang konsisten.
- Perubahan dibuat tanpa mengubah struktur database utama. Kolom `ktp_photo_path` dan `stnk_photo_path` dipakai jika tersedia dari schema saat ini.
- Notifikasi ke Owner tidak dihapus dari sistem approval otomatis; yang dihapus hanya tombol kirim manual dari UI.
