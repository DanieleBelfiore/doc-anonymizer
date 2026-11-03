const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

document.getElementById('year').textContent = new Date().getFullYear();

// Sticky header: tone step once the page scrolls, and scroll spy on the nav
const header = document.querySelector('.top');
addEventListener('scroll', () => header.classList.toggle('scrolled', scrollY > 8), { passive: true });
const navLinks = [...document.querySelectorAll('.top nav a[href^="#"]:not([data-contact])')];
const spy = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    for (const a of navLinks) {
      if (a.getAttribute('href') === '#' + e.target.id) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    }
  }
}, { rootMargin: '-45% 0px -50% 0px' });
navLinks.forEach((a) => { const s = document.querySelector(a.getAttribute('href')); if (s) spy.observe(s); });

// Entrances: parts of each section arrive in reading order, once
document.querySelectorAll('main > section').forEach((s) => {
  s.querySelectorAll('[data-reveal]').forEach((el, i) => el.style.setProperty('--i', i % 8));
});
const reveal = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); reveal.unobserve(e.target); }
}, { rootMargin: '0px 0px -8% 0px' });
document.querySelectorAll('[data-reveal]').forEach((el) => reveal.observe(el));

// The live document: view switch, category chips and a slow crossfade until the visitor takes over
const demo = document.getElementById('demo');
const viewBtns = demo.querySelectorAll('[data-view]');
const chips = demo.querySelectorAll('.chips button');
const spans = demo.querySelectorAll('.pii');
let view = 'anon';
function paint() {
  const off = new Set([...chips].filter((c) => c.getAttribute('aria-pressed') === 'false').map((c) => c.dataset.type));
  spans.forEach((s) => s.classList.toggle('on', view === 'anon' && !off.has(s.dataset.type)));
  viewBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
}
let auto = null;
function stopAuto() { clearInterval(auto); auto = null; }
viewBtns.forEach((b) => b.addEventListener('click', () => { stopAuto(); view = b.dataset.view; paint(); }));
chips.forEach((c) => c.addEventListener('click', () => {
  stopAuto();
  c.setAttribute('aria-pressed', String(c.getAttribute('aria-pressed') !== 'true'));
  view = 'anon';
  paint();
}));
if (!reduced) {
  view = 'orig';
  paint();
  const tick = () => { view = view === 'anon' ? 'orig' : 'anon'; paint(); };
  setTimeout(tick, 900);
  auto = setInterval(tick, 5500);
  document.addEventListener('visibilitychange', () => {
    if (auto === null) return;
    clearInterval(auto);
    auto = document.hidden ? 0 : setInterval(tick, 5500);
  });
}

// The Wi-Fi switch: the field and one word of the heading follow it
const wifi = document.getElementById('wifi');
const offline = document.getElementById('offline');
const WIFI_TEXT = {
  on: [['Acceso', 'Wi‑Fi acceso. Non serve.'], ['On', 'Wi‑Fi on. Not needed.']],
  off: [['Spento', 'Wi‑Fi spento. Funziona.'], ['Off', 'Wi‑Fi off. It works.']],
};
function paintWifi() {
  const [state, heading] = WIFI_TEXT[offline.dataset.net][document.documentElement.lang === 'en' ? 1 : 0];
  document.getElementById('wifi-state').textContent = state;
  document.getElementById('offline-h').textContent = heading;
}
wifi.addEventListener('click', () => {
  const on = wifi.getAttribute('aria-checked') !== 'true';
  wifi.setAttribute('aria-checked', String(on));
  offline.dataset.net = on ? 'on' : 'off';
  paintWifi();
});

// Panel notes: the note under the pointer or focus lights its part of the panel
const panel = document.getElementById('panel');
document.querySelectorAll('.notes button').forEach((n) => {
  const on = () => {
    panel.classList.add('focus');
    panel.querySelectorAll('.p-part').forEach((p) => p.classList.toggle('lit', p.dataset.part === n.dataset.part));
  };
  const off = () => panel.classList.remove('focus');
  n.addEventListener('mouseenter', on);
  n.addEventListener('focus', on);
  n.addEventListener('mouseleave', off);
  n.addEventListener('blur', off);
});

// Contact: a modal form sent to netlify/functions/contact.mjs;
// without JavaScript the same form posts normally and :target shows it.
const contact = document.getElementById('contatti');
const contactForm = document.getElementById('contact-form');
const contactStatus = document.getElementById('contact-status');
const CONTACT_TEXT = {
  sending: ['Invio in corso…', 'Sending…'],
  ok: ['Messaggio inviato. Ti rispondo appena posso.', 'Message sent. I’ll get back to you as soon as I can.'],
  invalid: ['Controlla nome, email e messaggio, poi riprova.', 'Check your name, email and message, then try again.'],
  limited: ['Troppi messaggi: riprova più tardi.', 'Too many messages: try again later.'],
  failed: ['Invio non riuscito: riprova più tardi.', 'Sending failed: try again later.'],
};
function contactSay(key) {
  contactStatus.textContent = key ? CONTACT_TEXT[key][document.documentElement.lang === 'en' ? 1 : 0] : '';
  contactStatus.classList.toggle('error', !['sending', 'ok'].includes(key));
}
function openContact() {
  contactSay('');
  contact.showModal();
}
document.addEventListener('click', (e) => { if (e.target.closest('[data-contact]')) { e.preventDefault(); openContact(); } });
contact.querySelector('[data-close]').addEventListener('click', (e) => { e.preventDefault(); contact.close(); });
// A click on the backdrop closes it too.
contact.addEventListener('click', (e) => { if (e.target === contact) contact.close(); });
if (location.hash === '#contatti') { history.replaceState(null, '', location.pathname + location.search); openContact(); }
contactForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const send = contactForm.querySelector('button[type=submit]');
  send.disabled = true;
  contactSay('sending');
  try {
    const res = await fetch(contactForm.action, { method: 'POST', body: new FormData(contactForm), headers: { accept: 'application/json' } });
    const data = await res.json().catch(() => ({}));
    contactSay(res.ok ? 'ok' : (CONTACT_TEXT[data.error] ? data.error : 'failed'));
    if (res.ok) contactForm.reset();
  } catch {
    contactSay('failed');
  } finally {
    send.disabled = false;
  }
});

// Language: Italian by default, English on request. The English sits in data-en
// (inner HTML, written by us) and data-en-<attribute>; the Italian is kept on first switch.
const ATTRS = ['aria-label', 'alt', 'content'];
const italian = new Map(), italianAttrs = new Map();
function setLang(lang) {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-en]').forEach((el) => {
    if (!italian.has(el)) italian.set(el, el.innerHTML);
    el.innerHTML = lang === 'en' ? el.dataset.en : italian.get(el);
  });
  for (const a of ATTRS) document.querySelectorAll(`[data-en-${a}]`).forEach((el) => {
    const saved = italianAttrs.get(el) || {};
    saved[a] ??= el.getAttribute(a);
    italianAttrs.set(el, saved);
    el.setAttribute(a, lang === 'en' ? el.getAttribute(`data-en-${a}`) : saved[a]);
  });
  paintWifi();
}
let lang = new URLSearchParams(location.search).get('lang');
try { lang ??= localStorage.getItem('lang'); } catch {}
if (lang === 'en') setLang('en');
document.getElementById('lang').addEventListener('click', () => {
  lang = document.documentElement.lang === 'en' ? 'it' : 'en';
  setLang(lang);
  try { localStorage.setItem('lang', lang); } catch {}
});
