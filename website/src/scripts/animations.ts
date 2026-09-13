import { animate, stagger } from 'animejs';

export function setupScrollAnimations() {
  if (typeof window === 'undefined') return;

  // Respect prefers-reduced-motion
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) return;

  // 1. Reveal Section Headers & Single Blocks
  const revealElements = document.querySelectorAll<HTMLElement>('[data-anime="reveal"]');
  if (revealElements.length > 0) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const target = entry.target as HTMLElement;
            animate(target, {
              opacity: [0, 1],
              translateY: [28, 0],
              duration: 750,
              ease: 'outExpo',
            });
            observer.unobserve(target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );

    revealElements.forEach((el) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(28px)';
      observer.observe(el);
    });
  }

  // 2. Staggered Grid Card Reveals
  const staggerContainers = document.querySelectorAll<HTMLElement>('[data-anime="stagger"]');
  if (staggerContainers.length > 0) {
    const staggerObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const container = entry.target as HTMLElement;
            const items = container.querySelectorAll<HTMLElement>(':scope > *');
            if (items.length > 0) {
              animate(items, {
                opacity: [0, 1],
                translateY: [24, 0],
                delay: stagger(75),
                duration: 650,
                ease: 'outExpo',
              });
            }
            staggerObserver.unobserve(container);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -30px 0px' }
    );

    staggerContainers.forEach((container) => {
      const items = container.querySelectorAll<HTMLElement>(':scope > *');
      items.forEach((item) => {
        item.style.opacity = '0';
        item.style.transform = 'translateY(24px)';
      });
      staggerObserver.observe(container);
    });
  }

  // 3. Counter Animation for Benchmarks / Metrics
  const counterElements = document.querySelectorAll<HTMLElement>('[data-counter-target]');
  if (counterElements.length > 0) {
    const counterObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement;
            const targetVal = parseFloat(el.getAttribute('data-counter-target') || '0');
            const suffix = el.getAttribute('data-counter-suffix') || '';
            const decimals = parseInt(el.getAttribute('data-counter-decimals') || '0', 10);

            const obj = { val: 0 };
            animate(obj, {
              val: targetVal,
              duration: 1200,
              ease: 'outExpo',
              onUpdate: () => {
                el.textContent = (decimals > 0 ? obj.val.toFixed(decimals) : Math.round(obj.val).toString()) + suffix;
              },
            });

            counterObserver.unobserve(el);
          }
        });
      },
      { threshold: 0.3 }
    );

    counterElements.forEach((el) => counterObserver.observe(el));
  }
}
