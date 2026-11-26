import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Plugin custom pour servir/copier sql-wasm.wasm
function sqlWasmPlugin() {
  return {
    name: 'sql-wasm',
    configureServer(server) {
      server.middlewares.use('/sql-wasm.wasm', (_req, res) => {
        const wasmPath = path.resolve(__dirname, 'node_modules/sql.js/dist/sql-wasm.wasm');
        res.setHeader('Content-Type', 'application/wasm');
        fs.createReadStream(wasmPath).pipe(res);
      });
    },
    generateBundle() {
      const wasmPath = path.resolve(__dirname, 'node_modules/sql.js/dist/sql-wasm.wasm');
      const source = fs.readFileSync(wasmPath);
      this.emitFile({ type: 'asset', fileName: 'sql-wasm.wasm', source });
    },
  };
}

// En dev, sert les fonctions Netlify (actualités, proxy API) comme en production.
function netlifyFunctionsDevPlugin() {
  return {
    name: 'netlify-functions-dev',
    configureServer(server) {
      server.middlewares.use('/.netlify/functions', async (req, res) => {
        try {
          const url = new URL(req.url, 'http://localhost');
          const name = url.pathname.replace(/^\/+/, '').replace(/[^a-z0-9-]/gi, '');
          const { handler } = await import(path.resolve(__dirname, 'netlify/functions', `${name}.js`));
          const out = await handler({ httpMethod: req.method, queryStringParameters: Object.fromEntries(url.searchParams) });
          res.writeHead(out.statusCode, out.headers);
          res.end(out.body);
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
    },
  };
}

// Version affichée dans le Profil : celle de package.json, montée à chaque mise en ligne (correctif ou fonctionnalité).
// ONNX Runtime Web (scanner) crée sa mémoire WebAssembly partagée avec un plafond de 4 Go
// (65 536 pages de 64 Ko), réservé d'un bloc. Un vrai iPhone refuse cette réservation
// (« RangeError: Out of memory ») alors que le scanner n'en utilise qu'une petite partie : on abaisse le
// plafond dans le fichier du moteur. Le fichier émis a donc son propre nom (hash du contenu modifié),
// ce qui évite qu'un ancien cache garde la version à 4 Go.
// Mesuré sur le scanner : il lui faut entre 64 et 128 Mo ; 512 Mo laisse une large marge.
const ORT_MAX_PAGES = Number(process.env.ORT_MAX_PAGES) || 8192; // 8 192 × 64 Ko = 512 Mo
function ortMemoryCapPlugin() {
  const GLUE = /onnxruntime-web\/dist\/ort-wasm-simd-threaded\.mjs\?url$/;
  return {
    name: 'ort-memory-cap',
    apply: 'build',
    enforce: 'pre',
    async resolveId(source, importer) {
      if (!source.endsWith('ort-wasm-simd-threaded.mjs?url')) return null;
      const resolved = await this.resolve(source.replace(/\?url$/, ''), importer, { skipSelf: true });
      return resolved ? `${resolved.id}?url` : null;
    },
    load(id) {
      if (!GLUE.test(id)) return null;
      const file = id.replace(/\?url$/, '');
      const src = fs.readFileSync(file, 'utf8');
      if (!src.includes('maximum:65536')) this.error(`ort-memory-cap : plafond mémoire introuvable dans ${file} (ONNX Runtime mis à jour ?)`);
      const ref = this.emitFile({ type: 'asset', name: 'ort-wasm-simd-threaded.mjs', source: src.replace('maximum:65536', `maximum:${ORT_MAX_PAGES}`) });
      return `export default import.meta.ROLLUP_FILE_URL_${ref};`;
    },
  };
}

const { version } = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'));

export default defineConfig({
  // Le fil de travail du scanner importe OpenCV et ONNX Runtime à la demande : format module.
  // « 2.9.0 » s'affiche « 2.9 », « 2.9.1 » en entier : le correctif se voit, le zéro non.
  // Le scanner tourne dans un worker, construit à part : il a besoin du même plafond mémoire.
  worker: { format: 'es', plugins: () => [ortMemoryCapPlugin()] },
  define: { __APP_VERSION__: JSON.stringify(version.replace(/\.0$/, '')) },
  plugins: [
    ortMemoryCapPlugin(),
    react(),
    sqlWasmPlugin(),
    netlifyFunctionsDevPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'logo.svg', 'logo-violet.svg', 'logo-white.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Dexup',
        short_name: 'Dexup',
        description: 'Gère ta collection de cartes Pokémon',
        theme_color: '#655ba4',
        background_color: '#f5f5f5',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          { src: 'icon-1024.png', sizes: '1024x1024', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm}'],
        // Le scanner (modèles, OpenCV, moteur WebAssembly, index : ≈ 100 Mo) n'est pas préchargé pour
        // tout le monde : il se télécharge à la première ouverture du scanner, puis reste en cache.
        globIgnores: ['**/scan/**', '**/assets/worker-*.js', '**/assets/opencv-*.js', '**/assets/ort-*.wasm'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === self.location.origin
              && (url.pathname.startsWith('/scan/') || /\/assets\/(worker|opencv|ort)-.*\.(m?js|wasm)$/.test(url.pathname))
              && url.pathname !== '/scan/index.json',
            handler: 'CacheFirst',
            options: {
              cacheName: 'scanner',
              expiration: { maxEntries: 20 },
              cacheableResponse: { statuses: [200] },
            },
          },
          // ⚠️ On ne met PAS api.pokemontcg.io ici : les requêtes API sont
          // déjà mises en cache côté app (SQLite + Supabase). Laisser le SW
          // intercepter les appels API provoque des erreurs CORS en production
          // car le SW fait un fetch() depuis son propre scope.

          {
            // Images pokemontcg.io — StaleWhileRevalidate (plus robuste que
            // CacheFirst) : ne rejette jamais même si l'image n'existe pas.
            // statuses: [0, 200] : accepte les réponses opaques cross-origin.
            urlPattern: /^https:\/\/images\.pokemontcg\.io\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'pokemon-images',
              expiration: { maxEntries: 2000, maxAgeSeconds: 604800 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Vignettes des actualités
            urlPattern: /^https:\/\/pokemonblog\.com\/wp-content\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'news-images',
              expiration: { maxEntries: 200, maxAgeSeconds: 86400 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  optimizeDeps: {
    // On inclut sql.js pour que Vite le pré-bundle (CJS→ESM) et expose proprement initSqlJs
    include: ['sql.js'],
  },
  build: {
    target: 'esnext',
  },
});
