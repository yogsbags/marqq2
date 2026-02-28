import path from 'path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const backendPort = process.env.BACKEND_PORT || process.env.VITE_BACKEND_PORT || '3008';
const backendTarget = `http://localhost:${backendPort}`;

export default defineConfig({
  root: path.resolve(__dirname, 'app'),
  envDir: __dirname,  // load .env from martech/ root, not app/
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
  plugins: [react()],
  server: {
    port: 3007,
    host: true,
    proxy: {
      // Proxy API requests to the Enhanced Bulk Generator backend server
      '/api/workflow': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
      },
      '/api/convert': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
      },
      // Proxy API requests to the backend-server.js API
      '/api/workflow/social-media': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
      },
      '/api/avatars': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
      },
          '/api/health/social-media': {
            target: backendTarget,
            changeOrigin: true,
            secure: false,
          },
          '/api/topic/generate': {
            target: backendTarget,
            changeOrigin: true,
            secure: false,
          },
      // Proxy API requests to the backend-server.js video endpoints
      '/api/video-gen': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
      },
      // Proxy GTM strategy endpoints
      '/api/gtm': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
      },
      // Proxy Positioning & Messaging endpoints
      '/api/positioning': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
      },
      // Proxy Sales Enablement endpoints
      '/api/sales-enablement': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
      },
      // Proxy Pricing Intelligence endpoints
      '/api/pricing-intelligence': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
      },
      // Proxy Budget Optimization endpoints
      '/api/budget-optimization': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
      },
      // Proxy integration auth/settings endpoints
      '/api/integrations': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
      },
      // Proxy Company Intelligence endpoints
      '/api/company-intel': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
      },
      '/api/workspaces': { target: 'http://localhost:3008', changeOrigin: true },
      // Catch-all: forward any /api/* not matched above to the backend
      '/api': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './app/src'),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
