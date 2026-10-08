(() => {
  const toggle = document.querySelector('.motion-toggle');
  if (!toggle) return;
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  let paused = media.matches;
  const render = () => {
    document.documentElement.classList.toggle('motion-paused', paused);
    toggle.setAttribute('aria-pressed', String(paused));
    toggle.querySelector('.motion-label').textContent = paused ? 'Play motion' : 'Pause motion';
    toggle.querySelector('.motion-icon').textContent = paused ? '▷' : 'Ⅱ';
  };
  document.documentElement.classList.add('motion-ready');
  toggle.hidden = false;
  render();
  toggle.addEventListener('click', () => { paused = !paused; render(); });
  media.addEventListener('change', () => { paused = media.matches; render(); });
})();
