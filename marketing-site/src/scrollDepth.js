/**
 * Scroll-linked 3D depth — rAF-throttled, transform-only (GPU-friendly).
 * Planes use viewport position for rotateX / rotateY / translateZ + subtle scale.
 */
export function initScrollDepth() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  const layers = document.querySelectorAll('[data-depth-layer]');
  const planes = document.querySelectorAll('[data-scroll-plane]');
  const heroStage = document.querySelector('[data-hero-depth]');

  if (!layers.length && !planes.length && !heroStage) return;

  let ticking = false;
  let lastScrollY = -1;

  function applyLayerTransforms(scrollY) {
    layers.forEach((el) => {
      const baseZ = parseFloat(el.dataset.baseZ || '0');
      const baseY = parseFloat(el.dataset.baseY || '0');
      const mulY = parseFloat(el.dataset.depthY || '0');
      const mulZ = parseFloat(el.dataset.depthZ || '0');
      const mulRx = parseFloat(el.dataset.depthRx || '0');
      const ty = baseY + scrollY * mulY;
      const tz = baseZ + scrollY * mulZ;
      const rx = scrollY * mulRx;
      el.style.transform = `translate3d(0, ${ty}px, ${tz}px) rotateX(${rx}deg)`;
    });

    if (heroStage) {
      const mul = parseFloat(heroStage.dataset.heroTilt || '0.018');
      const sy = scrollY;
      heroStage.style.transform = `rotateX(${sy * mul}deg) rotateY(${sy * mul * -0.22}deg)`;
    }
  }

  function applyPlaneTransforms() {
    const vh = window.innerHeight;
    const maxRot = parseFloat(document.body.dataset.scrollMaxRot || '36');
    const maxZ = parseFloat(document.body.dataset.scrollMaxZ || '96');
    /** Smaller divisor = stronger tilt as blocks cross the viewport */
    const curve = parseFloat(document.body.dataset.scrollDepthCurve || '0.4');

    for (let i = 0; i < planes.length; i++) {
      const el = planes[i];
      const r = el.getBoundingClientRect();
      if (r.bottom < -160 || r.top > vh + 160) continue;
      const mid = r.top + r.height / 2;
      const n = Math.max(-1, Math.min(1, (mid - vh * 0.5) / (vh * curve)));
      const mult = parseFloat(el.dataset.depthMult ?? '1');
      const rotX = n * -maxRot * mult;
      const rotY = n * maxRot * 0.2 * mult;
      const tz = (1 - Math.abs(n)) * maxZ * mult;
      const scale = 0.86 + (1 - Math.abs(n)) * 0.16 * mult;
      const py = n * 32 * mult;
      el.style.transform = `perspective(1280px) rotateX(${rotX}deg) rotateY(${rotY}deg) translateZ(${tz}px) translateY(${py}px) scale(${scale})`;
    }
  }

  function tick() {
    const scrollY = window.scrollY;
    if (scrollY !== lastScrollY) {
      lastScrollY = scrollY;
      document.documentElement.style.setProperty('--marqq-scroll-y', `${scrollY}px`);
      applyLayerTransforms(scrollY);
    }
    applyPlaneTransforms();
    ticking = false;
  }

  function requestTick() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(tick);
    }
  }

  window.addEventListener('scroll', requestTick, { passive: true });
  window.addEventListener('resize', requestTick, { passive: true });
  tick();
}
