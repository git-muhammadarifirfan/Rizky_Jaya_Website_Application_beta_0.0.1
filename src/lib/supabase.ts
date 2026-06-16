import { createClient, SupabaseClient } from '@supabase/supabase-js';

const backendUrl = import.meta.env.VITE_APP_BACKEND_URL as string | undefined;
const publicKey = import.meta.env.VITE_APP_PUBLIC_KEY as string | undefined;

export const isConfigured = Boolean(backendUrl && publicKey);

export const client: SupabaseClient | null = isConfigured
  ? createClient(backendUrl!, publicKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      realtime: { params: { eventsPerSecond: 8 } }
    })
  : null;

export async function currentUserId() {
  if (!client) throw new Error('Koneksi aplikasi belum dikonfigurasi.');
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error('Sesi tidak valid. Silakan login ulang.');
  return data.user.id;
}

export function asArray<T = Record<string, unknown>>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function normalizeSingle<T extends Record<string, unknown>>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] || null) as T | null;
  return (value || null) as T | null;
}
