import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync, existsSync, cpSync } from 'fs';
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
      name: 'copy-static-assets',
      // Vite 在 build 开始时会清空 dist。
      // 所以必须在 bundle 输出后再拷贝静态资源，否则会出现“部分 svg/图标打包后不显示”。
      closeBundle() {
        const distDir = join(process.cwd(), 'dist');

        // 确保 dist 目录存在
        if (!existsSync(distDir)) {
          mkdirSync(distDir, { recursive: true });
        }

        // 1) 复制字体到 dist/fonts，给前端用
        const fontSource = join(process.cwd(), 'fonts', 'OPPOSans4.0.ttf');
        const fontDestDir = join(distDir, 'fonts');
        const fontDest = join(fontDestDir, 'OPPOSans4.0.ttf');
        if (existsSync(fontSource)) {
          mkdirSync(fontDestDir, { recursive: true });
          copyFileSync(fontSource, fontDest);
        }

        // 2) 复制 imgs 目录到 dist/imgs，保证 /imgs/... 可用
        const imgsSource = join(process.cwd(), 'imgs');
        const imgsDest = join(distDir, 'imgs');
        if (existsSync(imgsSource)) {
          cpSync(imgsSource, imgsDest, { recursive: true });
        }
      }
    },
  ],
});
