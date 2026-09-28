import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Capacitor loads the built bundle from a `file://`/`capacitor://` origin on
// the device, not a server root — relative asset paths are required, or the
// WebView requests `/assets/...` against nothing and gets a blank screen.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
