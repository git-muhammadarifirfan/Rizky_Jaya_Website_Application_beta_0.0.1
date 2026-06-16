# Fix Create Admin + Simple Refresh Loading

## Ringkasan Perubahan

Perubahan ini menjaga fitur lama tetap ada, lalu memperbaiki dua hal:

1. **Create Admin Absensi** dibuat lebih stabil melalui Edge Function `manage-admin`.
2. **Loading saat refresh** dibuat sederhana: background putih penuh, teks `Loading`, dan tiga titik animasi di bawahnya.

## File yang Diubah

```text
src/hooks/useAppData.ts
src/components/ui.tsx
src/styles/global.css
supabase/functions/manage-admin/index.ts
supabase/functions/manage-admin/README.md
```

## Detail Fix Create Admin

### Frontend

File: `src/hooks/useAppData.ts`

- Frontend mengambil session aktif lewat `db.auth.getSession()`.
- Access token dikirim manual ke Edge Function:

```ts
headers: { Authorization: `Bearer ${token}` }
```

- Error dari Supabase Function dibaca dari `data.error` atau `error.context`, sehingga toast tidak lagi berhenti di pesan umum seperti `Gagal memproses admin`.

### Edge Function

File: `supabase/functions/manage-admin/index.ts`

Flow create admin sekarang:

1. Menerima request `POST` dari frontend.
2. Membaca JWT Owner dari header `Authorization`.
3. Memverifikasi user login menggunakan `admin.auth.getUser(token)`.
4. Mengecek role Owner di tabel `organization_users`.
5. Jika email belum ada, membuat Auth user baru.
6. Jika email sudah ada, user lama dipakai ulang dan password awal diperbarui.
7. Mengaktifkan/membuat row `profiles`.
8. Mengaktifkan/membuat row `organization_users` sebagai `admin_operasional`.

Function juga punya log aman tanpa password:

```ts
console.log('[manage-admin] ...')
```

## Deploy Function

Jalankan dari root project:

```bash
pnpm exec supabase link --project-ref PROJECT_REF_KAMU
pnpm exec supabase functions deploy manage-admin --no-verify-jwt
```

Tidak perlu menjalankan:

```bash
pnpm exec supabase secrets set SUPABASE_SERVICE_ROLE_KEY="..."
```

Kalau CLI menolak nama `SUPABASE_`, itu normal. Gunakan environment bawaan Edge Function.

## Test Create Admin

1. Login sebagai Owner.
2. Buka **Pengaturan → Kelola Admin**.
3. Klik **Tambah Admin**.
4. Isi:
   - Nama admin
   - Email admin
   - Password minimal 6 karakter
5. Klik **Buat Admin**.
6. Admin harus muncul di daftar Kelola Admin.
7. Coba login memakai email/password admin tersebut.

## Detail Fix Loading Refresh

File: `src/components/ui.tsx` dan `src/styles/global.css`

Loader lama berbentuk card + logo. Loader baru:

- Background full putih.
- Teks `Loading`.
- Tiga titik animasi di bawah teks.
- Lebih ringan saat refresh dan tidak mengurangi fitur app.

