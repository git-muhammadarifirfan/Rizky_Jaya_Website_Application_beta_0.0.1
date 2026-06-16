# Design System Rizki Jaya Web

## Font

Semua halaman memakai Poppins agar visual konsisten dengan mobile. Bobot font dibuat ringan:

- Body: 400
- Label/button: 500
- Judul/card penting: 500–600 secukupnya
- Tidak ada pemakaian bold berlebihan pada tabel dan isi data

## Warna

| Token | Nilai | Fungsi |
|---|---:|---|
| `--ink` | `#08164a` | Teks utama |
| `--ink-2` | `#31426f` | Teks sekunder kuat |
| `--muted` | `#7180a1` | Keterangan |
| `--teal` | `#0799a0` | Aksen utama, tombol, chart |
| `--green` | `#1ba762` | Status hadir/aktif/dibayar |
| `--orange` | `#ff7315` | Terlambat/peringatan |
| `--blue` | `#2563eb` | Info/izin/draft |
| `--purple` | `#7457f5` | Slip/dokumen |
| `--red` | `#ff334b` | Tidak hadir/ditolak/nonaktif |
| `--border` | `#e2e9f3` | Garis kartu/tabel |
| `--bg` | `#f5f7fb` | Latar belakang aplikasi |

## Komponen

- Card radius 16–20 px, shadow ringan.
- Sidebar desktop sticky, mobile berubah jadi drawer.
- Tabel horizontal scroll untuk data lebar seperti absensi cepat.
- Modal digunakan untuk input absensi, payroll detail, transport, admin, dan katalog.
- Chart memakai warna aksen utama agar ringan dan konsisten.
