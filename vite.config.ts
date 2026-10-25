import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Tauri expects a fixed dev port, and its CLI forwards the dev server output.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1422,
    strictPort: true,
    host: '127.0.0.1',
    watch: {
      // Rust side is rebuilt by the Tauri CLI, not Vite.
      ignored: ['**/src-tauri/**'],
    },
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: 'es2022',
    // Keep the shell small: heavy editor kernels are dynamic imports.
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('mermaid') || id.includes('cytoscape') || id.includes('d3-')) return 'mermaid';
          if (id.includes('katex')) return 'katex';
          if (id.includes('highlight.js')) return 'highlight';
          if (id.includes('@milkdown') || id.includes('prosemirror')) return 'milkdown';
          if (id.includes('@codemirror') || id.includes('@lezer')) return 'codemirror';
          if (id.includes('react')) return 'react';
        },
      },
    },
  },
});
