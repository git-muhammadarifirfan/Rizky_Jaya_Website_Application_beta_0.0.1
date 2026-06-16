# manage-admin Edge Function

Fungsi ini dipakai oleh fitur **Pengaturan → Kelola Admin → Tambah Admin**.

Web React/Vite tidak boleh menyimpan `service_role_key`, jadi pembuatan akun Supabase Auth untuk Admin Absensi harus lewat Edge Function ini.

## Yang diperbaiki

- Request dari frontend sekarang mengirim JWT Owner secara eksplisit lewat header `Authorization`.
- Function menulis log `[manage-admin] ...` supaya request yang masuk bisa dilacak di Supabase Dashboard.
- Create admin lebih tahan error: email yang sudah ada bisa dipakai lagi sebagai Admin Absensi, selama bukan akun Owner.
- Response error dikembalikan sebagai JSON `{ ok:false, error:"..." }` supaya toast web menampilkan penyebab asli, bukan pesan generic.

## Deploy cepat

Jalankan dari root project:

```bash
pnpm exec supabase link --project-ref PROJECT_REF_KAMU
pnpm exec supabase functions deploy manage-admin --no-verify-jwt
```

> Catatan: jangan set manual `SUPABASE_SERVICE_ROLE_KEY` dengan `supabase secrets set` kalau CLI menolak nama `SUPABASE_`. Di Supabase Edge Function, `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` biasanya sudah tersedia sebagai environment bawaan function.

## Test setelah deploy

1. Jalankan web lokal.
2. Login sebagai Owner.
3. Buka **Pengaturan → Kelola Admin → Tambah Admin**.
4. Isi nama, email, password minimal 6 karakter.
5. Klik **Buat Admin**.
6. Buka **Supabase Dashboard → Edge Functions → manage-admin → Logs** dan pastikan ada log `[manage-admin] admin create success`.

Kalau masih gagal, lihat toast web. Versi ini sudah menampilkan error asli dari Edge Function.
