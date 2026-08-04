// ponytail: measurement only, no dynamic imports or component changes here — that's C3's job.
// Runs a production build and reports real per-route First Load JS from Next's own
// route-bundle-stats.json diagnostic (this Next/Turbopack version no longer prints the
// classic size table to stdout), then names the heaviest library behind the 3 biggest routes.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const statsPath = path.join(webDir, '.next/diagnostics/route-bundle-stats.json');

execFileSync('pnpm', ['build'], { cwd: webDir, stdio: 'inherit', shell: true });

if (!existsSync(statsPath)) {
  throw new Error(`build did not produce ${statsPath}`);
}

const routes = JSON.parse(readFileSync(statsPath, 'utf8'))
  .sort((a, b) => b.firstLoadUncompressedJsBytes - a.firstLoadUncompressedJsBytes);

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;
const chunkFile = (p) => path.join(webDir, p.replace(/\\/g, path.sep));

// Chunks common to the lightest route are shared/framework chunks, not route-specific weight.
const baselineChunks = new Set(routes[routes.length - 1].firstLoadChunkPaths);

const SUSPECTS = [
  { name: 'ReactFlow', pattern: /reactflow|react-flow/i },
  { name: 'TipTap/ProseMirror', pattern: /prosemirror|tiptap/i },
  { name: 'Framer Motion', pattern: /framer-motion|\bmotion\b/i },
  { name: 'lucide-react', pattern: /lucide/i },
  { name: 'marked', pattern: /\bmarked\b/i },
];

function biggestContributors(route) {
  const unique = route.firstLoadChunkPaths.filter((p) => !baselineChunks.has(p));
  const sized = unique
    .map((p) => {
      const file = chunkFile(p);
      if (!existsSync(file)) return null;
      const content = readFileSync(file, 'utf8');
      const hits = SUSPECTS.filter((s) => s.pattern.test(content)).map((s) => s.name);
      return { path: p, bytes: readFileSync(file).length, hits };
    })
    .filter(Boolean)
    .sort((a, b) => b.bytes - a.bytes);
  if (!sized.length) return 'no route-unique chunks vs. baseline';
  return sized
    .slice(0, 3)
    .map((c) => `${path.basename(c.path)} (${kb(c.bytes)}${c.hits.length ? `, ${c.hits.join('+')}` : ''})`)
    .join(', ');
}

console.log('| route | First Load JS | biggest contributors |');
console.log('|---|---|---|');
for (const r of routes) {
  console.log(`| ${r.route} | ${kb(r.firstLoadUncompressedJsBytes)} | ${biggestContributors(r)} |`);
}
