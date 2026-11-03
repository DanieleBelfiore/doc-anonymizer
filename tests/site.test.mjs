// The public page in site/: English toggle coverage and the SEO/GEO files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SITE = 'https://doc-anonymizer.danielebelfiore.dev/';
const read = (f) => readFileSync(new URL(`../site/${f}`, import.meta.url), 'utf8');
const html = read('index.html');
const head = html.slice(0, html.indexOf('</head>'));
const body = html.slice(html.indexOf('<body>')).replace(/<!--[\s\S]*?-->/g, '');

// Text that stays the same in both languages: names, the app's own English UI in the mock-ups, file names.
const SAME = new Set(['Doc Anonymizer', 'GitHub', 'Daniele Belfiore', 'Wi‑Fi', '3 KB', 'Email', 'Website', 'Open source', 'Source Folder', 'Destination Folder', 'Start', 'PDF · DOCX · TXT', 'Processing documents...', 'Current file: contratto_affitto.docx', 'Protect your sensitive data locally.', 'Ready to anonymize', 'Configure your folder paths to start processing your documents securely.', 'gemma4:e2b · local engine ready', 'LinkedIn']);
const isFile = (t) => /^[\w.]+\.(pdf|docx|txt)$/.test(t);
const VOID = new Set(['img', 'input', 'br', 'meta', 'link', 'source', 'hr']);

test('every visible text and label has an English version (Italian sample documents carry lang="it")', () => {
  const stack = [];
  const missing = [];
  const covered = () => stack.some((t) => t.en || t.it);
  for (const m of body.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>|([^<]+)/g)) {
    const [, close, name, attrs = '', selfClose, text] = m;
    if (text !== undefined) {
      const t = text.replace(/\s+/g, ' ').trim();
      if (/\p{L}/u.test(t) && !covered() && !SAME.has(t) && !isFile(t)) missing.push(t);
      continue;
    }
    if (close) { while (stack.length && stack.pop().name !== name.toLowerCase()); continue; }
    for (const [, a, v] of attrs.matchAll(/\s(aria-label|alt|placeholder)="([^"]*)"/g)) {
      if (/\p{L}/u.test(v) && !SAME.has(v) && !attrs.includes(`data-en-${a}=`)) missing.push(`${a}="${v}"`);
    }
    if (selfClose || VOID.has(name.toLowerCase())) continue;
    stack.push({ name: name.toLowerCase(), en: /\sdata-en="/.test(attrs), it: /\slang="it"/.test(attrs) });
  }
  assert.deepEqual(missing, []);
});

test('the language switch, title and description have their English versions', () => {
  assert.match(html, /<html lang="it">/);
  assert.match(html, /<a class="lang" id="lang" href="\/en\/" hreflang="en" lang="en" aria-label="Read in English" data-en-href="\/" data-en-hreflang="it" data-en-lang="it" data-en-aria-label="Leggi in italiano" data-en="[^"]*class=&quot;flag&quot;[^"]*IT">/);
  assert.match(head, /<title data-en="[^"]+">/);
  assert.match(head, /<meta name="description" content="[^"]+" data-en-content="[^"]+">/);
});

test('title and description fit what search engines show', () => {
  const title = head.match(/<title[^>]*>([^<]+)<\/title>/)[1];
  const titleEn = head.match(/<title data-en="([^"]+)"/)[1];
  const [, desc, descEn] = head.match(/<meta name="description" content="([^"]+)" data-en-content="([^"]+)">/);
  for (const t of [title, titleEn]) assert.ok(t.length >= 50 && t.length <= 60, `title ${t.length}: ${t}`);
  for (const d of [desc, descEn]) assert.ok(d.length >= 140 && d.length <= 160, `description ${d.length}: ${d}`);
  assert.equal((body.match(/<h1[\s>]/g) || []).length, 1);
});

test('head has canonical, Open Graph, Twitter card, icons and theme color', () => {
  const meta = (attr, key) => head.match(new RegExp(`<meta ${attr}="${key}" content="([^"]+)"`))?.[1];
  assert.match(head, new RegExp(`<link rel="canonical" href="${SITE}"`));
  for (const k of ['og:type', 'og:url', 'og:title', 'og:description', 'og:image', 'og:image:width', 'og:image:height', 'og:image:alt', 'og:locale', 'og:site_name']) assert.ok(meta('property', k), k);
  for (const k of ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']) assert.ok(meta('name', k), k);
  assert.equal(meta('property', 'og:url'), SITE);
  assert.equal(meta('name', 'twitter:card'), 'summary_large_image');
  assert.ok(meta('property', 'og:image').startsWith(SITE));
  assert.equal(meta('property', 'og:image:width'), '1200');
  assert.equal(meta('property', 'og:image:height'), '630');
  assert.ok(meta('name', 'theme-color'));
  assert.match(head, /<link rel="apple-touch-icon" href="\/apple-touch-icon.png">/);
  readFileSync(new URL('../site/apple-touch-icon.png', import.meta.url));
  readFileSync(new URL(`../site/${meta('property', 'og:image').slice(SITE.length)}`, import.meta.url));
});

test('JSON-LD describes the app, the site, the author and the FAQ', () => {
  const graph = JSON.parse(head.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];
  const of = (type) => graph.find((n) => n['@type'] === type);
  const app = of('SoftwareApplication');
  assert.equal(app.offers.price, '0');
  assert.match(app.operatingSystem, /macOS/);
  assert.match(app.operatingSystem, /Windows/);
  assert.match(app.operatingSystem, /Linux/);
  assert.equal(app.author['@id'], of('Person')['@id']);
  assert.equal(of('Person').name, 'Daniele Belfiore');
  assert.deepEqual(of('Person').sameAs, ['https://www.linkedin.com/in/danielebelfiore', 'https://github.com/DanieleBelfiore']);
  assert.equal(of('WebSite').url, SITE);
  const faqs = (body.match(/<details name="faq"/g) || []).length;
  assert.equal(of('FAQPage').mainEntity.length, faqs);
});

test('robots.txt allows AI crawlers and points to the sitemap; sitemap and llms.txt exist', () => {
  const robots = read('robots.txt');
  for (const bot of ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended']) assert.match(robots, new RegExp(`User-agent: ${bot}`));
  assert.match(robots, new RegExp(`Sitemap: ${SITE}sitemap.xml`));
  assert.match(read('sitemap.xml'), new RegExp(`<loc>${SITE}</loc>`));
  const llms = read('llms.txt');
  assert.match(llms, /^# Doc Anonymizer\n\n> /);
  assert.match(llms, /MIT/);
  for (const f of ['index.html', 'llms.txt']) assert.ok(!read(f).includes('—'), `em dash in ${f}`);
});

test('the footer links to LinkedIn in a new tab', () => {
  assert.match(body, /<a class="li-link" href="https:\/\/www\.linkedin\.com\/in\/danielebelfiore" target="_blank" rel="noopener" aria-label="LinkedIn"><svg class="li"/);
});
