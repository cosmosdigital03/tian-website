const motionControl = document.querySelector('.motion-toggle');
motionControl?.addEventListener('click', () => {
  const paused = document.body.classList.toggle('motion-paused');
  motionControl.setAttribute('aria-pressed', String(paused));
  motionControl.textContent = paused ? 'Resume animation' : 'Pause animation';
});
