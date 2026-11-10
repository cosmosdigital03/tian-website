'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const pages = ['index.html', 'support.html', 'privacy.html', 'terms.html', '404.html'];
const fontsCss = read('fonts.css').replace(/\/\*[\s\S]*?\*\//g, '');

// Source-contract checks for the fonts every page shares (fonts.css). They do not render anything:
// how the type looks at desktop and phone widths still needs browser review.

const faces = [...fontsCss.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(match => match[1]);
const variable = name => new RegExp(name + '\\s*:\\s*([^;}]+)').exec(fontsCss)[1].trim();

test('fonts.css declares the two stand-in fonts from this site, with their licences', () => {
  const expected = {
    'DM Sans': ['assets/fonts/dm-sans-latin.woff2', 'licenses/DMSans-OFL.txt'],
    'Source Serif 4': ['assets/fonts/source-serif-4-latin.woff2', 'licenses/SourceSerif4-OFL.txt']
  };
  assert.equal(faces.length, 2);
  for (const face of faces) {
    const family = /font-family\s*:\s*"([^"]+)"/.exec(face)[1];
    assert.ok(expected[family], 'Unexpected font family: ' + family);
    const [file, licence] = expected[family];
    assert.match(face, new RegExp('src\\s*:\\s*url\\("' + file.replace(/\./g, '\\.') + '"\\)\\s*format\\("woff2"\\)'));
    assert.match(face, /font-display\s*:\s*swap/);
    assert.match(face, /unicode-range\s*:\s*U\+0000-00FF/);
    assert.equal(fs.readFileSync(path.join(root, file)).toString('latin1', 0, 4), 'wOF2', file + ' must be a WOFF2 font');
    assert.match(read(licence), /SIL OPEN FONT LICENSE Version 1\.1/, licence + ' must carry the licence text');
    delete expected[family];
  }
  assert.deepEqual(Object.keys(expected), [], 'Both stand-in fonts must be declared');
  assert.deepEqual(fs.readdirSync(path.join(root, 'assets', 'fonts')).sort(), ['dm-sans-latin.woff2', 'source-serif-4-latin.woff2'],
    'Only the two licensed-for-redistribution stand-ins are shipped; Styrene and Tiempos files must not be added without web licences');
});

test('The stacks name the owner\'s fonts first, then the stand-in, then system fonts', () => {
  assert.match(variable('--tian-display'), /^"Styrene B","Styrene A","DM Sans",.*sans-serif$/);
  assert.match(variable('--tian-serif'), /^"Tiempos Text","Tiempos","Source Serif 4",.*serif$/);
});

test('Every page links fonts.css before its own styles and preloads both fonts from this site', () => {
  for (const page of pages) {
    const html = read(page), prefix = page === '404.html' ? '/' : '';
    const link = html.indexOf('<link rel="stylesheet" href="' + prefix + 'fonts.css?v=');
    assert.ok(link > 0, page + ' must link fonts.css with a version tag');
    const own = [html.indexOf('<style>'), html.indexOf('premium.css?v='), html.indexOf('styles.css?v=')].filter(index => index > 0);
    assert.ok(own.length && link < Math.min(...own), page + ' must load fonts.css before its own styles');
    const preloads = [...html.matchAll(/<link rel="preload" href="([^"]+)" as="font" type="font\/woff2" crossorigin>/g)].map(match => match[1]).sort();
    assert.deepEqual(preloads, [prefix + 'assets/fonts/dm-sans-latin.woff2', prefix + 'assets/fonts/source-serif-4-latin.woff2'], page);
  }
});

test('No page or stylesheet loads a font or stylesheet from another host', () => {
  for (const file of [...pages, 'fonts.css', 'styles.css', 'premium.css', 'motion.css']) {
    const text = read(file);
    assert.doesNotMatch(text, /fonts\.googleapis|fonts\.gstatic|use\.typekit|fonts\.bunny|cdn\.jsdelivr|@import\b/i, file);
    for (const [, resource] of text.matchAll(/url\(\s*["']?([^)'"\s]+)["']?\s*\)/g)) {
      if (resource.startsWith('#') || resource.startsWith('data:')) continue;
      assert.doesNotMatch(resource, /^(?:https?:)?\/\//i, file + ': CSS asset must stay local: ' + resource);
    }
    for (const [, rel, href] of text.matchAll(/<link rel="(stylesheet|preload|preconnect|dns-prefetch)" href="([^"]+)"/g)) {
      assert.doesNotMatch(href, /^(?:https?:)?\/\//i, file + ': ' + rel + ' must stay local: ' + href);
    }
  }
});

test('Each page uses the shared stacks: display for headings and interface, serif for reading text', () => {
  const styles = read('styles.css');
  assert.match(styles, /:root\{font-family:var\(--tian-display,/, 'Support and the error page');
  assert.match(styles, /\.prose \.intro,\.prose p:not\(\.eyebrow\),\.support-card p,\.footer p:not\(\.copyright\)\{font-family:var\(--tian-serif,/);
  for (const page of ['privacy.html', 'terms.html']) {
    const html = read(page);
    assert.match(html, /--display:\s*var\(--tian-display,/, page);
    assert.match(html, /--serif:\s*var\(--tian-serif,/, page);
    assert.match(html, /html\s*\{\s*font-family:\s*var\(--display\);\s*\}/, page);
    assert.match(html, /section p, section ul, \.summary-card p, \.legal-caps\s*\{\s*font-family:\s*var\(--serif\);/, page);
  }
  assert.match(read('terms.html'), /font-family:\s*ui-monospace/, 'The reproduced licence text stays monospaced');
  const motion = read('motion.css');
  assert.match(motion, /--display:var\(--tian-display,/, 'Homepage');
  assert.match(motion, /--serif:var\(--tian-serif,/, 'Homepage');
});

test('Homepage pictures are small WebP files and no unused picture is shipped', () => {
  const html = read('index.html');
  const pictures = [...html.matchAll(/<img src="(assets\/[^"]+)"/g)].map(match => match[1]);
  assert.equal(pictures.filter(name => name.endsWith('-refined.webp')).length, 5);
  for (const name of new Set(pictures)) {
    assert.ok(fs.statSync(path.join(root, name)).size < 100 * 1024, name + ' must stay under 100 KB');
  }
  const shipped = fs.readdirSync(path.join(root, 'assets')).filter(name => /\.(png|jpe?g|webp)$/.test(name));
  for (const name of shipped) {
    assert.ok(pages.some(page => read(page).includes('assets/' + name)), 'Unused picture in assets/: ' + name);
  }
});
