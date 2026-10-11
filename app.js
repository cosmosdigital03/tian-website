(() => {
  'use strict';
  document.body.classList.add('js-enabled');
  const stages = {
    device: {
      kicker: '00 / YOUR STARTING POINT', title: 'Your device',
      description: 'Your iPhone starts the connection. Traffic follows the entry-to-exit route illustrated above before continuing to the internet.',
      sees: 'The apps and websites you choose to use.',
      separate: 'Your original connecting IP from the exit relay, by design.',
      note: 'Your iPhone starts both parts of the nested connection.'
    },
    entry: {
      kicker: '01 / THE FIRST RELAY', title: 'Identity Shield / Entry',
      description: 'Your device connects to Entry through the outer WireGuard tunnel. Entry forwards the encrypted inner connection toward Exit.',
      sees: 'The IP address connecting to TIAN.',
      separate: 'The destination handled by the exit relay.',
      note: 'One identity-facing role. A separate destination-facing role.'
    },
    exit: {
      kicker: '02 / THE ONWARD CONNECTION', title: 'Destination Shield / Exit',
      description: 'Exit handles the inner WireGuard connection and routes traffic onward to your destination. Entry and Exit handle distinct parts of that route.',
      sees: 'The destination needed to route your traffic.',
      separate: 'The original IP address connecting to the entry relay.',
      note: 'Nested tunnels give Entry and Exit separate network roles.'
    },
    internet: {
      kicker: '03 / YOUR DESTINATION', title: 'The internet',
      description: 'Your connection reaches the website or service you choose through Exit. The website receives the Exit IP for this network connection.',
      sees: 'The exit IP, plus information you share with the website.',
      separate: 'The original connecting IP, as intended by the VPN route.',
      note: 'Your destination receives a connection from the Exit relay.'
    }
  };
  const scenarios = {
    wifi: {
      kicker: 'A CAFÉ CONNECTION', title: 'Your connection.\nA private way through.',
      description: 'TIAN encrypts the connection from your iPhone through Entry and Exit. Your browsing follows a private route instead of going directly from the shared network to its destination.',
      boundary: 'Use HTTPS alongside your private route for protection all the way to supported websites.',
      label: 'SHARED NETWORK', icon: '<path d="M3 8a15 15 0 0 1 18 0M6 12a10 10 0 0 1 12 0M9 16a5 5 0 0 1 6 0"/><circle cx="12" cy="20" r=".7"/>'
    },
    home: {
      kicker: 'YOUR EVERYDAY CONNECTION', title: 'Your everyday route.\nLess unwanted traffic.',
      description: 'Enabled filter lists help block connections to known advertising, tracking, and malicious domains, alongside the two-relay private route.',
      boundary: 'Coverage varies by website and app. Optional Safari content blocking adds page-level filtering in Safari on iPhone.',
      label: 'HOME NETWORK', icon: '<path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8"/>'
    },
    move: {
      kicker: 'BETWEEN NETWORKS', title: 'Different places.\nGood habits travel.',
      description: 'TIAN brings the same Entry and Exit design to your iPhone’s internet connection, whether you’re at home, at a café, or on a mobile network.',
      boundary: 'Check the app’s connection state when changing networks, and keep using HTTPS for supported websites.',
      label: 'CHANGING NETWORKS', icon: '<path d="m15 3-6 7h6l-6 11M5 4H2M5 10H2M5 16H2M19 8h3M19 14h3M19 20h3"/>'
    }
  };
  function wireTabs(selector, attribute, render) {
    const tabs = [...document.querySelectorAll(selector)];
    if (!tabs.length) return;
    function select(tab, focus = false) {
      tabs.forEach(item => {
        const selected = item === tab;
        item.setAttribute('aria-selected', String(selected));
        item.tabIndex = selected ? 0 : -1;
      });
      render(tab.dataset[attribute], tab.id);
      if (focus) tab.focus({ preventScroll: true });
    }
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => select(tab));
      tab.addEventListener('keydown', event => {
        let next;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (i + 1) % tabs.length;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (i - 1 + tabs.length) % tabs.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = tabs.length - 1;
        if (next !== undefined) { event.preventDefault(); select(tabs[next], true); }
      });
    });
  }
  const setText = (id, text) => { const target = document.getElementById(id); if (target) target.textContent = text; };
  wireTabs('.stage-tab', 'stage', (stage, id) => {
    const data = stages[stage];
    if (!data) return;
    setText('stage-kicker', data.kicker); setText('stage-title', data.title);
    setText('stage-description', data.description); setText('stage-sees', data.sees);
    setText('stage-separate', data.separate); setText('stage-note', data.note);
    document.getElementById('stage-panel').setAttribute('aria-labelledby', id);
    document.querySelector('.scene-art').dataset.selected = stage;
  });
  wireTabs('.scenario-tab', 'scenario', (scenario, id) => {
    const data = scenarios[scenario];
    if (!data) return;
    setText('scenario-kicker', data.kicker); setText('scenario-title', data.title);
    setText('scenario-description', data.description); setText('scenario-boundary', data.boundary);
    setText('scenario-art-label', data.label);
    document.getElementById('scenario-panel').setAttribute('aria-labelledby', id);
    // Fixed local SVG strings only. No user input, remote content, or network requests.
    document.querySelector('.signal-mark .icon').innerHTML = data.icon;
  });
  const scenarioTablist = document.querySelector('.scenario-tabs');
  if (scenarioTablist) {
    const compactLayout = window.matchMedia('(max-width: 850px)');
    const syncOrientation = () => scenarioTablist.setAttribute('aria-orientation', compactLayout.matches ? 'horizontal' : 'vertical');
    syncOrientation();
    if (compactLayout.addEventListener) compactLayout.addEventListener('change', syncOrientation);
    else if (compactLayout.addListener) compactLayout.addListener(syncOrientation);
  }
  const motionButton = document.querySelector('.motion-toggle');
  if (motionButton) {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let paused = preference.matches;
    function applyMotion() {
      document.body.classList.toggle('motion-paused', paused);
      document.body.classList.toggle('motion-enabled', !paused);
      motionButton.setAttribute('aria-pressed', String(paused));
      motionButton.querySelector('span').textContent = paused ? 'Resume motion' : 'Pause motion';
      motionButton.querySelector('svg').innerHTML = paused ? '<path d="m8 4 12 8-12 8Z"/>' : '<path d="M8 5v14M16 5v14"/>';
    }
    motionButton.hidden = false;
    applyMotion();
    motionButton.addEventListener('click', () => { paused = !paused; applyMotion(); });
    const preferenceChanged = () => { if (preference.matches) { paused = true; applyMotion(); } };
    if (preference.addEventListener) preference.addEventListener('change', preferenceChanged);
    else if (preference.addListener) preference.addListener(preferenceChanged);
  }
})();
