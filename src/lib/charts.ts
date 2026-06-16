import type { ReactNode } from 'react';
import { idr } from './format';

export const chartColors = ['#0799a0', '#ff7315', '#2563eb', '#7457f5', '#1ba762', '#f5a400'];

export function moneyAxis(value: number | string) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount === 0) return '0';
  if (Math.abs(amount) >= 1_000_000_000) return `${Number(amount / 1_000_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} M`;
  if (Math.abs(amount) >= 1_000_000) return `${Number(amount / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`;
  if (Math.abs(amount) >= 1_000) return `${Number(amount / 1_000).toLocaleString('id-ID', { maximumFractionDigits: 0 })} rb`;
  return amount.toLocaleString('id-ID', { maximumFractionDigits: 0 });
}

export function chartDomain(values: Array<number | string>, fallback = 1_000_000): [number, number] {
  const max = Math.max(...values.map((value) => Number(value || 0)).filter(Number.isFinite), 0);
  const padded = max <= 0 ? fallback : Math.ceil(max * 1.18);
  return [0, padded];
}

export function tooltipMoney(value: unknown): [string, string] {
  return [idr(Number(value || 0)), 'Nominal'];
}

export function percent(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

export function emptyPieData(label = 'Belum ada data') {
  return [{ name: label, value: 1, __empty: true }];
}

export function normalizePieData<T extends { value: number; name: ReactNode }>(rows: T[]) {
  return rows.length > 0 && rows.some((row) => Number(row.value) > 0) ? rows : emptyPieData() as unknown as T[];
}
