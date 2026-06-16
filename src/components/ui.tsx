import { useEffect, useState, type ButtonHTMLAttributes, type HTMLAttributes, type MouseEvent, type ReactNode } from 'react';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, ImageOff, Loader2, X } from 'lucide-react';
import { statusLabel } from '../lib/format';
import { client } from '../lib/supabase';

function notifyError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Aksi gagal diproses.';
  window.dispatchEvent(new CustomEvent('app-toast', { detail: { message, kind: 'error' } }));
}

function isPromise(value: unknown): value is Promise<unknown> {
  return Boolean(value && typeof (value as Promise<unknown>).then === 'function');
}

export function Card({ children, className, ...props }: HTMLAttributes<HTMLElement> & { children: ReactNode; className?: string }) {
  return <section className={clsx('card', className)} {...props}>{children}</section>;
}

export function CardHeader({ title, action, subtitle }: { title: string; subtitle?: string; action?: ReactNode }) {
  return <div className="card-header"><div><h3 className="card-title">{title}</h3>{subtitle && <p className="card-subtitle">{subtitle}</p>}</div>{action}</div>;
}

export function Button({ children, className, onClick, disabled, type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const [busy, setBusy] = useState(false);
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (!onClick) return;
    const result = onClick(event);
    if (isPromise(result)) {
      setBusy(true);
      result.catch(notifyError).finally(() => setBusy(false));
    }
  };
  return <button className={clsx('btn', className)} type={type} disabled={disabled || busy} aria-busy={busy} onClick={handleClick} {...props}>{busy && <Loader2 className="spin" size={15} />}{children}</button>;
}

export function IconButton({ children, className, onClick, disabled, type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const [busy, setBusy] = useState(false);
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (!onClick) return;
    const result = onClick(event);
    if (isPromise(result)) {
      setBusy(true);
      result.catch(notifyError).finally(() => setBusy(false));
    }
  };
  return <button className={clsx('icon-button', className)} type={type} disabled={disabled || busy} aria-busy={busy} onClick={handleClick} {...props}>{busy ? <Loader2 className="spin" size={18} /> : children}</button>;
}

export function MetricCard({ icon, label, value, sub, color = 'teal', trend, down }: { icon: ReactNode; label: string; value: ReactNode; sub?: string; color?: 'teal' | 'green' | 'orange' | 'blue' | 'purple' | 'red'; trend?: string; down?: boolean }) {
  return <Card className="metric-card">
    <div className={clsx('metric-icon', color)}>{icon}</div>
    <div className="metric-body">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      {sub && <div className="metric-sub">{sub}</div>}
    </div>
    {trend && <div className={clsx('metric-trend', down && 'down')}><b>{down ? <ArrowDown size={12} /> : <ArrowUp size={12} />}{trend}</b><br /><span>vs kemarin</span></div>}
  </Card>;
}

export function StatusBadge({ status }: { status?: string | null }) {
  const normalized = (status || 'belum').toLowerCase().replace(/\s+/g, '_');
  return <span className={clsx('status', normalized)}>{statusLabel(normalized)}</span>;
}

export function Avatar({ name, src, size = 38 }: { name?: string | null; src?: string | null; size?: number }) {
  const initials = (name || 'RJ').split(' ').filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return <span className="avatar" style={{ width: size, height: size, fontSize: Math.max(10, size * .32) }}>{src ? <img src={src} alt={name || 'avatar'} /> : initials}</span>;
}

export function DataTable<T>({ columns, rows, keyOf, empty = 'Tidak ada data.' }: { columns: { title: string; render: (row: T, index: number) => ReactNode; width?: string; align?: 'left' | 'center' | 'right' }[]; rows: T[]; keyOf: (row: T, index: number) => string; empty?: string }) {
  return <div className="table-wrap"><table className="data-table"><thead><tr>{columns.map((col) => <th key={col.title} style={{ width: col.width, textAlign: col.align || 'left' }}>{col.title}</th>)}</tr></thead><tbody>{rows.length === 0 ? <tr><td colSpan={columns.length}><EmptyState title={empty} /></td></tr> : rows.map((row, index) => <tr key={keyOf(row, index)}>{columns.map((col) => <td key={col.title} style={{ textAlign: col.align || 'left' }}>{col.render(row, index)}</td>)}</tr>)}</tbody></table></div>;
}

export function Modal({ title, children, actions, onClose, wide }: { title: string; children: ReactNode; actions?: ReactNode; onClose: () => void; wide?: boolean }) {
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <div className={clsx('modal', wide && 'wide')} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-head"><h3>{title}</h3><IconButton onClick={onClose}><X size={20} /></IconButton></div>
      <div className="modal-body">{children}</div>
      {actions && <div className="modal-actions">{actions}</div>}
    </div>
  </div>;
}

export function ConfirmDialog({ title, message, confirmLabel = 'Ya, lanjutkan', cancelLabel = 'Batal', danger, onConfirm, onClose }: { title: string; message: ReactNode; confirmLabel?: string; cancelLabel?: string; danger?: boolean; onConfirm: () => Promise<void> | void; onClose: () => void }) {
  return <Modal title={title} onClose={onClose} actions={<><Button onClick={onClose}>{cancelLabel}</Button><Button className={danger ? 'red' : 'primary'} onClick={async () => { await onConfirm(); onClose(); }}>{confirmLabel}</Button></>}>
    <div className={danger ? 'confirm-panel danger' : 'confirm-panel'}>
      <div className="confirm-icon">!</div>
      <div><b>{title}</b><p>{message}</p></div>
    </div>
  </Modal>;
}

export function EmptyState({ title, text }: { title: string; text?: string }) {
  return <div className="empty-state"><b>{title}</b>{text && <p>{text}</p>}</div>;
}

export function Field({ label, children, full }: { label: string; children: ReactNode; full?: boolean }) {
  return <label className={clsx('field', full && 'full')}><span>{label}</span>{children}</label>;
}

export function NameCell({ name, sub, src }: { name?: string | null; sub?: string | null; src?: string | null }) {
  return <span className="name-cell"><Avatar name={name || ''} src={src} /><span><b>{name || '-'}</b>{sub && <small>{sub}</small>}</span></span>;
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (value: T) => void; options: { value: T; label: string; icon?: ReactNode }[] }) {
  return <div className="tabs">{options.map((option) => <button type="button" key={option.value} className={clsx('tab', value === option.value && 'active')} onClick={() => onChange(option.value)}>{option.icon}{option.label}</button>)}</div>;
}

/**
 * Renders private Supabase Storage documents with a short signed URL.
 * The component degrades into a clear status box when the path is empty or inaccessible.
 */
export function StorageImagePreview({ bucket, path, label = 'Preview dokumen', emptyText = 'Tidak ada foto' }: { bucket: string; path?: string | null; label?: string; emptyText?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setUrl(null);
    setError(null);
    if (!path) return;
    if (!client) {
      setError('Koneksi storage belum dikonfigurasi.');
      return;
    }
    void client.storage.from(bucket).createSignedUrl(path, 15 * 60).then(({ data, error: storageError }) => {
      if (!active) return;
      if (storageError || !data?.signedUrl) {
        setError('Foto tidak bisa dibuka dari storage.');
        return;
      }
      setUrl(data.signedUrl);
    });
    return () => { active = false; };
  }, [bucket, path]);

  if (!path) return <div className="document-preview empty"><ImageOff size={28} /><b>{emptyText}</b><span>Belum ada file yang tersimpan.</span></div>;
  if (error) return <div className="document-preview empty"><ImageOff size={28} /><b>{error}</b><span>Periksa policy bucket atau path file.</span></div>;
  if (!url) return <div className="document-preview loading"><Loader2 className="spin" size={24} /><b>Memuat foto...</b></div>;
  return <a className="document-preview image" href={url} target="_blank" rel="noreferrer" title="Buka gambar penuh"><img src={url} alt={label} /><span>{label}</span></a>;
}

export function AppBootLoader() {
  // UX: Loader refresh dibuat sederhana agar halaman tidak flicker sebelum sesi Supabase selesai dicek.
  return <div className="boot-loader" role="status" aria-live="polite">
    <div className="boot-simple">
      <div className="boot-title">Loading</div>
      <div className="loading-dots" aria-hidden="true"><span /><span /><span /></div>
    </div>
  </div>;
}

export function PageSkeleton() {
  return <div className="content"><div className="skeleton-head"><div className="skeleton-line w-30" /><div className="skeleton-line w-45" /></div><div className="grid metrics"><SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard /></div><div className="grid two" style={{ marginTop: 18 }}><SkeletonPanel /><SkeletonPanel /></div></div>;
}

function SkeletonCard() { return <div className="card skeleton-card"><span className="skeleton-dot" /><div className="skeleton-line w-60" /><div className="skeleton-line w-40" /></div>; }
function SkeletonPanel() { return <div className="card skeleton-panel"><div className="skeleton-line w-40" /><div className="skeleton-chart" /></div>; }
