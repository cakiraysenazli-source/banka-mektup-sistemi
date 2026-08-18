import { defineConfig } from 'vite';

// Geliştirme sırasında /api isteklerini yerel kayıt servisine yönlendirir.
export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:3001'
    }
  }
});
