import { useEffect, useState } from 'react';

export function ToastHost() {
  const [toast, setToast] = useState<{ message: string; kind: 'success' | 'error' } | null>(null);
  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ message: string; kind: 'success' | 'error' }>;
      setToast(custom.detail);
      window.setTimeout(() => setToast(null), 3200);
    };
    window.addEventListener('app-toast', handler);
    return () => window.removeEventListener('app-toast', handler);
  }, []);
  if (!toast) return null;
  return <div className={`toast ${toast.kind}`}>{toast.message}</div>;
}
