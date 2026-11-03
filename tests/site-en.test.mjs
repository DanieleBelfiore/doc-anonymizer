// The English page /en/ is generated from site/index.html by scripts/site-en.mjs:
// a gap here leaves Italian on the English page or breaks hreflang, and search engines then index the wrong language.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { toEnglish } from '../scripts/site-en.mjs';

const SITE = 'https://doc-anonymizer.danielebelfiore.dev/';
const EN = `${SITE}en/`;
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const it = read('site/index.html');
const en = toEnglish(it);
const ENTITY = { lt: '<', gt: '>', quot: '"', amp: '&', '#39': "'", '#10': '\n' };
const decode = (s) => s.replace(/&(lt|gt|quot|amp|#39|#10);/g, (_, e) => ENTITY[e]);
const plain = (s) => decode(s.replace(/<(?:[^>"]|"[^"]*")*>/g, '')).replace(/\s+/g, ' ').trim();
const meta = (page, key) => page.match(new RegExp(`<meta (?:name|property)="${key}" content="([^"]*)"`))?.[1];
const graph = (page) => JSON.parse(page.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];
// Elements with an English version: [tag, attributes, Italian inner HTML (up to the first closing tag of that name)].
const swapped = [...it.matchAll(/<(\w+)((?:[^>"]|"[^"]*")*?\sdata-en="[^"]*"(?:[^>"]|"[^"]*")*)>([\s\S]*?)<\/\1>/g)];

test('the English page has no Italian left where the Italian page has an English version', () => {
  assert.ok(swapped.length > 30, 'the data-en elements are found');
  assert.doesNotMatch(en, /\sdata-en/);
  const text = plain(en.replace(/<html[^>]*>/, ''));
  for (const [, , attrs, inner] of swapped) {
    const english = plain(decode(attrs.match(/\sdata-en="([^"]*)"/)[1]));
    assert.ok(text.includes(english), `missing: ${english}`);
    const italian = plain(inner);
    if (italian !== english && /\p{L}/u.test(italian)) assert.ok(!text.includes(italian), `Italian left: ${italian}`);
  }
  for (const [, name, english] of it.matchAll(/\sdata-en-([\w-]+)="([^"]*)"/g)) assert.ok(en.includes(` ${name}="${english}"`), `${name}="${english}"`);
});

test('each page is canonical to itself and lists both languages with hreflang', () => {
  assert.match(it, /<html lang="it">/);
  assert.match(en, /<html lang="en">/);
  for (const [page, self] of [[it, SITE], [en, EN]]) {
    assert.match(page, new RegExp(`<link rel="canonical" href="${self}"`));
    assert.ok(page.includes(`<link rel="alternate" hreflang="it" href="${SITE}">`));
    assert.ok(page.includes(`<link rel="alternate" hreflang="en" href="${EN}">`));
    assert.ok(page.includes(`<link rel="alternate" hreflang="x-default" href="${SITE}">`));
    assert.equal(meta(page, 'og:url'), self);
    const title = page.match(/<title[^>]*>([^<]*)<\/title>/)[1];
    assert.equal(meta(page, 'og:title'), title);
    assert.equal(meta(page, 'twitter:title'), title);
    assert.equal(meta(page, 'twitter:description'), meta(page, 'og:description'));
  }
  assert.equal(meta(it, 'og:locale'), 'it_IT');
  assert.equal(meta(it, 'og:locale:alternate'), 'en_GB');
  assert.equal(meta(en, 'og:locale'), 'en_GB');
  assert.equal(meta(en, 'og:locale:alternate'), 'it_IT');
  for (const key of ['description', 'og:title', 'og:description', 'og:image:alt']) assert.notEqual(meta(en, key), meta(it, key), key);
});

test('the language switch is a link to the other page', () => {
  const toggle = (page) => page.match(/<a class="lang"[^>]*>/)[0];
  assert.match(toggle(it), / href="\/en\/" hreflang="en" lang="en" aria-label="Read in English"/);
  assert.match(toggle(en), / href="\/" hreflang="it" lang="it" aria-label="Leggi in italiano"/);
  // No redirect by browser language or a stored choice: each URL shows its own language.
  assert.doesNotMatch(read('site/main.js'), /localStorage|navigator\.language|[?&]lang=/);
});

test('the English JSON-LD is in English, with the FAQ of the English page', () => {
  const nodes = graph(en);
  const faq = nodes.find((n) => n['@type'] === 'FAQPage');
  assert.equal(faq.inLanguage, 'en');
  assert.ok(faq['@id'].startsWith(EN));
  const details = [...en.matchAll(/<details\b[^>]*><summary[^>]*>([\s\S]*?)<\/summary><p[^>]*>([\s\S]*?)<\/p><\/details>/g)];
  assert.equal(faq.mainEntity.length, details.length);
  faq.mainEntity.forEach((q, i) => {
    assert.equal(q.name, plain(details[i][1]));
    assert.equal(q.acceptedAnswer.text, plain(details[i][2]));
  });
  assert.ok([].concat(nodes.find((n) => n['@type'] === 'WebSite').inLanguage).includes('en'));
  assert.doesNotMatch(nodes.find((n) => n['@type'] === 'SoftwareApplication').description, /\b(per|con|documenti)\b/);
});

test('assets load from /en/ too, and the CSP still allows the inline script', () => {
  const relative = [...it.matchAll(/\s(?:src|href)="([^"]*)"/g)].map((m) => m[1]).filter((u) => !/^(?:[a-z]+:|\/|#)/.test(u));
  assert.deepEqual(relative, []);
  const csp = read('netlify.toml');
  for (const page of [it, en]) for (const [, code] of page.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    assert.ok(csp.includes(`'sha256-${createHash('sha256').update(code).digest('base64')}'`), code);
  }
  assert.match(csp, /command = "node scripts\/site-en\.mjs"/);
  assert.match(read('.gitignore'), /^site\/en\/$/m);
});

test('the sitemap lists both pages with their alternates, and llms.txt points to the English page', () => {
  const sitemap = read('site/sitemap.xml');
  const urls = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => m[1]);
  assert.deepEqual(urls.map((u) => u.match(/<loc>([^<]*)<\/loc>/)[1]), [SITE, EN]);
  for (const u of urls) {
    assert.ok(u.includes(`<xhtml:link rel="alternate" hreflang="it" href="${SITE}"/>`));
    assert.ok(u.includes(`<xhtml:link rel="alternate" hreflang="en" href="${EN}"/>`));
    assert.ok(u.includes(`<xhtml:link rel="alternate" hreflang="x-default" href="${SITE}"/>`));
  }
  assert.match(sitemap, /xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/);
  assert.ok(read('site/llms.txt').includes(`(${EN})`));
});
