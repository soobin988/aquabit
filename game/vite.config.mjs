import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// PNG가 바뀌면 브라우저에 남아 있는 이전 이미지와 다른 주소를 사용합니다.
const assetDirectory = new URL('./public/assets/', import.meta.url);
const hash = createHash('sha256');
for (const file of readdirSync(assetDirectory, { recursive: true }).filter(file => file.endsWith('.png')).sort()) {
  hash.update(file).update(readFileSync(new URL(file, assetDirectory)));
}

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/play/',
  plugins: [vue()],
  define: { __GAME_ASSET_VERSION__: JSON.stringify(hash.digest('hex').slice(0, 12)), __COMMUNITY_BUILD_VERSION__: JSON.stringify(Date.now().toString(36)) },
  build: {
    outDir: fileURLToPath(new URL('../public/play', import.meta.url)),
    emptyOutDir: false, // OneDrive가 이전 빌드 파일을 잡고 있어도 원본을 삭제하지 않고 갱신합니다.
    rollupOptions: {
      input: { index: fileURLToPath(new URL('./index.html', import.meta.url)), 'community-entry': fileURLToPath(new URL('./community-entry.js', import.meta.url)) },
      output: {
        entryFileNames: chunk => chunk.name === 'community-entry' ? 'community-entry.js' : 'assets/[name]-[hash].js',
        assetFileNames: asset => asset.names?.some(name => name.includes('community-entry') && name.endsWith('.css')) ? 'community-entry.css' : asset.names?.some(name => name.includes('CommunicationPanel') && name.endsWith('.css')) ? 'community-shared.css' : 'assets/[name]-[hash][extname]',
        manualChunks(id) {
          if (id.includes('/node_modules/pixi.js/')) return 'pixi';
          if (id.includes('/node_modules/@vue/') || id.includes('/node_modules/vue/')) return 'vue';
        },
      },
    },
  },
});
