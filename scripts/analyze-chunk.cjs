// Deep analysis: check for known heavy packages using string search
const fs = require('fs');
const path = require('path');

const chunksDir = path.join('.next', 'static', 'chunks');

const suspects = [
  'framer-motion', 'recharts', 'd3', 'lodash', 'moment', 'dayjs', 'date-fns',
  'exceljs', 'jspdf', 'lucide', '@tanstack', 'zod', 'react-hook-form',
  'sonner', 'radix-ui', 'tailwind', 'class-variance', 'clsx',
  '@radix-ui', 'better-auth', 'jose'
];

const files = fs.readdirSync(chunksDir).filter(f => f.endsWith('.js'));

const packagePresence = {};
for (const pkg of suspects) { packagePresence[pkg] = { chunks: [], totalKB: 0 }; }

for (const file of files) {
  const full = path.join(chunksDir, file);
  const sizeKB = Math.round(fs.statSync(full).size / 1024);
  const data = fs.readFileSync(full, 'utf8');
  for (const pkg of suspects) {
    if (data.includes(pkg)) {
      packagePresence[pkg].chunks.push(file);
      packagePresence[pkg].totalKB += sizeKB;
    }
  }
}

console.log('\n══ Package Presence in Client Bundle Chunks ══');
for (const [pkg, info] of Object.entries(packagePresence)) {
  if (info.chunks.length > 0) {
    const chunkNames = info.chunks.map(c => c.slice(0, 12)).join(', ');
    console.log(`  ${pkg.padEnd(22)} ${info.chunks.length} chunk(s) → ${chunkNames}`);
  } else {
    console.log(`  ${pkg.padEnd(22)} NOT IN CLIENT BUNDLE ✓`);
  }
}

// Also measure total JS on page load
const totalKB = files.reduce((s, f) => s + fs.statSync(path.join(chunksDir, f)).size, 0) / 1024;
console.log(`\n══ Total .next/static/chunks: ${Math.round(totalKB)}KB ══`);
