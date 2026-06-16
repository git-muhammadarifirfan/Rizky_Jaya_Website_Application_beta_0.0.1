# Rizki Jaya App — React TypeScript Web Dashboard

Web dashboard production-ready untuk di-deploy ke Vercel atau shared hosting static. UI dibuat mengikuti referensi Owner dan Admin Absensi: sidebar kiri, topbar, kartu metrik, chart, notifikasi, tabel, modal, export PDF/Excel, dan responsive mobile.

## Stack

- React + TypeScript + Vite
- CSS custom design system, tanpa Tailwind agar ringan dan mudah di-hosting
- Recharts untuk chart dashboard
- xlsx untuk export Excel
- jsPDF + jspdf-autotable + html2canvas untuk export PDF/slip
- Database produksi sama dengan aplikasi mobile melalui konfigurasi `.env`

## Fitur

- Login Owner/Admin.
- Dashboard Owner: karyawan, absensi, payroll, chart, notifikasi, aksi cepat.
- Dashboard Admin Absensi: mulai absensi, ringkasan hari ini, aktivitas terbaru, tren absensi.
- Karyawan: tambah/edit, aktif/nonaktif, tipe gaji harian/bulanan/borongan.
- Absensi: status, absen detail/foto, dan absensi cepat `✖`, `½`, `✖ merah`, `—`, `— merah`.
- Payroll: pilih periode, hitung gaji semua/dipilih, tandai dibayar, export slip PDF.
- Transportasi: grafik biaya, komposisi biaya, armada, keberangkatan, BBM, servis/sparepart, biaya umum, export.
- Daftar harga barang: Owner edit, Admin lihat.
- Laporan: export Excel/PDF untuk absensi, payroll, transport, audit notifikasi.
- Notifikasi Admin ke Owner: memakai inbox approval/pengajuan.
- Pengaturan mode absensi Admin.
- Responsive untuk desktop, tablet, dan mobile.

## Setup Lokal

```bash
npm install
cp .env.example .env
npm run dev
```

Isi `.env`:

```bash
VITE_APP_BACKEND_URL=https://PROJECT_REF.supabase.co
VITE_APP_PUBLIC_KEY=sb_publishable_xxx
```

Nama variabel sengaja netral supaya tidak muncul branding teknis di UI.

## Build Production

```bash
npm run build
```

Output static ada di folder `dist/`.

## Deploy Vercel

1. Upload repo ini ke GitHub.
2. Import ke Vercel.
3. Set environment variables dari `.env.example`.
4. Build command: `npm run build`.
5. Output directory: `dist`.

## Deploy Shared Hosting

1. Jalankan `npm run build`.
2. Upload isi folder `dist/` ke `public_html/`.
3. Pastikan routing fallback diarahkan ke `index.html`. Contoh `.htaccess`:

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
```

## Database

Folder `supabase/migrations` dan `supabase/upgrades` disalin dari aplikasi mobile yang diunggah. Jalankan migration sesuai urutan jika membuat project database baru. Untuk database existing, jalankan file upgrade sesuai versi yang belum diterapkan.

## Catatan Produksi

- UI tidak menampilkan kata “Supabase” atau detail backend.
- Bila `.env` belum diisi, aplikasi menolak login dan menampilkan peringatan konfigurasi. Tidak ada fallback data tiruan.
- Untuk foto bukti absensi, bucket storage yang dipakai adalah `attendance-proofs` sesuai pola aplikasi mobile.
- Realtime refresh aktif pada tabel operasional utama.

---

## Fix Kelola Admin: Edge Function `manage-admin`

Fitur **Tambah Admin Absensi** tidak bisa dibuat hanya dari frontend React/Vercel karena pembuatan akun Supabase Auth membutuhkan `service_role_key`. Kunci tersebut tidak boleh ditempatkan di `.env` frontend.

Folder function sudah disertakan di:

```text
supabase/functions/manage-admin/index.ts
```

Deploy satu kali ke project Supabase yang sama dengan database mobile/web:

```bash
supabase login
supabase link --project-ref PROJECT_REF_KAMU
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=SERVICE_ROLE_KEY_KAMU
supabase functions deploy manage-admin --no-verify-jwt
```

Setelah deploy, tombol **Pengaturan → Kelola Admin → Tambah Admin** akan membuat:

- akun Supabase Auth untuk Admin Absensi,
- data profil di tabel `profiles`,
- relasi admin ke toko di tabel `organization_users`.

Jika function belum dideploy, web akan menampilkan pesan yang jelas, bukan lagi error generic `Failed to send a request to the Edge Function`.

## Revision notes — Owner/Admin UX Final

Dokumentasi perubahan final untuk detail karyawan, preview KTP/STNK, status absensi dengan jam, preview keberangkatan/armada/biaya umum, notification drawer, profile menu, logout confirmation, dan delete confirmation tersedia di:

```txt
docs/REVISION_2026_06_16_OWNER_ADMIN_UX_FINAL.md
```
