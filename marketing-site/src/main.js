import { initScrollDepth } from './scrollDepth.js';

const APP_URL =
  import.meta.env.VITE_MARQQ_APP_URL || 'https://marqq.up.railway.app';

const EARLY_ACCESS_MAILTO = `mailto:support@marqq.ai?subject=${encodeURIComponent('Early access — Marqq AI')}&body=${encodeURIComponent(
  'Please add me to the Marqq AI early access list. I understand you will email me when a workspace is available.\n\nWork email:\nCompany:\nRole:\n',
)}`;

/** Log in → deployed app */
function wireAuthLinks() {
  document.querySelectorAll('a[data-auth], button[data-auth]').forEach((el) => {
    if (el.tagName === 'A') {
      el.setAttribute('href', APP_URL);
      el.setAttribute('rel', 'noopener noreferrer');
    } else {
      el.addEventListener('click', () => {
        window.location.href = APP_URL;
      });
    }
  });
}

/** Get early access → mailto (same inbox as product; you can swap for a form URL later). */
function wireEarlyAccess() {
  document.querySelectorAll('a[data-early-access]').forEach((el) => {
    el.setAttribute('href', EARLY_ACCESS_MAILTO);
  });
}

function wireMobileNav() {
  const toggle = document.querySelector('[data-nav-toggle]');
  const drawer = document.querySelector('[data-mobile-drawer]');
  if (!toggle || !drawer) return;
  toggle.addEventListener('click', () => {
    const open = drawer.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  drawer.querySelectorAll('a').forEach((a) => {
    a.addEventListener('click', () => {
      drawer.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });
}

function wireActiveNav() {
  const page = document.body?.dataset?.page;
  if (!page) return;
  document.querySelectorAll(`[data-nav="${page}"]`).forEach((el) => {
    el.setAttribute('aria-current', 'page');
  });
}

function wireScrollReveal() {
  const nodes = document.querySelectorAll('.reveal, .reveal-3d, .reveal-fade');
  if (!nodes.length) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) {
    nodes.forEach((n) => n.classList.add('is-visible'));
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      });
    },
    { threshold: 0.08, rootMargin: '0px 0px -6% 0px' },
  );
  nodes.forEach((el) => io.observe(el));
}

function wireContactForm() {
  const form = document.querySelector('[data-contact-form]');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const name = String(fd.get('name') || '').trim();
    const email = String(fd.get('email') || '').trim();
    const subject = encodeURIComponent(String(fd.get('subject') || 'Marqq AI — website inquiry'));
    const body = encodeURIComponent(
      `Name: ${name}\nEmail: ${email}\n\n${String(fd.get('message') || '')}`,
    );
    window.location.href = `mailto:support@marqq.ai?subject=${subject}&body=${body}`;
  });
}

wireAuthLinks();
wireEarlyAccess();
wireMobileNav();
wireActiveNav();
wireScrollReveal();
initScrollDepth();
wireContactForm();
