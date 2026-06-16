import { useState } from 'react';
import { Bell, CheckCircle2, KeyRound, Plus, ShieldCheck, UserRound, UsersRound, XCircle } from 'lucide-react';
import type { AppData, AttendanceMode } from '../types';
import { PageHeader } from '../components/Shell';
import { Avatar, Button, Card, CardHeader, DataTable, Modal, StatusBadge } from '../components/ui';
import { dateShort } from '../lib/date';

export function SettingsPage({ data, onResolve, onProfile, onPassword, onCreateAdmin, onSetAdmin }: { data: AppData; onResolve: (id: string, approve: boolean, note?: string) => Promise<void>; onUpdateMode: (mode: AttendanceMode, requiresPhoto?: boolean) => Promise<void>; onProfile: (name: string) => Promise<void>; onPassword: (password: string) => Promise<void>; onCreateAdmin: (payload: { fullName: string; email: string; password: string }) => Promise<void>; onSetAdmin: (userId: string, active: boolean) => Promise<void> }) {
  const [name, setName] = useState(data.membership.fullName);
  const [password, setPassword] = useState('');
  const [adminModal, setAdminModal] = useState(false);
  const pending = data.requests.filter((r) => r.status === 'pending');

  return <div className="content">
    <PageHeader title={data.membership.role === 'owner' ? 'Pengaturan Owner' : 'Profil / Pengaturan'} subtitle="Profil, approval otomatis, dan manajemen admin" />
    <div className="settings-hero">
      <div className="profile-big"><Avatar name={data.membership.fullName} size={76} /><div><h2>{data.membership.fullName}</h2><p>{data.membership.role === 'owner' ? 'Owner / Toko Besar' : 'Admin Absensi'} • {data.membership.organizationName}</p></div></div>
      <div className="settings-pills"><span><ShieldCheck size={16} />Role aktif</span><b>{data.membership.role === 'owner' ? 'Owner' : 'Admin Absensi'}</b></div>
    </div>

    <div className="grid two settings-grid">
      <Card><CardHeader title="Informasi Akun" subtitle="Update nama profil dan password akun." action={<UserRound size={18} />} />
        <div className="form-grid"><div className="field"><label>Nama Profil</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div><div className="field"><label>Password Baru</label><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimal 6 karakter" /></div></div>
        <div className="header-inline-actions" style={{ marginTop: 14 }}><Button className="primary" onClick={() => onProfile(name)}>Simpan Nama</Button><Button onClick={() => password.length >= 6 && onPassword(password)}><KeyRound size={16} />Ubah Password</Button></div>
      </Card>
      <Card><CardHeader title={data.membership.role === 'owner' ? 'Pusat Approval' : 'Status Koreksi Otomatis'} subtitle={data.membership.role === 'owner' ? 'Pengajuan Admin yang masuk ke Owner.' : 'Koreksi akan dibuat otomatis saat Admin mengubah data yang sudah tersimpan.'} action={<Bell size={18} />} />
        <div className="approval-summary"><span><b>{pending.length}</b><small>Pending</small></span><span><b>{data.requests.filter((r) => r.status === 'approved').length}</b><small>Approved</small></span><span><b>{data.requests.filter((r) => r.status === 'rejected').length}</b><small>Rejected</small></span></div>
        <p className="muted-caption">Tombol kirim notifikasi manual dihapus. Approval tetap muncul otomatis dari koreksi absensi atau transport.</p>
      </Card>
    </div>

    <Card style={{ marginTop: 18 }}><CardHeader title={data.membership.role === 'owner' ? 'Inbox Approval Owner' : 'Status Pengajuan Admin'} subtitle="Klik Setujui/Tolak untuk memproses notifikasi Admin." action={<span className="status pending">{pending.length} pending</span>} />
      <DataTable rows={data.requests} keyOf={(r) => r.id} columns={[
        { title: 'Tanggal', render: (r) => r.created_at ? dateShort(r.created_at.slice(0, 10)) : '-' },
        { title: 'Pengaju', render: (r) => r.requester_name || '-' },
        { title: 'Jenis', render: (r) => r.request_type },
        { title: 'Isi Pengajuan', render: (r) => <span className="table-title">{r.reason || '-'}</span> },
        { title: 'Status', render: (r) => <StatusBadge status={r.status} /> },
        { title: 'Aksi', render: (r) => data.membership.role === 'owner' && r.status === 'pending' ? <div className="row-actions"><Button className="small good" onClick={() => onResolve(r.id, true)}><CheckCircle2 size={14} />Setujui</Button><Button className="small red" onClick={() => onResolve(r.id, false)}><XCircle size={14} />Tolak</Button></div> : <Bell size={16} /> }
      ]} />
    </Card>

    {data.membership.role === 'owner' && <Card style={{ marginTop: 18 }}><CardHeader title="Kelola Admin" subtitle="Tambah admin absensi dan ubah status aktif/nonaktif." action={<Button className="small primary" onClick={() => setAdminModal(true)}><Plus size={14} />Tambah Admin</Button>} />
      <div className="admin-cards">{data.admins.map((admin) => <div className="admin-card" key={admin.user_id}><Avatar name={admin.full_name} /><div><b>{admin.full_name}</b><small>{admin.role === 'owner' ? 'Owner' : 'Admin Absensi'}</small></div><StatusBadge status={admin.is_active ? 'aktif' : 'nonaktif'} />{admin.role === 'owner' ? <span /> : <Button className="small" onClick={() => onSetAdmin(admin.user_id, !admin.is_active)}>{admin.is_active ? 'Nonaktifkan' : 'Aktifkan'}</Button>}</div>)}</div>
      {data.admins.length === 0 && <p className="muted-caption">Belum ada data admin.</p>}
    </Card>}
    {adminModal && <AdminModal onClose={() => setAdminModal(false)} onSave={async (payload) => { await onCreateAdmin(payload); setAdminModal(false); }} />}
  </div>;
}

function AdminModal({ onClose, onSave }: { onClose: () => void; onSave: (payload: { fullName: string; email: string; password: string }) => Promise<void> }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  return <Modal title="Tambah Admin Absensi" onClose={onClose} actions={<><Button onClick={onClose}>Batal</Button><Button className="primary" disabled={!fullName.trim() || !email.trim() || password.length < 6} onClick={() => onSave({ fullName, email, password })}><UsersRound size={16} />Buat Admin</Button></>}>
    <div className="form-grid"><div className="field"><label>Nama Admin</label><input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} /></div><div className="field"><label>Email</label><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div><div className="field full"><label>Password Awal</label><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div><div className="field full"><div className="warning-box">Tambah admin memakai Edge Function <b>manage-admin</b> agar aman. Deploy folder supabase/functions/manage-admin satu kali ke project database yang sama, lalu tombol ini langsung aktif.</div></div></div>
  </Modal>;
}
