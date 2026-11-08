/* Topic pages: bring the current tab into view in the horizontally scrolling topic bar (phones). */
(() => {
  'use strict';
  const tabs = document.querySelector('.topic-tabs');
  const current = tabs && tabs.querySelector('[aria-current="page"]');
  if (!tabs || !current) return;
  tabs.scrollLeft = Math.max(0, current.offsetLeft - (tabs.clientWidth - current.offsetWidth) / 2);
})();
