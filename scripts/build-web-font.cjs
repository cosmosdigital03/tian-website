#!/usr/bin/env node
/* Builds assets/fonts/inter-latin.woff2 from the variable Inter TTF. No dependencies: Node's own Brotli.
   Usage: node scripts/build-web-font.cjs path/to/Inter.ttf assets/fonts/inter-latin.woff2

   Keeps the Latin characters the site uses and empties every other glyph while leaving glyph numbers
   unchanged, so kerning (GPOS) stays valid without being rewritten. Only the file on this site is
   ever sent to visitors: no font service sees their address. */
'use strict';
const fs = require('fs');
const zlib = require('zlib');

const [, , source, target] = process.argv;
if (!source || !target) { console.error('usage: build-web-font.cjs <Inter.ttf> <out.woff2>'); process.exit(1); }

const RANGES = [[0x20, 0x7e], [0xa0, 0x17f], [0x2c6, 0x2c7], [0x2d8, 0x2dd], [0x39b, 0x39b], [0x2010, 0x2015], [0x2018, 0x201e], [0x2020, 0x2022], [0x2026, 0x2026], [0x2030, 0x2030], [0x2039, 0x203a], [0x20ac, 0x20ac], [0x2122, 0x2122], [0x2190, 0x2193], [0x2212, 0x2212]];

const font = fs.readFileSync(source);
const tables = new Map();
for (let i = 0; i < font.readUInt16BE(4); i++) {
  const at = 12 + i * 16;
  tables.set(font.toString('latin1', at, at + 4), font.subarray(font.readUInt32BE(at + 8), font.readUInt32BE(at + 8) + font.readUInt32BE(at + 12)));
}

const head = Buffer.from(tables.get('head'));
const maxp = tables.get('maxp');
const hhea = tables.get('hhea');
const numGlyphs = maxp.readUInt16BE(4);
const oldLong = head.readInt16BE(50) === 1;
const oldLoca = tables.get('loca');
const glyfOffset = g => (oldLong ? oldLoca.readUInt32BE(g * 4) : oldLoca.readUInt16BE(g * 2) * 2);

// ---- which glyphs are needed ------------------------------------------------------------
function readCmap(cmap) {
  const out = new Map();
  const count = cmap.readUInt16BE(2);
  let best = -1, bestFormat = 0;
  for (let i = 0; i < count; i++) {
    const offset = cmap.readUInt32BE(8 + i * 8);
    const format = cmap.readUInt16BE(offset);
    if ((format === 12 || format === 4) && format > bestFormat) { best = offset; bestFormat = format; }
  }
  if (bestFormat === 12) {
    for (let i = 0; i < cmap.readUInt32BE(best + 12); i++) {
      const at = best + 16 + i * 12, a = cmap.readUInt32BE(at), b = cmap.readUInt32BE(at + 4), g = cmap.readUInt32BE(at + 8);
      for (let c = a; c <= b; c++) out.set(c, g + c - a);
    }
  } else {
    const seg = cmap.readUInt16BE(best + 6) / 2;
    const end = best + 14, start = end + seg * 2 + 2, delta = start + seg * 2, range = delta + seg * 2;
    for (let i = 0; i < seg; i++) {
      const e = cmap.readUInt16BE(end + i * 2), s = cmap.readUInt16BE(start + i * 2), d = cmap.readInt16BE(delta + i * 2), r = cmap.readUInt16BE(range + i * 2);
      for (let c = s; c <= e && c !== 0xffff; c++) {
        let g = r ? cmap.readUInt16BE(range + i * 2 + r + (c - s) * 2) : c;
        if (g) g = (g + d) & 0xffff;
        if (g) out.set(c, g);
      }
    }
  }
  return out;
}
const cmap = readCmap(tables.get('cmap'));
const chosen = new Map();
RANGES.forEach(([a, b]) => { for (let c = a; c <= b; c++) if (cmap.has(c)) chosen.set(c, cmap.get(c)); });

const glyf = tables.get('glyf');
const keep = new Set([0]);
const visit = g => {
  if (keep.has(g) && g !== 0) return;
  keep.add(g);
  const at = glyfOffset(g), end = glyfOffset(g + 1);
  if (end <= at || glyf.readInt16BE(at) >= 0) return;
  let p = at + 10, more = true;
  while (more) {
    const flags = glyf.readUInt16BE(p), comp = glyf.readUInt16BE(p + 2);
    visit(comp);
    p += 4 + (flags & 1 ? 4 : 2);
    if (flags & 8) p += 2; else if (flags & 0x40) p += 4; else if (flags & 0x80) p += 8;
    more = !!(flags & 0x20);
  }
};
chosen.forEach(g => visit(g));

// ---- rewrite the glyph tables, glyph numbers unchanged ----------------------------------
const chunks = [];
const newOffsets = new Array(numGlyphs + 1).fill(0);
let cursor = 0;
for (let g = 0; g < numGlyphs; g++) {
  newOffsets[g] = cursor;
  if (!keep.has(g)) continue;
  const part = glyf.subarray(glyfOffset(g), glyfOffset(g + 1));
  chunks.push(part);
  cursor += part.length;
  if (cursor % 4) { const pad = 4 - (cursor % 4); chunks.push(Buffer.alloc(pad)); cursor += pad; }
}
newOffsets[numGlyphs] = cursor;
const newGlyf = Buffer.concat(chunks);
const shortLoca = cursor < 131070;
const newLoca = Buffer.alloc((numGlyphs + 1) * (shortLoca ? 2 : 4));
newOffsets.forEach((o, i) => { if (shortLoca) newLoca.writeUInt16BE(o / 2, i * 2); else newLoca.writeUInt32BE(o, i * 4); });
head.writeInt16BE(shortLoca ? 0 : 1, 50);

const gvar = tables.get('gvar');
const gvarLong = gvar.readUInt16BE(14) & 1;
const gvarArray = gvar.readUInt32BE(16);
const gvarHeaderEnd = 20 + (numGlyphs + 1) * 4;
const sharedCount = gvar.readUInt16BE(6) * gvar.readUInt16BE(4) * 2;
const sharedTuples = gvar.subarray(gvar.readUInt32BE(8), gvar.readUInt32BE(8) + sharedCount);
const gvarAt = g => gvarArray + (gvarLong ? gvar.readUInt32BE(20 + g * 4) : gvar.readUInt16BE(20 + g * 2) * 2);
const gvarChunks = [];
const gvarHead = Buffer.alloc(gvarHeaderEnd);
gvar.copy(gvarHead, 0, 0, 20);
gvarHead.writeUInt16BE(gvar.readUInt16BE(14) | 1, 14);
gvarHead.writeUInt32BE(gvarHeaderEnd, 8);
gvarHead.writeUInt32BE(gvarHeaderEnd + sharedCount, 16);
let gvarCursor = 0;
for (let g = 0; g < numGlyphs; g++) {
  gvarHead.writeUInt32BE(gvarCursor, 20 + g * 4);
  if (!keep.has(g)) continue;
  const part = gvar.subarray(gvarAt(g), gvarAt(g + 1));
  gvarChunks.push(part);
  gvarCursor += part.length;
  if (gvarCursor % 2) { gvarChunks.push(Buffer.alloc(1)); gvarCursor += 1; }
}
gvarHead.writeUInt32BE(gvarCursor, 20 + numGlyphs * 4);
const newGvar = Buffer.concat([gvarHead, sharedTuples, ...gvarChunks]);

const hmtx = Buffer.from(tables.get('hmtx'));
const numH = hhea.readUInt16BE(34);
for (let g = 0; g < numGlyphs; g++) {
  if (keep.has(g)) continue;
  if (g < numH) hmtx.writeUInt32BE(0, g * 4);
  else hmtx.writeUInt16BE(0, numH * 4 + (g - numH) * 2);
}

// A small format 4 character map for the kept characters.
function buildCmap(map) {
  const cps = [...map.keys()].sort((a, b) => a - b);
  const segs = [];
  cps.forEach(c => {
    const g = map.get(c), last = segs[segs.length - 1];
    if (last && last.end === c - 1 && last.delta === g - c) last.end = c;
    else segs.push({ start: c, end: c, delta: g - c });
  });
  segs.push({ start: 0xffff, end: 0xffff, delta: 1 });
  const n = segs.length;
  const sub = Buffer.alloc(16 + n * 8);
  const floor = Math.floor(Math.log2(n));
  sub.writeUInt16BE(4, 0); sub.writeUInt16BE(sub.length, 2); sub.writeUInt16BE(n * 2, 6);
  sub.writeUInt16BE(2 << floor, 8); sub.writeUInt16BE(floor, 10); sub.writeUInt16BE(n * 2 - (2 << floor), 12);
  segs.forEach((s, i) => {
    sub.writeUInt16BE(s.end, 14 + i * 2);
    sub.writeUInt16BE(s.start, 16 + n * 2 + i * 2);
    sub.writeInt16BE(((s.delta + 0x8000) & 0xffff) - 0x8000, 16 + n * 4 + i * 2);
  });
  const header = Buffer.alloc(4 + 2 * 8);
  header.writeUInt16BE(2, 2);
  header.writeUInt16BE(0, 4); header.writeUInt16BE(3, 6); header.writeUInt32BE(20, 8);
  header.writeUInt16BE(3, 12); header.writeUInt16BE(1, 14); header.writeUInt32BE(20, 16);
  return Buffer.concat([header, sub]);
}

const post = Buffer.from(tables.get('post').subarray(0, 32));
post.writeUInt32BE(0x00030000, 0);

const out = new Map(tables);
out.delete('GSUB');            // substitutions are not needed for reading text in this subset
out.set('head', head); out.set('glyf', newGlyf); out.set('loca', newLoca); out.set('gvar', newGvar);
out.set('hmtx', hmtx); out.set('post', post); out.set('cmap', buildCmap(chosen));

// ---- WOFF2 container (null transform for glyf and loca) ---------------------------------
const KNOWN = { cmap: 0, head: 1, hhea: 2, hmtx: 3, maxp: 4, name: 5, 'OS/2': 6, post: 7, 'cvt ': 8, fpgm: 9, glyf: 10, loca: 11, prep: 12 };   // every other table carries its full tag
const base128 = v => { const b = [v & 0x7f]; while ((v >>>= 7)) b.unshift((v & 0x7f) | 0x80); return Buffer.from(b); };
const tags = [...out.keys()].filter(t => t !== 'glyf' && t !== 'loca').sort();
tags.unshift('glyf', 'loca');
const directory = [];
tags.forEach(tag => {
  const known = KNOWN[tag];
  const transform = tag === 'glyf' || tag === 'loca' ? 3 << 6 : 0;
  directory.push(Buffer.from([(known === undefined ? 63 : known) | transform]));
  if (known === undefined) directory.push(Buffer.from(tag, 'latin1'));
  directory.push(base128(out.get(tag).length));
});
const dir = Buffer.concat(directory);
const payload = Buffer.concat(tags.map(t => out.get(t)));
const compressed = zlib.brotliCompressSync(payload, { params: {
  [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_FONT,
  [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
  [zlib.constants.BROTLI_PARAM_LGWIN]: 24,
  [zlib.constants.BROTLI_PARAM_SIZE_HINT]: payload.length
} });
const sfntSize = 12 + 16 * tags.length + tags.reduce((s, t) => s + ((out.get(t).length + 3) & ~3), 0);
const header = Buffer.alloc(48);
header.write('wOF2', 0, 'latin1');
header.writeUInt32BE(0x00010000, 4);
const fileLength = (48 + dir.length + compressed.length + 3) & ~3;   // decoders require a 4-byte boundary
header.writeUInt32BE(fileLength, 8);
header.writeUInt16BE(tags.length, 12);
header.writeUInt32BE(sfntSize, 16);
header.writeUInt32BE(compressed.length, 20);
header.writeUInt16BE(4, 24); header.writeUInt16BE(1, 26);
fs.writeFileSync(target, Buffer.concat([header, dir, compressed], fileLength));
console.log(`${target}: ${fileLength} bytes, ${chosen.size} characters, ${keep.size} glyphs kept of ${numGlyphs}`);
