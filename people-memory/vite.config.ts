import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// 本番ビルドのみ CSP を付与（開発サーバーは HMR のため inline script / ws が必要）
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob: mediastream:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

function cspPlugin(): Plugin {
  return {
    name: 'people-memory-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<!--CSP-->',
        `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  const preview = mode === 'artifact';
  return {
  // 相対パスで出力し、任意の静的HTTPSホスティング（サブディレクトリ含む）で動かす
  base: './',
  // artifact モード: claude.ai Artifact 上での画面確認用（SW・CSP・顔モデルなし）
  ...(preview ? { publicDir: false as const, esbuild: { charset: 'ascii' as const } } : {}),
  plugins: [
    react(),
    ...(preview ? [] : [cspPlugin()]),
    VitePWA({
      disable: preview,
      registerType: 'prompt',
      injectRegister: false,
      manifest: false, // public/manifest.webmanifest を使う
      workbox: {
        // アプリシェルと顔モデルのみをキャッシュ。CSV・顔情報は IndexedDB にのみ保存しキャッシュへ入れない。
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}', 'models/*.{json,bin}'],
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [],
      },
    }),
  ],
  build: {
    target: 'es2022',
    outDir: preview ? 'dist-artifact' : 'dist',
    chunkSizeWarningLimit: 4000,
  },
  test: {
    environment: 'node',
    setupFiles: ['src/tests/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
  };
});
