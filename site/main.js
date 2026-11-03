const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

document.getElementById('year').textContent = new Date().getFullYear();

// Sticky header: tone step once the page scrolls, and scroll spy on the nav
const header = document.querySelector('.top');
addEventListener('scroll', () => header.classList.toggle('scrolled', scrollY > 8), { passive: true });
const navLinks = [...document.querySelectorAll('.top nav a[href^="#"]')];
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
wifi.addEventListener('click', () => {
  const on = wifi.getAttribute('aria-checked') !== 'true';
  wifi.setAttribute('aria-checked', String(on));
  offline.dataset.net = on ? 'on' : 'off';
  document.getElementById('wifi-state').textContent = on ? 'Acceso' : 'Spento';
  document.getElementById('offline-h').textContent = on ? 'Wi‑Fi acceso. Non serve.' : 'Wi‑Fi spento. Funziona.';
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
