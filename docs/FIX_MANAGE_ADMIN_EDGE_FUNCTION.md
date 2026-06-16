# Fix Error Tambah Admin

## Masalah

Saat klik **Buat Admin**, muncul toast:

```text
Failed to send a request to the Edge Function
```

Penyebabnya bukan form/modal. Penyebabnya adalah Edge Function `manage-admin` belum aktif/dideploy di project Supabase yang dipakai web.

## Kenapa harus Edge Function?

Web React berjalan di browser. Browser hanya boleh membawa public key Supabase. Pembuatan akun admin baru membutuhkan `service_role_key`, sehingga harus dilakukan di backend aman, yaitu Supabase Edge Function.

## File yang sudah disediakan

```text
supabase/functions/manage-admin/index.ts
supabase/functions/manage-admin/README.md
supabase/config.toml
```

## Cara deploy

```bash
pnpm exec supabase link --project-ref PROJECT_REF_KAMU
pnpm exec supabase functions deploy manage-admin --no-verify-jwt
```

## Perbaikan kode frontend

- Error function sekarang dibaca dari response server sehingga toast menampilkan penyebab asli.
- JWT Owner dikirim eksplisit dari frontend ke Edge Function.
- Response function dibuat `ok:false` supaya frontend bisa menampilkan detail error dari server.
- Function memverifikasi JWT Owner secara manual lalu mengecek role Owner di tabel `organization_users`.
- Function membuat user Auth, profil, dan membership admin dalam satu flow.

## Checklist Uji

1. Login sebagai Owner.
2. Buka **Pengaturan**.
3. Klik **Tambah Admin**.
4. Isi email baru, nama, dan password minimal 6 karakter.
5. Klik **Buat Admin**.
6. Admin baru muncul di tabel Kelola Admin.
7. Coba login menggunakan email/password admin baru.
