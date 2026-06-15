 // slider.js — Auto-slider with prev/next buttons and image tracker
(function () {
  const wrapper = document.querySelector('.slider');
  if (!wrapper) return;

  const slides = Array.from(wrapper.querySelectorAll('.slide'));
  if (!slides.length) return;

  let current = 0;
  let timer   = null;

  // ── Build Controls ────────────────────────
  const prevBtn = document.createElement('button');
  prevBtn.className = 'slider-btn slider-prev';
  prevBtn.setAttribute('aria-label', 'Previous image');
  prevBtn.innerHTML = '&#8249;';

  const nextBtn = document.createElement('button');
  nextBtn.className = 'slider-btn slider-next';
  nextBtn.setAttribute('aria-label', 'Next image');
  nextBtn.innerHTML = '&#8250;';

  const tracker = document.createElement('div');
  tracker.className = 'slider-tracker';

  wrapper.appendChild(prevBtn);
  wrapper.appendChild(nextBtn);
  wrapper.appendChild(tracker);

  // ── Dot per slide ─────────────────────────
  const dots = slides.map((_, i) => {
    const d = document.createElement('span');
    d.className = 'slider-dot' + (i === 0 ? ' dot-active' : '');
    d.addEventListener('click', () => goTo(i));
    tracker.appendChild(d);
    return d;
  });

  // ── Go-to helper ──────────────────────────
  function goTo(index, direction) {
    const prev = current;
    current    = (index + slides.length) % slides.length;

    if (prev === current) return;

    const outClass = direction === 'prev' ? 'slide-exit-right' : 'slide-exit';

    slides[prev].classList.remove('slide-active');
    slides[prev].classList.add(outClass);

    slides[current].classList.add('slide-active');

    setTimeout(() => {
      slides[prev].classList.remove(outClass);
    }, 600);

    dots.forEach((d, i) => d.classList.toggle('dot-active', i === current));
  }

  function advance() { goTo(current + 1, 'next'); }
  function retreat() { goTo(current - 1, 'prev'); }

  // ── Auto-play ─────────────────────────────
  function startAuto() {
    stopAuto();
    timer = setInterval(advance, 3000);
  }

  function stopAuto() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  nextBtn.addEventListener('click', () => { advance(); startAuto(); });
  prevBtn.addEventListener('click', () => { retreat(); startAuto(); });

  // Pause on hover
  wrapper.addEventListener('mouseenter', stopAuto);
  wrapper.addEventListener('mouseleave', startAuto);

  startAuto();
})();
