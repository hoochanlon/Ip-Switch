import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: ['es2021', 'chrome100', 'safari13'],
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
    rollupOptions: {
      output: {
        // 确保字体文件被复制到 dist 目录
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.ttf')) {
            return 'fonts/[name][extname]';
          }
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
  },
  plugins: [
    {
      name: 'copy-fonts',
      buildStart() {
        // 在构建开始时复制字体文件
        const fontSource = join(process.cwd(), 'fonts', 'OPPOSans4.0.ttf');
        const fontDest = join(process.cwd(), 'dist', 'fonts', 'OPPOSans4.0.ttf');
        
        if (existsSync(fontSource)) {
          mkdirSync(join(process.cwd(), 'dist', 'fonts'), { recursive: true });
          copyFileSync(fontSource, fontDest);
        }
      },
    },
  ],
});
