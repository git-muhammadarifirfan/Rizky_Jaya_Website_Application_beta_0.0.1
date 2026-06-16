import { useState, type ReactNode } from 'react';
import { CalendarCheck2, Download, FileSpreadsheet, FileText, Truck, WalletCards, Users, Bell } from 'lucide-react';
import type { AppData } from '../types';
import { PageHeader } from '../components/Shell';
import { Avatar, Button, Card, CardHeader, DataTable, StatusBadge } from '../components/ui';
import { dateShort, monthRange, rupiah, todayISO } from '../lib/date';
import { downloadExcel, downloadPdfTable, downloadWorkbook } from '../lib/export';
import { calcSlipTotal, employeeName, jobVehicleLabel, statusLabel } from '../lib/format';

export function ReportsPage({ data, onExportLog }: { data: AppData; onExportLog: (type: string, from?: string, to?: string) => Promise<string | null> }) {
  const current = monthRange();
  const [from, setFrom] = useState(current.start);
  const [to, setTo] = useState(todayISO());
  const rows = buildReportRows(data, from, to);
  const cards = [
    { key: 'attendance', icon: <CalendarCheck2 />, title: 'Rekap Absensi', desc: 'Harian/bulanan, status hadir, izin, sakit, terlambat.', rows: rows.attendance, file: 'rekap-absensi' },
    { key: 'payroll', icon: <WalletCards />, title: 'Rekap Payroll', desc: 'Nominal dasar, bonus, potongan, total diterima.', rows: rows.payroll, file: 'rekap-payroll' },
    { key: 'payroll_slips', icon: <FileText />, title: 'Rekap Slip Gaji', desc: 'Status slip dan pembayaran per karyawan.', rows: rows.slips, file: 'rekap-slip-gaji' },
    { key: 'approval_activity', icon: <Bell />, title: 'Detail Aktivitas / Approval', desc: 'Pengajuan Admin, status accept/reject, dan catatan.', rows: rows.requests, file: 'detail-aktivitas' },
    { key: 'fleet', icon: <Truck />, title: 'Master Armada', desc: 'Kode armada, plat, pajak, sopir default.', rows: rows.vehicles, file: 'master-armada' },
    { key: 'transport_jobs', icon: <Truck />, title: 'Daftar Keberangkatan', desc: 'Trip, tujuan, sopir, helper, dan status.', rows: rows.jobs, file: 'daftar-keberangkatan' },
    { key: 'transport_expenses', icon: <FileSpreadsheet />, title: 'Pengeluaran Transportasi', desc: 'BBM, servis/sparepart, parkir, dan biaya umum.', rows: rows.transport, file: 'pengeluaran-transportasi' },
    { key: 'product_prices', icon: <FileSpreadsheet />, title: 'Daftar Harga Barang', desc: 'Harga beli, khusus, toko, dan ecer.', rows: rows.products, file: 'daftar-harga' }
  ];

  const exportAll = async () => {
    await onExportLog('all_reports', from, to);
    downloadWorkbook('rizki-jaya-laporan-lengkap', [
      { name: 'Absensi', rows: rows.attendance },
      { name: 'Payroll', rows: rows.payroll },
      { name: 'Slip', rows: rows.slips },
      { name: 'Armada', rows: rows.vehicles },
      { name: 'Trip', rows: rows.jobs },
      { name: 'Biaya Transport', rows: rows.transport },
      { name: 'Daftar Harga', rows: rows.products },
      { name: 'Approval', rows: rows.requests }
    ]);
  };

  return <div className="content">
    <PageHeader title="Laporan / Export" subtitle="Pilih periode, lihat ringkasan data, lalu export Excel atau PDF" actions={<><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /><Button className="primary" onClick={exportAll}><Download size={18} />Export Semua</Button></>} />
    <div className="report-hero"><div><h2>Ringkasan Periode</h2><p>{dateShort(from)} - {dateShort(to)}</p></div><div className="report-stats"><ReportStat icon={<CalendarCheck2 />} label="Absensi" value={rows.attendance.length} /><ReportStat icon={<WalletCards />} label="Payroll" value={rows.payroll.length} /><ReportStat icon={<Truck />} label="Transport" value={rows.jobs.length} /><ReportStat icon={<Users />} label="Karyawan" value={data.employees.filter((e) => e.is_active).length} /></div></div>
    <div className="report-grid">{cards.map(({ key: reportKey, ...card }) => <ExportCard key={reportKey} {...card} onLog={() => onExportLog(reportKey, from, to)} />)}</div>
    <Card style={{ marginTop: 18 }}><CardHeader title="Karyawan Aktif" subtitle="Preview cepat agar laporan mudah dicek sebelum export" /><DataTable rows={data.employees.filter((e) => e.is_active)} keyOf={(r) => r.id} columns={[
      { title: 'Nama', render: (r) => <span className="name-cell"><Avatar name={r.full_name} />{r.full_name}</span> },
      { title: 'Kode', render: (r) => r.employee_code },
      { title: 'Jabatan', render: (r) => r.position || '-' },
      { title: 'Tipe Gaji', render: (r) => <StatusBadge status={r.salary_type} /> },
      { title: 'Status', render: () => <StatusBadge status="aktif" /> }
    ]} /></Card>
  </div>;
}

function ReportStat({ icon, label, value }: { icon: ReactNode; label: string; value: number }) { return <div className="report-stat"><span>{icon}</span><b>{value}</b><small>{label}</small></div>; }

function ExportCard({ title, desc, rows, file, icon, onLog }: { title: string; desc: string; rows: Record<string, unknown>[]; file: string; icon: ReactNode; onLog: () => Promise<string | null> }) {
  const exportExcel = async () => { await onLog(); downloadExcel(file, rows); };
  const exportPdf = async () => { await onLog(); downloadPdfTable(title, rows, file); };
  return <Card className="report-card"><div className="report-card-head"><span className="report-icon">{icon}</span><div><h3>{title}</h3><p>{desc}</p></div><b>{rows.length}</b></div><div className="report-actions"><Button onClick={exportExcel}><Download size={18} />Excel</Button><Button onClick={exportPdf}><FileText size={18} />PDF</Button></div></Card>;
}

function buildReportRows(data: AppData, from: string, to: string) {
  const attendance = data.attendance.filter((a) => a.attendance_date >= from && a.attendance_date <= to).map((a) => ({ Tanggal: a.attendance_date, Karyawan: employeeName(a.employee_id, data.employees), Status: statusLabel(a.status), Metode: a.input_method || '-', Kode_Cepat: a.quick_marker || '-', Gaji_Harian: a.paid_at ? 'Dibayar' : '-', Keterangan: a.notes || '-' }));
  const payroll = data.slips.map((s) => ({ Karyawan: employeeName(s.employee_id, data.employees), Tipe: statusLabel(s.salary_type || '-'), Hadir: s.attended_day_units ?? s.attended_days, Tidak_Hadir: s.absent_days || 0, Dasar: rupiah(s.base_amount), Bonus: rupiah(s.bonus_amount), Potongan: rupiah(s.deduction_amount), Total: rupiah(calcSlipTotal(s)), Status: statusLabel(s.status) }));
  const slips = data.slips.map((s) => ({ Karyawan: employeeName(s.employee_id, data.employees), Nominal: rupiah(calcSlipTotal(s)), Status: statusLabel(s.status), Dibayar: s.paid_at ? dateShort(s.paid_at.slice(0, 10)) : '-' }));
  const vehicles = data.vehicles.map((v) => ({ Kode: v.fleet_code, Plat: v.plate_number, Tahun: v.vehicle_year, Pajak: v.tax_due_date, Sopir: employeeName(v.default_driver_id, data.employees), Status: v.is_active ? 'Aktif' : 'Nonaktif' }));
  const jobs = data.jobs.filter((j) => j.operation_date >= from && j.operation_date <= to).map((j) => ({ Tanggal: j.operation_date, Armada: jobVehicleLabel(j, data.vehicles), Tujuan: j.destination, Sopir: employeeName(j.driver_id, data.employees), Helper_1: employeeName(j.helper_1_id, data.employees), Helper_2: employeeName(j.helper_2_id, data.employees), Status: statusLabel(j.status) }));
  const transport = [...data.generalExpenses.filter((e) => e.expense_date >= from && e.expense_date <= to).map((e) => ({ Tanggal: e.expense_date, Jenis: e.category, Keterangan: `${e.vehicle_identity || '-'} • ${e.requester_name}`, Nominal: rupiah(e.amount) })), ...data.fuelExpenses.map((e) => ({ Tanggal: e.created_at?.slice(0, 10) || '-', Jenis: 'BBM Trip', Keterangan: e.fuel_type, Nominal: rupiah(e.amount) })), ...data.vehicleExpenses.map((e) => ({ Tanggal: e.created_at?.slice(0, 10) || '-', Jenis: e.category, Keterangan: e.vendor_name, Nominal: rupiah(e.amount) }))];
  const products = data.products.map((p) => ({ Nama: p.product_name, Kode: p.product_code || '-', Beli: rupiah(p.purchase_price), Khusus: rupiah(p.special_sale_price), Toko: rupiah(p.store_sale_price), Ecer: rupiah(p.retail_sale_price), Status: p.is_active ? 'Aktif' : 'Nonaktif' }));
  const requests = data.requests.map((r) => ({ Tanggal: r.created_at ? dateShort(r.created_at.slice(0, 10)) : '-', Pengaju: r.requester_name || '-', Jenis: r.request_type, Isi: r.reason || '-', Status: statusLabel(r.status), Catatan_Resolusi: r.resolution_note || '-' }));
  return { attendance, payroll, slips, vehicles, jobs, transport, products, requests };
}
