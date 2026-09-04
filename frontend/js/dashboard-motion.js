/* Framework-free adaptations of the laptop scroll, 3D cards and blur-in headings
   in apply.docx. No wrappers are added to live controls or mirrored content. */
(function () {
  const headingDelay = 250;
  const headingDuration = 1100;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const pointer = matchMedia('(hover: hover) and (pointer: fine)');
  const cardSelector = '.service-card, .worker-card, .layout-grid-card, .grid-3 > .card.panel';
  const headingSelector = 'h1,h2,h3,h4,h5,h6,[role="heading"],.dashboard-preview-heading';
  const scrollSections = new Set();
  const visibleScrollSections = new Set();
  const pendingHeadings = new Set();
  const seenHeadings = new WeakSet();
  const animations = new Map();
  const roots = new Set();
  let scanFrame = 0, scrollFrame = 0, pointerFrame = 0;
  let activeCard = null, cardRect = null, point = null;

  function dashboardFor(el) {
    const dashboard = el?.closest?.('main.dashboard');
    return dashboard?.querySelector('#userContent,#workerContent') ? dashboard : null;
  }

  function each(root, selector, callback) {
    if (root.matches?.(selector)) callback(root);
    root.querySelectorAll?.(selector).forEach(callback);
  }

  function reveal(heading) {
    headingObserver?.unobserve(heading);
    pendingHeadings.delete(heading);
    if (reduce.matches || !heading.isConnected || !heading.animate) return;
    // Animate the existing element so labels, links and translated text stay intact.
    const animation = heading.animate([
      { filter: 'blur(8px)', opacity: 0 },
      { filter: 'blur(0px)', opacity: 1 }
    ], { delay: headingDelay, duration: headingDuration, fill: 'backwards', easing: 'cubic-bezier(.2,.65,.3,1)' });
    animations.set(heading, animation);
    animation.onfinish = animation.oncancel = () => animations.delete(heading);
  }

  const headingObserver = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(entries => {
      entries.forEach(entry => { if (entry.isIntersecting) reveal(entry.target); });
    }, { threshold: 0.15 }) : null;

  const scrollObserver = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) visibleScrollSections.add(entry.target);
        else visibleScrollSections.delete(entry.target);
      });
      scheduleScroll();
    }) : null;

  function refresh(root) {
    each(root, cardSelector, card => {
      if (dashboardFor(card)) card.classList.add('sev-motion-card');
    });
    each(root, headingSelector, heading => {
      if (!dashboardFor(heading) || seenHeadings.has(heading)) return;
      seenHeadings.add(heading);
      if (reduce.matches) return;
      if (headingObserver) { pendingHeadings.add(heading); headingObserver.observe(heading); }
      else reveal(heading);
    });
    each(root, '[data-sevahub-macbook3d], [data-dashboard-scroll]', section => {
      if (!dashboardFor(section) || scrollSections.has(section)) return;
      scrollSections.add(section);
      if (scrollObserver) scrollObserver.observe(section);
      else visibleScrollSections.add(section);
    });
  }

  function cleanDetached() {
    scrollSections.forEach(section => {
      if (section.isConnected) return;
      scrollObserver?.unobserve(section);
      scrollSections.delete(section);
      visibleScrollSections.delete(section);
    });
    pendingHeadings.forEach(heading => {
      if (heading.isConnected) return;
      headingObserver?.unobserve(heading);
      pendingHeadings.delete(heading);
    });
    animations.forEach((animation, heading) => { if (!heading.isConnected) animation.cancel(); });
    if (activeCard && !activeCard.isConnected) resetCard();
  }

  function queue(root) {
    if (root?.nodeType === 1) roots.add(root);
    if (scanFrame) return;
    scanFrame = requestAnimationFrame(() => {
      scanFrame = 0;
      cleanDetached();
      const pending = [...roots];
      roots.clear();
      pending.forEach(root => {
        if (root.isConnected && !pending.some(other => other !== root && other.contains(root))) refresh(root);
      });
      scheduleScroll();
    });
  }

  function updateScroll() {
    scrollFrame = 0;
    if (document.hidden) return;
    // Read geometry before writing styles, once per scroll frame and only in view.
    const updates = [...visibleScrollSections].filter(el => el.isConnected).map(section => {
      const rect = section.getBoundingClientRect();
      const range = Math.max(1, Math.min(rect.height, innerHeight) * 0.85);
      const hero = section.hasAttribute('data-dashboard-scroll');
      const progress = Math.max(0, Math.min(1, hero
        ? (80 - rect.top) / Math.max(1, rect.height * 0.65)
        : (innerHeight - rect.top) / range));
      return [section, reduce.matches ? 1 : progress];
    });
    updates.forEach(([section, progress]) => {
      if (section.hasAttribute('data-dashboard-scroll')) {
        const startScale = innerWidth <= 800 ? 0.92 : 1.05;
        section.style.setProperty('--sev-hero-angle', `${20 * (1 - progress)}deg`);
        section.style.setProperty('--sev-hero-scale', String(startScale + (1 - startScale) * progress));
        section.style.setProperty('--sev-hero-title-y', `${-70 * progress}px`);
        return;
      }
      section.style.setProperty('--sev-lid-angle', `${-38 * (1 - progress)}deg`);
      section.style.setProperty('--sev-lid-scale', String(0.88 + 0.12 * progress));
      section.style.setProperty('--sev-lid-rise', `${-12 * progress}px`);
    });
  }

  function scheduleScroll() {
    if (!scrollFrame && !document.hidden) scrollFrame = requestAnimationFrame(updateScroll);
  }

  function resetCard() {
    if (pointerFrame) cancelAnimationFrame(pointerFrame);
    pointerFrame = 0;
    if (activeCard) {
      activeCard.classList.remove('sev-motion-active');
      activeCard.style.removeProperty('--sev-card-x');
      activeCard.style.removeProperty('--sev-card-y');
    }
    activeCard = cardRect = point = null;
  }

  document.addEventListener('pointermove', event => {
    if (reduce.matches || !pointer.matches || event.pointerType === 'touch') return;
    const card = event.target.closest?.('.sev-motion-card');
    if (!card || !dashboardFor(card)) { resetCard(); return; }
    if (card !== activeCard) {
      resetCard();
      activeCard = card;
      cardRect = card.getBoundingClientRect();
      card.classList.add('sev-motion-active');
    }
    point = { x: event.clientX, y: event.clientY };
    if (pointerFrame) return;
    pointerFrame = requestAnimationFrame(() => {
      pointerFrame = 0;
      if (!activeCard?.isConnected || !cardRect.width || !cardRect.height) { resetCard(); return; }
      const x = Math.max(-0.5, Math.min(0.5, (point.x - cardRect.left) / cardRect.width - 0.5));
      const y = Math.max(-0.5, Math.min(0.5, (point.y - cardRect.top) / cardRect.height - 0.5));
      activeCard.style.setProperty('--sev-card-x', `${-y * 14}deg`);
      activeCard.style.setProperty('--sev-card-y', `${x * 14}deg`);
    });
  }, { passive: true });
  document.addEventListener('pointerout', event => {
    if (activeCard && !activeCard.contains(event.relatedTarget)) resetCard();
  }, { passive: true });
  document.addEventListener('pointercancel', resetCard, { passive: true });
  window.addEventListener('blur', resetCard);
  // Focus opens the laptop immediately so transformed controls remain easy to use.
  document.addEventListener('focusin', event => {
    const section = event.target.closest?.('[data-sevahub-macbook3d]');
    if (section) {
      section.style.setProperty('--sev-lid-angle', '0deg');
      section.style.setProperty('--sev-lid-scale', '1');
    }
  });
  document.addEventListener('scroll', () => { resetCard(); scheduleScroll(); }, { capture: true, passive: true });
  window.addEventListener('resize', () => { resetCard(); scheduleScroll(); }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    resetCard();
    if (!document.hidden) scheduleScroll();
  });
  reduce.addEventListener('change', () => {
    resetCard();
    if (reduce.matches) {
      animations.forEach(animation => animation.cancel());
      pendingHeadings.forEach(heading => headingObserver?.unobserve(heading));
      pendingHeadings.clear();
    }
    scheduleScroll();
  });
  pointer.addEventListener('change', resetCard);

  function start() {
    const app = document.getElementById('app') || document.body;
    refresh(app);
    new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1 && !node.matches('.sev-ripple')) queue(node);
        });
        if (mutation.removedNodes.length) queue(null);
      });
    }).observe(app, { childList: true, subtree: true });
    scheduleScroll();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
