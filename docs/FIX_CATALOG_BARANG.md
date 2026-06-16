# Fix Daftar Harga Barang

Masalah yang diperbaiki:

1. Web memakai nama kolom `special_sell_price`, `store_sell_price`, dan `retail_sell_price`, sementara database/Android memakai `special_sale_price`, `store_sale_price`, dan `retail_sale_price`.
2. `product_code` di database wajib (`not null`), tetapi form web sebelumnya masih bisa menyimpan kode kosong/null.
3. Flow katalog belum lengkap seperti Android: tambah, edit, aktif/nonaktif, hapus, search, dan export.

Perbaikan:

- `src/types.ts` disamakan dengan schema Android/database.
- `src/hooks/useAppData.ts` menyimpan barang menggunakan kolom database yang benar.
- `src/pages/Catalog.tsx` dibuat ulang mengikuti flow Android.
- Build production sudah berhasil dengan `npm run build`.
