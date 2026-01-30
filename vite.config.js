import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync, existsSync, cpSync } from 'fs';
import { join } from 'path';

// 判断是否是生产构建
const isProduction = process.env.NODE_ENV === 'production' || !process.env.TAURI_DEBUG;

export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: ['es2021', 'chrome100', 'safari13'],
    minify: isProduction ? 'esbuild' : false,
    sourcemap: !isProduction,
    // 使用 esbuild 的 drop 选项（虽然可能不够彻底，但作为第一层防护）
    esbuild: isProduction ? {
      drop: ['console', 'debugger'],
      legalComments: 'none',
    } : undefined,
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
    // 在生产构建时移除 console 语句的自定义插件
    // 在 generateBundle 阶段处理最终打包后的代码，确保所有 console 都被移除
    ...(isProduction ? [{
      name: 'remove-console',
      generateBundle(options, bundle) {
        // 处理所有生成的 JS 文件
        Object.keys(bundle).forEach(fileName => {
          const file = bundle[fileName];
          if (file.type === 'chunk' && file.code) {
            // 移除所有 console 语句（包括各种格式）
            // 使用更强大的正则表达式，处理：
            // 1. 单行 console 语句
            // 2. 多行 console 语句（通过匹配括号对）
            // 3. 模板字符串中的 console
            // 4. 条件语句中的 console
            
            let code = file.code;
            let changed = false;
            
            // 移除所有 console 语句
            // 由于代码已经经过压缩，console 语句通常在一行内
            // 使用简单的正则表达式匹配并移除
            const consoleMethods = ['log', 'warn', 'error', 'debug', 'info', 'trace', 'table', 
              'group', 'groupEnd', 'time', 'timeEnd', 'assert', 'clear', 'count', 'countReset', 
              'dir', 'dirxml', 'profile', 'profileEnd'];
            
            // 多次替换直到没有更多匹配
            let previousCode;
            let iterations = 0;
            const maxIterations = 10; // 防止无限循环
            
            do {
              previousCode = code;
              
              // 对每个 console 方法进行匹配和移除
              // 匹配模式：console.method(任意内容，可能包含括号、引号等);
              for (const method of consoleMethods) {
                // 简单模式：匹配到下一个分号或换行
                code = code.replace(
                  new RegExp(`console\\.${method}\\s*\\([^;\\n]*\\)\\s*;?`, 'g'),
                  ''
                );
                // 处理可能的多参数情况（匹配到闭合括号）
                code = code.replace(
                  new RegExp(`console\\.${method}\\s*\\([^)]*\\)\\s*;?`, 'g'),
                  ''
                );
              }
              
              iterations++;
            } while (code !== previousCode && iterations < maxIterations);
            
            // 移除可能残留的空行和多余的分号
            code = code.replace(/;\s*;/g, ';');
            code = code.replace(/\n\s*\n\s*\n/g, '\n\n');
            
            if (code !== file.code) {
              file.code = code;
              changed = true;
            }
            
            if (changed) {
              // 更新 source map（如果有）
              if (file.map) {
                // 简单处理：保持 source map 但标记已修改
                file.map.sourcesContent = file.map.sourcesContent || [];
              }
            }
          }
        });
      },
    }] : []),
    {
      name: 'copy-static-assets',
      // Vite 在 build 开始时会清空 dist。
      // 所以必须在 bundle 输出后再拷贝静态资源，否则会出现"部分 svg/图标打包后不显示"。
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
