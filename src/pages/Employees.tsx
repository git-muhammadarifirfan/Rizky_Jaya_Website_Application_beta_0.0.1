import { useMemo, useState, type ReactNode } from 'react';
import { CalendarDays, Download, Eye, FileText, IdCard, Phone, Plus, Search, ToggleLeft, ToggleRight, UserRound } from 'lucide-react';
import type { AppData, Employee, SalaryType } from '../types';
import { PageHeader } from '../components/Shell';
import { Avatar, Button, Card, CardHeader, DataTable, Modal, StatusBadge, StorageImagePreview } from '../components/ui';
import { dateShort, rupiah, todayISO } from '../lib/date';
import { downloadExcel, downloadPdfTable } from '../lib/export';
import { statusLabel } from '../lib/format';

type EmployeeForm = Partial<Employee> & { ktpFile?: File | null };

export function EmployeesPage({ data, onSave, onSetActive }: { data: AppData; onSave: (employee: EmployeeForm) => Promise<void>; onSetActive: (id: string, active: boolean) => Promise<void> }) {
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<EmployeeForm | null>(null);
  const [viewing, setViewing] = useState<Employee | null>(null);
  const rows = useMemo(() => data.employees.filter((e) => [e.full_name, e.employee_code, e.position, e.phone, e.salary_type].join(' ').toLowerCase().includes(query.toLowerCase())), [data.employees, query]);
  const exportRows = rows.map((e) => ({ Kode: e.employee_code, Nama: e.full_name, Jabatan: e.position || '-', HP: e.phone || '-', Tipe_Gaji: statusLabel(e.salary_type), Gaji_Harian: rupiah(e.daily_rate), Gaji_Bulanan: rupiah(e.monthly_rate), Potongan_Absen: rupiah(e.absence_deduction), KTP: e.ktp_photo_path ? 'Ada' : 'Tidak ada', Status: e.is_active ? 'Aktif' : 'Nonaktif' }));
  const isOwner = data.membership.role === 'owner';

  return <div className="content">
    <PageHeader title="Data Karyawan" subtitle="Kelola data karyawan, jabatan, status aktif, dokumen KTP, dan tipe gaji seperti aplikasi mobile" actions={<><Button onClick={() => downloadExcel('data-karyawan', exportRows)}><Download size={18} />Excel</Button><Button onClick={() => downloadPdfTable('Data Karyawan', exportRows)}><FileText size={18} />PDF</Button>{isOwner && <Button className="primary" onClick={() => setEditing({ is_active: true, joined_date: todayISO(), salary_type: 'harian', daily_rate: 0, monthly_rate: 0, allowed_absence_days: 4, absence_deduction: 0 })}><Plus size={18} />Tambah Karyawan</Button>}</>} />
    <Card>
      <CardHeader title="Daftar Karyawan" subtitle="Gunakan tombol Detail untuk melihat profil lengkap dan preview foto KTP." />
      <div className="filters"><div style={{ position: 'relative', flex: '1 1 320px' }}><Search size={18} style={{ position: 'absolute', left: 13, top: 13, color: 'var(--muted)' }} /><input className="input" style={{ width: '100%', paddingLeft: 42 }} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari nama, kode, jabatan, tipe gaji, atau nomor HP" /></div></div>
      <DataTable rows={rows} keyOf={(r) => r.id} columns={[
        { title: 'Karyawan', render: (r) => <button type="button" className="table-click-name" onClick={() => setViewing(r)}><Avatar name={r.full_name} /><span>{r.full_name}<small>{r.position || 'Karyawan'}</small></span></button> },
        { title: 'Kode', render: (r) => r.employee_code || '-' },
        { title: 'Jabatan', render: (r) => r.position || '-' },
        { title: 'No HP', render: (r) => r.phone || '-' },
        { title: 'Tipe Gaji', render: (r) => <StatusBadge status={r.salary_type} /> },
        { title: 'Rate', render: (r) => r.salary_type === 'bulanan' ? rupiah(r.monthly_rate) : r.salary_type === 'borongan' ? 'Borongan' : rupiah(r.daily_rate) },
        { title: 'KTP', render: (r) => <StatusBadge status={r.ktp_photo_path ? 'aktif' : 'belum'} /> },
        { title: 'Status', render: (r) => <StatusBadge status={r.is_active ? 'aktif' : 'nonaktif'} /> },
        { title: 'Aksi', render: (r) => <div className="row-actions"><Button className="small" onClick={() => setViewing(r)}><Eye size={14} />Detail</Button>{isOwner && <><Button className="small" onClick={() => setEditing(r)}>Edit</Button><Button className="small" onClick={() => onSetActive(r.id, !r.is_active)}>{r.is_active ? <ToggleRight size={15} /> : <ToggleLeft size={15} />} {r.is_active ? 'Nonaktifkan' : 'Aktifkan'}</Button></>}</div> }
      ]} />
    </Card>
    {viewing && <EmployeeDetailModal employee={viewing} onClose={() => setViewing(null)} onEdit={isOwner ? () => { setViewing(null); setEditing(viewing); } : undefined} />}
    {editing && <EmployeeModal initial={editing} onClose={() => setEditing(null)} onSave={async (employee) => { await onSave(employee); setEditing(null); }} />}
  </div>;
}

function EmployeeDetailModal({ employee, onEdit, onClose }: { employee: Employee; onEdit?: () => void; onClose: () => void }) {
  const rateLabel = employee.salary_type === 'bulanan' ? rupiah(employee.monthly_rate) : employee.salary_type === 'borongan' ? 'Dihitung dari item borongan' : rupiah(employee.daily_rate);
  return <Modal title="Detail Karyawan" onClose={onClose} wide actions={<><Button onClick={onClose}>Tutup</Button>{onEdit && <Button className="primary" onClick={onEdit}>Edit Data</Button>}</>}>
    <div className="employee-detail-layout">
      <div className="employee-detail-main">
        <div className="employee-detail-hero compact">
          <Avatar name={employee.full_name} size={66} />
          <div><h3>{employee.full_name}</h3><p>{employee.employee_code || '-'} • {employee.position || 'Karyawan'}</p></div>
          <StatusBadge status={employee.is_active ? 'aktif' : 'nonaktif'} />
        </div>
        <div className="detail-tile-grid">
          <DetailTile icon={<UserRound />} label="Jabatan" value={employee.position || '-'} />
          <DetailTile icon={<Phone />} label="No HP" value={employee.phone || '-'} />
          <DetailTile icon={<CalendarDays />} label="Tanggal Masuk" value={employee.joined_date ? dateShort(employee.joined_date) : '-'} />
          <DetailTile icon={<IdCard />} label="Tipe Gaji" value={`${statusLabel(employee.salary_type)} • ${rateLabel}`} />
        </div>
        <Card style={{ boxShadow: 'none', marginTop: 14 }}><CardHeader title="Catatan" /><p className="muted-caption">{employee.notes || 'Belum ada catatan.'}</p></Card>
      </div>
      <div className="employee-document-panel">
        <CardHeader title="Foto KTP" subtitle={employee.ktp_photo_path ? 'Klik gambar untuk membuka ukuran penuh.' : 'Status: tidak ada foto.'} />
        <StorageImagePreview bucket="master-documents" path={employee.ktp_photo_path} label={`KTP ${employee.full_name}`} emptyText="Tidak ada foto KTP" />
      </div>
    </div>
  </Modal>;
}

function DetailTile({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="detail-tile"><span>{icon}</span><small>{label}</small><b>{value}</b></div>;
}

function EmployeeModal({ initial, onSave, onClose }: { initial: EmployeeForm; onSave: (employee: EmployeeForm) => Promise<void>; onClose: () => void }) {
  const [form, setForm] = useState<EmployeeForm>(initial);
  const input = (key: keyof Employee, value: string | boolean | number | null | SalaryType) => setForm((f) => ({ ...f, [key]: value }));
  const salaryType = form.salary_type || 'harian';
  return <Modal title={form.id ? 'Edit Karyawan' : 'Tambah Karyawan'} onClose={onClose} wide actions={<><Button onClick={onClose}>Batal</Button><Button className="primary" onClick={() => onSave(form)}>Simpan</Button></>}> 
    <div className="form-grid">
      <div className="field"><label>Nama Lengkap</label><input className="input" value={form.full_name || ''} onChange={(e) => input('full_name', e.target.value)} /></div>
      <div className="field"><label>Kode Karyawan</label><input className="input" value={form.employee_code || ''} onChange={(e) => input('employee_code', e.target.value)} /></div>
      <div className="field"><label>Jabatan</label><input className="input" value={form.position || ''} onChange={(e) => input('position', e.target.value)} /></div>
      <div className="field"><label>No HP</label><input className="input" value={form.phone || ''} onChange={(e) => input('phone', e.target.value)} /></div>
      <div className="field"><label>Tanggal Masuk</label><input className="input" type="date" value={form.joined_date || todayISO()} onChange={(e) => input('joined_date', e.target.value)} /></div>
      <div className="field"><label>Tipe Gaji</label><select className="select" value={salaryType} onChange={(e) => input('salary_type', e.target.value as SalaryType)}><option value="harian">Harian</option><option value="bulanan">Bulanan</option><option value="borongan">Borongan</option></select></div>
      {salaryType === 'harian' && <div className="field"><label>Gaji Harian</label><input className="input" type="number" value={form.daily_rate || 0} onChange={(e) => input('daily_rate', Number(e.target.value))} /></div>}
      {salaryType === 'bulanan' && <><div className="field"><label>Gaji Bulanan</label><input className="input" type="number" value={form.monthly_rate || 0} onChange={(e) => input('monthly_rate', Number(e.target.value))} /></div><div className="field"><label>Jatah Tidak Masuk</label><input className="input" type="number" value={form.allowed_absence_days ?? 4} onChange={(e) => input('allowed_absence_days', Number(e.target.value))} /></div><div className="field"><label>Potongan per Hari</label><input className="input" type="number" value={form.absence_deduction || 0} onChange={(e) => input('absence_deduction', Number(e.target.value))} /></div></>}
      {salaryType === 'borongan' && <div className="field full"><label>Catatan Borongan</label><input className="input" value="Nominal dihitung dari item borongan di menu Gaji" disabled /></div>}
      <div className="field full"><label>Upload / Ganti Foto KTP</label><input className="input" type="file" accept="image/*" onChange={(e) => setForm((f) => ({ ...f, ktpFile: e.target.files?.[0] || null }))} /><small className="field-help">File akan dikompresi dan disimpan di bucket master-documents. Kosongkan jika tidak ingin mengganti foto.</small></div>
      {form.ktp_photo_path && <div className="field full"><StorageImagePreview bucket="master-documents" path={form.ktp_photo_path} label="Foto KTP tersimpan" emptyText="Tidak ada foto KTP" /></div>}
      <div className="field full"><label>Catatan</label><textarea className="textarea" value={form.notes || ''} onChange={(e) => input('notes', e.target.value)} /></div>
    </div>
  </Modal>;
}
