// Builds the English page site/en/index.html from site/index.html (run by Netlify as the build command).
// Every element with data-en gets that inner HTML, every data-en-<attribute> replaces <attribute>,
// and the JSON-LD strings take the English of the same Italian text on the page (or LD_EN below).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// JSON-LD text with no copy on the page: Italian -> English. The build fails on a missing one.
const LD_EN = {
  'Funziona offline: il modello di IA gira sul computer con Ollama': 'Works offline: the AI model runs on your computer with Ollama',
  'Trova nomi, indirizzi, telefoni, email, codici fiscali e partite IVA, enti, date di nascita, IBAN, documenti d’identità, targhe':
    'Finds names, addresses, phone numbers, emails, tax codes and VAT numbers, organisations, dates of birth, IBANs, ID documents, number plates',
  'Oscura il testo nei PDF rimuovendolo dal file, con OCR per le scansioni': 'Redacts text in PDFs by removing it from the file, with OCR for scans',
  'Elabora cartelle intere di PDF, DOCX e TXT lasciando intatti gli originali': 'Processes whole folders of PDF, DOCX and TXT files and leaves the originals untouched',
  '8 GB RAM (16 GB consigliati)': '8 GB RAM (16 GB recommended)',
  '10 GB liberi su disco': '10 GB of free disk space',
};
const LD_KEYS = new Set(['name', 'text', 'description', 'featureList', 'memoryRequirements', 'storageRequirements']);

// Tags with quoted attributes (a data-en value may hold a literal "<"); raw text elements are skipped whole.
const TAG = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*\/?>/g;
const RAW = new Set(['script', 'style', 'textarea', 'title']);
const ENTITY = { lt: '<', gt: '>', quot: '"', amp: '&', '#39': "'", '#10': '\n' };
const decode = (s) => s.replace(/&(lt|gt|quot|amp|#39|#10);/g, (_, e) => ENTITY[e]);
const plain = (s) => decode(s.replace(/<(?:[^>"]|"[^"]*")*>/g, '')).replace(/\s+/g, ' ').trim();

function tags(html) {
  const out = [];
  TAG.lastIndex = 0;
  for (let m; (m = TAG.exec(html));) {
    if (!m[2]) continue;
    const t = { start: m.index, end: TAG.lastIndex, close: !!m[1], name: m[2].toLowerCase(), attrs: m[3] };
    out.push(t);
    if (!t.close && RAW.has(t.name)) TAG.lastIndex = html.toLowerCase().indexOf(`</${t.name}`, t.end);
  }
  return out;
}

export function toEnglish(html) {
  if (/\sdata-en[\w-]*\s*=\s*'/.test(html)) throw new Error('data-en attributes must use double quotes');
  const site = html.match(/<link rel="canonical" href="([^"]+)"/)[1];
  const list = tags(html);
  const edits = [], english = new Map();
  let inside = -1; // end of the last replaced inner HTML: what is inside is replaced with it
  list.forEach((t, i) => {
    if (t.close || t.start < inside || !/\sdata-en/.test(t.attrs)) return;
    let open = html.slice(t.start, t.end);
    for (const [, name, value] of t.attrs.matchAll(/\sdata-en-([\w-]+)="([^"]*)"/g)) {
      const own = new RegExp(`(\\s${name}=")([^"]*)"`);
      const old = open.match(own);
      if (old) english.set(plain(old[2]), plain(value));
      open = old ? open.replace(own, (_, a) => `${a}${value}"`) : open.replace(/\s*\/?>$/, (end) => ` ${name}="${value}"${end}`);
    }
    edits.push({ start: t.start, end: t.end, text: open.replace(/\sdata-en(?:-[\w-]+)?="[^"]*"/g, '') });
    const inner = t.attrs.match(/\sdata-en="([^"]*)"/);
    if (!inner) return;
    let depth = 0, close;
    for (const u of list.slice(i + 1)) {
      if (u.name !== t.name) continue;
      if (!u.close) depth++;
      else if (depth-- === 0) { close = u; break; }
    }
    if (!close) throw new Error(`no closing tag for <${t.name}> at ${t.start}`);
    english.set(plain(html.slice(t.end, close.start)), plain(decode(inner[1])));
    edits.push({ start: t.end, end: close.start, text: decode(inner[1]) });
    inside = close.start;
  });
  let out = html;
  for (const e of edits.reverse()) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  if (!out.includes('<html lang="it">')) throw new Error('expected <html lang="it">');
  out = out.replace('<html lang="it">', '<html lang="en">');

  for (const [it, en] of Object.entries(LD_EN)) english.set(it, en);
  const translate = (v, key) => {
    if (Array.isArray(v)) return v.map((x) => translate(x, key));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'inLanguage' && x === 'it' ? 'en' : translate(x, k)]));
    if (typeof v !== 'string' || !LD_KEYS.has(key)) return v;
    if (english.has(v)) return english.get(v);
    if (key === 'name') return v; // product and person names stay as they are
    throw new Error(`no English for the JSON-LD ${key} "${v}": add it to LD_EN`);
  };
  return out.replace(/(<script type="application\/ld\+json">\n)([\s\S]*?)(\n<\/script>)/, (_, a, json, b) => {
    const ld = translate(JSON.parse(json));
    for (const n of ld['@graph']) if (n['@type'] === 'FAQPage') for (const k of ['@id', 'url']) if (n[k]) n[k] = n[k].replace(site, `${site}en/`);
    return a + JSON.stringify(ld, null, 1) + b;
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const site = new URL('../site/', import.meta.url);
  mkdirSync(new URL('en/', site), { recursive: true });
  writeFileSync(new URL('en/index.html', site), toEnglish(readFileSync(new URL('index.html', site), 'utf8')));
}
