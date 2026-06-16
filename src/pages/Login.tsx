import { useState } from 'react';
import { ArrowRight, Lock, Mail } from 'lucide-react';
import { Button } from '../components/ui';

function toast(message: string, kind: 'success' | 'error' = 'error') {
  window.dispatchEvent(new CustomEvent('app-toast', { detail: { message, kind } }));
}

export function LoginPage({ configured, onLogin, onGoogle }: { configured: boolean; onLogin: (email: string, password: string) => Promise<void>; onGoogle: () => Promise<void> }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    const cleanEmail = email.trim();
    if (!cleanEmail) return toast('Email wajib diisi.');
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) return toast('Format email tidak valid.');
    if (password.length < 8) return toast('Password minimal 8 karakter.');
    setLoading(true);
    try {
      await onLogin(cleanEmail, password);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Login gagal.');
    } finally {
      setLoading(false);
    }
  };
  return <div className="login-page">
    <div className="login-hero">
      <div className="brand"><img src="/logo.png" alt="Rizki Jaya" /><span>Rizki Jaya App</span></div>
      <div><h1>Kelola absensi, gaji, transport, dan laporan dalam satu dashboard.</h1><p>Web production ini memakai data operasional yang sama dengan aplikasi mobile. Tidak ada data tiruan di halaman kerja.</p></div>
      <p style={{ fontSize: 13 }}>© 2024 Rizki Jaya App</p>
    </div>
    <div className="login-panel">
      <div className="brand"><img src="/logo.png" alt="Rizki Jaya" /><span>Rizki Jaya App</span></div>
      <h2 style={{ margin: '0 0 8px', fontWeight: 500, fontSize: 28 }}>Login</h2>
      <p style={{ color: 'var(--muted)', margin: '0 0 24px' }}>Masuk sesuai akun Owner atau Admin Absensi.</p>
      {!configured && <div className="config-warning">Koneksi aplikasi belum diatur. Isi environment variable lalu deploy ulang.</div>}
      <label className="field"><span>Email</span><div style={{ position: 'relative' }}><Mail size={19} style={{ position: 'absolute', left: 14, top: 12, color: 'var(--muted)' }} /><input className="input" style={{ width: '100%', paddingLeft: 44 }} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="owner@rizkijaya.com" autoComplete="email" /></div></label>
      <div style={{ height: 12 }} />
      <label className="field"><span>Password</span><div style={{ position: 'relative' }}><Lock size={19} style={{ position: 'absolute', left: 14, top: 12, color: 'var(--muted)' }} /><input className="input" style={{ width: '100%', paddingLeft: 44 }} value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="••••••••" autoComplete="current-password" onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }} /></div></label>
      <div style={{ height: 18 }} />
      <Button className="primary" disabled={!configured || loading} onClick={submit}>Login <ArrowRight size={19} /></Button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0', color: 'var(--muted)' }}><span style={{ height: 1, background: 'var(--border)', flex: 1 }} /><span>atau</span><span style={{ height: 1, background: 'var(--border)', flex: 1 }} /></div>
      <Button disabled={!configured} onClick={onGoogle}>Login dengan Google</Button>
    </div>
  </div>;
}
