const WIB_TZ = 'Asia/Jakarta';

export function todayISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: WIB_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function monthKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: WIB_TZ, year: 'numeric', month: '2-digit' }).format(date);
}

export function monthRange(key = monthKey()) {
  const [year, month] = key.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return { start: toISO(start), end: toISO(end) };
}

export function monthDays(key = monthKey()) {
  const { start, end } = monthRange(key);
  const output: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const stop = new Date(`${end}T00:00:00Z`);
  while (cursor <= stop) {
    output.push(toISO(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return output;
}

export function addMonths(key: string, amount: number) {
  const [year, month] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function lastMonths(count = 6, anchorKey = monthKey()) {
  return Array.from({ length: count }, (_, index) => addMonths(anchorKey, index - count + 1));
}

export function dateLong(date = new Date()) {
  return new Intl.DateTimeFormat('id-ID', { timeZone: WIB_TZ, weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(date);
}

export function dateShort(value?: string | Date | null) {
  if (!value) return '-';
  const date = typeof value === 'string' ? new Date(value.length <= 10 ? `${value}T00:00:00Z` : value) : value;
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

export function timeWib(value = new Date()) {
  return new Intl.DateTimeFormat('id-ID', { timeZone: WIB_TZ, hour: '2-digit', minute: '2-digit' }).format(value) + ' WIB';
}

export function monthLabel(key: string, short = true) {
  const [year, month] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));
  return new Intl.DateTimeFormat('id-ID', { month: short ? 'short' : 'long', year: short ? undefined : 'numeric' }).format(date);
}

export function toISO(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function rupiah(value?: number | string | null) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount).replace('IDR', 'Rp');
}

export function readableMonth(key = monthKey()) {
  return monthLabel(key, false);
}
