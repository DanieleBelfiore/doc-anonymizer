// POST /api/contact: the contact form of site/index.html. Checks the fields,
// stops bots and floods, and mails the owner through Resend. Only a count of
// today's messages is stored (Netlify Blobs), no personal data, and nothing is
// logged. Env: RESEND_API_KEY, CONTACT_TO, CONTACT_FROM.
import { getStore } from '@netlify/blobs';

const LIMIT = 3;
const WINDOW_MS = 10 * 60_000;
// The Resend account serves other sites too: a flood must not use up its quota.
const DAILY_LIMIT = 30;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** `send(email)` resolves to whether Resend accepted it; `store` keeps the daily count. Tests pass fakes. */
export function createHandler({ env, send, store, now = Date.now }) {
  // shortcut: per-instance memory, so the limit resets on cold starts; move to Netlify Blobs if spam gets through.
  const recent = new Map();
  const limited = ip => {
    const times = (recent.get(ip) ?? []).filter(t => now() - t < WINDOW_MS);
    recent.set(ip, [...times, now()]);
    return times.length >= LIMIT;
  };
  // shortcut: read then write, so simultaneous requests can pass the cap by a few; fine for a contact form.
  const overDailyCap = async () => {
    const today = new Date(now()).toISOString().slice(0, 10);
    const saved = await store.get('daily');
    const count = saved?.day === today ? saved.count : 0;
    if (count >= DAILY_LIMIT) return true;
    await store.set('daily', { day: today, count: count + 1 });
    return false;
  };

  return async (req, context) => {
    if (req.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } });
    const json = req.headers.get('accept')?.includes('application/json');
    const reply = (status, error) =>
      json ? Response.json(error ? { error } : { ok: true }, { status }) : page(status, error);

    let form;
    try {
      form = await req.formData();
    } catch {
      return reply(400, 'invalid');
    }
    // Only bots fill the hidden field: they get a fake success.
    if (form.get('website')) return reply(200);
    if (limited(context?.ip ?? 'unknown')) return reply(429, 'limited');

    const name = String(form.get('name') ?? '').replace(/\s+/g, ' ').trim();
    const email = String(form.get('email') ?? '').trim();
    const message = String(form.get('message') ?? '').trim();
    if (!name || name.length > 100 || email.length > 254 || !EMAIL.test(email) || !message || message.length > 3000) {
      return reply(400, 'invalid');
    }
    if (!env.RESEND_API_KEY || !env.CONTACT_TO || !env.CONTACT_FROM) return reply(500, 'failed');
    try {
      if (await overDailyCap()) return reply(429, 'limited');
    } catch {
      // Without the count the cap cannot hold: send nothing.
      return reply(500, 'failed');
    }

    const sent = await send({
      from: env.CONTACT_FROM,
      to: [env.CONTACT_TO],
      reply_to: email,
      subject: `Doc Anonymizer: messaggio da ${name}`,
      text: `Nome: ${name}\nEmail: ${email}\n\n${message}`,
    });
    return sent ? reply(200) : reply(502, 'failed');
  };
}

/** The answer for a form posted without JavaScript. */
function page(status, error) {
  const text = !error
    ? 'Messaggio inviato. Ti rispondo appena posso.'
    : error === 'invalid'
      ? 'Controlla nome, email e messaggio, poi riprova.'
      : error === 'limited'
        ? 'Troppi messaggi: riprova più tardi.'
        : 'Invio non riuscito: riprova più tardi.';
  const html = `<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Doc Anonymizer</title><body style="font:18px/1.55 -apple-system,sans-serif;max-width:32em;margin:15vh auto;padding:0 24px;color:#0b1f33;background:#f3f6f9"><p>${text}</p><p><a href="/">Torna al sito</a></p></body></html>`;
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

async function resend(email) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify(email),
  });
  return res.ok;
}

// Opened per call: the Blobs context exists only while a request runs.
const blobs = () => getStore({ name: 'contact-messages', consistency: 'strong' });
const store = { get: key => blobs().get(key, { type: 'json' }), set: (key, value) => blobs().setJSON(key, value) };

export default createHandler({ env: process.env, send: resend, store });

export const config = { path: '/api/contact' };
