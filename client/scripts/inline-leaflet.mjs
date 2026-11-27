// Generează src/components/leaflet/assets.ts: Leaflet (JS + CSS) ca text, pentru harta din WebView
// de pe Android. Așa harta nu depinde de un CDN. Rulează după actualizarea pachetului leaflet:
//   npm run leaflet:inline
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const dist = join(dirname(require.resolve('leaflet/package.json')), 'dist');
const version = JSON.parse(readFileSync(join(dist, '..', 'package.json'), 'utf8')).version;
const js = readFileSync(join(dist, 'leaflet.js'), 'utf8').replace(/\n\/\/# sourceMappingURL=.*$/m, '');
const css = readFileSync(join(dist, 'leaflet.css'), 'utf8');
// Textul ajunge într-un <script> / <style> din pagina hărții: nu are voie să le închidă.
if (/<\/script|<!--/i.test(js) || /<\/style/i.test(css)) throw new Error('Leaflet conține secvențe care ar închide <script>/<style>.');

const out = `// Generat de scripts/inline-leaflet.mjs din leaflet@${version} (licență BSD-2-Clause). Nu edita manual.
export const LEAFLET_VERSION = ${JSON.stringify(version)};
export const LEAFLET_JS = ${JSON.stringify(js)};
export const LEAFLET_CSS = ${JSON.stringify(css)};
`;
writeFileSync(new URL('../src/components/leaflet/assets.ts', import.meta.url), out);
console.log(`leaflet@${version}: ${js.length} B JS, ${css.length} B CSS`);
