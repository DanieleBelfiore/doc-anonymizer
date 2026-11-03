// GET / in the browser's language: Italian stays here, any other language goes to /en/.
// No Accept-Language (crawlers) keeps the x-default Italian page; a same-site Referer means the visitor
// clicked the IT/EN switch, so their choice wins over the browser.
const SUPPORTED = ['it', 'en'];

// First supported language by q weight, 'en' when none is supported, null when the header is empty.
function preferredLanguage(header) {
  const ranges = header
    .split(',')
    .map((part, i) => {
      const [tag, ...params] = part.trim().split(';');
      const q = Number(params.find(p => p.trim().startsWith('q='))?.trim().slice(2) ?? 1);
      return { lang: tag.trim().toLowerCase().split('-')[0], q: Number.isNaN(q) ? 0 : q, i };
    })
    .filter(r => r.lang && r.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i);
  if (ranges.length === 0) return null;
  return ranges.find(r => SUPPORTED.includes(r.lang))?.lang ?? 'en';
}

export default function language(req) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return;
  const url = new URL(req.url);
  const referer = req.headers.get('referer');
  if (referer && URL.canParse(referer) && new URL(referer).origin === url.origin) return;
  if (preferredLanguage(req.headers.get('accept-language') ?? '') !== 'en') return;
  return Response.redirect(new URL(`/en/${url.search}`, url), 302);
}

export const config = { path: '/' };
