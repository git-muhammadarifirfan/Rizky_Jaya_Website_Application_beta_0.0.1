import { useMemo, useState, type ReactNode } from 'react';
import { Ban, CheckCircle2, Download, Eye, FileText, Fuel, Lock, LockKeyhole, PlayCircle, Plus, Route, Truck, Unlock, UnlockKeyhole, WalletCards, Wrench } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AppData, FuelExpense, GeneralTransportExpense, TransportJob, Vehicle, VehicleExpense } from '../types';
import { PageHeader } from '../components/Shell';
import { Avatar, Button, Card, CardHeader, DataTable, Modal, StatusBadge, StorageImagePreview } from '../components/ui';
import { dateShort, lastMonths, monthLabel, monthRange, rupiah, todayISO } from '../lib/date';
import { downloadExcel, downloadPdfTable } from '../lib/export';
import { employeeName, jobVehicleLabel, statusLabel } from '../lib/format';
import { chartColors, chartDomain, moneyAxis, normalizePieData } from '../lib/charts';

type VehicleForm = Partial<Vehicle> & { stnkFile?: File | null };

export function TransportPage({ data, onVehicle, onJob, onStatus, onLock, onFuel, onVehicleExpense, onGeneral }: { data: AppData; onVehicle: (v: VehicleForm) => Promise<void>; onJob: (j: Partial<TransportJob>) => Promise<void>; onStatus: (id: string, status: TransportJob['status']) => Promise<void>; onLock: (id: string, locked: boolean) => Promise<void>; onFuel: (e: Partial<FuelExpense>) => Promise<void>; onVehicleExpense: (e: Partial<VehicleExpense>) => Promise<void>; onGeneral: (e: Partial<GeneralTransportExpense>) => Promise<void> }) {
  const [tab, setTab] = useState<'summary' | 'jobs' | 'fleet' | 'expenses'>('summary');
  const [vehicleModal, setVehicleModal] = useState<VehicleForm | null>(null);
  const [jobModal, setJobModal] = useState<Partial<TransportJob> | null>(null);
  const [expenseModal, setExpenseModal] = useState<Partial<GeneralTransportExpense> | null>(null);
  const [tripExpense, setTripExpense] = useState<TransportJob | null>(null);
  const [jobPreview, setJobPreview] = useState<TransportJob | null>(null);
  const [vehiclePreview, setVehiclePreview] = useState<Vehicle | null>(null);
  const [expensePreview, setExpensePreview] = useState<GeneralTransportExpense | null>(null);
  const vehicleName = (id?: string | null) => { const v = data.vehicles.find((x) => x.id === id); return v ? `${v.fleet_code} / ${v.plate_number}` : 'Nota kiriman'; };
  const jobRows = data.jobs.map((j) => ({ ...j, vehicleLabel: vehicleName(j.vehicle_id), driverName: employeeName(j.driver_id, data.employees) }));
  const exportRows = buildTransportExport(data);
  const isOwner = data.membership.role === 'owner';

  return <div className="content">
    <PageHeader title="Transportasi" subtitle="Ringkasan grafik, armada, keberangkatan, BBM, servis, dan pengeluaran umum" actions={<><Button onClick={() => downloadExcel('laporan-transportasi', exportRows)}><Download size={18} />Excel</Button><Button onClick={() => downloadPdfTable('Laporan Transportasi', exportRows)}><FileText size={18} />PDF</Button></>} />
    <div className="filters page-tabs-row">
      <div className="tabs strong-tabs"><button type="button" className={`tab ${tab === 'summary' ? 'active' : ''}`} onClick={() => setTab('summary')}><WalletCards size={16} />Ringkasan</button><button type="button" className={`tab ${tab === 'jobs' ? 'active' : ''}`} onClick={() => setTab('jobs')}><Route size={16} />Keberangkatan</button><button type="button" className={`tab ${tab === 'fleet' ? 'active' : ''}`} onClick={() => setTab('fleet')}><Truck size={16} />Armada</button><button type="button" className={`tab ${tab === 'expenses' ? 'active' : ''}`} onClick={() => setTab('expenses')}><Wrench size={16} />Biaya Umum</button></div>
      <div style={{ flex: 1 }} />
      {tab === 'jobs' && <Button className="primary" onClick={() => setJobModal({ operation_date: todayISO(), status: 'draft' })}><Plus size={18} />Tambah Trip</Button>}
      {tab === 'fleet' && isOwner && <Button className="primary" onClick={() => setVehicleModal({ vehicle_year: new Date().getFullYear(), tax_due_date: todayISO(), is_active: true })}><Plus size={18} />Tambah Armada</Button>}
      {tab === 'expenses' && <Button className="primary" onClick={() => setExpenseModal({ expense_date: todayISO(), category: 'bbm' })}><Plus size={18} />Tambah Biaya</Button>}
    </div>

    {tab === 'summary' && <TransportSummary data={data} />}
    {tab === 'jobs' && <Card><CardHeader title="Daftar Keberangkatan" subtitle="Preview untuk membaca detail. Owner memakai tombol status yang jelas: mulai, selesai, batal, dan kunci final." /><DataTable rows={jobRows} keyOf={(r) => r.id} columns={[
      { title: 'Tanggal', render: (r) => dateShort(r.operation_date) },
      { title: 'Armada', render: (r) => r.vehicleLabel },
      { title: 'Tujuan', render: (r) => r.destination },
      { title: 'Sopir', render: (r) => <span className="name-cell"><Avatar name={r.driverName} />{r.driverName}</span> },
      { title: 'Status', render: (r) => <StatusBadge status={r.status} /> },
      { title: 'Odometer', render: (r) => `${r.odometer_start || '-'} - ${r.odometer_end || '-'}` },
      { title: 'Kunci', render: (r) => <LockState locked={Boolean(r.is_locked)} /> },
      { title: 'Aksi', render: (r) => <div className="row-actions"><Button className="small" onClick={() => setJobPreview(r)}><Eye size={14} />Preview</Button><Button className="small" onClick={() => setJobModal(r)}>Edit</Button><Button className="small" onClick={() => setTripExpense(r)}><Fuel size={14} />Biaya</Button>{isOwner && <JobStatusButton job={r} onStatus={onStatus} />}{isOwner && <Button className={r.is_locked ? 'small' : 'small good'} onClick={() => onLock(r.id, !r.is_locked)}>{r.is_locked ? <UnlockKeyhole size={14} /> : <LockKeyhole size={14} />}{r.is_locked ? 'Buka Kunci' : 'Kunci Final'}</Button>}</div> }
    ]} /></Card>}

    {tab === 'fleet' && <Card><CardHeader title="Daftar Armada" subtitle="Preview menampilkan data unit, sopir default, dan foto STNK jika ada." /><DataTable rows={data.vehicles} keyOf={(r) => r.id} columns={[{ title: 'Kode', render: (r) => r.fleet_code }, { title: 'Plat', render: (r) => r.plate_number }, { title: 'Tahun', render: (r) => r.vehicle_year }, { title: 'Pajak', render: (r) => dateShort(r.tax_due_date) }, { title: 'Sopir Default', render: (r) => employeeName(r.default_driver_id, data.employees) }, { title: 'Status', render: (r) => <StatusBadge status={r.is_active ? 'aktif' : 'nonaktif'} /> }, { title: 'Aksi', render: (r) => <div className="row-actions"><Button className="small" onClick={() => setVehiclePreview(r)}><Eye size={14} />Preview</Button>{isOwner && <Button className="small" onClick={() => setVehicleModal(r)}>Edit</Button>}</div> }]} /></Card>}

    {tab === 'expenses' && <Card><CardHeader title="Biaya Umum Transportasi" subtitle="Preview memudahkan pengecekan biaya sebelum diedit." /><DataTable rows={data.generalExpenses} keyOf={(r) => r.id} columns={[{ title: 'Tanggal', render: (r) => dateShort(r.expense_date) }, { title: 'Nominal', render: (r) => rupiah(r.amount) }, { title: 'Jenis', render: (r) => statusLabel(r.category) }, { title: 'Kendaraan', render: (r) => r.vehicle_identity || '-' }, { title: 'Penanggung Jawab', render: (r) => r.requester_name }, { title: 'Catatan', render: (r) => r.notes || '-' }, { title: 'Aksi', render: (r) => <div className="row-actions"><Button className="small" onClick={() => setExpensePreview(r)}><Eye size={14} />Preview</Button><Button className="small" onClick={() => setExpenseModal(r)}>Edit</Button></div> }]} /></Card>}

    {vehicleModal && <VehicleModal initial={vehicleModal} employees={data.employees} onClose={() => setVehicleModal(null)} onSave={async (v) => { await onVehicle(v); setVehicleModal(null); }} />}
    {jobModal && <JobModal initial={jobModal} data={data} onClose={() => setJobModal(null)} onSave={async (j) => { await onJob(j); setJobModal(null); }} />}
    {expenseModal && <ExpenseModal initial={expenseModal} defaultName={data.membership.fullName} onClose={() => setExpenseModal(null)} onSave={async (e) => { await onGeneral(e); setExpenseModal(null); }} />}
    {tripExpense && <TripExpenseModal job={tripExpense} data={data} onClose={() => setTripExpense(null)} onFuel={onFuel} onVehicleExpense={onVehicleExpense} />}
    {jobPreview && <JobPreviewModal job={jobPreview} data={data} onClose={() => setJobPreview(null)} onEdit={() => { setJobModal(jobPreview); setJobPreview(null); }} />}
    {vehiclePreview && <VehiclePreviewModal vehicle={vehiclePreview} data={data} onClose={() => setVehiclePreview(null)} onEdit={isOwner ? () => { setVehicleModal(vehiclePreview); setVehiclePreview(null); } : undefined} />}
    {expensePreview && <GeneralExpensePreviewModal expense={expensePreview} onClose={() => setExpensePreview(null)} onEdit={() => { setExpenseModal(expensePreview); setExpensePreview(null); }} />}
  </div>;
}

function TransportSummary({ data }: { data: AppData }) {
  const chart = useMemo(() => lastMonths(6).map((key) => { const { start, end } = monthRange(key); const general = data.generalExpenses.filter((e) => e.expense_date >= start && e.expense_date <= end).reduce((s, e) => s + Number(e.amount || 0), 0); const jobIds = data.jobs.filter((j) => j.operation_date >= start && j.operation_date <= end).map((j) => j.id); const fuel = data.fuelExpenses.filter((e) => jobIds.includes(e.transport_job_id)).reduce((s, e) => s + Number(e.amount || 0), 0); const vehicle = data.vehicleExpenses.filter((e) => jobIds.includes(e.transport_job_id)).reduce((s, e) => s + Number(e.amount || 0), 0); return { label: monthLabel(key), total: general + fuel + vehicle, umum: general, bbm: fuel, kendaraan: vehicle }; }), [data]);
  const composition = expenseComposition(data);
  const pieRows = normalizePieData(composition);
  const destinations = [...new Map(data.jobs.map((j) => [j.destination.toLowerCase(), j.destination])).values()].map((name) => ({ name, total: data.jobs.filter((j) => j.destination.toLowerCase() === name.toLowerCase()).length })).sort((a, b) => b.total - a.total).slice(0, 6);
  const totalCost = composition.reduce((s, x) => s + x.value, 0);
  const yDomain = chartDomain(chart.map((x) => x.total));
  return <>
    <div className="grid metrics" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
      <TransportMetric icon={<Truck />} title="Total Armada" value={`${data.vehicles.length}`} sub="Unit" />
      <TransportMetric icon={<Route />} title="Total Trip" value={`${data.jobs.length}`} sub="Keberangkatan" />
      <TransportMetric icon={<Fuel />} title="Total Biaya" value={rupiah(totalCost)} sub="Semua kategori" />
      <TransportMetric icon={<CheckCircle2 />} title="Trip Selesai" value={`${data.jobs.filter((j) => j.status === 'selesai').length}`} sub="Final" />
    </div>
    <div className="grid transport-analytics">
      <Card className="chart-card"><CardHeader title="Grafik Biaya 6 Bulan" subtitle="Biaya total BBM, servis/sparepart, dan biaya umum" /><ResponsiveContainer width="100%" height={270}><BarChart data={chart} margin={{ left: 8, right: 14, top: 8, bottom: 4 }}><CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#dbe4ef" /><XAxis dataKey="label" axisLine={false} tickLine={false} /><YAxis width={58} tickFormatter={moneyAxis} domain={yDomain} axisLine={false} tickLine={false} /><Tooltip formatter={(v) => rupiah(Number(v))} /><Bar dataKey="total" radius={[8, 8, 0, 0]} barSize={38} animationDuration={850}>{chart.map((_, i) => <Cell key={i} fill={chartColors[i % chartColors.length]} />)}</Bar></BarChart></ResponsiveContainer></Card>
      <Card className="chart-card"><CardHeader title="Komposisi Biaya" subtitle="Porsi setiap kategori biaya" />{pieRows.length === 0 ? <p className="muted-caption">Belum ada biaya.</p> : <div className="donut-layout compact"><ResponsiveContainer width="100%" height={220}><PieChart><Pie data={pieRows} dataKey="value" innerRadius={66} outerRadius={92} paddingAngle={3} animationDuration={850}>{pieRows.map((row: any, i) => <Cell key={row.name} fill={chartColors[i % chartColors.length]} />)}</Pie></PieChart></ResponsiveContainer><div className="donut-legend">{pieRows.map((row: any, i) => <LegendLine key={row.name} color={chartColors[i % chartColors.length]} label={row.name} value={rupiah(row.value)} />)}</div></div>}</Card>
      <Card className="chart-card"><CardHeader title="Tujuan Terbanyak" subtitle="Rangking tujuan trip" /><ResponsiveContainer width="100%" height={270}><LineChart data={destinations} margin={{ left: 8, right: 14, top: 8, bottom: 4 }}><CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#dbe4ef" /><XAxis dataKey="name" axisLine={false} tickLine={false} /><YAxis width={36} allowDecimals={false} axisLine={false} tickLine={false} /><Tooltip /><Line type="monotone" dataKey="total" stroke="#0799a0" strokeWidth={3} dot={{ r: 4 }} animationDuration={900} /></LineChart></ResponsiveContainer></Card>
    </div>
  </>;
}

function TransportMetric({ icon, title, value, sub }: { icon: ReactNode; title: string; value: string; sub: string }) {
  return <Card className="metric-card"><div className="metric-icon teal">{icon}</div><div><div className="metric-label">{title}</div><div className="metric-value fit-text">{value}</div><div className="metric-sub">{sub}</div></div></Card>;
}

function LegendLine({ color, label, value }: { color: string; label: string; value: string }) {
  return <div className="legend-dot"><span style={{ background: color }} /><div><b>{label}</b><small>Transport</small></div><strong>{value}</strong></div>;
}

function LockState({ locked }: { locked: boolean }) {
  return <span className={locked ? 'lock-state locked' : 'lock-state'}>{locked ? <LockKeyhole size={13} /> : <UnlockKeyhole size={13} />}{locked ? 'Terkunci' : 'Belum dikunci'}</span>;
}

function JobStatusButton({ job, onStatus }: { job: TransportJob; onStatus: (id: string, status: TransportJob['status']) => Promise<void> }) {
  if (job.status === 'draft') return <Button className="small primary" onClick={() => onStatus(job.id, 'berjalan')}><PlayCircle size={14} />Mulai Berangkat</Button>;
  if (job.status === 'berjalan') return <Button className="small good" onClick={() => onStatus(job.id, 'selesai')}><CheckCircle2 size={14} />Tandai Selesai</Button>;
  if (job.status === 'selesai') return <Button className="small" onClick={() => onStatus(job.id, 'berjalan')}><Unlock size={14} />Buka Lagi</Button>;
  return <Button className="small" onClick={() => onStatus(job.id, 'draft')}><Ban size={14} />Kembalikan Draft</Button>;
}

function VehicleModal({ initial, employees, onClose, onSave }: { initial: VehicleForm; employees: AppData['employees']; onClose: () => void; onSave: (v: VehicleForm) => Promise<void> }) {
  const [form, setForm] = useState<VehicleForm>(initial);
  const set = (k: keyof Vehicle, v: string | boolean | number | null) => setForm((f) => ({ ...f, [k]: v }));
  return <Modal title="Armada" onClose={onClose} wide actions={<><Button onClick={onClose}>Batal</Button><Button className="primary" onClick={() => onSave(form)}>Simpan</Button></>}><div className="form-grid"><div className="field"><label>Kode Armada</label><input className="input" value={form.fleet_code || ''} onChange={(e) => set('fleet_code', e.target.value)} /></div><div className="field"><label>Plat Nomor</label><input className="input" value={form.plate_number || ''} onChange={(e) => set('plate_number', e.target.value)} /></div><div className="field"><label>Tahun</label><input className="input" type="number" value={form.vehicle_year || new Date().getFullYear()} onChange={(e) => set('vehicle_year', Number(e.target.value))} /></div><div className="field"><label>Jatuh Tempo Pajak</label><input className="input" type="date" value={form.tax_due_date || todayISO()} onChange={(e) => set('tax_due_date', e.target.value)} /></div><div className="field"><label>Sopir Default</label><select className="select" value={form.default_driver_id || ''} onChange={(e) => set('default_driver_id', e.target.value || null)}><option value="">Pilih</option>{employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select></div><div className="field"><label>Status</label><select className="select" value={form.is_active === false ? 'nonaktif' : 'aktif'} onChange={(e) => set('is_active', e.target.value === 'aktif')}><option value="aktif">Aktif</option><option value="nonaktif">Nonaktif</option></select></div><div className="field full"><label>Upload / Ganti Foto STNK</label><input className="input" type="file" accept="image/*" onChange={(e) => setForm((f) => ({ ...f, stnkFile: e.target.files?.[0] || null }))} /><small className="field-help">Kosongkan jika tidak ingin mengganti foto STNK.</small></div>{form.stnk_photo_path && <div className="field full"><StorageImagePreview bucket="master-documents" path={form.stnk_photo_path} label="Foto STNK tersimpan" emptyText="Tidak ada foto STNK" /></div>}<div className="field full"><label>Catatan</label><textarea className="textarea" value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} /></div></div></Modal>;
}

function JobModal({ initial, data, onClose, onSave }: { initial: Partial<TransportJob>; data: AppData; onClose: () => void; onSave: (j: Partial<TransportJob>) => Promise<void> }) {
  const [form, setForm] = useState(initial);
  const set = (k: keyof TransportJob, v: string | boolean | number | null) => setForm((f) => ({ ...f, [k]: v }));
  return <Modal title="Keberangkatan" onClose={onClose} wide actions={<><Button onClick={onClose}>Batal</Button><Button className="primary" onClick={() => onSave(form)}>Simpan</Button></>}><div className="form-grid"><div className="field"><label>Tanggal</label><input className="input" type="date" value={form.operation_date || todayISO()} onChange={(e) => set('operation_date', e.target.value)} /></div><div className="field"><label>Armada</label><select className="select" value={form.vehicle_id || ''} onChange={(e) => set('vehicle_id', e.target.value || null)}><option value="">Nota kiriman / tanpa armada</option>{data.vehicles.map((v) => <option key={v.id} value={v.id}>{v.fleet_code} - {v.plate_number}</option>)}</select></div><div className="field"><label>Tujuan</label><input className="input" value={form.destination || ''} onChange={(e) => set('destination', e.target.value)} /></div><div className="field"><label>Sopir</label><select className="select" value={form.driver_id || ''} onChange={(e) => set('driver_id', e.target.value || null)}><option value="">Pilih</option>{data.employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select></div><div className="field"><label>Helper 1</label><select className="select" value={form.helper_1_id || ''} onChange={(e) => set('helper_1_id', e.target.value || null)}><option value="">Pilih</option>{data.employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select></div><div className="field"><label>Helper 2</label><select className="select" value={form.helper_2_id || ''} onChange={(e) => set('helper_2_id', e.target.value || null)}><option value="">Pilih</option>{data.employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select></div><div className="field"><label>Status</label><select className="select" value={form.status || 'draft'} onChange={(e) => set('status', e.target.value as TransportJob['status'])}><option value="draft">Draft</option><option value="berjalan">Berjalan</option><option value="selesai">Selesai</option><option value="dibatalkan">Dibatalkan</option></select></div><div className="field"><label>Odometer Mulai</label><input className="input" type="number" value={form.odometer_start || ''} onChange={(e) => set('odometer_start', Number(e.target.value) || null)} /></div><div className="field"><label>Odometer Akhir</label><input className="input" type="number" value={form.odometer_end || ''} onChange={(e) => set('odometer_end', Number(e.target.value) || null)} /></div><div className="field full"><label>Catatan</label><textarea className="textarea" value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} /></div></div></Modal>;
}

function ExpenseModal({ initial, defaultName, onClose, onSave }: { initial: Partial<GeneralTransportExpense>; defaultName: string; onClose: () => void; onSave: (e: Partial<GeneralTransportExpense>) => Promise<void> }) {
  const [form, setForm] = useState({ requester_name: defaultName, ...initial });
  const set = (k: keyof GeneralTransportExpense, v: string | number | null) => setForm((f) => ({ ...f, [k]: v }));
  return <Modal title="Biaya Umum" onClose={onClose} actions={<><Button onClick={onClose}>Batal</Button><Button className="primary" onClick={() => onSave(form)}>Simpan</Button></>}><div className="form-grid"><div className="field"><label>Tanggal</label><input className="input" type="date" value={form.expense_date || todayISO()} onChange={(e) => set('expense_date', e.target.value)} /></div><div className="field"><label>Nominal</label><input className="input" type="number" value={form.amount || 0} onChange={(e) => set('amount', Number(e.target.value))} /></div><div className="field"><label>Kategori</label><select className="select" value={form.category || 'bbm'} onChange={(e) => set('category', e.target.value)}><option value="bbm">BBM</option><option value="bahan">Bahan</option><option value="servis">Servis</option><option value="sparepart">Sparepart</option><option value="parkir">Parkir</option><option value="lainnya">Lainnya</option></select></div><div className="field"><label>Identitas Kendaraan</label><input className="input" value={form.vehicle_identity || ''} onChange={(e) => set('vehicle_identity', e.target.value)} /></div><div className="field"><label>Penanggung Jawab</label><input className="input" value={form.requester_name || ''} onChange={(e) => set('requester_name', e.target.value)} /></div><div className="field full"><label>Catatan</label><textarea className="textarea" value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} /></div></div></Modal>;
}

function TripExpenseModal({ job, data, onClose, onFuel, onVehicleExpense }: { job: TransportJob; data: AppData; onClose: () => void; onFuel: (e: Partial<FuelExpense>) => Promise<void>; onVehicleExpense: (e: Partial<VehicleExpense>) => Promise<void> }) {
  const [fuel, setFuel] = useState<Partial<FuelExpense>>({ transport_job_id: job.id, fuel_type: 'Solar', amount: 0 });
  const [expense, setExpense] = useState<Partial<VehicleExpense>>({ transport_job_id: job.id, category: 'servis', vendor_name: '-', amount: 0 });
  const fuelRows = data.fuelExpenses.filter((e) => e.transport_job_id === job.id);
  const vehicleRows = data.vehicleExpenses.filter((e) => e.transport_job_id === job.id);
  return <Modal title={`Biaya Trip ${job.destination}`} onClose={onClose} wide actions={<Button onClick={onClose}>Tutup</Button>}><div className="grid two"><Card style={{ boxShadow: 'none' }}><CardHeader title="Input BBM" action={<Button className="small primary" onClick={() => onFuel(fuel)}>Simpan BBM</Button>} /><div className="form-grid"><div className="field"><label>Jenis BBM</label><input className="input" value={fuel.fuel_type || ''} onChange={(e) => setFuel((f) => ({ ...f, fuel_type: e.target.value }))} /></div><div className="field"><label>Liter</label><input className="input" type="number" value={fuel.liters || ''} onChange={(e) => setFuel((f) => ({ ...f, liters: Number(e.target.value) || null }))} /></div><div className="field full"><label>Nominal</label><input className="input" type="number" value={fuel.amount || 0} onChange={(e) => setFuel((f) => ({ ...f, amount: Number(e.target.value) }))} /></div></div></Card><Card style={{ boxShadow: 'none' }}><CardHeader title="Input Servis/Sparepart" action={<Button className="small primary" onClick={() => onVehicleExpense(expense)}>Simpan Biaya</Button>} /><div className="form-grid"><div className="field"><label>Kategori</label><input className="input" value={expense.category || ''} onChange={(e) => setExpense((f) => ({ ...f, category: e.target.value }))} /></div><div className="field"><label>Vendor</label><input className="input" value={expense.vendor_name || ''} onChange={(e) => setExpense((f) => ({ ...f, vendor_name: e.target.value }))} /></div><div className="field full"><label>Nominal</label><input className="input" type="number" value={expense.amount || 0} onChange={(e) => setExpense((f) => ({ ...f, amount: Number(e.target.value) }))} /></div></div></Card></div><div style={{ height: 16 }} /><div className="grid two"><Card style={{ boxShadow: 'none' }}><CardHeader title="Riwayat BBM" /><DataTable rows={fuelRows} keyOf={(r) => r.id} columns={[{ title: 'BBM', render: (r) => r.fuel_type }, { title: 'Liter', render: (r) => r.liters || '-' }, { title: 'Nominal', render: (r) => rupiah(r.amount) }]} /></Card><Card style={{ boxShadow: 'none' }}><CardHeader title="Riwayat Biaya Kendaraan" /><DataTable rows={vehicleRows} keyOf={(r) => r.id} columns={[{ title: 'Kategori', render: (r) => r.category }, { title: 'Vendor', render: (r) => r.vendor_name }, { title: 'Nominal', render: (r) => rupiah(r.amount) }]} /></Card></div></Modal>;
}

function JobPreviewModal({ job, data, onClose, onEdit }: { job: TransportJob; data: AppData; onClose: () => void; onEdit: () => void }) {
  const fuelTotal = data.fuelExpenses.filter((e) => e.transport_job_id === job.id).reduce((s, e) => s + Number(e.amount || 0), 0);
  const vehicleTotal = data.vehicleExpenses.filter((e) => e.transport_job_id === job.id).reduce((s, e) => s + Number(e.amount || 0), 0);
  return <Modal title="Preview Keberangkatan" onClose={onClose} wide actions={<><Button onClick={onClose}>Tutup</Button><Button className="primary" onClick={onEdit}>Edit Trip</Button></>}><div className="preview-hero"><Route /><div><h3>{job.destination}</h3><p>{dateShort(job.operation_date)} • {jobVehicleLabel(job, data.vehicles)}</p></div><StatusBadge status={job.status} /></div><div className="detail-tile-grid"><DetailTile label="Sopir" value={employeeName(job.driver_id, data.employees)} /><DetailTile label="Helper 1" value={employeeName(job.helper_1_id, data.employees)} /><DetailTile label="Helper 2" value={employeeName(job.helper_2_id, data.employees)} /><DetailTile label="Odometer" value={`${job.odometer_start || '-'} - ${job.odometer_end || '-'}`} /><DetailTile label="Biaya BBM" value={rupiah(fuelTotal)} /><DetailTile label="Biaya Kendaraan" value={rupiah(vehicleTotal)} /><DetailTile label="Kunci" value={job.is_locked ? 'Terkunci final' : 'Belum dikunci'} /></div><Card style={{ boxShadow: 'none', marginTop: 14 }}><CardHeader title="Catatan" /><p className="muted-caption">{job.notes || 'Belum ada catatan.'}</p></Card></Modal>;
}

function VehiclePreviewModal({ vehicle, data, onClose, onEdit }: { vehicle: Vehicle; data: AppData; onClose: () => void; onEdit?: () => void }) {
  return <Modal title="Preview Armada" onClose={onClose} wide actions={<><Button onClick={onClose}>Tutup</Button>{onEdit && <Button className="primary" onClick={onEdit}>Edit Armada</Button>}</>}><div className="employee-detail-layout"><div className="employee-detail-main"><div className="preview-hero"><Truck /><div><h3>{vehicle.fleet_code}</h3><p>{vehicle.plate_number} • Tahun {vehicle.vehicle_year}</p></div><StatusBadge status={vehicle.is_active ? 'aktif' : 'nonaktif'} /></div><div className="detail-tile-grid"><DetailTile label="Pajak" value={dateShort(vehicle.tax_due_date)} /><DetailTile label="Sopir Default" value={employeeName(vehicle.default_driver_id, data.employees)} /><DetailTile label="Helper 1" value={employeeName(vehicle.default_helper_1_id, data.employees)} /><DetailTile label="Helper 2" value={employeeName(vehicle.default_helper_2_id, data.employees)} /></div><Card style={{ boxShadow: 'none', marginTop: 14 }}><CardHeader title="Catatan" /><p className="muted-caption">{vehicle.notes || 'Belum ada catatan.'}</p></Card></div><div className="employee-document-panel"><CardHeader title="Foto STNK" subtitle={vehicle.stnk_photo_path ? 'Klik gambar untuk membuka ukuran penuh.' : 'Status: tidak ada foto.'} /><StorageImagePreview bucket="master-documents" path={vehicle.stnk_photo_path} label={`STNK ${vehicle.fleet_code}`} emptyText="Tidak ada foto STNK" /></div></div></Modal>;
}

function GeneralExpensePreviewModal({ expense, onClose, onEdit }: { expense: GeneralTransportExpense; onClose: () => void; onEdit: () => void }) {
  return <Modal title="Preview Biaya Umum" onClose={onClose} actions={<><Button onClick={onClose}>Tutup</Button><Button className="primary" onClick={onEdit}>Edit Biaya</Button></>}><div className="preview-hero"><WalletCards /><div><h3>{rupiah(expense.amount)}</h3><p>{statusLabel(expense.category)} • {dateShort(expense.expense_date)}</p></div></div><div className="detail-tile-grid two-col"><DetailTile label="Kendaraan" value={expense.vehicle_identity || '-'} /><DetailTile label="Penanggung Jawab" value={expense.requester_name || '-'} /></div><Card style={{ boxShadow: 'none', marginTop: 14 }}><CardHeader title="Catatan" /><p className="muted-caption">{expense.notes || 'Belum ada catatan.'}</p></Card></Modal>;
}

function DetailTile({ label, value }: { label: string; value: string }) {
  return <div className="detail-tile"><small>{label}</small><b>{value}</b></div>;
}

function expenseComposition(data: AppData) {
  const jobIds = data.jobs.map((j) => j.id);
  const fuel = data.fuelExpenses.filter((e) => jobIds.includes(e.transport_job_id)).reduce((s, e) => s + Number(e.amount || 0), 0);
  const vehicle = data.vehicleExpenses.filter((e) => jobIds.includes(e.transport_job_id)).reduce((s, e) => s + Number(e.amount || 0), 0);
  const generalByCategory = data.generalExpenses.reduce<Record<string, number>>((acc, e) => { acc[e.category] = (acc[e.category] || 0) + Number(e.amount || 0); return acc; }, {});
  return [{ name: 'BBM Trip', value: fuel }, { name: 'Servis/Sparepart', value: vehicle }, ...Object.entries(generalByCategory).map(([name, value]) => ({ name: statusLabel(name), value }))].filter((x) => x.value > 0);
}

function buildTransportExport(data: AppData) {
  return [...data.jobs.map((j) => ({ Jenis: 'Keberangkatan', Tanggal: j.operation_date, Keterangan: `${jobVehicleLabel(j, data.vehicles)} ke ${j.destination}`, Nominal: '-', Status: statusLabel(j.status) })), ...data.fuelExpenses.map((e) => ({ Jenis: 'BBM Trip', Tanggal: e.created_at?.slice(0, 10) || '-', Keterangan: e.fuel_type, Nominal: rupiah(e.amount), Status: '-' })), ...data.vehicleExpenses.map((e) => ({ Jenis: e.category, Tanggal: e.created_at?.slice(0, 10) || '-', Keterangan: e.vendor_name, Nominal: rupiah(e.amount), Status: '-' })), ...data.generalExpenses.map((e) => ({ Jenis: e.category, Tanggal: e.expense_date, Keterangan: `${e.vehicle_identity || '-'} • ${e.requester_name}`, Nominal: rupiah(e.amount), Status: '-' }))];
}
