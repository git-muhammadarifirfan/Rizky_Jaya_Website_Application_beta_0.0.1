import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ['recharts'],
          export: ['xlsx', 'jspdf', 'jspdf-autotable', 'html2canvas'],
          vendor: ['react', 'react-dom', '@supabase/supabase-js']
        }
      }
    }
  }
});
