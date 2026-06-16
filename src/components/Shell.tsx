import { useState, type ReactNode } from 'react';
import { BarChart3, Bell, CalendarCheck2, CheckCircle2, ChevronDown, FileSpreadsheet, FileText, Home, LogOut, Menu, Settings, Truck, UserCircle2, Users, WalletCards, X, XCircle } from 'lucide-react';
import clsx from 'clsx';
import type { ChangeRequest, Membership } from '../types';
import { Avatar, Button, CardHeader, ConfirmDialog, IconButton, StatusBadge } from './ui';
import { dateLong, dateShort, timeWib } from '../lib/date';
import { statusLabel } from '../lib/format';

export type PageKey = 'dashboard' | 'employees' | 'attendance' | 'payroll' | 'transport' | 'reports' | 'catalog' | 'settings' | 'history';

const iconMap = { dashboard: Home, employees: Users, attendance: CalendarCheck2, payroll: WalletCards, transport: Truck, reports: FileText, catalog: FileSpreadsheet, settings: Settings, history: BarChart3 };

type ShellProps = {
  membership: Membership;
  page: PageKey;
  setPage: (page: PageKey) => void;
  pendingCount: number;
  requests: ChangeRequest[];
  children: ReactNode;
  onLogout: () => void;
  onResolve?: (id: string, approve: boolean, note?: string) => Promise<void>;
};

export function Shell({ membership, page, setPage, pendingCount, requests, children, onLogout, onResolve }: ShellProps) {
  const [open, setOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const nav = membership.role === 'owner'
    ? [['dashboard', 'Dashboard'], ['employees', 'Karyawan'], ['attendance', 'Absensi'], ['payroll', 'Gaji'], ['transport', 'Transport'], ['catalog', 'Daftar Harga'], ['reports', 'Laporan'], ['settings', 'Pengaturan']] as const
    : [['dashboard', 'Dashboard'], ['attendance', 'Absensi'], ['employees', 'Karyawan'], ['transport', 'Transport'], ['catalog', 'Daftar Harga'], ['history', 'Riwayat'], ['settings', 'Profil']] as const;
  const shortcuts = membership.role === 'owner'
    ? [['attendance', 'Rekap Absensi'], ['payroll', 'Kelola Gaji'], ['reports', 'Export Excel']] as const
    : [['attendance', 'Mulai Absensi'], ['transport', 'Input Trip'], ['history', 'Riwayat Koreksi']] as const;

  const sidebar = <aside className="sidebar">
    <div className="brand"><img src="/logo.png" alt="Rizki Jaya" /><span>Rizki Jaya App</span></div>
    <div className="side-section">Menu Utama</div>
    <nav className="nav-list">{nav.map(([key, label]) => <NavButton key={key} page={key} label={label} active={page === key} onClick={() => { setPage(key); setOpen(false); }} />)}</nav>
    <div className="side-section">Shortcut</div>
    <nav className="nav-list">{shortcuts.map(([key, label]) => <NavButton key={key} page={key} label={label} active={false} onClick={() => { setPage(key); setOpen(false); }} />)}</nav>
    <div className="sidebar-footer"><div className="mini-brand"><img src="/logo.png" alt="" />Rizki Jaya App</div><div>v1.4.0</div><div style={{ marginTop: 10 }}>© 2024 All rights reserved.</div></div>
  </aside>;

  const openProfilePage = () => {
    setProfileOpen(false);
    setPage('settings');
  };

  return <div className="app-shell">
    {sidebar}
    <div className={clsx('mobile-menu', open && 'open')} onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>{sidebar}</div>
    <main className="main">
      <header className="topbar">
        <IconButton className="topbar-menu" onClick={() => setOpen(true)}><Menu size={23} /></IconButton>
        <div className="topbar-right">
          <IconButton className="notif-button" onClick={() => setNotifOpen(true)} title="Buka notifikasi">
            <Bell size={21} />{pendingCount > 0 && <span className="badge-dot">{pendingCount}</span>}
          </IconButton>
          <div className="profile-wrap">
            <button type="button" className="profile-chip" onClick={() => setProfileOpen((value) => !value)} title="Menu akun">
              <Avatar name={membership.fullName} />
              <span className="profile-meta"><strong>{membership.fullName}</strong><small>{membership.role === 'owner' ? 'Owner / Toko Besar' : 'Admin Absensi'}</small></span><ChevronDown size={15} />
            </button>
            {profileOpen && <div className="profile-menu" role="menu">
              <button type="button" onClick={openProfilePage}><UserCircle2 size={17} /><span>Detail Profil</span></button>
              <button type="button" className="danger" onClick={() => { setProfileOpen(false); setConfirmLogout(true); }}><LogOut size={17} /><span>Log out</span></button>
            </div>}
          </div>
        </div>
      </header>
      {children}
    </main>
    {notifOpen && <NotificationDrawer membership={membership} requests={requests} onClose={() => setNotifOpen(false)} onOpenSettings={() => { setNotifOpen(false); setPage(membership.role === 'owner' ? 'settings' : 'history'); }} onResolve={onResolve} />}
    {confirmLogout && <ConfirmDialog danger title="Keluar dari akun?" message="Sesi login akan ditutup. Data yang sudah tersimpan tetap aman di database." confirmLabel="Ya, log out" onConfirm={onLogout} onClose={() => setConfirmLogout(false)} />}
  </div>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle: string; actions?: ReactNode }) {
  return <div className="page-head"><div className="page-title"><h1>{title}</h1><p>{subtitle}</p></div><div className="head-actions"><div className="date-pill"><CalendarCheck2 size={22} /><span><strong>{dateLong()}</strong><span>{timeWib()}</span></span></div>{actions}</div></div>;
}

function NavButton({ page, label, active, onClick }: { page: PageKey; label: string; active: boolean; onClick: () => void }) {
  const Icon = iconMap[page];
  return <button type="button" className={clsx('nav-item', active && 'active')} onClick={onClick} aria-current={active ? 'page' : undefined}><Icon />{label}<span className="nav-chevron">›</span></button>;
}

function NotificationDrawer({ membership, requests, onClose, onOpenSettings, onResolve }: { membership: Membership; requests: ChangeRequest[]; onClose: () => void; onOpenSettings: () => void; onResolve?: (id: string, approve: boolean, note?: string) => Promise<void> }) {
  const [selected, setSelected] = useState<ChangeRequest | null>(requests[0] || null);
  const pending = requests.filter((r) => r.status === 'pending');
  return <div className="notif-drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <aside className="notif-drawer" role="dialog" aria-modal="true" aria-label="Notifikasi dan approval">
      <div className="notif-drawer-head">
        <div><h3>Notifikasi</h3><p>{pending.length} pengajuan menunggu keputusan</p></div>
        <IconButton onClick={onClose}><X size={20} /></IconButton>
      </div>
      <div className="notif-drawer-body">
        <section className="notif-drawer-list">
          {requests.length === 0 ? <div className="empty-state"><b>Belum ada notifikasi</b><p>Pengajuan koreksi akan tampil otomatis di sini.</p></div> : requests.slice(0, 30).map((request) => (
            <button type="button" key={request.id} className={clsx('notif-row', selected?.id === request.id && 'active')} onClick={() => setSelected(request)}>
              <span className="notif-icon"><Bell size={16} /></span>
              <span className="notif-copy"><b>{request.reason || statusLabel(request.request_type)}</b><small>{request.requester_name || 'Sistem'} • {request.created_at ? dateShort(request.created_at.slice(0, 10)) : '-'}</small></span>
              <StatusBadge status={request.status} />
            </button>
          ))}
        </section>
        <section className="notif-drawer-detail">
          {!selected ? <div className="empty-state"><b>Pilih notifikasi</b></div> : <>
            <CardHeader title="Detail Pengajuan" subtitle={selected.request_type} action={<StatusBadge status={selected.status} />} />
            <div className="detail-stack">
              <div className="detail-line"><span>Pengaju</span><b>{selected.requester_name || '-'}</b></div>
              <div className="detail-line"><span>Tanggal</span><b>{selected.created_at ? dateShort(selected.created_at.slice(0, 10)) : '-'}</b></div>
              <div className="detail-line"><span>Isi</span><p>{selected.reason || '-'}</p></div>
              <div className="payload-box"><pre>{JSON.stringify(selected.payload || {}, null, 2)}</pre></div>
            </div>
            {membership.role === 'owner' && selected.status === 'pending' && onResolve && <div className="notif-actions">
              <Button className="good" onClick={async () => { await onResolve(selected.id, true); setSelected(null); }}><CheckCircle2 size={16} />Setujui</Button>
              <Button className="red" onClick={async () => { await onResolve(selected.id, false); setSelected(null); }}><XCircle size={16} />Tolak</Button>
            </div>}
          </>}
        </section>
      </div>
      <div className="notif-drawer-foot"><Button onClick={onOpenSettings}>Buka Halaman Detail</Button><Button className="primary" onClick={onClose}>Tutup</Button></div>
    </aside>
  </div>;
}
