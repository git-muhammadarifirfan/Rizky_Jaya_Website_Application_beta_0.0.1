import type { AttendanceRecord, AttendanceStatus, Employee, PayrollSlip, QuickMarker, TransportJob } from '../types';

export function idr(value?: number | string | null, compact = false) {
  const amount = Number(value || 0);
  if (compact && Math.abs(amount) >= 1_000_000) return `Rp ${(amount / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`;
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount).replace('IDR', 'Rp');
}

export function number(value?: number | string | null, max = 0) {
  return Number(value || 0).toLocaleString('id-ID', { maximumFractionDigits: max });
}

export function cleanNumber(value: FormDataEntryValue | string | number | null | undefined) {
  const raw = String(value ?? '').replace(/[^0-9.,-]/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function statusLabel(status?: string | null) {
  const map: Record<string, string> = {
    belum: 'Belum Absen', hadir: 'Hadir', terlambat: 'Terlambat', izin: 'Izin', sakit: 'Sakit', libur: 'Libur', tidak_hadir: 'Tidak Hadir',
    draft: 'Draft', siap_dibayar: 'Siap Dibayar', dibayar: 'Dibayar', dibatalkan: 'Dibatalkan', pending: 'Menunggu', approved: 'Disetujui', rejected: 'Ditolak',
    berjalan: 'Berjalan', selesai: 'Selesai', aktif: 'Aktif', nonaktif: 'Nonaktif', harian: 'Harian', bulanan: 'Bulanan', borongan: 'Borongan', masuk: 'Masuk', setengah_hari: 'Setengah Hari', masuk_ambil_gaji: 'Masuk Ambil Gaji', tidak_masuk: 'Tidak Masuk', tidak_masuk_ambil_gaji: 'Tidak Masuk Ambil Gaji'
  };
  return map[String(status || '').toLowerCase()] || status || '-';
}

export function salaryLabel(employee?: Pick<Employee, 'salary_type'> | null) {
  return statusLabel(employee?.salary_type || 'harian');
}

export function quickCode(record?: AttendanceRecord | null): QuickMarker | undefined {
  if (!record) return undefined;
  if (record.quick_marker) return record.quick_marker;
  if (record.status === 'tidak_hadir') return 'tidak_masuk';
  if ((record.attendance_fraction || 1) <= 0.5 && (record.status === 'hadir' || record.status === 'terlambat')) return 'setengah_hari';
  if ((record.status === 'hadir' || record.status === 'terlambat') && record.paid_at) return 'masuk_ambil_gaji';
  if (record.status === 'hadir' || record.status === 'terlambat') return 'masuk';
  return undefined;
}

export function quickGlyph(record?: AttendanceRecord | null) {
  const code = quickCode(record);
  if (code === 'masuk') return '✖';
  if (code === 'setengah_hari') return '½';
  if (code === 'masuk_ambil_gaji') return '✖';
  if (code === 'tidak_masuk' || code === 'tidak_masuk_ambil_gaji') return '—';
  if (record?.status === 'izin') return 'I';
  if (record?.status === 'sakit') return 'S';
  if (record?.status === 'libur') return 'L';
  return '';
}

export function quickClass(record?: AttendanceRecord | null) {
  const code = quickCode(record);
  if (code === 'masuk') return 'masuk';
  if (code === 'setengah_hari') return 'half';
  if (code === 'masuk_ambil_gaji') return 'paid';
  if (code === 'tidak_masuk_ambil_gaji') return 'absent-paid';
  if (code === 'tidak_masuk') return 'no';
  if (record?.status === 'izin' || record?.status === 'sakit' || record?.status === 'libur') return 'info';
  return '';
}

export function calcSlipTotal(slip?: PayrollSlip | null) {
  if (!slip) return 0;
  return Number(slip.net_amount ?? (Number(slip.base_amount || 0) + Number(slip.bonus_amount || 0) - Number(slip.deduction_amount || 0)));
}

export function attendanceStatusFromMarker(marker: QuickMarker): AttendanceStatus {
  return marker === 'tidak_masuk' || marker === 'tidak_masuk_ambil_gaji' ? 'tidak_hadir' : 'hadir';
}

export function employeeName(id: string | null | undefined, employees: Employee[]) {
  return employees.find((e) => e.id === id)?.full_name || '-';
}

export function jobVehicleLabel(job: TransportJob, vehicles: { id: string; fleet_code: string; plate_number: string }[]) {
  const vehicle = vehicles.find((v) => v.id === job.vehicle_id);
  return vehicle ? `${vehicle.fleet_code} • ${vehicle.plate_number}` : 'Nota kiriman';
}
