import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Area } from 'recharts';
import { CalendarPlus, FileSpreadsheet, FileText, Users, UserCheck, UserX, WalletCards, Truck, ReceiptText } from 'lucide-react';
import type { AppData } from '../types';
import type { PageKey } from '../components/Shell';
import { PageHeader } from '../components/Shell';
import { Button, Card, CardHeader, DataTable, MetricCard, NameCell, StatusBadge } from '../components/ui';
import { idr, calcSlipTotal } from '../lib/format';
import { dateShort, lastMonths, monthLabel, monthRange, todayISO } from '../lib/date';
import { chartColors, chartDomain, moneyAxis, normalizePieData, percent } from '../lib/charts';

export function OwnerDashboard({ data, setPage }: { data: AppData; setPage: (page: PageKey) => void }) {
  const today = todayISO();
  const { start, end } = monthRange();
  const activeEmployees = data.employees.filter((e) => e.is_active);
  const todayRecords = data.attendance.filter((a) => a.attendance_date === today);
  const monthRecords = data.attendance.filter((a) => a.attendance_date >= start && a.attendance_date <= end);
  const present = todayRecords.filter((a) => a.status === 'hadir' || a.status === 'terlambat').length;
  const notPresent = Math.max(0, activeEmployees.length - present);
  const currentPeriod = data.periods.find((p) => today >= p.start_date && today <= p.end_date) || data.periods[0];
  const currentSlips = currentPeriod ? data.slips.filter((s) => s.payroll_period_id === currentPeriod.id) : [];
  const paid = currentSlips.filter((s) => s.status === 'dibayar').reduce((sum, s) => sum + calcSlipTotal(s), 0);
  const unpaid = currentSlips.filter((s) => s.status !== 'dibayar').reduce((sum, s) => sum + calcSlipTotal(s), 0);
  const payrollChart = buildPayrollChart(data);
  const yDomain = chartDomain(payrollChart.map((row) => row.amount));
  const attendanceRows = activeEmployees.slice(0, 8).map((employee) => ({ employee, record: todayRecords.find((a) => a.employee_id === employee.id) }));
  const newest = [...data.employees].sort((a, b) => (b.joined_date || '').localeCompare(a.joined_date || '')).slice(0, 5);
  const pending = data.requests.filter((r) => r.status === 'pending').slice(0, 5);
  const activeVehicles = data.vehicles.filter((v) => v.is_active).length;
  const pieRows = normalizePieData([{ name: 'Sudah Dibayar', value: paid }, { name: 'Belum Dibayar', value: unpaid }]);
  const pieTotal = paid + unpaid;

  return <div className="content">
    <PageHeader title="Dashboard Owner" subtitle="Ringkasan bisnis dan operasional toko dalam satu layar" />
    <div className="grid metrics dashboard-metrics">
      <MetricCard icon={<Users />} label="Total Karyawan" value={activeEmployees.length} sub="Orang" color="teal" trend="12%" />
      <MetricCard icon={<UserCheck />} label="Hadir Hari Ini" value={present} sub="Orang" color="green" trend="12%" />
      <MetricCard icon={<UserX />} label="Belum Absen" value={notPresent} sub="Orang" color="orange" trend="8%" down />
      <MetricCard icon={<FileText />} label="Slip Belum Dibayar" value={currentSlips.filter((s) => s.status !== 'dibayar').length} sub={`Total ${idr(unpaid)}`} color="purple" />
      <MetricCard icon={<WalletCards />} label="Total Payroll" value={idr(paid + unpaid)} sub="Periode berjalan" color="teal" />
      <MetricCard icon={<Truck />} label="Armada Aktif" value={activeVehicles} sub="Unit operasional" color="blue" />
    </div>
    <div className="grid owner-main dashboard-section">
      <Card className="chart-card"><CardHeader title="Payroll Bulan Ini" subtitle="Komposisi slip periode aktif" />
        <div className="donut-layout">
          <ResponsiveContainer width="100%" height={230}><PieChart><Pie data={pieRows} dataKey="value" innerRadius={72} outerRadius={100} paddingAngle={3} animationDuration={850}>{pieRows.map((_, i) => <Cell key={i} fill={(pieRows as any)[i]?.__empty ? '#e7edf5' : chartColors[i]} />)}</Pie><Tooltip formatter={(v) => idr(Number(v))} /></PieChart></ResponsiveContainer>
          <div className="donut-legend">
            <LegendDot color={chartColors[0]} label="Sudah Dibayar" value={idr(paid)} note={`${percent(paid, pieTotal)}%`} />
            <LegendDot color={chartColors[1]} label="Belum Dibayar" value={idr(unpaid)} note={`${percent(unpaid, pieTotal)}%`} />
          </div>
        </div>
      </Card>
      <Card className="chart-card"><CardHeader title="Payroll 6 Bulan Terakhir" action={<span className="card-link">{idr(payrollChart.reduce((s, p) => s + p.amount, 0))}</span>} />
        <ResponsiveContainer width="100%" height={260}><ComposedChart data={payrollChart} margin={{ left: 10, right: 14, top: 10, bottom: 4 }}><defs><linearGradient id="payrollFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0799a0" stopOpacity={0.25} /><stop offset="100%" stopColor="#0799a0" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#dbe4ef" /><XAxis dataKey="label" tickLine={false} axisLine={false} /><YAxis width={58} tickLine={false} axisLine={false} tickFormatter={moneyAxis} domain={yDomain} /><Tooltip formatter={(v) => idr(Number(v))} /><Area type="monotone" dataKey="amount" fill="url(#payrollFill)" stroke="transparent" /><Bar dataKey="amount" fill="#0799a0" radius={[8, 8, 0, 0]} barSize={38} animationDuration={900} /></ComposedChart></ResponsiveContainer>
      </Card>
      <Card><CardHeader title="Aksi Cepat" subtitle="Klik kartu untuk membuka halaman" />
        <div className="quick-actions strong-actions"><button type="button" className="action-box" onClick={() => setPage('attendance')}><CalendarPlus />Rekap Absensi<span>Lihat status & detail</span></button><button type="button" className="action-box" onClick={() => setPage('payroll')}><WalletCards />Kelola Gaji<span>Hitung & generate slip</span></button><button type="button" className="action-box" onClick={() => setPage('reports')}><FileSpreadsheet />Export Excel<span>Unduh laporan</span></button></div>
      </Card>
    </div>
    <div className="grid owner-main dashboard-section">
      <Card><CardHeader title="Ringkasan Absensi Bulan Ini" subtitle={`${dateShort(start)} - ${dateShort(end)}`} />
        <div className="summary-row"><Summary label="Hadir" value={monthRecords.filter((a) => a.status === 'hadir').length} color="var(--teal)" /><Summary label="Izin" value={monthRecords.filter((a) => a.status === 'izin').length} color="var(--blue)" /><Summary label="Sakit" value={monthRecords.filter((a) => a.status === 'sakit').length} color="var(--orange)" /><Summary label="Terlambat" value={monthRecords.filter((a) => a.status === 'terlambat').length} color="var(--red)" /></div>
        <p className="muted-caption">Total karyawan aktif: {activeEmployees.length} orang</p>
      </Card>
      <Card><CardHeader title="Karyawan Terbaru" action={<button type="button" className="card-link" onClick={() => setPage('employees')}>Lihat Semua</button>} />
        <div className="list">{newest.map((e) => <div className="list-item" key={e.id}><NameCell name={e.full_name} sub={e.position || 'Karyawan'} /><StatusBadge status={e.is_active ? 'aktif' : 'nonaktif'} /></div>)}</div>
      </Card>
      <Card><CardHeader title="Pengingat & Notifikasi" action={<button type="button" className="card-link" onClick={() => setPage('settings')}>Lihat Semua</button>} />
        <div className="list">{pending.length === 0 ? <p className="muted-caption">Belum ada notifikasi.</p> : pending.map((r) => <div className="list-item" key={r.id}><span><b>{r.reason || r.request_type}</b><br /><small>{dateShort(r.created_at)}</small></span><span>›</span></div>)}</div>
      </Card>
    </div>
    <div className="grid owner-lower dashboard-section">
      <Card><CardHeader title="Absensi Terbaru" action={<button type="button" className="card-link" onClick={() => setPage('attendance')}>Lihat Semua Absensi</button>} /><DataTable rows={attendanceRows} keyOf={(r) => r.employee.id} columns={[{ title: 'Karyawan', render: (r) => <NameCell name={r.employee.full_name} sub={r.employee.position || '-'} /> }, { title: 'Waktu', render: (r) => r.record?.input_time ? new Date(r.record.input_time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-' }, { title: 'Status', render: (r) => <StatusBadge status={r.record?.status || 'tidak_hadir'} /> }, { title: 'Keterangan', render: (r) => r.record?.notes || '-' }]} /></Card>
      <Card className="chart-card"><CardHeader title="Trend Payroll (6 Bulan Terakhir)" />
        <ResponsiveContainer width="100%" height={260}><LineChart data={payrollChart} margin={{ left: 10, right: 14, top: 8, bottom: 4 }}><CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#dbe4ef" /><XAxis dataKey="label" tickLine={false} axisLine={false} /><YAxis width={58} tickLine={false} axisLine={false} tickFormatter={moneyAxis} domain={yDomain} /><Tooltip formatter={(v) => idr(Number(v))} /><Line type="monotone" dataKey="amount" stroke="#0799a0" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} animationDuration={900} /></LineChart></ResponsiveContainer>
      </Card>
    </div>
  </div>;
}

export function AdminDashboard({ data, setPage }: { data: AppData; setPage: (page: PageKey) => void }) {
  const today = todayISO();
  const activeEmployees = data.employees.filter((e) => e.is_active);
  const todayRecords = data.attendance.filter((a) => a.attendance_date === today);
  const present = todayRecords.filter((a) => a.status === 'hadir' || a.status === 'terlambat').length;
  const late = todayRecords.filter((a) => a.status === 'terlambat').length;
  const leave = todayRecords.filter((a) => a.status === 'izin' || a.status === 'sakit').length;
  const notPresent = Math.max(0, activeEmployees.length - present);
  const trend = Array.from({ length: 7 }, (_, i) => { const date = new Date(); date.setDate(date.getDate() - (6 - i)); const iso = date.toISOString().slice(0, 10); return { label: String(date.getDate()), total: data.attendance.filter((a) => a.attendance_date === iso && (a.status === 'hadir' || a.status === 'terlambat')).length }; });
  const rows = activeEmployees.slice(0, 10).map((employee) => ({ employee, record: todayRecords.find((a) => a.employee_id === employee.id) }));
  return <div className="content">
    <PageHeader title="Dashboard Admin Absensi" subtitle="Kelola dan pantau absensi karyawan secara real-time" actions={<Button className="primary" onClick={() => setPage('attendance')}><CalendarPlus size={18} />Mulai Absensi</Button>} />
    <div className="grid metrics" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
      <MetricCard icon={<UserCheck />} label="Sudah Absen" value={present} sub="Orang" color="green" />
      <MetricCard icon={<UserX />} label="Belum Absen" value={notPresent} sub="Orang" color="orange" />
      <MetricCard icon={<Users />} label="Total Karyawan" value={activeEmployees.length} sub="Orang" color="teal" />
      <MetricCard icon={<CalendarPlus />} label="Izin / Sakit" value={leave} sub="Orang" color="purple" />
    </div>
    <div className="grid admin-main dashboard-section">
      <Card><CardHeader title="Absensi Hari Ini" action={<button type="button" className="card-link" onClick={() => setPage('attendance')}>Lihat Semua</button>} /><DataTable rows={rows} keyOf={(r) => r.employee.id} columns={[{ title: 'Nama', render: (r) => <NameCell name={r.employee.full_name} sub={r.employee.position || '-'} /> }, { title: 'Jam', render: (r) => r.record?.input_time ? new Date(r.record.input_time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-' }, { title: 'Status', render: (r) => <StatusBadge status={r.record?.status || 'tidak_hadir'} /> }, { title: 'Keterangan', render: (r) => r.record?.notes || '-' }]} /></Card>
      <div className="grid">
        <Card><CardHeader title="Ringkasan Hari Ini" /><div className="summary-row"><Summary label="Hadir" value={present} color="var(--teal)" /><Summary label="Terlambat" value={late} color="var(--orange)" /><Summary label="Izin/Sakit" value={leave} color="var(--blue)" /><Summary label="Belum" value={notPresent} color="var(--red)" /></div></Card>
        <Card><CardHeader title="Aktivitas Terbaru" /><div className="list">{todayRecords.slice(0, 5).map((r) => <div className="list-item" key={r.id}><NameCell name={data.employees.find((e) => e.id === r.employee_id)?.full_name} sub={`${r.status} • ${r.input_method || '-'}`} /><span>{r.input_time ? new Date(r.input_time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'}</span></div>)}</div></Card>
      </div>
    </div>
    <Card className="chart-card dashboard-section"><CardHeader title="Tren Absensi 7 Hari Terakhir" action={<span className="status hadir">Rata-rata {activeEmployees.length ? Math.round((present / activeEmployees.length) * 100) : 0}%</span>} /><ResponsiveContainer width="100%" height={230}><LineChart data={trend}><CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#dbe4ef" /><XAxis dataKey="label" tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} /><Tooltip /><Line type="monotone" dataKey="total" stroke="#0799a0" strokeWidth={3} dot={{ r: 4 }} animationDuration={900} /></LineChart></ResponsiveContainer></Card>
  </div>;
}

function Summary({ label, value, color }: { label: string; value: number; color: string }) {
  return <div className="summary-mini"><b style={{ color }}>{value}</b><span>{label}</span></div>;
}

function LegendDot({ color, label, value, note }: { color: string; label: string; value: string; note: string }) {
  return <div className="legend-dot"><span style={{ background: color }} /><div><b>{note}</b><small>{label}</small></div><strong>{value}</strong></div>;
}

function buildPayrollChart(data: AppData) {
  return lastMonths(6).map((key) => {
    const range = monthRange(key);
    const periodIds = data.periods.filter((p) => p.start_date >= range.start && p.start_date <= range.end).map((p) => p.id);
    const amount = data.slips.filter((s) => periodIds.includes(s.payroll_period_id)).reduce((sum, s) => sum + calcSlipTotal(s), 0);
    return { key, label: monthLabel(key), amount };
  });
}
