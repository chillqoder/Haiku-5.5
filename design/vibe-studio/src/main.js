const ORDER = ['tuning', 'pieces', 'method', 'rack', 'commission'];
const ROMAN = { tuning: 'I', pieces: 'II', method: 'III', rack: 'IV', commission: 'V' };
const LABEL = { tuning: 'Tuning', pieces: 'Pieces', method: 'Method', rack: 'Rack', commission: 'Commission' };
const GLYPHS = '01/\\|<>[]{}+*#_~';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const sections = [...document.querySelectorAll('.movement')];
const buttons = [...document.querySelectorAll('.dial button')];
const statusText = document.getElementById('status-text');

let current = null;
let field = null;

// Headline "tunes in": static glyphs resolve left to right into the real text.
function tune(el, duration = 900) {
  if (!el.dataset.html) el.dataset.html = el.innerHTML;
  if (reduceMotion) {
    el.innerHTML = el.dataset.html;
    return;
  }

  const template = document.createElement('template');
  template.innerHTML = el.dataset.html;
  const plain = [...template.content.textContent];
  const chars = plain.map((ch, i) => ({
    ch,
    at: (i / plain.length) * 0.6 + Math.random() * 0.4,
  }));

  const token = {};
  el._tuneToken = token;
  const start = performance.now();

  const step = (now) => {
    if (el._tuneToken !== token) return;
    const p = (now - start) / duration;
    if (p >= 1) {
      el.innerHTML = el.dataset.html;
      return;
    }
    el.textContent = chars
      .map(({ ch, at }) => (ch === ' ' || p > at ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0]))
      .join('');
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function show(name) {
  if (name === current || !ORDER.includes(name)) return;
  current = name;

  for (const section of sections) {
    section.classList.toggle('is-active', section.dataset.movement === name);
  }
  for (const button of buttons) {
    button.setAttribute('aria-current', String(button.dataset.movement === name));
  }

  const active = sections.find((section) => section.dataset.movement === name);
  active.scrollTop = 0;
  const title = active.querySelector('[data-tune]');
  if (title) tune(title);

  field?.setMood(name);
  statusText.textContent = `Tuned to ${ROMAN[name]} · ${LABEL[name]}`;
}

function go(name) {
  if (name === current) return;
  history.pushState(null, '', `#${name}`);
  show(name);
}

function readHash() {
  const name = location.hash.slice(1);
  return ORDER.includes(name) ? name : 'tuning';
}

for (const button of buttons) {
  button.addEventListener('click', () => go(button.dataset.movement));
}

// "Listen" re-tunes the rope to a single piece without changing movement.
for (const button of document.querySelectorAll('[data-mood]')) {
  button.addEventListener('click', () => {
    field?.setMood(button.dataset.mood);
    statusText.textContent = `Playing ${button.closest('.piece')?.querySelector('h3')?.textContent ?? button.dataset.mood}`;
  });
}

// Tempo on the commission form sets how fast the rope runs (60–180 bpm).
const tempo = document.getElementById('tempo');
const tempoOut = document.getElementById('tempo-out');
tempo?.addEventListener('input', () => {
  tempoOut.textContent = tempo.value;
  field?.setTempo(Number(tempo.value));
});

document.querySelector('.wordmark').addEventListener('click', (event) => {
  event.preventDefault();
  go('tuning');
});

window.addEventListener('popstate', () => show(readHash()));

// Keys 1–5 jump to a movement; arrows step through them like a tuning dial.
window.addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const index = ORDER.indexOf(current);
  const digit = Number(event.key);
  if (digit >= 1 && digit <= ORDER.length) {
    go(ORDER[digit - 1]);
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
    go(ORDER[Math.min(ORDER.length - 1, index + 1)]);
  } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
    go(ORDER[Math.max(0, index - 1)]);
  }
});

// Cursor strums the rope; its speed decides how hard the strings are hit.
let lastX = null;
let lastY = null;
window.addEventListener('pointermove', (event) => {
  const nx = (event.clientX / window.innerWidth) * 2 - 1;
  const ny = -(event.clientY / window.innerHeight) * 2 + 1;
  const dx = lastX === null ? 0 : event.clientX - lastX;
  const dy = lastY === null ? 0 : event.clientY - lastY;
  lastX = event.clientX;
  lastY = event.clientY;

  if (field) {
    field.strum(nx, ny, Math.min(1, Math.hypot(dx, dy) / 40) * 0.6);
    field.setParallax(nx, ny);
  }
});

// The 3D rope loads on its own, so navigation and text still work without it.
import('./field.js')
  .then(({ createField }) => {
    field = createField(document.getElementById('field'));
    field.setMood(current ?? 'tuning');
  })
  .catch(() => {
    statusText.textContent = 'Offline · strings muted';
  });

show(readHash());
