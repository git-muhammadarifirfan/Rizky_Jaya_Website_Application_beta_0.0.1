import { useMemo, useState } from 'react';
import { Calculator, CheckCircle2, Download, FileText, Plus, Trash2, WalletCards } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Line, LineChart } from 'recharts';
import type { AppData, Employee, PayrollJobItem, PayrollSlip } from '../types';
import { PageHeader } from '../components/Shell';
import { Avatar, Button, Card, CardHeader, ConfirmDialog, DataTable, EmptyState, Modal, StatusBadge } from '../components/ui';
import { lastMonths, monthKey, monthLabel, monthRange, readableMonth, rupiah, todayISO } from '../lib/date';
import { downloadExcel, downloadPdfTable, downloadSlipPdf } from '../lib/export';
import { calcSlipTotal, statusLabel } from '../lib/format';
import { chartColors, chartDomain, moneyAxis, normalizePieData, percent } from '../lib/charts';

export function PayrollPage({ data, onCalculate, onGenerate, onPaid, onItem, onDeleteItem }: { data: AppData; onCalculate: (month: string, employeeIds: string[]) => Promise<void>; onGenerate: (month: string, employeeId: string, bonus?: number, deduction?: number) => Promise<void>; onPaid: (slipIds: string[], method?: string) => Promise<void>; onItem: (item: Partial<PayrollJobItem>) => Promise<void>; onDeleteItem: (id: string) => Promise<void> }) {
  const [periodKey, setPeriodKey] = useState(monthKey());
  const [selected, setSelected] = useState<string[]>([]);
  const [detail, setDetail] = useState<Employee | null>(null);
  const period = data.periods.find((p) => p.start_date.startsWith(periodKey));
  const rows = useMemo(() => buildRows(data, periodKey), [data, periodKey]);
  const selectedIds = selected.length ? selected : rows.map((r) => r.employee.id);
  const selectedSlipIds = rows.filter((r) => selectedIds.includes(r.employee.id) && r.slip).map((r) => r.slip!.id);
  const totals = rows.reduce((acc, row) => { acc.total += row.net; if (row.slip?.status === 'dibayar') acc.paid += row.net; else acc.unpaid += row.net; return acc; }, { total: 0, paid: 0, unpaid: 0 });
  const exportRows = rows.map((r) => ({ Karyawan: r.employee.full_name, Jabatan: r.employee.position || '-', Tipe: statusLabel(r.employee.salary_type), Hadir: r.attendedUnits, Tidak_Hadir: r.absentDays, Dasar: rupiah(r.base), Bonus: rupiah(r.slip?.bonus_amount || 0), Potongan: rupiah(r.slip?.deduction_amount || 0), Total_Diterima: rupiah(r.net), Status: statusLabel(r.slip?.status || 'draft') }));

  if (data.membership.role !== 'owner') {
    return <div className="content"><PageHeader title="Kelola Gaji" subtitle="Fitur payroll hanya untuk Owner." /><Card><EmptyState title="Akses dibatasi" text="Admin tetap bisa melihat daftar harga dan laporan sesuai kebutuhan operasional." /></Card></div>;
  }

  return <div className="content">
    <PageHeader title="Kelola Gaji" subtitle="Hitung gaji harian, bulanan, borongan, buat slip, dan export PDF/Excel" actions={<><input className="input" type="month" value={periodKey} onChange={(e) => setPeriodKey(e.target.value)} /><Button onClick={() => downloadExcel('payroll', exportRows)}><Download size={18} />Excel</Button><Button onClick={() => downloadPdfTable('Laporan Payroll', exportRows)}><FileText size={18} />PDF</Button></>} />
    <div className="grid metrics" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
      <Metric title="Total Payroll" value={rupiah(totals.total)} sub={readableMonth(periodKey)} />
      <Metric title="Sudah Dibayar" value={rupiah(totals.paid)} sub={`${rows.filter((r) => r.slip?.status === 'dibayar').length} slip`} />
      <Metric title="Belum Dibayar" value={rupiah(totals.unpaid)} sub={`${rows.filter((r) => r.slip?.status !== 'dibayar').length} slip`} />
      <Metric title="Jumlah Slip" value={`${rows.filter((r) => r.slip).length} / ${rows.length}`} sub={period ? 'Periode tersimpan' : 'Periode baru'} />
    </div>

    <PayrollAnalytics data={data} periodKey={periodKey} rows={rows} totals={totals} />

    <Card style={{ marginTop: 18 }}>
      <CardHeader title="Ringkasan per Karyawan" subtitle="Pilih karyawan untuk hitung massal, generate slip, atau buka detail perhitungan." action={<div className="header-inline-actions"><Button className="primary" onClick={() => onCalculate(periodKey, selectedIds)}><Calculator size={17} />Hitung</Button><Button onClick={() => onPaid(selectedSlipIds)} disabled={selectedSlipIds.length === 0}><CheckCircle2 size={17} />Tandai Dibayar</Button></div>} />
      <DataTable rows={rows} keyOf={(r) => r.employee.id} columns={[
        { title: 'Pilih', width: '70px', render: (r) => <input type="checkbox" checked={selected.includes(r.employee.id)} onChange={(e) => setSelected((list) => e.target.checked ? [...list, r.employee.id] : list.filter((id) => id !== r.employee.id))} /> },
        { title: 'Karyawan', render: (r) => <span className="name-cell"><Avatar name={r.employee.full_name} />{r.employee.full_name}</span> },
        { title: 'Tipe', render: (r) => <StatusBadge status={r.employee.salary_type} /> },
        { title: 'Hadir', render: (r) => `${r.attendedUnits} hari` },
        { title: 'Tidak Hadir', render: (r) => `${r.absentDays} hari` },
        { title: 'Total', render: (r) => rupiah(r.net) },
        { title: 'Status', render: (r) => <StatusBadge status={r.slip?.status || 'draft'} /> },
        { title: 'Aksi', render: (r) => <div className="row-actions"><Button className="small" onClick={() => onGenerate(periodKey, r.employee.id)}>Generate</Button><Button className="small" onClick={() => setDetail(r.employee)}>Detail</Button>{r.slip && <Button className="small" onClick={() => exportSlip(r.employee, r.slip!, periodKey)}>PDF</Button>}</div> }
      ]} />
    </Card>
    {detail && <PayrollDetailModal employee={detail} data={data} periodKey={periodKey} row={rows.find((r) => r.employee.id === detail.id)!} onClose={() => setDetail(null)} onGenerate={onGenerate} onPaid={onPaid} onItem={onItem} onDeleteItem={onDeleteItem} />}
  </div>;
}

function Metric({ title, value, sub }: { title: string; value: string; sub: string }) {
  return <Card className="metric-card"><div className="metric-icon teal"><WalletCards /></div><div><div className="metric-label">{title}</div><div className="metric-value fit-text">{value}</div><div className="metric-sub">{sub}</div></div></Card>;
}

function PayrollAnalytics({ data, periodKey, rows, totals }: { data: AppData; periodKey: string; rows: ReturnType<typeof buildRows>; totals: { total: number; paid: number; unpaid: number } }) {
  const trend = lastMonths(6, periodKey).map((key) => {
    const range = monthRange(key);
    const periods = data.periods.filter((p) => p.start_date >= range.start && p.start_date <= range.end).map((p) => p.id);
    const amount = data.slips.filter((s) => periods.includes(s.payroll_period_id)).reduce((sum, s) => sum + calcSlipTotal(s), 0);
    return { label: monthLabel(key), amount };
  });
  const typeRows = ['harian', 'bulanan', 'borongan'].map((type) => ({ label: statusLabel(type), total: rows.filter((r) => r.employee.salary_type === type).reduce((sum, r) => sum + r.net, 0) }));
  const pieRows = normalizePieData([{ name: 'Dibayar', value: totals.paid }, { name: 'Belum', value: totals.unpaid }]);
  const yDomain = chartDomain([...trend.map((x) => x.amount), ...typeRows.map((x) => x.total)]);
  return <div className="grid payroll-analytics">
    <Card className="chart-card"><CardHeader title="Status Pembayaran" subtitle="Perbandingan nominal yang sudah dan belum dibayar" />
      <div className="donut-layout compact"><ResponsiveContainer width="100%" height={220}><PieChart><Pie data={pieRows} dataKey="value" innerRadius={66} outerRadius={92} paddingAngle={3} animationDuration={850}>{pieRows.map((row: any, i) => <Cell key={i} fill={row.__empty ? '#e7edf5' : chartColors[i]} />)}</Pie><Tooltip formatter={(v) => rupiah(Number(v))} /></PieChart></ResponsiveContainer><div className="donut-legend"><LegendLine color={chartColors[0]} label="Dibayar" value={rupiah(totals.paid)} note={`${percent(totals.paid, totals.total)}%`} /><LegendLine color={chartColors[1]} label="Belum" value={rupiah(totals.unpaid)} note={`${percent(totals.unpaid, totals.total)}%`} /></div></div>
    </Card>
    <Card className="chart-card"><CardHeader title="Payroll 6 Bulan" subtitle="Nominal slip tersimpan otomatis" />
      <ResponsiveContainer width="100%" height={250}><LineChart data={trend} margin={{ left: 8, right: 14, top: 8, bottom: 4 }}><CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#dbe4ef" /><XAxis dataKey="label" axisLine={false} tickLine={false} /><YAxis width={58} domain={yDomain} tickFormatter={moneyAxis} axisLine={false} tickLine={false} /><Tooltip formatter={(v) => rupiah(Number(v))} /><Line type="monotone" dataKey="amount" stroke="#0799a0" strokeWidth={3} dot={{ r: 4 }} animationDuration={900} /></LineChart></ResponsiveContainer>
    </Card>
    <Card className="chart-card"><CardHeader title="Komposisi Tipe Gaji" subtitle="Harian, bulanan, dan borongan" />
      <ResponsiveContainer width="100%" height={250}><BarChart data={typeRows} margin={{ left: 8, right: 14, top: 8, bottom: 4 }}><CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#dbe4ef" /><XAxis dataKey="label" axisLine={false} tickLine={false} /><YAxis width={58} domain={yDomain} tickFormatter={moneyAxis} axisLine={false} tickLine={false} /><Tooltip formatter={(v) => rupiah(Number(v))} /><Bar dataKey="total" radius={[8, 8, 0, 0]} barSize={42} animationDuration={850}>{typeRows.map((_, i) => <Cell key={i} fill={chartColors[i]} />)}</Bar></BarChart></ResponsiveContainer>
    </Card>
  </div>;
}

function LegendLine({ color, label, value, note }: { color: string; label: string; value: string; note: string }) {
  return <div className="legend-dot"><span style={{ background: color }} /><div><b>{note}</b><small>{label}</small></div><strong>{value}</strong></div>;
}

function PayrollDetailModal({ employee, data, periodKey, row, onClose, onGenerate, onPaid, onItem, onDeleteItem }: { employee: Employee; data: AppData; periodKey: string; row: ReturnType<typeof buildRows>[number]; onClose: () => void; onGenerate: (month: string, employeeId: string, bonus?: number, deduction?: number) => Promise<void>; onPaid: (ids: string[], method?: string) => Promise<void>; onItem: (item: Partial<PayrollJobItem>) => Promise<void>; onDeleteItem: (id: string) => Promise<void> }) {
  const [bonus, setBonus] = useState(Number(row.slip?.bonus_amount || 0));
  const [deduction, setDeduction] = useState(Number(row.slip?.deduction_amount || 0));
  const { start, end } = monthRange(periodKey);
  const items = data.payrollItems.filter((i) => i.employee_id === employee.id && i.work_date >= start && i.work_date <= end);
  const [itemForm, setItemForm] = useState<Partial<PayrollJobItem>>({ employee_id: employee.id, work_date: todayISO(), item_kind: 'borongan', unit_label: 'job', quantity: 1, unit_rate: 0 });
  const [deleteItem, setDeleteItem] = useState<PayrollJobItem | null>(null);
  const slipRows = [{ label: 'Karyawan', value: employee.full_name }, { label: 'Periode', value: readableMonth(periodKey) }, { label: 'Tipe Gaji', value: statusLabel(employee.salary_type) }, { label: 'Total Hadir', value: `${row.attendedUnits} hari` }, { label: 'Tidak Hadir', value: `${row.absentDays} hari` }, { label: 'Gaji Dasar', value: rupiah(row.base) }, { label: 'Bonus', value: rupiah(bonus) }, { label: 'Potongan', value: rupiah(deduction) }, { label: 'Total Diterima', value: rupiah(row.base + bonus - deduction) }, { label: 'Status', value: statusLabel(row.slip?.status || 'draft') }];
  return <>
    <Modal title="Detail Perhitungan Gaji" onClose={onClose} wide actions={<><Button onClick={onClose}>Tutup</Button><Button className="primary" onClick={() => onGenerate(periodKey, employee.id, bonus, deduction)}>Generate Slip</Button>{row.slip && <Button onClick={() => exportSlip(employee, row.slip!, periodKey)}><FileText size={16} />PDF Slip</Button>}{row.slip && <Button onClick={() => onPaid([row.slip!.id])}>Tandai Dibayar</Button>}</>}>
    <div className="employee-detail-hero"><Avatar name={employee.full_name} size={62} /><div><h3>{employee.full_name}</h3><p>{employee.position || 'Karyawan'} • {statusLabel(employee.salary_type)}</p></div><b className="total-chip">{rupiah(row.base + bonus - deduction)}</b></div>
    <div className="form-grid">
      <div className="field"><label>Bonus Manual</label><input className="input" type="number" value={bonus} onChange={(e) => setBonus(Number(e.target.value))} /></div>
      <div className="field"><label>Potongan Manual</label><input className="input" type="number" value={deduction} onChange={(e) => setDeduction(Number(e.target.value))} /></div>
      <div className="field full"><label>Catatan Kalkulasi</label><textarea className="textarea" value={row.slip?.calculation_notes || 'Belum ada slip. Klik Generate Slip untuk membuat perhitungan final.'} disabled /></div>
    </div>
    <Card style={{ marginTop: 16, boxShadow: 'none' }}><CardHeader title="Rincian Slip" /><DataTable rows={slipRows} keyOf={(r) => r.label} columns={[{ title: 'Komponen', render: (r) => r.label }, { title: 'Nilai', render: (r) => r.value }]} /></Card>
    {employee.salary_type === 'borongan' && <Card style={{ marginTop: 16, boxShadow: 'none' }}><CardHeader title="Item Borongan" action={<Button className="small primary" onClick={() => onItem({ ...itemForm, employee_id: employee.id })}><Plus size={14} />Simpan Item</Button>} />
      <div className="form-grid" style={{ marginBottom: 14 }}><div className="field"><label>Tanggal</label><input className="input" type="date" value={itemForm.work_date || todayISO()} onChange={(e) => setItemForm((f) => ({ ...f, work_date: e.target.value }))} /></div><div className="field"><label>Jenis Item</label><input className="input" value={itemForm.item_kind || ''} onChange={(e) => setItemForm((f) => ({ ...f, item_kind: e.target.value }))} /></div><div className="field"><label>Deskripsi</label><input className="input" value={itemForm.description || ''} onChange={(e) => setItemForm((f) => ({ ...f, description: e.target.value }))} /></div><div className="field"><label>Jumlah</label><input className="input" type="number" value={itemForm.quantity || 0} onChange={(e) => setItemForm((f) => ({ ...f, quantity: Number(e.target.value) }))} /></div><div className="field"><label>Satuan</label><input className="input" value={itemForm.unit_label || ''} onChange={(e) => setItemForm((f) => ({ ...f, unit_label: e.target.value }))} /></div><div className="field"><label>Tarif</label><input className="input" type="number" value={itemForm.unit_rate || 0} onChange={(e) => setItemForm((f) => ({ ...f, unit_rate: Number(e.target.value) }))} /></div></div>
      <DataTable rows={items} keyOf={(r) => r.id} columns={[{ title: 'Tanggal', render: (r) => r.work_date }, { title: 'Deskripsi', render: (r) => r.description }, { title: 'Qty', render: (r) => `${r.quantity} ${r.unit_label}` }, { title: 'Tarif', render: (r) => rupiah(r.unit_rate) }, { title: 'Total', render: (r) => rupiah(Number(r.total_amount ?? r.quantity * r.unit_rate)) }, { title: 'Aksi', render: (r) => <Button className="small red" onClick={() => setDeleteItem(r)}><Trash2 size={14} />Hapus</Button> }]} />
    </Card>}
  </Modal>
    {deleteItem && <ConfirmDialog danger title="Hapus item borongan?" message={<>Item <b>{deleteItem.description}</b> akan dihapus dari perhitungan gaji bulan ini.</>} confirmLabel="Ya, hapus" onConfirm={() => onDeleteItem(deleteItem.id)} onClose={() => setDeleteItem(null)} />}
  </>;
}

function buildRows(data: AppData, periodKey: string) {
  const { start, end } = monthRange(periodKey);
  const period = data.periods.find((p) => p.start_date.startsWith(periodKey));
  return data.employees.filter((e) => e.is_active).map((employee) => {
    const records = data.attendance.filter((a) => a.employee_id === employee.id && a.attendance_date >= start && a.attendance_date <= end);
    const attendedRecords = records.filter((a) => a.status === 'hadir' || a.status === 'terlambat');
    const attendedUnits = attendedRecords.reduce((sum, a) => sum + Number(a.attendance_fraction ?? 1), 0);
    const absentDays = records.filter((a) => ['tidak_hadir', 'izin', 'sakit', 'libur'].includes(a.status)).length;
    const items = data.payrollItems.filter((i) => i.employee_id === employee.id && i.work_date >= start && i.work_date <= end);
    const slip = period ? data.slips.find((s) => s.payroll_period_id === period.id && s.employee_id === employee.id) : undefined;
    let base = 0;
    if (employee.salary_type === 'bulanan') base = Number(employee.monthly_rate || 0);
    else if (employee.salary_type === 'borongan') base = items.reduce((sum, item) => sum + Number(item.total_amount ?? item.quantity * item.unit_rate), 0);
    else base = attendedUnits * Number(employee.daily_rate || 0);
    const net = slip ? calcSlipTotal(slip) : base;
    return { employee, slip, attendedUnits, attendedRecords: attendedRecords.length, absentDays, base: Number(slip?.base_amount ?? base), net };
  });
}

function exportSlip(employee: Employee, slip: PayrollSlip, periodKey: string) {
  downloadSlipPdf(`Slip Gaji ${employee.full_name}`, [{ label: 'Nama', value: employee.full_name }, { label: 'Jabatan', value: employee.position || '-' }, { label: 'Periode', value: readableMonth(periodKey) }, { label: 'Tipe Gaji', value: statusLabel(slip.salary_type || employee.salary_type) }, { label: 'Gaji Dasar', value: rupiah(slip.base_amount) }, { label: 'Bonus', value: rupiah(slip.bonus_amount) }, { label: 'Potongan', value: rupiah(slip.deduction_amount) }, { label: 'Total Diterima', value: rupiah(calcSlipTotal(slip)) }, { label: 'Status', value: statusLabel(slip.status) }], `slip-${employee.full_name.toLowerCase().replace(/\s+/g, '-')}`);
}
