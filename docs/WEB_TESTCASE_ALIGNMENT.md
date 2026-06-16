# Web Testcase Alignment - Rizki Jaya App Beta 0.0.9

Dokumen ini dibuat dari file testcase Android yang diberikan user. Web disesuaikan agar alur input, validasi, export, dan fitur role mengikuti aplikasi Android.

## Ringkasan modul testcase
- **Build & Config**: 8 testcase
- **Auth & Role**: 10 testcase
- **Dashboard**: 10 testcase
- **Karyawan**: 12 testcase
- **Absensi Detail**: 12 testcase
- **Absensi Cepat**: 12 testcase
- **Payroll**: 14 testcase
- **Transport Armada**: 4 testcase
- **Transport Keberangkatan**: 9 testcase
- **Transport Pengeluaran Umum**: 3 testcase
- **Transport**: 5 testcase
- **Katalog**: 8 testcase
- **Reports & Export**: 16 testcase
- **Approval**: 8 testcase
- **Settings**: 10 testcase
- **Storage Retention**: 6 testcase
- **Performance**: 5 testcase
- **Security**: 5 testcase

## Fokus implementasi web
- Semua tombol `Button` sekarang punya handler async: loading otomatis, error toast, dan `type="button"` agar tidak mati karena submit form tidak sengaja.
- Font semua halaman tetap Poppins dengan bobot ringan, tidak full-bold.
- Absensi web mengikuti mobile: tab `Status`, `Absen`, dan `Absen Cepat`; tombol `Absen` membuka modal status/foto/catatan.
- Mode Owner untuk Admin Absensi sudah sinkron: quick, detail, both, serta toggle foto wajib.
- Transportasi punya tab Ringkasan berisi KPI, grafik biaya 6 bulan, komposisi biaya, dan tujuan terbanyak untuk Owner maupun Admin.
- Export Excel/PDF membersihkan kolom teknis/path/id mentah dan menambahkan sheet Info pada workbook.
- Validasi input utama mengikuti testcase: nama wajib, nominal harus valid, destination wajib, email/password login divalidasi.

## Daftar testcase dari Android
### Build & Config
- `RJ-001` Flutter dependencies (Critical)
- `RJ-002` Static analysis (Critical)
- `RJ-003` Unit test runner (Critical)
- `RJ-004` Dart define missing config (High)
- `RJ-005` Dart define configured config (Critical)
- `RJ-006` APK debug build (High)
- `RJ-007` APK release build (High)
- `RJ-008` Asset logo (Medium)

### Auth & Role
- `RJ-009` Login owner valid (Critical)
- `RJ-010` Login admin valid (Critical)
- `RJ-011` Login email kosong (High)
- `RJ-012` Login format email salah (High)
- `RJ-013` Login password pendek (High)
- `RJ-014` Login credential salah (High)
- `RJ-015` Logout owner (High)
- `RJ-016` Logout admin (High)
- `RJ-017` Role owner menu (Critical)
- `RJ-018` Role admin menu (Critical)

### Dashboard
- `RJ-019` Owner KPI payroll (Critical)
- `RJ-020` Owner KPI absensi hari ini (Critical)
- `RJ-021` Owner chart 6 bulan payroll (Medium)
- `RJ-022` Owner active vehicles (Medium)
- `RJ-023` Admin dashboard today list (High)
- `RJ-024` Admin quick navigation (Medium)
- `RJ-025` Dashboard loading state (Medium)
- `RJ-026` Dashboard error state (High)
- `RJ-027` Owner dashboard RPC contract (Critical)
- `RJ-028` Cache dashboard rebuild (High)

### Karyawan
- `RJ-029` Tambah karyawan harian (Critical)
- `RJ-030` Tambah karyawan bulanan (Critical)
- `RJ-031` Tambah karyawan borongan (Critical)
- `RJ-032` Validasi nama wajib (High)
- `RJ-033` Validasi nominal gaji positif (High)
- `RJ-034` Edit karyawan (Critical)
- `RJ-035` Nonaktifkan karyawan (High)
- `RJ-036` Upload foto KTP (Medium)
- `RJ-037` Search/filter karyawan (Medium)
- `RJ-038` Owner-only CRUD (Critical)
- `RJ-039` Employee model contract (High)
- `RJ-040` Data nested employee (High)

### Absensi Detail
- `RJ-041` Input hadir dengan foto (Critical)
- `RJ-042` Input terlambat (High)
- `RJ-043` Input izin (High)
- `RJ-044` Input sakit (High)
- `RJ-045` Input tidak hadir (High)
- `RJ-046` Foto wajib on menolak tanpa foto (Critical)
- `RJ-047` Foto opsional off menerima tanpa foto (High)
- `RJ-048` Cegah duplikat absen hari sama (Critical)
- `RJ-049` Edit absensi oleh admin jadi request (Critical)
- `RJ-050` Owner edit langsung/approve (Critical)
- `RJ-051` Jam input WIB (High)
- `RJ-052` Attendance model quick marker (High)

### Absensi Cepat
- `RJ-053` Input masuk penuh (Critical)
- `RJ-054` Input setengah hari (Critical)
- `RJ-055` Input masuk ambil gaji (Critical)
- `RJ-056` Input tidak masuk (High)
- `RJ-057` Input tidak masuk ambil gaji (Critical)
- `RJ-058` Mode quick only (High)
- `RJ-059` Mode detail only (High)
- `RJ-060` Mode both (High)
- `RJ-061` Owner quick attendance view (Medium)
- `RJ-062` Export quick monthly (High)
- `RJ-063` Filter tanggal/bulan (Medium)
- `RJ-064` Backward compatibility quick_marker kosong (High)

### Payroll
- `RJ-065` Generate periode payroll (Critical)
- `RJ-066` Hitung gaji harian (Critical)
- `RJ-067` Hitung gaji bulanan dengan potongan absen (Critical)
- `RJ-068` Hitung borongan fleksibel (Critical)
- `RJ-069` Tambah bonus manual (High)
- `RJ-070` Tambah potongan manual (High)
- `RJ-071` Mark slip paid (Critical)
- `RJ-072` Delete weekly/monthly payroll sesuai aturan (High)
- `RJ-073` Lock periode payroll (Critical)
- `RJ-074` Slip personal export (High)
- `RJ-075` Payroll list export (High)
- `RJ-076` Payroll model labels (High)
- `RJ-077` Payroll job item labels (High)
- `RJ-078` Dashboard payroll total (Medium)

### Transport Armada
- `RJ-079` Tambah armada (Critical)
- `RJ-080` Edit armada (High)
- `RJ-081` Nonaktifkan armada (High)
- `RJ-082` Pajak jatuh tempo (Medium)

### Transport Keberangkatan
- `RJ-083` Tambah nota kiriman draft (Critical)
- `RJ-084` Lengkapi armada dan crew (Critical)
- `RJ-085` Update odometer (High)
- `RJ-086` Tambah BBM trip (Critical)
- `RJ-087` Tambah biaya kendaraan (High)
- `RJ-088` Upload nota pengeluaran (Medium)
- `RJ-089` Selesaikan keberangkatan (Critical)
- `RJ-090` Request edit job locked oleh admin (Critical)
- `RJ-091` Approve edit job owner (Critical)

### Transport Pengeluaran Umum
- `RJ-092` Tambah pengeluaran umum BBM (High)
- `RJ-093` Tambah pengeluaran sparepart (High)
- `RJ-094` Validasi nominal pengeluaran (High)

### Transport
- `RJ-095` Summary transport (Medium)
- `RJ-096` Export keberangkatan (High)
- `RJ-097` Export pengeluaran transportasi (High)
- `RJ-098` Transport model status display (High)
- `RJ-099` Expense model labels (Medium)

### Katalog
- `RJ-100` Tambah barang harga (Critical)
- `RJ-101` Edit harga barang (Critical)
- `RJ-102` Nonaktifkan barang (High)
- `RJ-103` Validasi nama barang (High)
- `RJ-104` Validasi harga positif (High)
- `RJ-105` Search barang (Medium)
- `RJ-106` Export daftar harga (High)
- `RJ-107` ProductPrice model (Medium)

### Reports & Export
- `RJ-108` Export database workbook info sheet (Critical)
- `RJ-109` Export database no technical columns (Critical)
- `RJ-110` Export filter header (High)
- `RJ-111` Export attendance detail format (High)
- `RJ-112` Export attendance summary format (High)
- `RJ-113` Export quick attendance format (High)
- `RJ-114` Export payroll format (High)
- `RJ-115` Export transport format (High)
- `RJ-116` Export product catalog format (High)
- `RJ-117` Export evidence label no raw path (Critical)
- `RJ-118` Export validation row count (High)
- `RJ-119` Export filename date range (Medium)
- `RJ-120` Excel mobile readability (Medium)
- `RJ-121` Excel desktop readability (Medium)
- `RJ-122` Export empty data (High)
- `RJ-123` Export large data (High)

### Approval
- `RJ-124` Inbox pending request (Critical)
- `RJ-125` Approve attendance request (Critical)
- `RJ-126` Reject attendance request (High)
- `RJ-127` Approve transport request (Critical)
- `RJ-128` Reject transport request (High)
- `RJ-129` Local notification background (Medium)
- `RJ-130` ChangeRequest model (High)
- `RJ-131` Audit log after approval (High)

### Settings
- `RJ-132` Settings tanpa blok mode absensi sesuai revisi web (High)
- `RJ-133` Approval center tampil jelas di pengaturan Owner (Critical)
- `RJ-134` Form tambah admin memakai validasi dan Edge Function (Critical)
- `RJ-135` Owner toggle foto wajib (High)
- `RJ-136` Admin management create admin (Critical)
- `RJ-137` Admin management deactivate admin (High)
- `RJ-138` Profile owner view (Medium)
- `RJ-139` Profile admin view (Medium)
- `RJ-140` OperationalSettings model (High)
- `RJ-141` AdminMember model (Medium)

### Storage Retention
- `RJ-142` Cleanup foto >37 hari (Critical)
- `RJ-143` Foto <=37 hari aman (Critical)
- `RJ-144` Attendance data tetap aman (Critical)
- `RJ-145` Payload change_requests dibersihkan (High)
- `RJ-146` Audit logs dibersihkan (High)
- `RJ-147` Retention SQL contract (Critical)

### Performance
- `RJ-148` Slow query count turun setelah index (High)
- `RJ-149` Cache repository mengurangi request rebuild (Medium)
- `RJ-150` Realtime attendance tidak load snapshot berat (High)
- `RJ-151` Peak connection aman (Medium)
- `RJ-152` Memory app stabil (Medium)

### Security
- `RJ-153` RLS owner akses organisasi sendiri (Critical)
- `RJ-154` RLS admin tidak approve owner-only (Critical)
- `RJ-155` Storage policy attendance photos (High)
- `RJ-156` SQL grant execute RPC (High)
- `RJ-157` No technical IDs in export audit (High)
