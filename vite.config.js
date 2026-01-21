import { defineConfig } from 'vite';

export default defineConfig(({ command }) => {
  // Base path for GitHub Pages (only used in production builds)
  // For repository: username.github.io/repo-name, use base: '/repo-name/'
  // For repository: username.github.io (user site), use base: '/'
  // In development (serve), base is '/' (no subpath)
  // In production (build), base is '/peggled/' for GitHub Pages
  const base = command === 'build' ? '/peggled/' : '/';
  
  // Generate build timestamp (date and time down to minutes)
  const now = new Date();
  const buildTimestamp = now.toISOString().slice(0, 16).replace('T', ' '); // Format: YYYY-MM-DD HH:MM
  
  return {
    base,
    
    define: {
      // Inject build timestamp as a constant
      __BUILD_TIMESTAMP__: JSON.stringify(buildTimestamp)
    },
    
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
    },
    
    build: {
      // Output directory for production build
      outDir: 'dist',
      // Generate source maps for debugging
      sourcemap: false
    }
  };
});

