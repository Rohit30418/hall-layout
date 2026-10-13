/* =========================================================
   WOW UI Enhancements for ViewhallLayout — client-safe patch
   Frontend-only layer. Keeps backend/API and core map engine unchanged.
   ========================================================= */

(function () {
  let routeFromUrlApplied = false;
  let initialHighlightApplied = false;

  function $(id) { return document.getElementById(id); }

  window.escapeHtml = function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char];
    });
  };

  function normalize(value) { return String(value ?? '').trim(); }
  function lower(value) { return normalize(value).toLowerCase(); }
  function haptic(ms = 18) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (_) {} }

  function getAllStalls() {
    try {
      if (Array.isArray(window.__allStallData)) return window.__allStallData;
      if (Array.isArray(allStallData)) return allStallData;
    } catch (_) {}
    return [];
  }

  function getStatus(data) {
    if (!data) return { key: 'neutral', label: 'Unknown', icon: 'fa-circle-info' };
    // Provisionally Booked (YELLOW) must be checked BEFORE plain Booked,
    // otherwise blBooked=true + blPreBooked='1' is misclassified as 'booked'.
    if (data.blBooked !== 'false' && data.blPreBooked === '1') return { key: 'prebooked', label: 'Provisionally Booked', icon: 'fa-clock' };
    if (data.blBooked !== 'false') return { key: 'booked', label: 'Booked', icon: 'fa-lock' };
    if (data.blPreBooked === '1' || data.blTemp !== 'false') return { key: 'hold', label: 'On Hold', icon: 'fa-clock' };
    return { key: 'available', label: 'Available', icon: 'fa-check-circle' };
  }

  function findStall(stallNoOrSeatId) {
    try {
      if (typeof matchesStallKey === 'function') {
        return getAllStalls().find(s => matchesStallKey(s, stallNoOrSeatId));
      }
    } catch (_) {}
    const t = lower(stallNoOrSeatId);
    const tc = t.replace(/[^a-z0-9]/g, '');
    return getAllStalls().find(s => {
      const keys = [s.StallNo, s.SeatId, s.StallId, s.StallID, s.stallID, s.stallId];
      return keys.some(k => {
        const nk = lower(k);
        return nk && (nk === t || nk.replace(/[^a-z0-9]/g, '') === tc);
      });
    });
  }

  function statusBadgeHtml(status) {
    return `<span class="stall-chip ${status.key}"><i class="fa ${status.icon}"></i>${escapeHtml(status.label)}</span>`;
  }

  window.hideStallBottomCard = function hideStallBottomCard() {
    const card = $('stallBottomCard');
    if (card) card.classList.remove('show');
  };

  // Direct details popup. No favorite, share, start-here, or go-here buttons.
  window.openStallDetails = function openStallDetails(data) {
    if (!data || !window.jq) return;
    const status = getStatus(data);
    const stallNo = normalize(data.StallNo || '—');
    const company = normalize(data.txtComName) || (status.key === 'booked' ? 'Booked' : status.key === 'prebooked' ? 'Provisionally Booked' : status.key === 'hold' ? 'On Hold' : 'Available Stall');
    const cat = normalize(data.Category) || 'Normal';
    const target = status.key === 'booked' ? '#DivBook' : '#myModal';
    const initial = company.charAt(0).toUpperCase() || 'S';
    const safeSeatId = encodeURIComponent(normalize(data.SeatId || data.StallId || data.StallID || data.stallID || data.stallId));

    const html = `
      <div class="stall-card premium-dialog-card">
        <div style="text-align:center;margin-bottom:8px">
          <div class="co-avatar">${escapeHtml(initial)}</div>
          <div class="co-name">${escapeHtml(company)}</div>
          <span class="card-badge cb-${status.key === 'booked' ? 'booked' : (status.key === 'hold' || status.key === 'prebooked') ? 'hold' : 'available'}"><i class="fa ${status.icon}"></i> ${escapeHtml(status.label)}</span>
        </div>
        <div class="info-grid">
          <div class="info-cell"><div class="info-label">Stall No.</div><div class="info-val"><i class="fa fa-hashtag"></i>${escapeHtml(stallNo)}</div></div>
          <div class="info-cell"><div class="info-label">Area</div><div class="info-val"><i class="fa fa-vector-square"></i>${escapeHtml(data.Area || '—')} m²</div></div>
          <div class="info-cell"><div class="info-label">Dimensions</div><div class="info-val"><i class="fa fa-ruler-combined"></i>${escapeHtml(data.Dimention || '—')}</div></div>
          <div class="info-cell"><div class="info-label">Open Sides</div><div class="info-val"><i class="fa fa-door-open"></i>${escapeHtml(data.SideOpen || '—')}</div></div>
          <div class="info-cell" style="grid-column:span 2"><div class="info-label">Category / Scheme</div><div class="info-val"><i class="fa fa-layer-group"></i>${escapeHtml(cat)}${data.Scheme ? ' / ' + escapeHtml(data.Scheme) : ''}</div></div>
        </div>
        ${status.key === 'booked' && safeSeatId ? `<a class="btn-profile" href="https://register.acrex.in/ViewhallLayout.html?stallID=${safeSeatId}" target="_blank" rel="noopener">View Exhibitor <i class="fa fa-arrow-right"></i></a>` : ''}
      </div>`;

    jq(target).html(html).dialog({
      modal: true,
      width: Math.min(innerWidth * .92, 420),
      buttons: [{ text: 'Close', click: function () { jq(this).dialog('close'); } }]
    });
  };

  function showToast(message, icon = 'fa-circle-check') {
    const stack = $('toastStack');
    if (!stack) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<i class="fa ${icon}"></i><span>${escapeHtml(message)}</span>`;
    stack.appendChild(toast);
    setTimeout(() => toast.remove(), 2400);
  }
  window.showToast = showToast;

  window.showMapError = function showMapError(message) {
    const box = $('mapErrorBox');
    if (!box) return;
    box.querySelector('.map-error-text').textContent = message || 'Unable to load hall layout.';
    box.classList.add('show');
  };
  window.hideMapError = function hideMapError() { $('mapErrorBox')?.classList.remove('show'); };
  window.reloadCurrentHall = function reloadCurrentHall() { hideMapError(); if (typeof LoadSearchData === 'function') LoadSearchData(); };


  function initials(name) {
    return String(name || 'SM').trim().split(/\s+/).slice(0, 2).map(x => x[0] || '').join('').toUpperCase() || 'SM';
  }

  function buildMapProductShell() {
    // Keep only two purposeful map controls. Availability statistics remain
    // in the existing Hall Stats sidebar and do not need duplicate chips.
    if (!$('mapTopChips')) {
      const chips = document.createElement('div');
      chips.id = 'mapTopChips';
      chips.className = 'map-top-chips';
      chips.innerHTML = `
        <button class="map-chip primary" type="button" data-action="route"><i class="fa fa-route" aria-hidden="true"></i> Directions</button>
        <button class="map-chip" type="button" data-action="fit"><i class="fa fa-expand" aria-hidden="true"></i> Fit map</button>`;
      chips.addEventListener('click', function (e) {
        const btn = e.target.closest('.map-chip');
        if (!btn) return;
        if (btn.dataset.action === 'fit') {
          if (typeof resetMapView === 'function') resetMapView();
        } else if (btn.dataset.action === 'route') {
          if (typeof hasActiveRoute === 'function' && hasActiveRoute()) {
            if (typeof openNavDrawer === 'function') openNavDrawer();
          } else {
            if (typeof toggleSidebar === 'function') toggleSidebar();
            setTimeout(() => $('routeFrom')?.focus(), 140);
          }
        }
      });
      document.body.appendChild(chips);
    }
    if (!$('mapCompassLite')) {
      const compass = document.createElement('div');
      compass.id = 'mapCompassLite';
      compass.className = 'map-compass-lite';
      document.body.appendChild(compass);
    }
  }

  function updateMapProductShell() {
    // Map counters continue to be calculated for the existing sidebar.
    // Removed duplicate toolbar counters and promotional exhibitor carousel.
  }

  function updateTopChips() {
    const stalls = getAllStalls();
    const total = stalls.length;
    const avail = stalls.filter(d => d.blBooked === 'false' && d.blPreBooked !== '1' && d.blTemp === 'false').length;
    const booked = stalls.filter(d => d.blBooked !== 'false').length;
    const set = (id, val) => { const el = $(id); if (el) el.textContent = String(val); };
    set('chipTotal', total || '—');
    set('chipAvailable', avail || '—');
    set('chipBooked', booked || '—');
  }

  function updateSponsorStrip() {
    const strip = $('expoSponsorStrip');
    if (!strip) return;
    const stalls = getAllStalls();
    const seen = new Set();
    const cards = stalls
      .filter(d => normalize(d.txtComName))
      .filter(d => {
        const key = lower(d.txtComName);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 16);

    if (!cards.length) {
      strip.innerHTML = `<div class="expo-sponsor-card"><div class="expo-logo-mark">SM</div><div class="expo-logo-name">Stall Map</div></div>`;
      return;
    }

    strip.innerHTML = cards.map(d => `
      <button class="expo-sponsor-card" type="button" data-seat-id="${escapeHtml(d.SeatId || d.StallId || '')}" data-stall-no="${escapeHtml(d.StallNo || '')}" title="${escapeHtml(d.txtComName)}">
        <div class="expo-logo-mark">${escapeHtml(initials(d.txtComName))}</div>
        <div class="expo-logo-name">${escapeHtml(d.txtComName)}</div>
      </button>`).join('');

    strip.querySelectorAll('.expo-sponsor-card[data-stall-no]').forEach(btn => {
      btn.addEventListener('click', function () {
        if (typeof selectStallFromSearch === 'function') selectStallFromSearch(this.dataset.seatId || '', this.dataset.stallNo || '');
      });
    });
  }

  function focusFirstByStatus(status) {
    const stalls = getAllStalls();
    const d = stalls.find(x => {
      const booked = x.blBooked !== 'false';
      const hold = x.blPreBooked === '1' || x.blTemp !== 'false';
      if (status === 'available') return !booked && !hold;
      if (status === 'booked') return booked;
      return true;
    });
    if (!d) return showToast('No stall found for this filter', 'fa-circle-info');
    if (typeof selectStallFromSearch === 'function') selectStallFromSearch(d.SeatId || d.StallId || '', d.StallNo || '');
  }

  function buildEnhancementShell() {
    // Keep old element harmless for backwards compatibility, but direct popup is now used instead of bottom actions.
    if (!$('stallBottomCard')) {
      const card = document.createElement('div');
      card.id = 'stallBottomCard';
      card.className = 'stall-bottom-card';
      document.body.appendChild(card);
    }

    if (!$('mobileSearchPill')) {
      const pill = document.createElement('button');
      pill.id = 'mobileSearchPill';
      pill.className = 'mobile-search-pill';
      pill.innerHTML = '<i class="fa fa-magnifying-glass"></i><span>Search stall or company</span>';
      pill.addEventListener('click', openSearchSheet);
      document.body.appendChild(pill);
    }

    if (!$('searchSheetOverlay')) {
      const overlay = document.createElement('div');
      overlay.id = 'searchSheetOverlay';
      overlay.className = 'search-sheet-overlay';
      overlay.innerHTML = `
        <div class="search-sheet" role="dialog" aria-modal="true" aria-label="Search stalls">
          <div class="search-sheet-head">
            <div class="search-sheet-input-wrap">
              <i class="fa fa-magnifying-glass" style="color:var(--accent)"></i>
              <input id="wowSearchInput" class="search-sheet-input" placeholder="Search stall or company..." autocomplete="off" />
            </div>
            <button class="search-sheet-close" type="button" aria-label="Close search"><i class="fa fa-xmark"></i></button>
          </div>
          <div id="wowSearchResults" class="search-sheet-results search-results-dropdown"></div>
        </div>`;
      overlay.addEventListener('click', e => { if (e.target === overlay) closeSearchSheet(); });
      overlay.querySelector('.search-sheet-close').addEventListener('click', closeSearchSheet);
      document.body.appendChild(overlay);
      const input = $('wowSearchInput');
      const results = $('wowSearchResults');
      let t = null;
      input.addEventListener('input', function () {
        clearTimeout(t);
        t = setTimeout(() => renderSearchResults(this.value.trim(), results), 100);
      });
    }

    if (!$('mapErrorBox')) {
      const err = document.createElement('div');
      err.id = 'mapErrorBox';
      err.className = 'map-error-box';
      err.innerHTML = `
        <div class="map-error-icon"><i class="fa fa-wifi"></i></div>
        <div class="map-error-title">Map could not load</div>
        <div class="map-error-text">Please check internet connection and try again.</div>
        <button class="map-error-btn" onclick="reloadCurrentHall()"><i class="fa fa-rotate-right"></i> Retry</button>`;
      document.body.appendChild(err);
    }

    if (!$('toastStack')) {
      const stack = document.createElement('div');
      stack.id = 'toastStack';
      stack.className = 'toast-stack';
      document.body.appendChild(stack);
    }

    if (!$('mapHelpCard')) {
      const help = document.createElement('div');
      help.id = 'mapHelpCard';
      help.className = 'map-help-card';
      help.innerHTML = `
        <div class="help-title">How to use map <button onclick="closeHelpCard()"><i class="fa fa-xmark"></i></button></div>
        <div class="help-points">
          <div><i class="fa fa-hand-pointer"></i>Tap stall for details</div>
          <div><i class="fa fa-magnifying-glass"></i>Search company/stall</div>
          <div><i class="fa fa-route"></i>Use sidebar for directions</div>
        </div>`;
      document.body.appendChild(help);
    }

    const drawer = $('nav-drawer');
    if (drawer && !drawer.querySelector('.drawer-handle')) {
      drawer.insertAdjacentHTML('afterbegin', '<div class="drawer-handle"></div>');
    }

    buildMapProductShell();
    enhanceLegend();
  }

  window.closeHelpCard = function closeHelpCard() {
    $('mapHelpCard')?.classList.remove('show');
    try { localStorage.setItem('stallmap_help_seen', '1'); } catch (_) {}
  };

  function maybeShowHelp() {
    try {
      if (localStorage.getItem('stallmap_help_seen')) return;
      setTimeout(() => $('mapHelpCard')?.classList.add('show'), 900);
      setTimeout(() => closeHelpCard(), 8000);
    } catch (_) {}
  }

  function enhanceLegend() {
    const legend = document.querySelector('.map-legend');
    if (!legend || legend.dataset.enhanced === '1') return;
    legend.dataset.enhanced = '1';
    const old = legend.innerHTML;
    legend.innerHTML = `
      <button class="legend-head" type="button" aria-label="Toggle legend">
        <i class="fa fa-layer-group"></i><span>Legend</span><i class="fa fa-chevron-up legend-chev"></i>
      </button>
      <div class="legend-body">${old}</div>`;
    legend.querySelector('.legend-head').addEventListener('click', () => legend.classList.toggle('collapsed'));
    if (window.innerWidth <= 768) legend.classList.add('collapsed');
  }

  function openSearchSheet() {
    const overlay = $('searchSheetOverlay');
    overlay?.classList.add('open');
    setTimeout(() => $('wowSearchInput')?.focus(), 120);
  }
  function closeSearchSheet() { $('searchSheetOverlay')?.classList.remove('open'); }
  window.closeSearchSheet = closeSearchSheet;

  // Original-style suggestions, but escaped and works with separated JS files.
  if (typeof renderSearchResults === 'function') {
    renderSearchResults = function fixedRenderSearchResults(query, resultsEl) {
      if (!resultsEl) return;
      const stalls = getAllStalls();
      if (!query || !stalls.length) {
        resultsEl.classList.remove('open');
        resultsEl.style.display = 'none';
        resultsEl.innerHTML = '';
        return;
      }

      const q = lower(query);
      const qc = (typeof compactStallKey === 'function') ? compactStallKey(query) : q.replace(/[^a-z0-9]/g, '');
      const score = (d) => {
        const stall = lower(d.StallNo);
        const stallC = (typeof compactStallKey === 'function') ? compactStallKey(d.StallNo) : stall.replace(/[^a-z0-9]/g, '');
        const company = lower(d.txtComName);
        const companyC = (typeof compactStallKey === 'function') ? compactStallKey(d.txtComName) : company.replace(/[^a-z0-9]/g, '');
        const ids = [d.SeatId, d.StallId, d.StallID, d.stallID, d.stallId].map(lower);
        const idsC = [d.SeatId, d.StallId, d.StallID, d.stallID, d.stallId].map(v => (typeof compactStallKey === 'function') ? compactStallKey(v) : lower(v).replace(/[^a-z0-9]/g, ''));
        if (stall === q || ids.includes(q) || stallC === qc || idsC.includes(qc)) return 100;
        if (company === q || companyC === qc) return 90;
        if (stall.startsWith(q) || stallC.startsWith(qc)) return 80;
        if (company.startsWith(q) || companyC.startsWith(qc)) return 70;
        if (stall.includes(q) || stallC.includes(qc)) return 60;
        if (company.includes(q) || companyC.includes(qc)) return 50;
        if (ids.some(x => x.includes(q)) || idsC.some(x => x.includes(qc))) return 45;
        return 0;
      };
      const results = stalls
        .map(d => ({ d, score: score(d) }))
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score || String(a.d.StallNo).localeCompare(String(b.d.StallNo)))
        .slice(0, 12)
        .map(x => x.d);

      if (!results.length) {
        resultsEl.innerHTML = `<div class="search-empty"><i class="fa fa-magnifying-glass" style="display:block;font-size:18px;margin-bottom:4px;opacity:0.4"></i>No results for "${escapeHtml(query)}"</div>`;
      } else {
        resultsEl.innerHTML = results.map(d => {
          const status = d.blBooked !== 'false' ? 'booked' : (d.blPreBooked === '1' || d.blTemp !== 'false') ? 'hold' : 'available';
          const statusLabel = status === 'available' ? 'Free' : status === 'booked' ? 'Taken' : 'Hold';
          const company = normalize(d.txtComName);
          return `<div class="search-result-item" data-seat-id="${escapeHtml(d.SeatId)}" data-stall-id="${escapeHtml(d.StallId || d.StallID || d.stallID || d.stallId || '')}" data-stall-no="${escapeHtml(d.StallNo)}">
            <div class="sri-no">${escapeHtml(d.StallNo)}</div>
            <div class="sri-company">${company ? escapeHtml(company) : '<span style="color:var(--muted)">No exhibitor</span>'}</div>
            <div class="sri-badge ${status}">${statusLabel}</div>
          </div>`;
        }).join('');
      }

      resultsEl.classList.add('open');
      resultsEl.style.display = 'block';
      resultsEl.querySelectorAll('.search-result-item[data-stall-no]').forEach(item => {
        item.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          selectStallFromSearch(this.dataset.seatId || this.dataset.stallId || '', this.dataset.stallNo || '');
        });
      });
    };
  }

  // Stall click should directly open details popup, not bottom card/actions.
  if (typeof showStallDialog === 'function') {
    showStallDialog = function directDetailsShowStallDialog(data) {
      if (!data) return;
      try {
        const key = (typeof getStallPrimaryKey === 'function' ? getStallPrimaryKey(data) : (data.SeatId || data.StallId || data.StallID || data.stallID || data.stallId || data.StallNo || ''));
        if (typeof setActiveStallTarget === 'function') setActiveStallTarget(key, key && key !== data.StallNo ? 'id' : 'any');
        else searchTargetStallId = key;
      } catch (_) {}
      hideStallBottomCard();
      window.openStallDetails(data);
      haptic(15);
    };
  }

  // Search click should behave like original: hide sidebar/sheets and focus/highlight selected stall.
  if (typeof selectStallFromSearch === 'function') {
    const oldSelect = selectStallFromSearch;
    selectStallFromSearch = function fixedSelectStallFromSearch(seatId, stallNo) {
      hideStallBottomCard();
      closeSearchSheet();
      oldSelect(seatId, stallNo);
      if (typeof closeSidebar === 'function') closeSidebar();
      // Prefer backend id first so duplicate/similar stall names never highlight the wrong stall.
      const d = findStall(seatId) || findStall(stallNo);
      if (d) {
        const focusKey = (typeof getStallPrimaryKey === 'function' ? getStallPrimaryKey(d) : (d.SeatId || d.StallId || d.StallID || d.stallID || d.stallId || d.StallNo || ''));
        try {
          if (typeof setActiveStallTarget === 'function') setActiveStallTarget(focusKey, focusKey && focusKey !== d.StallNo ? 'id' : 'any');
          else searchTargetStallId = focusKey;
        } catch (_) {}
        if (currentView === '3d' && typeof rebuild3DAndFocus === 'function') rebuild3DAndFocus(focusKey);
        if (currentView === '2d' && typeof focusStall2d === 'function') focusStall2d(focusKey);
        showToast('Stall highlighted', 'fa-location-dot');
      }
    };
  }

  if (typeof calculateRoute === 'function') {
    const oldCalcRoute = calculateRoute;
    calculateRoute = function enhancedCalculateRoute() {
      const from = normalize($('routeFrom')?.value);
      const to = normalize($('routeTo')?.value);
      oldCalcRoute();
      if (from && to) {
        const url = new URL(window.location.href);
        url.searchParams.set('from', from);
        url.searchParams.set('to', to);
        history.replaceState(null, '', url.toString());
        showToast('Route ready', 'fa-route');
      }
    };
  }

  if (typeof clearRoute === 'function') {
    const oldClearRoute = clearRoute;
    clearRoute = function fixedClearRoute() {
      oldClearRoute();
      try { routePath2d = null; routeStart2d = null; routeEnd2d = null; } catch (_) {}
      try { navStepsData = []; currentNavStepIdx = 0; } catch (_) {}
      $('nav-fab')?.classList.remove('show');
      $('nav-drawer')?.classList.remove('open');
      const url = new URL(window.location.href);
      url.searchParams.delete('from');
      url.searchParams.delete('to');
      history.replaceState(null, '', url.toString());
      if (typeof render2dFrame === 'function' && currentView === '2d') render2dFrame();
      showToast('Route cleared', 'fa-xmark');
    };
  }

  if (typeof OnSuccess === 'function') {
    const oldOnSuccess = OnSuccess;
    OnSuccess = function enhancedOnSuccess(resp) {
      hideMapError();
      oldOnSuccess(resp);
      try { window.__allStallData = allStallData; window.__allUtilData = allUtilData; } catch (_) {}
      updateMapProductShell();

      // Apply deep-link state only after hall data is loaded.
      // URL example: ?HallId=23&StallId=14071407&hallName=HALL+6&from=H6-B11&to=H6-D9
      applyRouteFromUrlOnce();

      // Re-focus after route drawing because calculateRoute can move/refresh the map.
      setTimeout(applyInitialHighlightFromUrlOnce, routeFromUrlApplied ? 420 : 80);
    };
  }

  function applyInitialHighlightFromUrlOnce() {
    if (initialHighlightApplied) return;
    const params = new URLSearchParams(location.search);
    const targetParam = params.get('StallId') || params.get('stallId') || params.get('seatId') || params.get('StallNo') || params.get('stallNo');
    if (!targetParam) return;

    const d = findStall(targetParam);
    if (!d) {
      // In WebView/AJAX timing cases, data may not be exposed to the enhancement layer immediately.
      setTimeout(() => {
        if (!initialHighlightApplied) applyInitialHighlightFromUrlOnce();
      }, 300);
      setTimeout(() => {
        if (!initialHighlightApplied) showToast('Stall not found in selected hall', 'fa-triangle-exclamation');
      }, 900);
      return;
    }

    initialHighlightApplied = true;
    try {
      const key = (typeof getStallPrimaryKey === 'function' ? getStallPrimaryKey(d) : (d.SeatId || d.StallId || d.StallID || d.stallID || d.stallId || d.StallNo || targetParam));
      if (typeof setActiveStallTarget === 'function') setActiveStallTarget(key, key && key !== d.StallNo ? 'id' : 'any');
      else searchTargetStallId = key;
    } catch (_) {}

    const globalInput = $('globalSearchInput');
    const sidebarInput = $('sidebarSearchInput');
    if (globalInput) globalInput.value = d.StallNo || targetParam;
    if (sidebarInput) sidebarInput.value = d.StallNo || targetParam;

    if (typeof closeSidebar === 'function') closeSidebar();
    closeSearchSheet();
    hideStallBottomCard();

    const focusKey = (typeof getStallPrimaryKey === 'function' ? getStallPrimaryKey(d) : (d.SeatId || d.StallId || d.StallID || d.stallID || d.stallId || d.StallNo || targetParam));
    if (typeof focusStall2d === 'function') {
      focusStall2d(focusKey);
      setTimeout(() => focusStall2d(focusKey), 120);
      setTimeout(() => focusStall2d(focusKey), 450);
    }
    if (currentView === '3d' && typeof rebuild3DAndFocus === 'function') rebuild3DAndFocus(focusKey);
    if (currentView === '2d' && typeof render2dFrame === 'function') render2dFrame();

    showToast('Stall highlighted: ' + (d.StallNo || targetParam), 'fa-location-dot');
  }

  function applyRouteFromUrlOnce() {
    if (routeFromUrlApplied) return;
    const params = new URLSearchParams(location.search);
    const from = params.get('from');
    const to = params.get('to');
    if (from && to) {
      routeFromUrlApplied = true;
      const f = $('routeFrom');
      const t = $('routeTo');
      if (f) f.value = from;
      if (t) t.value = to;
      setTimeout(() => { if (typeof calculateRoute === 'function') calculateRoute(); }, 250);
    }
  }


  document.addEventListener('stallmap:hall-changing', function () {
    // User intentionally changed hall; do not re-apply previous deep-link route/highlight.
    routeFromUrlApplied = false;
    initialHighlightApplied = false;
    hideStallBottomCard();
    closeSearchSheet();
    $('mapHelpCard')?.classList.remove('show');
    $('mapErrorBox')?.classList.remove('show');
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      hideStallBottomCard();
      closeSearchSheet();
      $('mapHelpCard')?.classList.remove('show');
    }
  });

  document.addEventListener('DOMContentLoaded', function () {
    if (new URLSearchParams(location.search).get('debug') === '1') document.body.classList.add('debug-mode');
    buildEnhancementShell();
    updateMapProductShell();
    maybeShowHelp();
  });
})();