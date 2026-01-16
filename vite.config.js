import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0', // Allow access from network
    open: false // Don't auto-open browser
  },
  resolve: {
    // Ensure bare module specifiers are resolved
    preserveSymlinks: false
  },
  optimizeDeps: {
    // Pre-bundle these dependencies
    include: ['three', 'cannon-es']
  }
});

