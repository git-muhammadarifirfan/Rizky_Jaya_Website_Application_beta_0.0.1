import { useMemo, useState } from 'react';
import { Download, FileText, Plus, Search, Trash2 } from 'lucide-react';
import type { AppData, ProductPrice } from '../types';
import { PageHeader } from '../components/Shell';
import { Button, Card, CardHeader, ConfirmDialog, DataTable, Modal, StatusBadge } from '../components/ui';
import { rupiah } from '../lib/date';
import { downloadExcel, downloadPdfTable } from '../lib/export';

// Katalog harga disamakan dengan Android: Owner tambah/edit/hapus/aktif-nonaktif,
// Admin hanya membaca dan melakukan export sesuai hak akses database.
export function CatalogPage({
  data,
  onSave,
  onToggle,
  onDelete
}: {
  data: AppData;
  onSave: (p: Partial<ProductPrice>) => Promise<void>;
  onToggle: (id: string, active: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState<Partial<ProductPrice> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProductPrice | null>(null);
  const [search, setSearch] = useState('');
  const isOwner = data.membership.role === 'owner';

  const products = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return data.products;
    return data.products.filter((product) =>
      product.product_name.toLowerCase().includes(term) ||
      product.product_code.toLowerCase().includes(term)
    );
  }, [data.products, search]);

  const exportRows = products.map((p, index) => ({
    No: index + 1,
    Kode_Barang: p.product_code || '-',
    Nama_Barang: p.product_name,
    Harga_Beli: rupiah(p.purchase_price),
    Harga_Jual_Khusus: rupiah(p.special_sale_price),
    Harga_Jual_Toko: rupiah(p.store_sale_price),
    Harga_Ecer: rupiah(p.retail_sale_price),
    Status: p.is_active ? 'Aktif' : 'Nonaktif',
    Catatan: p.notes || '-'
  }));

  const requestDelete = (product: ProductPrice) => setDeleteTarget(product);

  return <div className="content">
    <PageHeader
      title="Daftar Harga Barang"
      subtitle="Katalog harga barang tersinkron dengan aplikasi Android"
      actions={<>
        <Button onClick={() => downloadExcel('daftar-harga-barang', exportRows)}><Download size={18} />Excel</Button>
        <Button onClick={() => downloadPdfTable('Daftar Harga Barang', exportRows)}><FileText size={18} />PDF</Button>
        {isOwner && <Button className="primary" onClick={() => setEditing({ is_active: true, purchase_price: 0, special_sale_price: 0, store_sale_price: 0, retail_sale_price: 0 })}><Plus size={18} />Tambah Barang</Button>}
      </>}
    />

    <Card className="catalog-card">
      <CardHeader
        title="Katalog"
        subtitle={`${products.length} barang ditemukan`}
        action={<label className="search-box catalog-search"><Search size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama atau kode barang..." /></label>}
      />

      <div className="catalog-list">
        {products.length === 0 ? <div className="empty-state"><b>Belum ada harga barang</b><p>{isOwner ? 'Tekan Tambah Barang untuk membuat katalog.' : 'Owner belum mengisi katalog harga.'}</p></div> : products.map((product, index) => (
          <ProductCard
            key={product.id}
            index={index + 1}
            product={product}
            canEdit={isOwner}
            onEdit={() => setEditing(product)}
            onToggle={() => onToggle(product.id, !product.is_active)}
            onDelete={() => requestDelete(product)}
          />
        ))}
      </div>

      <div className="catalog-table">
        <DataTable rows={products} keyOf={(r) => r.id} columns={[
          { title: 'No', width: '60px', render: (_r, i) => i + 1 },
          { title: 'Nama Barang', render: (r) => <span className="table-title">{r.product_name}</span> },
          { title: 'Kode', render: (r) => r.product_code || '-' },
          { title: 'Harga Beli', render: (r) => rupiah(r.purchase_price) },
          { title: 'Khusus', render: (r) => rupiah(r.special_sale_price) },
          { title: 'Toko', render: (r) => rupiah(r.store_sale_price) },
          { title: 'Ecer', render: (r) => rupiah(r.retail_sale_price) },
          { title: 'Status', render: (r) => <StatusBadge status={r.is_active ? 'aktif' : 'nonaktif'} /> },
          { title: 'Aksi', render: (r) => isOwner ? <div className="row-actions"><Button className="small" onClick={() => setEditing(r)}>Edit</Button><Button className="small" onClick={() => onToggle(r.id, !r.is_active)}>{r.is_active ? 'Nonaktifkan' : 'Aktifkan'}</Button><Button className="small red" onClick={() => requestDelete(r)}><Trash2 size={14} />Hapus</Button></div> : '-' }
        ]} />
      </div>
    </Card>

    {editing && <ProductModal initial={editing} onClose={() => setEditing(null)} onSave={async (p) => { await onSave(p); setEditing(null); }} />}
    {deleteTarget && <ConfirmDialog danger title="Hapus barang?" message={<>Barang <b>{deleteTarget.product_name}</b> akan dihapus dari katalog. Aksi ini tidak bisa dibatalkan dari halaman web.</>} confirmLabel="Ya, hapus" onConfirm={() => onDelete(deleteTarget.id)} onClose={() => setDeleteTarget(null)} />}
  </div>;
}

function ProductCard({ index, product, canEdit, onEdit, onToggle, onDelete }: { index: number; product: ProductPrice; canEdit: boolean; onEdit: () => void; onToggle: () => Promise<void>; onDelete: () => Promise<void> | void }) {
  return <div className="product-card">
    <div className="product-head">
      <span className="product-number">{index}</span>
      <div className="product-title"><b>{product.product_name}</b><small>Kode: {product.product_code || '-'}</small></div>
      <StatusBadge status={product.is_active ? 'aktif' : 'nonaktif'} />
    </div>
    <div className="price-grid">
      <PriceBox label="Harga Beli" value={rupiah(product.purchase_price)} />
      <PriceBox label="Jual Khusus" value={rupiah(product.special_sale_price)} />
      <PriceBox label="Jual Toko" value={rupiah(product.store_sale_price)} />
      <PriceBox label="Ecer / Konsumen" value={rupiah(product.retail_sale_price)} highlight />
    </div>
    {product.notes && <p className="product-notes">{product.notes}</p>}
    {canEdit && <div className="product-actions"><Button className="small" onClick={onEdit}>Edit Harga</Button><Button className="small" onClick={onToggle}>{product.is_active ? 'Nonaktifkan' : 'Aktifkan'}</Button><Button className="small red" onClick={onDelete}><Trash2 size={14} />Hapus</Button></div>}
  </div>;
}

function PriceBox({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return <div className={highlight ? 'price-box highlight' : 'price-box'}><small>{label}</small><b>{value}</b></div>;
}

function ProductModal({ initial, onClose, onSave }: { initial: Partial<ProductPrice>; onClose: () => void; onSave: (p: Partial<ProductPrice>) => Promise<void> }) {
  const [form, setForm] = useState<Partial<ProductPrice>>(initial);
  const set = (key: keyof ProductPrice, value: string | number | boolean | null) => setForm((current) => ({ ...current, [key]: value }));

  return <Modal
    title={form.id ? 'Edit Harga Barang' : 'Tambah Harga Barang'}
    onClose={onClose}
    actions={<><Button onClick={onClose}>Batal</Button><Button className="primary" onClick={() => onSave(form)}>Simpan Harga</Button></>}
  >
    <div className="form-grid">
      <div className="field"><label>Nama Barang</label><input className="input" value={form.product_name || ''} onChange={(e) => set('product_name', e.target.value)} placeholder="Contoh: Beras Premium" /></div>
      <div className="field"><label>Kode Barang</label><input className="input" value={form.product_code || ''} onChange={(e) => set('product_code', e.target.value.toUpperCase())} placeholder="Contoh: BRS-001" /></div>
      <div className="field"><label>Harga Beli</label><input className="input" type="number" min="0" value={form.purchase_price ?? 0} onChange={(e) => set('purchase_price', Number(e.target.value))} /></div>
      <div className="field"><label>Harga Jual Khusus</label><input className="input" type="number" min="0" value={form.special_sale_price ?? 0} onChange={(e) => set('special_sale_price', Number(e.target.value))} /></div>
      <div className="field"><label>Harga Jual Toko</label><input className="input" type="number" min="0" value={form.store_sale_price ?? 0} onChange={(e) => set('store_sale_price', Number(e.target.value))} /></div>
      <div className="field"><label>Harga Ecer / Konsumen Akhir</label><input className="input" type="number" min="0" value={form.retail_sale_price ?? 0} onChange={(e) => set('retail_sale_price', Number(e.target.value))} /></div>
      <div className="field full"><label>Catatan</label><textarea className="textarea" value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} placeholder="Opsional" /></div>
    </div>
  </Modal>;
}
