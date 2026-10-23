import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const target = process.env.API_PROXY_TARGET ?? 'http://localhost:8000';

export default defineConfig(({ command, mode }) => {
  // Public builds (Vercel) must not embed an API key: VITE_* values are readable by anyone.
  // .env.development is not loaded for `vite build`; this catches .env.local / CI env leaks.
  if (command === 'build') {
    const key = loadEnv(mode, process.cwd(), 'VITE_').VITE_API_KEY;
    if (key && process.env.ALLOW_API_KEY_IN_BUNDLE !== '1') {
      throw new Error(
        'VITE_API_KEY is set for a production build. Public builds must not embed a key. ' +
          'Unset it (check .env.local and your CI/Vercel env), or set ALLOW_API_KEY_IN_BUNDLE=1 for a private build.',
      );
    }
  }
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
    preview: {
      port: 5173,
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
    build: {
      target: 'es2020',
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            motion: ['framer-motion'],
            charts: ['recharts'],
          },
        },
      },
    },
  };
});
