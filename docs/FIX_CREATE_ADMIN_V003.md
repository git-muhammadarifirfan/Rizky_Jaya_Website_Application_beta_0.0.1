# Fix Create Admin v0.0.3

## Masalah yang terlihat di log

Log Edge Function berhenti di:

```txt
[manage-admin] action parsed ...
[manage-admin] failed Gagal memproses admin.
```

Artinya request sudah masuk ke Edge Function, tetapi error asli dari Supabase/PostgREST tidak ikut terbaca karena object error bukan instance `Error` JavaScript.

## Perbaikan

File yang diperbaiki:

```txt
supabase/functions/manage-admin/index.ts
```

Perubahan utama:

1. Error PostgREST/Supabase sekarang dibaca dari `message`, `details`, `hint`, `code`, dan `status`.
2. Setiap step penting diberi log:
   - request masuk
   - action parsed
   - owner authorized
   - create admin started
   - create success
3. Validasi Owner dibuat lebih aman:
   - server mencari membership Owner dari tabel `organization_users`
   - kalau frontend mengirim `organizationId` lama/template, function otomatis memakai organization milik Owner yang valid
4. `createUser`, `profiles.upsert`, dan `organization_users.upsert` sekarang menampilkan error step yang jelas.

## Deploy ulang

Jalankan dari root project:

```bash
pnpm exec supabase functions deploy manage-admin --no-verify-jwt
```

Lalu refresh web app dan coba lagi.

## Kalau masih gagal

Buka:

```txt
Supabase Dashboard -> Edge Functions -> manage-admin -> Logs
```

Sekarang log harus menampilkan error detail seperti:

```txt
Simpan profil admin: ...
Simpan role Admin Absensi: ...
Cek role Owner di organization_users: ...
Buat auth user admin: ...
```

Itu yang perlu dikirim untuk diagnosis lanjutan.
