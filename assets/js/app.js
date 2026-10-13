var jq = jQuery.noConflict();

/* ══════════════════════════════════════════
   SHARED STATE
══════════════════════════════════════════ */
let currentView         = '2d';
let searchTargetStallId = '';
// 'id' means highlight/focus must match backend SeatId/StallId only, not StallNo.
// This makes deep links like ?HallId=23&StallId=14071407 exact and prevents wrong highlight by stall name.
let searchTargetMatchMode = 'any';
let allStallData        = [];
let allUtilData         = [];
let mapBaseSize         = 2000;
let currentNavStepIdx   = 0;
let navStepsData        = [];

// 3D quality is intentionally fixed to Normal for app WebView performance.
// Do not read old localStorage values because an older HD setting can slow/heat mobile devices.
let currentQuality = 'normal';
try { localStorage.removeItem('stallmap_quality'); } catch (e) {}

/* Multi-touch */
let _multiTouchActive = false;
let _activeTouches    = 0;

/* Label throttle */
let _lastLabelUpdate = 0;

/* FPS tracking */
let _fpsFrames = 0, _fpsLast = performance.now(), _fpsVal = 0;

/* ══════════════════════════════════════════
   FPS MONITOR
══════════════════════════════════════════ */
function trackFPS() {
  _fpsFrames++;
  const now = performance.now();
  if (now - _fpsLast >= 1000) {
    _fpsVal = _fpsFrames;
    _fpsFrames = 0;
    _fpsLast = now;
    const el = document.getElementById('fps-indicator');
    if (el && currentView === '3d') {
      el.textContent = 'FPS: ' + _fpsVal;
      el.style.color = _fpsVal < 20 ? '#ef4444' : _fpsVal < 40 ? '#f59e0b' : '#94a3b8';
    }
  }
}

/* ══════════════════════════════════════════
   SIDEBAR
══════════════════════════════════════════ */
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebarOverlay').classList.add('open');
  document.getElementById('sidebarToggleBtn').classList.add('active');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
  document.getElementById('sidebarToggleBtn').classList.remove('active');
}
function toggleSidebar() {
  const s = document.getElementById('sidebar');
  s.classList.contains('open') ? closeSidebar() : openSidebar();
}
function swapRoute() {
  const f = document.getElementById('routeFrom');
  const t = document.getElementById('routeTo');
  [f.value, t.value] = [t.value, f.value];
}

/* ══════════════════════════════════════════
   NAV DRAWER
══════════════════════════════════════════ */
function openNavDrawer() { document.getElementById('nav-drawer').classList.add('open'); }
function closeNavDrawer() { document.getElementById('nav-drawer').classList.remove('open'); }

/* ══════════════════════════════════════════
   STATS
══════════════════════════════════════════ */
function updateStats() {
  const total  = allStallData.length;
  const avail  = allStallData.filter(d => d.blBooked === 'false' && d.blPreBooked !== '1' && d.blTemp === 'false').length;
  const booked = allStallData.filter(d => d.blBooked !== 'false').length;
  document.getElementById('statTotal').textContent  = total;
  document.getElementById('statAvail').textContent  = avail;
  document.getElementById('statBooked').textContent = booked;
}

/* ══════════════════════════════════════════
   GLOBAL SEARCH
══════════════════════════════════════════ */
let searchDebounce = null;

function escapeHtmlLocal(value) {
  return String(value ?? '').replace(/[&<>"']/g, function (char) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char];
  });
}
function escapeAttrLocal(value) { return escapeHtmlLocal(value); }

function renderSearchResults(query, resultsEl) {
  if (!query || !allStallData.length) { resultsEl.classList.remove('open'); resultsEl.style.display = 'none'; return; }
  const q = normalizeStallKey(query);
  const qc = compactStallKey(query);
  const score = (d) => {
    const stall = normalizeStallKey(d.StallNo);
    const stallC = compactStallKey(d.StallNo);
    const company = normalizeStallKey(d.txtComName);
    const companyC = compactStallKey(d.txtComName);
    const ids = [d.SeatId, d.StallId, d.StallID, d.stallID, d.stallId].map(normalizeStallKey);
    const idsC = [d.SeatId, d.StallId, d.StallID, d.stallID, d.stallId].map(compactStallKey);
    if (stall === q || ids.includes(q) || stallC === qc || idsC.includes(qc)) return 100;
    if (company === q || companyC === qc) return 90;
    if (stall.startsWith(q) || stallC.startsWith(qc)) return 80;
    if (company.startsWith(q) || companyC.startsWith(qc)) return 70;
    if (stall.includes(q) || stallC.includes(qc)) return 60;
    if (company.includes(q) || companyC.includes(qc)) return 50;
    if (ids.some(x => x.includes(q)) || idsC.some(x => x.includes(qc))) return 45;
    return 0;
  };
  const results = allStallData
    .map(d => ({ d, score: score(d) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || String(a.d.StallNo).localeCompare(String(b.d.StallNo)))
    .slice(0, 12)
    .map(x => x.d);
  const isEmpty = !results.length;
  const html = isEmpty
    ? `<div class="search-empty"><i class="fa fa-magnifying-glass" style="display:block;font-size:18px;margin-bottom:4px;opacity:0.4"></i>No results for "${escapeHtmlLocal(query)}"</div>`
    : results.map(d => {
        const status = d.blBooked !== 'false' ? 'booked' : (d.blPreBooked === '1' || d.blTemp !== 'false') ? 'hold' : 'available';
        const statusLabel = status === 'available' ? 'Free' : status === 'booked' ? 'Taken' : 'Hold';
        const company = d.txtComName || '';
        return `<div class="search-result-item" onclick="selectStallFromSearch('${escapeAttrLocal(d.SeatId)}','${escapeAttrLocal(d.StallNo)}')">
          <div class="sri-no">${escapeHtmlLocal(d.StallNo)}</div>
          <div class="sri-company">${company ? escapeHtmlLocal(company) : '<span style="color:var(--muted)">No exhibitor</span>'}</div>
          <div class="sri-badge ${status}">${statusLabel}</div>
        </div>`;
      }).join('');
  resultsEl.innerHTML = html;
  resultsEl.classList.add('open');
  resultsEl.style.display = 'block';
}

document.getElementById('globalSearchInput').addEventListener('input', function() {
  clearTimeout(searchDebounce);
  const dd = document.getElementById('searchResultsDropdown');
  searchDebounce = setTimeout(() => renderSearchResults(this.value.trim(), dd), 120);
});
document.getElementById('globalSearchInput').addEventListener('focus', function() {
  const dd = document.getElementById('searchResultsDropdown');
  if (this.value.trim()) renderSearchResults(this.value.trim(), dd);
});
document.addEventListener('click', e => {
  if (!document.getElementById('headerSearch').contains(e.target)) {
    document.getElementById('searchResultsDropdown').classList.remove('open');
    document.getElementById('searchResultsDropdown').style.display = 'none';
  }
});
document.getElementById('sidebarSearchInput').addEventListener('input', function() {
  clearTimeout(searchDebounce);
  const res = document.getElementById('sidebarSearchResults');
  searchDebounce = setTimeout(() => renderSearchResults(this.value.trim(), res), 120);
});

function selectStallFromSearch(seatId, stallNo) {
  if (hasActiveRoute && hasActiveRoute()) resetRouteVisualState(true);
  document.getElementById('searchResultsDropdown').classList.remove('open');
  document.getElementById('searchResultsDropdown').style.display = 'none';
  document.getElementById('sidebarSearchResults').style.display = 'none';
  document.getElementById('globalSearchInput').value = stallNo;
  document.getElementById('sidebarSearchInput').value = stallNo;

  // Use backend unique id for selection/highlight when available.
  // StallNo can be duplicated or formatted differently, so it should only be display/fallback.
  const focusKey = seatId || stallNo;
  setActiveStallTarget(focusKey, seatId ? 'id' : 'any');
  closeSidebar();
  if (currentView === '3d') rebuild3DAndFocus(focusKey);
  else focusStall2d(focusKey);
}

function normalizeStallKey(v) {
  return String(v == null ? '' : v).trim().toLowerCase();
}
function compactStallKey(v) {
  return normalizeStallKey(v).replace(/[^a-z0-9]/g, '');
}
function keyMatchesValue(k, target) {
  const nk = normalizeStallKey(k);
  const t = normalizeStallKey(target);
  if (!nk || !t) return false;
  return nk === t || compactStallKey(k) === compactStallKey(target);
}
function getBackendIdKeys(d) {
  return [d?.SeatId, d?.StallId, d?.StallID, d?.stallID, d?.stallId];
}
function matchesStallBackendId(d, target) {
  if (!d || !target) return false;
  return getBackendIdKeys(d).some(k => keyMatchesValue(k, target));
}
function matchesStallKey(d, target) {
  if (!d || !target) return false;
  const keys = [...getBackendIdKeys(d), d.StallNo];
  return keys.some(k => keyMatchesValue(k, target));
}
function getStallPrimaryKey(d) {
  // Prefer backend IDs for exact selection/highlight. StallNo is only a fallback/display value.
  return d && (d.SeatId || d.StallId || d.StallID || d.stallID || d.stallId || d.StallNo || '');
}
function getStallPrimaryMode(d) {
  return d && (d.SeatId || d.StallId || d.StallID || d.stallID || d.stallId) ? 'id' : 'any';
}
function setActiveStallTarget(target, mode) {
  searchTargetStallId = String(target || '').trim();
  searchTargetMatchMode = mode || 'any';
}
function findStallForTarget(target) {
  if (!target) return null;
  if (searchTargetMatchMode === 'id') {
    return allStallData.find(s => matchesStallBackendId(s, target)) || allStallData.find(s => matchesStallKey(s, target));
  }
  return allStallData.find(s => matchesStallKey(s, target));
}
function isActive(d) {
  if (!searchTargetStallId) return false;
  return searchTargetMatchMode === 'id'
    ? matchesStallBackendId(d, searchTargetStallId)
    : matchesStallKey(d, searchTargetStallId);
}

/* ══════════════════════════════════════════
   2D CANVAS ENGINE
══════════════════════════════════════════ */
const canvas2d = document.getElementById('canvas-2d');
const ctx      = canvas2d.getContext('2d');

let cam2 = { x: 0, y: 0, zoom: 1 };
let isPanning = false, isDragging2d = false;
let ptrDown2d = { x: 0, y: 0 }, camStart = { x: 0, y: 0 };
let lastPinchDist = null;
let routePath2d = null, routeStart2d = null, routeEnd2d = null;
let routeMetrics = { distanceM: 0, timeMin: 0, distanceLabel: '', timeLabel: '' };
let raf2dId = null;

const C = {
  available: '#059669', booked: '#dc2626', hold: '#d97706',
  grayHold: '#94a3b8', active: '#1d4ed8', special: '#34d399', path: '#10b981'
};

function stallColor(d, act) {
  if (act) return C.active;
  if (d.blBooked !== 'false') return d.blPreBooked === '1' ? C.hold : C.booked;
  if (d.blPreBooked === '1' || d.blTemp !== 'false') return C.grayHold;
  if (d.sStatus === '1') return C.special;
  return C.available;
}

function resize2d() {
  canvas2d.width  = window.innerWidth;
  canvas2d.height = window.innerHeight - parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-h'));
}

function w2s(wx, wy) {
  return { x: (wx - cam2.x) * cam2.zoom + canvas2d.width / 2, y: (wy - cam2.y) * cam2.zoom + canvas2d.height / 2 };
}
function s2w(sx, sy) {
  return { x: (sx - canvas2d.width / 2) / cam2.zoom + cam2.x, y: (sy - canvas2d.height / 2) / cam2.zoom + cam2.y };
}
function zoom2d(factor) {
  const cx = canvas2d.width / 2, cy = canvas2d.height / 2;
  const w = s2w(cx, cy);
  cam2.zoom = Math.min(10, Math.max(0.04, cam2.zoom * factor));
  const wn = s2w(cx, cy);
  cam2.x += w.x - wn.x;
  cam2.y += w.y - wn.y;
}

function zoom3d(factor) {
  if (!camera3 || !controls3) return;
  const target = controls3.target.clone();
  const offset = camera3.position.clone().sub(target);
  const currentDist = offset.length() || 1;
  const minDist = controls3.minDistance || 50;
  const maxDist = controls3.maxDistance || 12000;
  const nextDist = Math.max(minDist, Math.min(maxDist, currentDist / factor));
  offset.setLength(nextDist);
  camera3.position.copy(target).add(offset);
  controls3.update();
}
function fitCamera3d() {
  if (!camera3 || !controls3 || !stallsGroup3 || !stallsGroup3.children.length) return;
  const box = new THREE.Box3().setFromObject(stallsGroup3);
  if (!box || !isFinite(box.min.x) || !isFinite(box.max.x)) return;
  const ctr = box.getCenter(new THREE.Vector3());
  const sz = box.getSize(new THREE.Vector3());
  const base = Math.max(sz.x, sz.z, 450);
  const dist = base * (innerWidth <= 768 ? 1.15 : 0.95);
  controls3.target.copy(ctr);
  camera3.position.set(ctr.x, Math.max(320, dist * 0.95), ctr.z + Math.max(520, dist * 0.78));
  controls3.update();
}
function zoomMap(factor) {
  if (currentView === '3d') zoom3d(factor);
  else zoom2d(factor);
}
function resetMapView() {
  if (currentView === '3d') fitCamera3d();
  else fitCamera2d();
}

function calcLabelFontSize(stallW_px, stallH_px, labelText) {
  if (stallW_px < 8 || stallH_px < 8) return 0;
  const maxByWidth  = (stallW_px * 0.72) / (labelText.length * 0.6);
  const maxByHeight = stallH_px * 0.42;
  const size = Math.min(maxByWidth, maxByHeight, 13);
  return Math.max(5.5, size);
}

/* ── Google-Maps-style stall labels ──────────────────────────────────
   Small / zoomed-out  -> only the stall number (compact).
   Bigger / zoomed-in  -> stall number shrinks to a small tag and the
                          exhibitor/company name grows in, wrapped to
                          fit and always clipped to the stall box so it
                          can never spill onto a neighbouring stall.
   Results are cached per stall + rounded pixel size so the (slightly
   expensive) text-measuring work isn't repeated on every animation
   frame while the camera is idle.                                  */
const _stallLabelCache = new Map();

function _stallLabelCacheKey(d, sw, sh) {
  const rw = Math.round(sw / 4) * 4, rh = Math.round(sh / 4) * 4;
  return (d.StallId || d.SeatId || d.StallNo || '') + '|' + rw + 'x' + rh;
}

// Word-wraps `text` into at most `maxLines` lines at the current ctx.font.
// Returns { lines, fits } — fits=false means at least one line (including
// an unbreakable long word on its own) is WIDER than maxWidth, or there
// was leftover text beyond maxLines. This must catch the long-single-word
// case too, otherwise the font-fitting loop below would wrongly think a
// too-big font size "fits" just because word-splitting alone succeeded.
function _wrapToLines(text, maxWidth, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  if (!words.length) return { lines: [], fits: true };
  const lines = [];
  let cur = '';
  let overflow = false;
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const candidate = cur ? cur + ' ' + word : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      cur = candidate;
    } else if (!cur) {
      // A single word wider than maxWidth all by itself — keep it as its
      // own line so we can still return something, but flag the overflow
      // so the caller knows this font size doesn't actually fit.
      cur = word;
      overflow = true;
    } else {
      lines.push(cur);
      cur = word;
      if (ctx.measureText(cur).width > maxWidth) overflow = true;
      if (lines.length >= maxLines) { overflow = true; cur = ''; break; }
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { lines.length = maxLines; overflow = true; }
  return { lines, fits: !overflow };
}

function _ellipsisFit(text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  return t + '…';
}

// Finds the largest font size (stepping down from maxFs to minFs) at which
// `text` wraps into <= maxLines lines that each fit maxWidth. Falls back to
// minFs with every overflowing line individually ellipsis-truncated (not
// just the last one) if it never fully fits even at the smallest size.
function _fitWrappedText(text, maxWidth, maxLines, maxFs, minFs, weight) {
  for (let fs = maxFs; fs >= minFs; fs -= 0.5) {
    ctx.font = `${weight} ${fs}px Inter,Arial,sans-serif`;
    const res = _wrapToLines(text, maxWidth, maxLines);
    if (res.fits) return { fontSize: fs, lines: res.lines };
  }
  ctx.font = `${weight} ${minFs}px Inter,Arial,sans-serif`;
  const res = _wrapToLines(text, maxWidth, maxLines);
  const lines = (res.lines.length ? res.lines : ['']).map(line =>
    ctx.measureText(line).width > maxWidth ? _ellipsisFit(line, maxWidth) : line
  );
  return { fontSize: minFs, lines };
}

// Computes (and caches) the label layout for one stall at its current
// on-screen size. Returns null when the box is too small for any label.
function computeStallLabelLayout(d, sw, sh) {
  const stallNo = String(d.StallNo || '').trim();
  const company = String(d.txtComName || '').trim();
  if (!stallNo && !company) return null;
  if (sw < 10 || sh < 10) return null;

  const key = _stallLabelCacheKey(d, sw, sh) + '|' + stallNo + '|' + company;
  const cached = _stallLabelCache.get(key);
  if (cached) return cached;

  let layout;
  const pad = Math.max(2, sw * 0.06);
  const innerW = Math.max(1, sw - pad * 2);

  if (!company) {
    // Number-only (small / zoomed-out) view — unchanged behaviour.
    const fs = calcLabelFontSize(sw, sh, stallNo);
    layout = fs >= 5.5 ? { mode: 'number', numFs: fs } : null;
  } else if (!stallNo) {
    const fit = _fitWrappedText(company, innerW, sh > 30 ? 2 : 1, Math.min(13, sh * 0.4), 6, 800);
    layout = fit.fontSize >= 5.5 ? { mode: 'company', coFit: fit } : null;
  } else {
    // Reserve a slim top band for the stall number, and grow the company
    // name into the remaining space — more room (i.e. more zoom) = bigger,
    // more legible name, exactly like a map label appearing as you zoom in.
    const gap = Math.max(1, sh * 0.04);
    const numAreaH = sh * 0.32;
    const coAreaH = sh - numAreaH - gap;
    const numFs = Math.max(5, Math.min(11, calcLabelFontSize(sw, numAreaH * 2, stallNo)));
    const maxCoLines = coAreaH > 30 ? 2 : 1;
    const coMaxFs = Math.min(13, coAreaH / (maxCoLines * 1.15));
    const coMinFs = 6;

    if (coAreaH >= 10 && innerW >= 14 && coMaxFs >= coMinFs) {
      const fit = _fitWrappedText(company, innerW, maxCoLines, coMaxFs, coMinFs, 800);
      layout = { mode: 'stacked', numFs, numAreaH, gap, coAreaH, coFit: fit };
    } else {
      // Not enough room yet for both — fall back to number only, the
      // company name will appear once the stall is zoomed in further.
      const fs = calcLabelFontSize(sw, sh, stallNo);
      layout = fs >= 5.5 ? { mode: 'number', numFs: fs } : null;
    }
  }

  _stallLabelCache.set(key, layout);
  return layout;
}

function getStallCutouts(d) {
  return Array.isArray(d && d._cutouts) ? d._cutouts : [];
}

function hasStallCutouts(d) {
  return getStallCutouts(d).length > 0;
}

function pointInRectXY(x, y, r, pad = 0) {
  return x >= r.dLeft - pad && x <= r.dLeft + r.dWidth + pad && y >= r.dTop - pad && y <= r.dTop + r.dHeight + pad;
}

function pointInStallShapeXY(x, y, d, pad = 0) {
  if (!pointInRectXY(x, y, d, pad)) return false;
  const cutouts = getStallCutouts(d);
  for (const cut of cutouts) {
    if (pointInRectXY(x, y, cut, 0)) return false;
  }
  return true;
}

function rectInsideRect(inner, outer, tol = 0.8) {
  return inner.dLeft >= outer.dLeft - tol && inner.dTop >= outer.dTop - tol &&
         inner.dLeft + inner.dWidth <= outer.dLeft + outer.dWidth + tol &&
         inner.dTop + inner.dHeight <= outer.dTop + outer.dHeight + tol;
}

function subtract1d(a0, a1, b0, b1, eps = 0.001) {
  if (b1 <= a0 + eps || b0 >= a1 - eps) return [[a0, a1]];
  const out = [];
  if (b0 > a0 + eps) out.push([a0, Math.min(a1, b0)]);
  if (b1 < a1 - eps) out.push([Math.max(a0, b1), a1]);
  return out;
}

function getCutoutCornerType(d, cut, tol = 0.8) {
  const touchTop = Math.abs(cut.dTop - d.dTop) <= tol;
  const touchBottom = Math.abs((cut.dTop + cut.dHeight) - (d.dTop + d.dHeight)) <= tol;
  const touchLeft = Math.abs(cut.dLeft - d.dLeft) <= tol;
  const touchRight = Math.abs((cut.dLeft + cut.dWidth) - (d.dLeft + d.dWidth)) <= tol;
  if (touchTop && touchRight) return 'top-right';
  if (touchTop && touchLeft) return 'top-left';
  if (touchBottom && touchRight) return 'bottom-right';
  if (touchBottom && touchLeft) return 'bottom-left';
  return null;
}

function getStallBoundarySegments(d) {
  const l = d.dLeft, t = d.dTop, r = d.dLeft + d.dWidth, b = d.dTop + d.dHeight;
  let topRanges = [[l, r]], bottomRanges = [[l, r]], leftRanges = [[t, b]], rightRanges = [[t, b]];
  const innerSegs = [];

  getStallCutouts(d).forEach(cut => {
    const cx0 = cut.dLeft, cy0 = cut.dTop, cx1 = cut.dLeft + cut.dWidth, cy1 = cut.dTop + cut.dHeight;
    const type = getCutoutCornerType(d, cut);
    if (type === 'top-right') {
      topRanges = topRanges.flatMap(([a0, a1]) => subtract1d(a0, a1, cx0, cx1));
      rightRanges = rightRanges.flatMap(([a0, a1]) => subtract1d(a0, a1, cy0, cy1));
      innerSegs.push({ x1: cx0, y1: cy0, x2: cx0, y2: cy1, side: 'inner' });
      innerSegs.push({ x1: cx0, y1: cy1, x2: cx1, y2: cy1, side: 'inner' });
    } else if (type === 'top-left') {
      topRanges = topRanges.flatMap(([a0, a1]) => subtract1d(a0, a1, cx0, cx1));
      leftRanges = leftRanges.flatMap(([a0, a1]) => subtract1d(a0, a1, cy0, cy1));
      innerSegs.push({ x1: cx1, y1: cy0, x2: cx1, y2: cy1, side: 'inner' });
      innerSegs.push({ x1: cx0, y1: cy1, x2: cx1, y2: cy1, side: 'inner' });
    } else if (type === 'bottom-right') {
      bottomRanges = bottomRanges.flatMap(([a0, a1]) => subtract1d(a0, a1, cx0, cx1));
      rightRanges = rightRanges.flatMap(([a0, a1]) => subtract1d(a0, a1, cy0, cy1));
      innerSegs.push({ x1: cx0, y1: cy0, x2: cx1, y2: cy0, side: 'inner' });
      innerSegs.push({ x1: cx0, y1: cy0, x2: cx0, y2: cy1, side: 'inner' });
    } else if (type === 'bottom-left') {
      bottomRanges = bottomRanges.flatMap(([a0, a1]) => subtract1d(a0, a1, cx0, cx1));
      leftRanges = leftRanges.flatMap(([a0, a1]) => subtract1d(a0, a1, cy0, cy1));
      innerSegs.push({ x1: cx0, y1: cy0, x2: cx1, y2: cy0, side: 'inner' });
      innerSegs.push({ x1: cx1, y1: cy0, x2: cx1, y2: cy1, side: 'inner' });
    }
  });

  const segs = [];
  topRanges.forEach(([x0, x1]) => { if (x1 - x0 > 0.01) segs.push({ x1: x0, y1: t, x2: x1, y2: t, side: 'top' }); });
  bottomRanges.forEach(([x0, x1]) => { if (x1 - x0 > 0.01) segs.push({ x1: x0, y1: b, x2: x1, y2: b, side: 'bottom' }); });
  leftRanges.forEach(([y0, y1]) => { if (y1 - y0 > 0.01) segs.push({ x1: l, y1: y0, x2: l, y2: y1, side: 'left' }); });
  rightRanges.forEach(([y0, y1]) => { if (y1 - y0 > 0.01) segs.push({ x1: r, y1: y0, x2: r, y2: y1, side: 'right' }); });
  return segs.concat(innerSegs);
}

function getStallShapeScreenPath(d, s, sw, sh) {
  const path = new Path2D();
  path.rect(s.x, s.y, sw, sh);
  getStallCutouts(d).forEach(cut => {
    const x = s.x + (cut.dLeft - d.dLeft) * cam2.zoom;
    const y = s.y + (cut.dTop - d.dTop) * cam2.zoom;
    path.rect(x, y, cut.dWidth * cam2.zoom, cut.dHeight * cam2.zoom);
  });
  return path;
}

function getStallShapeCenter(d) {
  const baseArea = Math.max(0.001, d.dWidth * d.dHeight);
  let weightedX = (d.dLeft + d.dWidth / 2) * baseArea;
  let weightedY = (d.dTop + d.dHeight / 2) * baseArea;
  let totalArea = baseArea;

  getStallCutouts(d).forEach(cut => {
    const area = Math.max(0, cut.dWidth * cut.dHeight);
    totalArea -= area;
    weightedX -= (cut.dLeft + cut.dWidth / 2) * area;
    weightedY -= (cut.dTop + cut.dHeight / 2) * area;
  });

  if (totalArea <= 0.001) return { x: d.dLeft + d.dWidth / 2, y: d.dTop + d.dHeight / 2 };
  const center = { x: weightedX / totalArea, y: weightedY / totalArea };
  if (pointInStallShapeXY(center.x, center.y, d)) return center;

  // Concave L polygons can have a mathematical centroid inside the notch.
  // Fall back to the centre of the largest solid rectangle so labels stay visible.
  const pieces = buildShape2DRectangles(d).sort((a, b) => (b.dWidth*b.dHeight) - (a.dWidth*a.dHeight));
  if (pieces.length) return {
    x: pieces[0].dLeft + pieces[0].dWidth / 2,
    y: pieces[0].dTop + pieces[0].dHeight / 2
  };
  return center;
}

function normalizeOverlayKey(v) {
  return String(v == null ? '' : v).trim().toLowerCase().replace(/\s+/g, '');
}

function rectIntersection(a, b) {
  const left = Math.max(a.dLeft, b.dLeft);
  const top = Math.max(a.dTop, b.dTop);
  const right = Math.min(a.dLeft + a.dWidth, b.dLeft + b.dWidth);
  const bottom = Math.min(a.dTop + a.dHeight, b.dTop + b.dHeight);
  if (right <= left || bottom <= top) return null;
  return { dLeft: left, dTop: top, dWidth: right - left, dHeight: bottom - top };
}

function nearestCornerCutout(stall, overlayInside) {
  const l = stall.dLeft, t = stall.dTop;
  const r = stall.dLeft + stall.dWidth, b = stall.dTop + stall.dHeight;
  const ol = overlayInside.dLeft, ot = overlayInside.dTop;
  const or = overlayInside.dLeft + overlayInside.dWidth;
  const ob = overlayInside.dTop + overlayInside.dHeight;

  const scores = [
    { type: 'top-right', score: Math.abs(ot - t) + Math.abs(or - r) },
    { type: 'top-left', score: Math.abs(ot - t) + Math.abs(ol - l) },
    { type: 'bottom-right', score: Math.abs(ob - b) + Math.abs(or - r) },
    { type: 'bottom-left', score: Math.abs(ob - b) + Math.abs(ol - l) }
  ].sort((a, b) => a.score - b.score);

  const type = scores[0].type;
  // The backend overlay defines the INNER corner. We deliberately extend its
  // two outer edges to the stall boundary so a slightly inset / oversized
  // overlay still produces the intended L-shape.
  if (type === 'top-right') {
    return { dLeft: ol, dTop: t, dWidth: r - ol, dHeight: ob - t, _corner: type };
  }
  if (type === 'top-left') {
    return { dLeft: l, dTop: t, dWidth: or - l, dHeight: ob - t, _corner: type };
  }
  if (type === 'bottom-right') {
    return { dLeft: ol, dTop: ot, dWidth: r - ol, dHeight: b - ot, _corner: type };
  }
  return { dLeft: l, dTop: ot, dWidth: or - l, dHeight: b - ot, _corner: type };
}

function attachOverlaySpacesToStalls(stalls, spaces) {
  if (!Array.isArray(stalls) || !Array.isArray(spaces)) return;

  stalls.forEach(d => { d._cutouts = []; });
  spaces.forEach(space => { if (space) space._isStallCutout = false; });

  const stallKey = d => normalizeOverlayKey(d && d.StallNo);

  function spaceKeys(space) {
    const vals = [];
    if (space && space.Text) vals.push(space.Text);
    if (space && Array.isArray(space._rawLabels)) vals.push(...space._rawLabels);
    return [...new Set(vals.map(normalizeOverlayKey).filter(Boolean))];
  }

  function expandedIntersection(space, stall, tol = 8) {
    // Normal intersection first.
    let inter = rectIntersection(space, stall);
    if (inter) return inter;

    // Some backend overlays are a few layout units outside the booth boundary.
    // Expand only for matching/ownership, then clamp the actual cutout to the stall.
    const expanded = {
      dLeft: space.dLeft - tol,
      dTop: space.dTop - tol,
      dWidth: space.dWidth + tol * 2,
      dHeight: space.dHeight + tol * 2
    };
    return rectIntersection(expanded, stall);
  }

  spaces.forEach(space => {
    if (!space || !(space.dWidth > 0) || !(space.dHeight > 0)) return;

    const keys = spaceKeys(space);

    // 1) Strongest backend signal:
    //    a Table2/SpaceData row contains the same 14.14D value as Table1.StallNo.
    // Search ALL string fields from the row; the old parser only kept the first
    // text field, which is why the cutout could be missed.
    let owner = null;
    let inside = null;

    const named = stalls.filter(stall => {
      const sk = stallKey(stall);
      return sk && keys.includes(sk) && !!expandedIntersection(space, stall, 10);
    });

    if (named.length) {
      named.sort((a, b) => {
        const ia = expandedIntersection(space, a, 10);
        const ib = expandedIntersection(space, b, 10);
        const aa = ia ? ia.dWidth * ia.dHeight : 0;
        const ab = ib ? ib.dWidth * ib.dHeight : 0;
        return ab - aa;
      });
      owner = named[0];
      inside = rectIntersection(space, owner) || expandedIntersection(space, owner, 10);
    }

    // 2) Coordinate-only fallback.
    // A blank SpaceData rectangle that overlaps a booth substantially and sits
    // nearest one of its corners is treated as the blank corner overlay.
    if (!owner) {
      const candidates = stalls.map(stall => {
        const inter = rectIntersection(space, stall);
        if (!inter) return null;

        const interArea = inter.dWidth * inter.dHeight;
        const overlayArea = Math.max(0.001, space.dWidth * space.dHeight);
        const stallArea = Math.max(0.001, stall.dWidth * stall.dHeight);

        const overlayOverlap = interArea / overlayArea;
        const stallOverlap = interArea / stallArea;

        // Overlay should occupy a meaningful part of the stall but not just
        // cross it by one or two pixels.
        if (overlayOverlap < 0.22 || stallOverlap < 0.04) return null;

        const scx = stall.dLeft + stall.dWidth / 2;
        const scy = stall.dTop + stall.dHeight / 2;
        const icx = inter.dLeft + inter.dWidth / 2;
        const icy = inter.dTop + inter.dHeight / 2;

        // Prefer overlays whose center is away from the booth center because a
        // corner blank normally lives in one quadrant.
        const nx = Math.abs(icx - scx) / Math.max(1, stall.dWidth / 2);
        const ny = Math.abs(icy - scy) / Math.max(1, stall.dHeight / 2);
        const cornerBias = nx + ny;

        return {
          stall, inter,
          score: overlayOverlap * 3 + stallOverlap + cornerBias * 0.75
        };
      }).filter(Boolean);

      if (candidates.length) {
        candidates.sort((a, b) => b.score - a.score);
        owner = candidates[0].stall;
        inside = candidates[0].inter;
      }
    }

    if (!owner || !inside) return;

    // The overlay coordinates define the notch's INNER corner. Extend the other
    // two sides to the nearest booth corner so the result is a true L shape.
    const cut = nearestCornerCutout(owner, inside);
    if (!cut || cut.dWidth <= 0.01 || cut.dHeight <= 0.01) return;

    const stallArea = Math.max(0.001, owner.dWidth * owner.dHeight);
    const cutArea = cut.dWidth * cut.dHeight;

    // Only reject overlays that would practically erase the whole booth.
    if (cutArea / stallArea >= 0.96) return;

    // Avoid duplicate identical cutouts if the backend returns the same SpaceData
    // record twice.
    const duplicate = owner._cutouts.some(c =>
      Math.abs(c.dLeft - cut.dLeft) < 0.5 &&
      Math.abs(c.dTop - cut.dTop) < 0.5 &&
      Math.abs(c.dWidth - cut.dWidth) < 0.5 &&
      Math.abs(c.dHeight - cut.dHeight) < 0.5
    );
    if (!duplicate) owner._cutouts.push(cut);

    // Once a SpaceData record becomes geometry, it must not be drawn as a
    // normal utility/label over the stall.
    space._isStallCutout = true;

    console.debug('[L-SHAPE CUTOUT]', {
      stall: owner.StallNo,
      space: space,
      cutout: cut,
      matchedBy: named.length ? 'stall-number' : 'coordinates'
    });
  });
}
// Backward-compatible alias used by any external enhancement script.
function attachBlankOverlaysToStalls(stalls, blankSpaces) {
  attachOverlaySpacesToStalls(stalls, blankSpaces);
}

function buildShape2DRectangles(d) {
  const full = [{ dLeft: d.dLeft, dTop: d.dTop, dWidth: d.dWidth, dHeight: d.dHeight }];
  const cutouts = getStallCutouts(d);
  if (!cutouts.length) return full;

  const rects = [];
  cutouts.forEach(cut => {
    const type = getCutoutCornerType(d, cut);
    if (type === 'top-right') {
      rects.push({ dLeft: d.dLeft, dTop: d.dTop, dWidth: cut.dLeft - d.dLeft, dHeight: d.dHeight });
      rects.push({ dLeft: d.dLeft, dTop: cut.dTop + cut.dHeight, dWidth: d.dWidth, dHeight: d.dTop + d.dHeight - (cut.dTop + cut.dHeight) });
    } else if (type === 'top-left') {
      rects.push({ dLeft: cut.dLeft + cut.dWidth, dTop: d.dTop, dWidth: d.dLeft + d.dWidth - (cut.dLeft + cut.dWidth), dHeight: d.dHeight });
      rects.push({ dLeft: d.dLeft, dTop: cut.dTop + cut.dHeight, dWidth: d.dWidth, dHeight: d.dTop + d.dHeight - (cut.dTop + cut.dHeight) });
    } else if (type === 'bottom-right') {
      rects.push({ dLeft: d.dLeft, dTop: d.dTop, dWidth: cut.dLeft - d.dLeft, dHeight: d.dHeight });
      rects.push({ dLeft: d.dLeft, dTop: d.dTop, dWidth: d.dWidth, dHeight: cut.dTop - d.dTop });
    } else if (type === 'bottom-left') {
      rects.push({ dLeft: cut.dLeft + cut.dWidth, dTop: d.dTop, dWidth: d.dLeft + d.dWidth - (cut.dLeft + cut.dWidth), dHeight: d.dHeight });
      rects.push({ dLeft: d.dLeft, dTop: d.dTop, dWidth: d.dWidth, dHeight: cut.dTop - d.dTop });
    }
  });
  return rects.filter(r => r.dWidth > 0.01 && r.dHeight > 0.01);
}

function createThreeStallShape(data) {
  const cuts = getStallCutouts(data);
  const cut = cuts.length ? cuts[0] : null;
  const type = cut ? getCutoutCornerType(data, cut, 2.5) : null;
  const shape = new THREE.Shape();

  if (cut && type) {
    const x0 = cut.dLeft - data.dLeft, y0 = cut.dTop - data.dTop;
    const x1 = x0 + cut.dWidth, y1 = y0 + cut.dHeight;
    const w = data.dWidth, h = data.dHeight;
    let pts;
    if (type === 'top-right') pts = [[0,0],[x0,0],[x0,y1],[w,y1],[w,h],[0,h]];
    else if (type === 'top-left') pts = [[x1,0],[w,0],[w,h],[0,h],[0,y1],[x1,y1]];
    else if (type === 'bottom-right') pts = [[0,0],[w,0],[w,y0],[x0,y0],[x0,h],[0,h]];
    else pts = [[0,0],[w,0],[w,h],[x1,h],[x1,y0],[0,y0]]; // bottom-left

    pts.forEach(([x,y], i) => { if (i === 0) shape.moveTo(x,y); else shape.lineTo(x,y); });
    shape.closePath();
    return shape;
  }

  shape.moveTo(0, 0);
  shape.lineTo(data.dWidth, 0);
  shape.lineTo(data.dWidth, data.dHeight);
  shape.lineTo(0, data.dHeight);
  shape.closePath();
  return shape;
}

// Draws the stall number + (once there's room) the exhibitor/company name,
// always clipped to the stall's own box so text can never overlap a
// neighbouring stall regardless of how the wrap/shrink math rounds.
function drawStallLabel(d, s, sw, sh, isActive) {
  const layout = computeStallLabelLayout(d, sw, sh);
  if (!layout) return;

  const numberColor = isActive ? '#1d4ed8' : '#0f172a';
  const companyColor = isActive ? '#1d4ed8' : '#0f172a';
  const centerWorld = getStallShapeCenter(d);
  const centerScreen = w2s(centerWorld.x, centerWorld.y);
  const cx = centerScreen.x, cy = centerScreen.y;

  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.save();
  if (hasStallCutouts(d)) {
    const clipPath = getStallShapeScreenPath(d, s, sw, sh);
    ctx.clip(clipPath, 'evenodd');
  } else {
    ctx.rect(s.x + 1, s.y + 1, sw - 2, sh - 2);
    ctx.clip();
  }

  if (layout.mode === 'number') {
    const stallNo = String(d.StallNo || '').trim();
    ctx.font = `${isActive ? 800 : 700} ${layout.numFs}px Inter,Arial,sans-serif`;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1.2, layout.numFs * .3);
    ctx.strokeText(stallNo, cx, cy);
    ctx.fillStyle = numberColor;
    ctx.fillText(stallNo, cx, cy);
  } else if (layout.mode === 'company') {
    const { fontSize, lines } = layout.coFit;
    const lineH = fontSize * 1.15;
    let ly = cy - (lineH * (lines.length - 1)) / 2;
    ctx.font = `800 ${fontSize}px Inter,Arial,sans-serif`;
    for (const line of lines) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1.2, fontSize * .28);
      ctx.strokeText(line, cx, ly);
      ctx.fillStyle = companyColor;
      ctx.fillText(line, cx, ly);
      ly += lineH;
    }
  } else if (layout.mode === 'stacked') {
    const stallNo = String(d.StallNo || '').trim();
    const totalBlock = layout.numAreaH + layout.gap + layout.coAreaH;
    const blockTop = cy - totalBlock / 2;

    ctx.font = `700 ${layout.numFs}px Inter,Arial,sans-serif`;
    const numY = blockTop + layout.numAreaH / 2 + 1;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, layout.numFs * .3);
    ctx.strokeText(stallNo, cx, numY);
    ctx.fillStyle = numberColor;
    ctx.globalAlpha = 0.85;
    ctx.fillText(stallNo, cx, numY);
    ctx.globalAlpha = 1;

    const { fontSize, lines } = layout.coFit;
    const lineH = fontSize * 1.15;
    const totalH = lineH * lines.length;
    let ly = blockTop + layout.numAreaH + layout.gap + (layout.coAreaH - totalH) / 2 + lineH / 2;
    ctx.font = `800 ${fontSize}px Inter,Arial,sans-serif`;
    for (const line of lines) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1.2, fontSize * .28);
      ctx.strokeText(line, cx, ly);
      ctx.fillStyle = companyColor;
      ctx.fillText(line, cx, ly);
      ly += lineH;
    }
  }

  ctx.restore();
}

function drawStall(d, color, act) {
  const s  = w2s(d.dLeft, d.dTop);
  const sw = d.dWidth * cam2.zoom, sh = d.dHeight * cam2.zoom;

  const openSides = openSidesForStall(d);
  const shapePath = getStallShapeScreenPath(d, s, sw, sh);
  const segments = getStallBoundarySegments(d);

  ctx.fillStyle = act ? 'rgba(29,78,216,0.14)' : color + '1f';
  ctx.fill(shapePath, 'evenodd');

  if (act) {
    const pulse = 0.5 + 0.35 * Math.sin(Date.now() / 350);
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = 'rgba(29,78,216,0.22)';
    ctx.lineWidth = Math.max(3, 4 * cam2.zoom);
    ctx.setLineDash([]);
    ctx.beginPath();
    segments.forEach(seg => {
      const p1 = w2s(seg.x1, seg.y1), p2 = w2s(seg.x2, seg.y2);
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
    });
    ctx.stroke();
    ctx.restore();
  }

  const lw = Math.max(act ? 1.9 : 1.35, cam2.zoom * (act ? 1.55 : 1.2));
  ctx.lineWidth = lw;
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';

  const solidColor = act ? '#1d4ed8' : color;
  const dashedColor = act ? 'rgba(29,78,216,0.72)' : color + '66';
  const dash = Math.max(4, Math.min(sw, sh) * 0.12);
  const gap = Math.max(3, dash * 0.7);

  ctx.strokeStyle = solidColor;
  ctx.setLineDash([]);
  ctx.beginPath();
  segments.forEach(seg => {
    if (seg.side !== 'inner' && openSides.includes(seg.side)) return;
    const p1 = w2s(seg.x1, seg.y1), p2 = w2s(seg.x2, seg.y2);
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
  });
  ctx.stroke();

  ctx.strokeStyle = dashedColor;
  ctx.setLineDash([dash, gap]);
  ctx.beginPath();
  segments.forEach(seg => {
    if (seg.side === 'inner' || !openSides.includes(seg.side)) return;
    const p1 = w2s(seg.x1, seg.y1), p2 = w2s(seg.x2, seg.y2);
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
  });
  ctx.stroke();
  ctx.setLineDash([]);

  if (sw > 6 && sh > 6) drawStallLabel(d, s, sw, sh, act);
}

function drawUtil(d) {
  const s  = w2s(d.dLeft, d.dTop);
  const sw = d.dWidth * cam2.zoom, sh = d.dHeight * cam2.zoom;
  ctx.fillStyle = '#f8fafc'; ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1; ctx.setLineDash([]);
  drawRoundedRect(ctx, s.x, s.y, sw, sh, Math.min(8, Math.max(2, sw * .05))); ctx.fill(); ctx.stroke();
  if (sw > 8 && sh > 6) {
    const fs = calcLabelFontSize(sw, sh, d.Text);
    if (fs >= 5.5) {
      ctx.font = `700 ${fs}px Inter,Arial,sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.save();
      ctx.rect(s.x + 1, s.y + 1, sw - 2, sh - 2);
      ctx.clip();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.strokeText(d.Text, s.x + sw / 2, s.y + sh / 2);
      ctx.fillStyle = '#dc2626';
      ctx.fillText(d.Text, s.x + sw / 2, s.y + sh / 2);
      ctx.restore();
    }
  }
}


function drawRoundedRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
}

function drawRouteSummaryBubble2d(anchorWorld) {
  if (!routeMetrics || !routeMetrics.distanceLabel || !anchorWorld) return;
  const p = w2s(anchorWorld.x, anchorWorld.y);
  const title = `${routeMetrics.timeLabel} (${routeMetrics.distanceLabel})`;
  const sub = _usingWalkZones ? 'Shortest aisle route' : 'Aisle-safe route';
  ctx.save();
  ctx.font = '800 12px Inter,Arial,sans-serif';
  const titleW = ctx.measureText(title).width;
  ctx.font = '700 10px Inter,Arial,sans-serif';
  const subW = ctx.measureText(sub).width;
  const w = Math.max(150, Math.min(240, Math.max(titleW, subW) + 28));
  const h = 50;
  let x = p.x + 18;
  let y = p.y - h - 18;
  x = Math.max(10, Math.min(canvas2d.width - w - 10, x));
  y = Math.max(10, Math.min(canvas2d.height - h - 10, y));

  ctx.shadowColor = 'rgba(15,23,42,.22)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = 'rgba(255,255,255,.96)';
  drawRoundedRect(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(30,58,138,.18)';
  ctx.stroke();

  ctx.fillStyle = '#1e3a8a';
  ctx.font = '900 12px Inter,Arial,sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(title, x + 14, y + 9);
  ctx.fillStyle = '#64748b';
  ctx.font = '700 10px Inter,Arial,sans-serif';
  ctx.fillText(sub, x + 14, y + 28);
  ctx.restore();
}

function drawRoute2d() {
  if (!routePath2d || routePath2d.length < 2) return;
  const pts = routePath2d.map(p => w2s(p.x, p.y));
  const routeBlue = '#1e3a8a';
  const routeBlue2 = '#2563eb';

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Soft base glow like premium indoor maps.
  ctx.strokeStyle = routeBlue;
  ctx.lineWidth = Math.max(7, 10 * Math.min(cam2.zoom, 1.25));
  ctx.globalAlpha = .13;
  ctx.setLineDash([]);
  ctx.beginPath();
  pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  ctx.stroke();

  // Main dotted route line.
  ctx.globalAlpha = 1;
  ctx.lineWidth = Math.max(3, 4.2 * Math.min(cam2.zoom, 1.45));
  ctx.strokeStyle = routeBlue;
  const dash = Math.max(1, 1.5 * cam2.zoom);
  const gap = Math.max(8, 11 * cam2.zoom);
  ctx.setLineDash([dash, gap]);
  ctx.lineDashOffset = -(Date.now() / 26 % (dash + gap));
  ctx.beginPath();
  pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw arrows directly on the actual route polyline. They use the same
  // points and heading as the directions, never independent guessed turns.
  let arrowCount = 0;
  for (let i = 1; i < pts.length && arrowCount < 12; i++) {
    const a = pts[i - 1], b = pts[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    if (Math.hypot(dx, dy) < 56) continue;
    const x = a.x + dx * 0.6, y = a.y + dy * 0.6;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.atan2(dy, dx));
    ctx.fillStyle = '#1e40af';
    ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(4, 0);
    ctx.moveTo(1, -4); ctx.lineTo(5, 0); ctx.lineTo(1, 4); ctx.stroke();
    ctx.restore();
    arrowCount++;
  }

  // Multi-action instructions highlight EVERY segment in their exact range,
  // so combining two directions cannot disconnect the text from the line.
  const active = navStepsData[currentNavStepIdx];
  if (active && Number.isInteger(active.pathStartIndex) && Number.isInteger(active.pathEndIndex)) {
    const start = Math.max(0, active.pathStartIndex);
    const end = Math.min(pts.length - 1, active.pathEndIndex);
    if (start <= end && pts[start] && pts[end]) {
      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.setLineDash([]);
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(pts[start].x, pts[start].y);
      for (let i = start + 1; i <= end; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      const mark = active.type === 'end' ? pts[end] : pts[start];
      ctx.fillStyle = '#fbbf24';
      ctx.strokeStyle = '#1e3a8a';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(mark.x, mark.y, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      let longest = 0, selected = null;
      for (let i = start + 1; i <= end; i++) {
        const a = pts[i - 1], b = pts[i];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len > longest) { longest = len; selected = [a, b]; }
      }
      if (selected && longest > 20) {
        const [a, b] = selected;
        const theta = Math.atan2(b.y - a.y, b.x - a.x);
        ctx.translate(a.x + (b.x - a.x) * 0.5, a.y + (b.y - a.y) * 0.5);
        ctx.rotate(theta);
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-5, -6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
  }

  // Direction pulse dots.
  const total = routePath2d.reduce((sum, p, i) => i ? sum + Math.hypot(p.x - routePath2d[i - 1].x, p.y - routePath2d[i - 1].y) : 0, 0);
  if (total > 0) {
    const now = Date.now() * 0.052;
    const count = Math.min(6, Math.max(2, Math.floor(total / 140)));
    for (let d = 0; d < count; d++) {
      const pos = pointOnRoute2d((now + d * total / count) % total);
      if (!pos) continue;
      const sp = w2s(pos.x, pos.y);
      ctx.beginPath();
      ctx.fillStyle = '#ffffff';
      ctx.arc(sp.x, sp.y, Math.max(3.5, 4.2 * Math.min(cam2.zoom, 1.3)), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = routeBlue2;
      ctx.lineWidth = 1.8;
      ctx.stroke();
    }
  }

  const mkr = (p, clr, label, icon) => {
    const r = Math.max(7, 9 * Math.min(cam2.zoom, 1.2));
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = clr;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    if (cam2.zoom > .32) {
      const fs = Math.min(10, 9 * cam2.zoom);
      ctx.font = `900 ${fs}px Inter,Arial,sans-serif`;
      const txt = icon ? `${icon} ${label}` : label;
      const tw = ctx.measureText(txt).width;
      ctx.fillStyle = 'rgba(15,23,42,.90)';
      drawRoundedRect(ctx, p.x - tw / 2 - 8, p.y - 16 * cam2.zoom - fs - 8, tw + 16, fs + 10, 8);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(txt, p.x, p.y - 16 * cam2.zoom - 2);
    }
  };
  if (routeStart2d) { const sp = w2s(routeStart2d.x, routeStart2d.y); mkr(sp, '#059669', 'START', ''); }
  if (routeEnd2d)   { const ep = w2s(routeEnd2d.x, routeEnd2d.y);     mkr(ep, '#1e3a8a', 'END', ''); }
  drawRouteSummaryBubble2d(routePath2d[Math.max(0, routePath2d.length - 2)] || routeEnd2d);
  ctx.restore();
}

function pointOnRoute2d(distanceOnPath) {
  if (!routePath2d || routePath2d.length < 2) return null;
  let remaining = distanceOnPath;
  for (let i = 1; i < routePath2d.length; i++) {
    const a = routePath2d[i - 1], b = routePath2d[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len <= 0) continue;
    if (remaining <= len) {
      const t = remaining / len;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    remaining -= len;
  }
  return routePath2d[routePath2d.length - 1];
}


function drawMapFloor2d() {
  const all = allStallData.length ? allStallData : [];
  if (!all.length) return;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  all.forEach(d => {
    x0 = Math.min(x0, d.dLeft); x1 = Math.max(x1, d.dLeft + d.dWidth);
    y0 = Math.min(y0, d.dTop);  y1 = Math.max(y1, d.dTop + d.dHeight);
  });
  if (!Number.isFinite(x0)) return;
  const pad = 34;
  const tl = w2s(x0 - pad, y0 - pad);
  const br = w2s(x1 + pad, y1 + pad);
  const w = br.x - tl.x, h = br.y - tl.y;
  ctx.save();
  ctx.shadowColor = 'rgba(15,23,42,.055)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 7;
  ctx.fillStyle = 'rgba(255,255,255,.94)';
  drawRoundedRect(ctx, tl.x, tl.y, w, h, Math.max(10, 18 * Math.min(cam2.zoom, 1.2)));
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(148,163,184,.16)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function render2dFrame() {
  ctx.clearRect(0, 0, canvas2d.width, canvas2d.height);
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, canvas2d.width, canvas2d.height);
  drawMapFloor2d();
  const step = 50;
  ctx.strokeStyle = 'rgba(148,163,184,.075)'; ctx.lineWidth = .5; ctx.setLineDash([]);
  const tl = s2w(0, 0), br = s2w(canvas2d.width, canvas2d.height);
  for (let gx = Math.floor(tl.x / step) * step; gx < br.x; gx += step) {
    const sx = w2s(gx, 0).x; ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, canvas2d.height); ctx.stroke();
  }
  for (let gy = Math.floor(tl.y / step) * step; gy < br.y; gy += step) {
    const sy = w2s(0, gy).y; ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(canvas2d.width, sy); ctx.stroke();
  }
  allUtilData.forEach(d => drawUtil(d));
  allStallData.forEach(d => { const act = isActive(d); drawStall(d, stallColor(d, act), act); });
  drawRoute2d();
}

function draw2d() {
  // Guard against multiple canvas animation loops after hall reloads or view switches.
  if (raf2dId !== null) return;

  const loop = () => {
    if (currentView !== '2d') { raf2dId = null; return; }
    render2dFrame();
    raf2dId = requestAnimationFrame(loop);
  };
  loop();
}
function hitTest(sx, sy) {
  const w = s2w(sx, sy);
  for (let i = allStallData.length - 1; i >= 0; i--) {
    const d = allStallData[i];
    if (pointInStallShapeXY(w.x, w.y, d))
      return { type: 'stall', data: d };
  }
  for (let i = allUtilData.length - 1; i >= 0; i--) {
    const d = allUtilData[i];
    if (w.x >= d.dLeft && w.x <= d.dLeft + d.dWidth && w.y >= d.dTop && w.y <= d.dTop + d.dHeight)
      return { type: 'util', data: d };
  }
  return null;
}

function getStallStatusMeta(d) {
  if (d.blBooked !== 'false') {
    if (d.blPreBooked === '1') return { label: 'Provisionally Booked', cls: 'hold' };
    return { label: 'Booked', cls: 'booked' };
  }
  if (d.blPreBooked === '1' || d.blTemp !== 'false') return { label: 'On Hold', cls: 'hold' };
  return { label: 'Available', cls: 'available' };
}

function hide2dHoverTip() {
  const tip = document.getElementById('tooltip-2d');
  if (!tip) return;
  tip.classList.remove('map-hover-tip-show');
  canvas2d.style.cursor = isPanning ? 'grabbing' : 'grab';
}

function update2dHoverTip(e) {
  if (currentView !== '2d' || isPanning || window.innerWidth <= 768) return hide2dHoverTip();
  const rect = canvas2d.getBoundingClientRect();
  const sx = (e.clientX - rect.left) * (canvas2d.width / Math.max(1, rect.width));
  const sy = (e.clientY - rect.top) * (canvas2d.height / Math.max(1, rect.height));
  const hit = hitTest(sx, sy);
  const tip = document.getElementById('tooltip-2d');
  if (!tip || !hit || hit.type !== 'stall') return hide2dHoverTip();

  const d = hit.data;
  const status = getStallStatusMeta(d);
  const company = String(d.txtComName || '').trim();
  const meta = [d.Area ? `${d.Area} m²` : '', d.Dimention || '', d.SideOpen || ''].filter(Boolean).join(' · ');
  tip.innerHTML = `
    <div class="map-hover-top">
      <strong>Stall ${escapeHtmlLocal(String(d.StallNo || ''))}</strong>
      <span class="map-hover-status ${status.cls}">${escapeHtmlLocal(status.label)}</span>
    </div>
    ${company ? `<div class="map-hover-company">${escapeHtmlLocal(company)}</div>` : ''}
    ${meta ? `<div class="map-hover-meta">${escapeHtmlLocal(meta)}</div>` : ''}`;

  const margin = 16;
  const tipW = 260;
  let left = e.clientX - rect.left + 16;
  let top = e.clientY - rect.top + 16;
  if (left + tipW > rect.width - margin) left = e.clientX - rect.left - tipW - 16;
  if (top + 98 > rect.height - margin) top = e.clientY - rect.top - 104;
  tip.style.left = `${Math.max(margin, left)}px`;
  tip.style.top = `${Math.max(margin, top)}px`;
  tip.classList.add('map-hover-tip-show');
  canvas2d.style.cursor = 'pointer';
}

canvas2d.addEventListener('pointerdown', e => {
  if (currentView !== '2d') return;
  ptrDown2d = { x: e.clientX, y: e.clientY };
  isPanning = true; isDragging2d = false;
  camStart = { x: cam2.x, y: cam2.y };
  canvas2d.setPointerCapture(e.pointerId);
});
canvas2d.addEventListener('pointermove', e => {
  if (currentView !== '2d') return;
  if (isPanning) {
    hide2dHoverTip();
    const dx = e.clientX - ptrDown2d.x, dy = e.clientY - ptrDown2d.y;
    if (Math.hypot(dx, dy) > 8) isDragging2d = true;
    cam2.x = camStart.x - dx / cam2.zoom;
    cam2.y = camStart.y - dy / cam2.zoom;
  } else {
    update2dHoverTip(e);
  }
});
canvas2d.addEventListener('pointerleave', hide2dHoverTip);
canvas2d.addEventListener('pointerup', e => {
  if (currentView !== '2d') return;
  isPanning = false;
  if (!isDragging2d && !_multiTouchActive) {
    const headerH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-h'));
    const hit = hitTest(e.clientX, e.clientY - headerH);
    if (hit && hit.type === 'stall') showStallDialog(hit.data);
  }
  isDragging2d = false;
});
canvas2d.addEventListener('wheel', e => {
  if (currentView !== '2d') return;
  e.preventDefault();
  const headerH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-h'));
  const w = s2w(e.clientX, e.clientY - headerH);
  const delta = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
  const factor = Math.pow(0.999, delta);
  cam2.zoom = Math.min(10, Math.max(0.04, cam2.zoom * factor));
  const wn = s2w(e.clientX, e.clientY - headerH);
  cam2.x += w.x - wn.x;
  cam2.y += w.y - wn.y;
}, { passive: false });
let lastPinchMid = null;

function touchPointToCanvas(touch) {
  const rect = canvas2d.getBoundingClientRect();
  return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
}
function getTouchMidpoint(touches) {
  const a = touchPointToCanvas(touches[0]);
  const b = touchPointToCanvas(touches[1]);
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
function getTouchDistance(touches) {
  const a = touchPointToCanvas(touches[0]);
  const b = touchPointToCanvas(touches[1]);
  return Math.hypot(a.x - b.x, a.y - b.y);
}

canvas2d.addEventListener('touchstart', e => {
  _activeTouches = e.touches.length;
  if (e.touches.length >= 2) {
    e.preventDefault();
    _multiTouchActive = true;
    isPanning = false;
    isDragging2d = true;
    lastPinchDist = getTouchDistance(e.touches);
    lastPinchMid = getTouchMidpoint(e.touches);
  }
}, { passive: false });

canvas2d.addEventListener('touchmove', e => {
  _activeTouches = e.touches.length;
  if (e.touches.length === 2) {
    e.preventDefault();
    _multiTouchActive = true;
    isPanning = false;
    isDragging2d = true;

    const newDist = getTouchDistance(e.touches);
    const newMid = getTouchMidpoint(e.touches);

    if (lastPinchDist && newDist > 0 && lastPinchMid) {
      // Keep the map point under the users' finger midpoint stable while zooming.
      // This removes the scattered/jumping feel on mobile pinch zoom.
      const worldBefore = s2w(lastPinchMid.x, lastPinchMid.y);
      const rawFactor = newDist / lastPinchDist;
      const factor = Math.max(0.82, Math.min(1.22, rawFactor));
      cam2.zoom = Math.min(10, Math.max(0.04, cam2.zoom * factor));
      const worldAfter = s2w(newMid.x, newMid.y);
      cam2.x += worldBefore.x - worldAfter.x;
      cam2.y += worldBefore.y - worldAfter.y;
    }

    lastPinchDist = newDist;
    lastPinchMid = newMid;
  }
}, { passive: false });

canvas2d.addEventListener('touchend', e => {
  _activeTouches = e.touches.length;
  if (e.touches.length >= 2) {
    lastPinchDist = getTouchDistance(e.touches);
    lastPinchMid = getTouchMidpoint(e.touches);
    return;
  }
  if (e.touches.length === 0) {
    lastPinchDist = null;
    lastPinchMid = null;
    _activeTouches = 0;
    isPanning = false;
    setTimeout(() => { _multiTouchActive = false; }, 160);
  }
}, { passive: false });

function fitCamera2d() {
  const all = [...allStallData, ...allUtilData]; if (!all.length) return;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  all.forEach(d => { x0 = Math.min(x0, d.dLeft); x1 = Math.max(x1, d.dLeft + d.dWidth); y0 = Math.min(y0, d.dTop); y1 = Math.max(y1, d.dTop + d.dHeight); });
  cam2.x = (x0 + x1) / 2; cam2.y = (y0 + y1) / 2;
  cam2.zoom = Math.min(canvas2d.width / ((x1 - x0) * 1.1), canvas2d.height / ((y1 - y0) * 1.1));
}

function focusStall2d(sid) {
  const d = findStallForTarget(sid);
  if (!d) return false;
  setActiveStallTarget(getStallPrimaryKey(d), getStallPrimaryMode(d));
  cam2.x = d.dLeft + d.dWidth / 2;
  cam2.y = d.dTop  + d.dHeight / 2;
  cam2.zoom = window.innerWidth <= 768 ? 2.8 : 4;
  if (currentView === '2d' && typeof render2dFrame === 'function') render2dFrame();
  return true;
}

/* ══════════════════════════════════════════
   3D ENGINE SETUP
══════════════════════════════════════════ */
let scene, camera3, renderer3, labelRenderer3, controls3, raycaster3, mouse3;
let stallsGroup3 = new THREE.Group();
let activeStallPos3 = null;
let isDragging3 = false, ptrDown3 = { x: 0, y: 0 };
let pathMesh3 = null, startMark3 = null, endMark3 = null;
let pathAnimDots3 = [], routeWorldPts3 = [], routeTotalLen3 = 0;
let routeHighlightedGroups3 = new Set();
let startGroup3 = null, endGroup3 = null;
// Keep live references to 3D stall labels so font/scale can be fitted to the actual projected stall size.
let stallLabel3DRefs = [];

/* ── Shared geometries (reused across all stalls) ── */
const geo3Floor    = new THREE.BoxGeometry(1, 1, 1); // scaled per stall
const geo3Wall     = new THREE.BoxGeometry(1, 1, 1);
const geo3TTop     = new THREE.CylinderGeometry(3.5, 3.5, .4, 24);
const geo3TLeg     = new THREE.CylinderGeometry(.3, .3, 6, 12);
const geo3TBase    = new THREE.CylinderGeometry(1.8, 1.8, .2, 24);
const geo3SSeat    = new THREE.CylinderGeometry(1.4, 1.4, .4, 24);
const geo3SLeg     = new THREE.CylinderGeometry(.2, .2, 4.5, 12);
const geo3SBase    = new THREE.CylinderGeometry(1.2, 1.2, .2, 24);
const geo3DB       = new THREE.BoxGeometry(8, 7.5, 3);
const geo3DTop     = new THREE.BoxGeometry(8.5, .5, 3.5);
const geo3Plant    = new THREE.ConeGeometry(3.5, 12, 8);
const geo3Pot      = new THREE.CylinderGeometry(2, 1.5, 3, 8);
const geo3Counter  = new THREE.BoxGeometry(12, 8, 4);
const geo3CounterTop = new THREE.BoxGeometry(13, .6, 5);

/* ── Materials ── */
const mat3Metal = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: .3, metalness: .8 });
const mat3Stool = new THREE.MeshLambertMaterial({ color: 0x1e293b });
const mat3Table = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: .95 });
const mat3DeskA = new THREE.MeshLambertMaterial({ color: 0x334155 });
const mat3Desk  = new THREE.MeshLambertMaterial({ color: 0xffffff });
const mat3Plant = new THREE.MeshLambertMaterial({ color: 0x16a34a });
const mat3Pot   = new THREE.MeshLambertMaterial({ color: 0x78350f });
const mat3CounterWhite = new THREE.MeshLambertMaterial({ color: 0xfafafa });

// HD materials
let mat3FloorHD = null;
let hdSpotLights = [];
let hdFloorMesh  = null;

function makeConeGeo() {
  const g = new THREE.ConeGeometry(8, 20, 16);
  g.translate(0, -10, 0); g.rotateX(Math.PI); return g;
}

function get3DViewportSize() {
  const container = document.getElementById('webgl-container');
  return {
    w: container?.clientWidth || window.innerWidth,
    h: container?.clientHeight || Math.max(1, window.innerHeight - parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-h')))
  };
}

function resize3d() {
  if (!renderer3 || !camera3 || !labelRenderer3) return;
  const { w, h } = get3DViewportSize();
  camera3.aspect = w / Math.max(1, h);
  camera3.updateProjectionMatrix();
  renderer3.setSize(w, h, false);
  labelRenderer3.setSize(w, h);
}

function init3D() {
  const container = document.getElementById('webgl-container');
  const isMobile  = window.innerWidth <= 768;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf0f2f5);
  scene.fog = new THREE.FogExp2(0xf0f2f5, isMobile ? 0.00008 : 0.00012);
  scene.add(stallsGroup3);

  const { w: viewW, h: viewH } = get3DViewportSize();
  camera3 = new THREE.PerspectiveCamera(45, viewW / Math.max(1, viewH), 1, 20000);
  camera3.position.set(1000, 1500, 1000);

  renderer3 = new THREE.WebGLRenderer({
    antialias: !isMobile,
    powerPreference: 'high-performance',
    precision: isMobile ? 'mediump' : 'highp'
  });
  renderer3.setSize(viewW, viewH, false);
  renderer3.setPixelRatio(isMobile ? 1 : Math.min(window.devicePixelRatio, 1.5));
  renderer3.shadowMap.enabled = false;
  container.appendChild(renderer3.domElement);
  renderer3.domElement.style.cssText = 'position:absolute;top:0;left:0;display:none';

  labelRenderer3 = new THREE.CSS2DRenderer();
  labelRenderer3.setSize(viewW, viewH);
  labelRenderer3.domElement.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:10;display:none';
  container.appendChild(labelRenderer3.domElement);

  controls3 = new THREE.OrbitControls(camera3, renderer3.domElement);
  controls3.enableDamping = true;
  controls3.dampingFactor = 0.06;
  controls3.maxPolarAngle = Math.PI / 2 - 0.04;
  controls3.minDistance   = 50;
  controls3.maxDistance   = 12000;
  controls3.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

  // Base lighting
  const hemi = new THREE.HemisphereLight(0xffffff, 0xe2e8f0, 0.75);
  hemi.name = 'hemi';
  scene.add(hemi);

  const dl = new THREE.DirectionalLight(0xffffff, 0.5);
  dl.position.set(1000, 2000, 500);
  dl.name = 'dirMain';
  scene.add(dl);

  // Floor
  const flrGeo = new THREE.PlaneGeometry(12000, 12000);
  const flrMat = new THREE.MeshLambertMaterial({ color: 0xf1f5f9 });
  const flr = new THREE.Mesh(flrGeo, flrMat);
  flr.rotation.x = -Math.PI / 2;
  flr.name = 'floor';
  scene.add(flr);
  hdFloorMesh = flr;

  const grid = new THREE.GridHelper(12000, 240, 0xcbd5e1, 0xe2e8f0);
  grid.position.y = 0.15; grid.material.opacity = 0.35; grid.material.transparent = true;
  grid.name = 'grid';
  scene.add(grid);

  raycaster3 = new THREE.Raycaster();
  mouse3 = new THREE.Vector2();

  const c = renderer3.domElement;
  c.addEventListener('pointerdown', e => { ptrDown3 = { x: e.clientX, y: e.clientY }; isDragging3 = false; });
  c.addEventListener('pointermove', e => { if (Math.hypot(e.clientX - ptrDown3.x, e.clientY - ptrDown3.y) > 8) isDragging3 = true; });
  c.addEventListener('pointerup',   e => { if (!isDragging3 && !_multiTouchActive) onCk3(e); });
  c.addEventListener('touchstart',  e => { if (e.touches.length >= 2) { _multiTouchActive = true; isDragging3 = true; } }, { passive: true });
  c.addEventListener('touchend',    e => { if (e.touches.length === 0) setTimeout(() => { _multiTouchActive = false; }, 120); }, { passive: true });

  // Resize is handled by the single global resize listener in init.

  // Apply saved quality
  applyQualityLighting(currentQuality);
  animate3();
}

function animate3() {
  requestAnimationFrame(animate3);
  if (currentView !== '3d') return; // Do not burn GPU while 2D view is active/hidden in WebView.
  trackFPS();
  controls3.update();

  const now = Date.now();
  const isMobile = window.innerWidth <= 768;
  if (!isMobile || now - _lastLabelUpdate > 80) {
    _lastLabelUpdate = now;
    update3DLabelSizing();
  }

  if (startMark3 && endMark3) {
    [startMark3, endMark3].forEach(m => { m.position.y = 25 + Math.sin(now * .003) * 4; m.rotation.y += .02; });
  }

  updateRouteAnimation3(now);

  // HD LED glow pulse on spotlights
  if (currentQuality === 'hd') {
    hdSpotLights.forEach((sl, i) => {
      sl.intensity = 1.2 + 0.3 * Math.sin(now * 0.0008 + i * 1.2);
    });
  }

  renderer3.render(scene, camera3);
  labelRenderer3.render(scene, camera3);
}

function clampNum(v, min, max) { return Math.max(min, Math.min(max, v)); }

function projectedWorldSpanPx3(center, span, axis) {
  if (!camera3 || !renderer3 || !center || !Number.isFinite(span) || span <= 0) return 0;
  const w = Math.max(1, labelRenderer3?.domElement?.clientWidth || renderer3.domElement.clientWidth || window.innerWidth || 1);
  const h = Math.max(1, labelRenderer3?.domElement?.clientHeight || renderer3.domElement.clientHeight || window.innerHeight || 1);
  const a = center.clone();
  const b = center.clone();
  if (axis === 'x') { a.x -= span / 2; b.x += span / 2; }
  else { a.z -= span / 2; b.z += span / 2; }
  a.project(camera3); b.project(camera3);
  const ax = (a.x + 1) * 0.5 * w, ay = (-a.y + 1) * 0.5 * h;
  const bx = (b.x + 1) * 0.5 * w, by = (-b.y + 1) * 0.5 * h;
  return Math.hypot(bx - ax, by - ay);
}

function update3DLabelSizing() {
  if (!camera3 || !controls3) return;
  const dist = camera3.position.distanceTo(controls3.target);
  // Inverse zoom behaviour: zoom in => bigger labels, zoom out => smaller labels.
  const zoomScale = clampNum((mapBaseSize * 0.52) / Math.max(1, dist), 0.32, 1.75);
  const globalOpacity = dist > mapBaseSize * 1.7 ? 0.5 : dist > mapBaseSize * 1.25 ? 0.72 : 1;

  const reusableCenter = new THREE.Vector3();
  stallLabel3DRefs = stallLabel3DRefs.filter(ref => ref && ref.element && ref.label && ref.label.parent);
  stallLabel3DRefs.forEach(ref => {
    const el = ref.element;
    const data = ref.data || {};
    const label = String(data.StallNo || el.textContent || '').trim();
    const len = Math.max(1, label.length);
    const stallW = Math.max(1, Number(data.dWidth) || 40);
    const stallH = Math.max(1, Number(data.dHeight) || 40);

    ref.label.getWorldPosition(reusableCenter);
    const screenW = projectedWorldSpanPx3(reusableCenter, stallW, 'x');
    const screenH = projectedWorldSpanPx3(reusableCenter, stallH, 'z');
    const availableW = Math.max(12, screenW * 0.76);
    const availableH = Math.max(8, screenH * 0.46);

    // Estimate rendered label size at 14px base font + horizontal padding, then scale to fit the booth.
    const baseTextW = Math.max(18, len * 8.2 + 12);
    const baseTextH = 20;
    const fitScale = Math.min(availableW / baseTextW, availableH / baseTextH);
    const scale = clampNum(Math.min(zoomScale, fitScale), 0.28, 1.8);

    el.style.display = scale < 0.22 ? 'none' : 'block';
    el.style.opacity = String(Math.max(0.35, Math.min(globalOpacity, fitScale < 0.34 ? 0.55 : 1)));
    el.style.transform = `translateZ(0) scale(${scale})`;
    el.style.maxWidth = '';
  });

  const utilScale = clampNum(zoomScale, 0.3, 1.25);
  document.querySelectorAll('.util-label').forEach(l => {
    l.style.display = 'block';
    l.style.opacity = globalOpacity;
    l.style.transform = `translateZ(0) scale(${utilScale})`;
  });

  const pinScale = clampNum((mapBaseSize * .6) / Math.max(1, dist), .38, 1.2);
  document.querySelectorAll('.active-pin,.route-badge').forEach(p => p.style.transform = `translateZ(0) scale(${pinScale})`);
}

/* ══════════════════════════════════════════
   QUALITY MODE SYSTEM
══════════════════════════════════════════ */
function applyQualityLighting(quality) {
  quality = 'normal'; // locked: no Basic/HD switching in WebView build
  // Remove old HD lights
  hdSpotLights.forEach(sl => scene && scene.remove(sl));
  hdSpotLights = [];

  const hemi = scene.getObjectByName('hemi');
  const dl   = scene.getObjectByName('dirMain');
  const grid = scene.getObjectByName('grid');

  if (quality === 'basic') {
    renderer3.setPixelRatio(1.0);
    renderer3.shadowMap.enabled = false;
    if (hemi) hemi.intensity = 1.0;
    if (dl)   dl.intensity   = 0.3;
    if (grid) grid.visible   = false;
    if (hdFloorMesh) hdFloorMesh.material.color.setHex(0xf1f5f9);
    scene.fog = new THREE.FogExp2(0xf0f2f5, 0.0002);

  } else if (quality === 'normal') {
    const isMobile = window.innerWidth <= 768;
    renderer3.setPixelRatio(isMobile ? 1 : Math.min(window.devicePixelRatio, 1.5));
    renderer3.shadowMap.enabled = false;
    if (hemi) hemi.intensity = 0.8;
    if (dl)   { dl.intensity = 0.5; dl.position.set(1000, 2000, 500); }
    if (grid) grid.visible   = true;
    if (hdFloorMesh) hdFloorMesh.material.color.setHex(0xf1f5f9);
    scene.fog = new THREE.FogExp2(0xf0f2f5, 0.00012);

  } else if (quality === 'hd') {
    const isMobile = window.innerWidth <= 768;
    renderer3.setPixelRatio(isMobile ? Math.min(window.devicePixelRatio, 1.5) : Math.min(window.devicePixelRatio, 2.0));
    renderer3.shadowMap.enabled = true;
    renderer3.shadowMap.type    = THREE.PCFSoftShadowMap;
    if (hemi) hemi.intensity = 0.6;
    if (dl)   {
      dl.intensity = 0.4;
      dl.castShadow = true;
      dl.shadow.mapSize.width = 2048;
      dl.shadow.mapSize.height = 2048;
    }
    if (grid) grid.visible = true;
    // Glossy floor
    if (hdFloorMesh) {
      hdFloorMesh.material = new THREE.MeshStandardMaterial({
        color: 0xe8ecf0, roughness: 0.15, metalness: 0.1,
        envMapIntensity: 0.5
      });
    }
    // Add coloured spotlights for premium feel
    const spotColors = [0xffeedd, 0xddeeff, 0xffffff, 0xeeffdd];
    const spotPositions = [
      [-500, 600, -500], [500, 600, -500],
      [-500, 600, 500],  [500, 600, 500]
    ];
    spotPositions.forEach((pos, i) => {
      const sl = new THREE.SpotLight(spotColors[i], 1.2, 3000, Math.PI / 8, 0.5, 1.5);
      sl.position.set(...pos);
      sl.castShadow = false; // perf
      scene.add(sl);
      hdSpotLights.push(sl);
    });
    scene.fog = new THREE.FogExp2(0xeef2f7, 0.00008);
  }
}

function updateQualityUI(quality) {
  // Quality UI removed. Keep this function as a safe no-op for older code paths.
  currentQuality = 'normal';
}

function setQualityMode(quality) {
  // Quality selector removed. 3D always stays in Normal mode for predictable WebView performance.
  currentQuality = 'normal';
  applyQualityLighting('normal');
}
function clearStallGroup3() {
  stallLabel3DRefs = [];
  while (stallsGroup3.children.length) {
    const o = stallsGroup3.children[0];
    o.traverse(c => {
      if (c.isMesh) {
        if (c.geometry && !isSharedGeo(c.geometry)) c.geometry.dispose();
        if (Array.isArray(c.material)) c.material.forEach(m => { if (!isSharedMat(m)) m.dispose(); });
        else if (c.material && !isSharedMat(c.material)) c.material.dispose();
      }
      if (c.isCSS2DObject && c.element?.parentNode) c.element.parentNode.removeChild(c.element);
    });
    stallsGroup3.remove(o);
  }
}

const _sharedGeos = new Set([geo3TTop, geo3TLeg, geo3TBase, geo3SSeat, geo3SLeg, geo3SBase, geo3DB, geo3DTop, geo3Plant, geo3Pot, geo3Counter, geo3CounterTop]);
const _sharedMats = new Set([mat3Metal, mat3Stool, mat3Table, mat3DeskA, mat3Desk, mat3Plant, mat3Pot, mat3CounterWhite]);
function isSharedGeo(g) { return _sharedGeos.has(g); }
function isSharedMat(m) { return _sharedMats.has(m); }

/* ══════════════════════════════════════════
   3D STALL BUILDER — quality-aware
══════════════════════════════════════════ */
function stColor3(d, act) {
  if (act) return 0x1d4ed8;
  if (d.blBooked !== 'false') return d.blPreBooked === '1' ? 0xf59e0b : 0xef4444;
  if (d.blPreBooked === '1' || d.blTemp !== 'false') return 0x94a3b8;
  if (d.sStatus === '1') return 0x34d399;
  return 0x059669;
}

function stallOpacity(d, act) {
  // IMPROVEMENT 2: Stronger opacity — no more invisible stalls
  if (act) return 0.92;
  if (d.blBooked !== 'false') return 0.88; // booked: more solid
  if (d.blPreBooked === '1' || d.blTemp !== 'false') return 0.70; // hold: moderate
  return 0.75; // available: semi-transparent but clearly visible
}

function build3DStall(data) {
  const vH = 28, wT = 2, fH = 4, flT = 2;
  const pW = data.dWidth, pH = data.dHeight;
  const act = isActive(data);
  const col = stColor3(data, act);
  const opacity = stallOpacity(data, act);

  const grp = new THREE.Group();
  grp.userData = { ...data, _isStall: true };
  grp.position.set(data.dLeft + pW / 2, 0, data.dTop + pH / 2);

  const mk = (geo, mat, x, y, z, rx, ry, rz) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (rx) m.rotation.x = rx;
    if (ry) m.rotation.y = ry;
    if (rz) m.rotation.z = rz;
    m.userData = { ...data, _isStall: true };
    if (currentQuality === 'hd') { m.castShadow = true; m.receiveShadow = true; }
    grp.add(m); return m;
  };

  // Real L-shaped / notched stall. Do not create the old rectangular floor/walls,
  // otherwise the backend blank overlay would still look filled in 3D.
  if (hasStallCutouts(data)) {
    const floorShape = createThreeStallShape(data);
    const floorGeo = new THREE.ShapeGeometry(floorShape);
    floorGeo.rotateX(Math.PI / 2);
    const floorMat = new THREE.MeshLambertMaterial({
      color: col,
      transparent: true,
      opacity: currentQuality === 'basic' ? Math.min(opacity + 0.15, 1) : Math.min(opacity + 0.05, 1),
      side: THREE.DoubleSide
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.set(-pW / 2, flT, -pH / 2);
    floor.userData = { ...data, _isStall: true };
    grp.add(floor);

    const openSides3 = openSidesForStall(data);
    const edgeH = currentQuality === 'basic' ? 8 : 14;
    const edgeMat = new THREE.MeshLambertMaterial({ color: col });
    getStallBoundarySegments(data).forEach(seg => {
      if (seg.side !== 'inner' && openSides3.includes(seg.side)) return;
      const x1 = seg.x1 - (data.dLeft + pW / 2);
      const z1 = seg.y1 - (data.dTop + pH / 2);
      const x2 = seg.x2 - (data.dLeft + pW / 2);
      const z2 = seg.y2 - (data.dTop + pH / 2);
      const len = Math.hypot(x2 - x1, z2 - z1);
      if (len < 0.1) return;
      const edge = new THREE.Mesh(new THREE.BoxGeometry(len, edgeH, wT), edgeMat);
      edge.position.set((x1 + x2) / 2, flT + edgeH / 2, (z1 + z2) / 2);
      edge.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
      edge.userData = { ...data, _isStall: true };
      grp.add(edge);
    });

    stallsGroup3.add(grp);
    addStallLabel3D(grp, data, flT + edgeH + 6, act);
    return;
  }

  // ── BASIC: just coloured floor slab ──
  if (currentQuality === 'basic') {
    const flrMat = new THREE.MeshLambertMaterial({ color: col, transparent: true, opacity: Math.min(opacity + 0.15, 1) });
    const flrMesh = new THREE.Mesh(new THREE.BoxGeometry(pW, flT, pH), flrMat);
    flrMesh.position.set(0, flT / 2, 0);
    flrMesh.userData = { ...data, _isStall: true };
    grp.add(flrMesh);

    const sides = openSidesForStall(data);
    const oT = sides.includes('top'), oB = sides.includes('bottom'), oL = sides.includes('left'), oR = sides.includes('right');

    // Bold border walls (no transparency) only on closed sides.
    const wallH = 8;
    const borderMat = new THREE.MeshLambertMaterial({ color: col });
    if (!oT) { const topB = new THREE.Mesh(new THREE.BoxGeometry(pW, wallH, wT * 1.5), borderMat); topB.position.set(0, flT + wallH / 2, -pH / 2); grp.add(topB); }
    if (!oB) { const btmB = new THREE.Mesh(new THREE.BoxGeometry(pW, wallH, wT * 1.5), borderMat); btmB.position.set(0, flT + wallH / 2, pH / 2); grp.add(btmB); }
    if (!oL) { const lftB = new THREE.Mesh(new THREE.BoxGeometry(wT * 1.5, wallH, pH), borderMat); lftB.position.set(-pW / 2, flT + wallH / 2, 0); grp.add(lftB); }
    if (!oR) { const rgtB = new THREE.Mesh(new THREE.BoxGeometry(wT * 1.5, wallH, pH), borderMat); rgtB.position.set(pW / 2, flT + wallH / 2, 0); grp.add(rgtB); }

    stallsGroup3.add(grp);
    addStallLabel3D(grp, data, flT + wallH + 6, act);
    return;
  }

  // ── NORMAL + HD: full booth construction ──
  const sides = openSidesForStall(data);
  const oT = sides.includes('top'), oB = sides.includes('bottom'), oL = sides.includes('left'), oR = sides.includes('right');
  const hW = pW / 2, hH = pH / 2;
  const wallH = vH - fH, wallY = flT + wallH / 2, fY = flT + wallH + fH / 2;

  // Floor slab
  const flrMat = new THREE.MeshLambertMaterial({ color: col });
  const flrMesh = new THREE.Mesh(new THREE.BoxGeometry(pW, flT, pH), flrMat);
  flrMesh.position.set(0, flT / 2, 0);
  flrMesh.userData = { ...data, _isStall: true };
  if (currentQuality === 'hd') { flrMesh.receiveShadow = true; }
  grp.add(flrMesh);

  // Walls — reduced transparency for better visibility
  const wallOpacity = currentQuality === 'hd' ? 0.45 : 0.38;
  const wallMat  = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: wallOpacity });
  const frameMat = new THREE.MeshLambertMaterial({ color: col });

  if (!oT) { const w = new THREE.Mesh(new THREE.BoxGeometry(pW + wT, wallH, wT), wallMat); w.position.set(0, wallY, -hH + wT/2); w.userData = { ...data, _isStall: true }; grp.add(w); }
  if (!oB) { const w = new THREE.Mesh(new THREE.BoxGeometry(pW + wT, wallH, wT), wallMat); w.position.set(0, wallY,  hH - wT/2); w.userData = { ...data, _isStall: true }; grp.add(w); }
  if (!oL) { const w = new THREE.Mesh(new THREE.BoxGeometry(wT, wallH, pH + wT), wallMat); w.position.set(-hW + wT/2, wallY, 0); w.userData = { ...data, _isStall: true }; grp.add(w); }
  if (!oR) { const w = new THREE.Mesh(new THREE.BoxGeometry(wT, wallH, pH + wT), wallMat); w.position.set( hW - wT/2, wallY, 0); w.userData = { ...data, _isStall: true }; grp.add(w); }

  // Fascia frames (solid colour bands) only on closed sides.
  if (!oT) { const m = new THREE.Mesh(new THREE.BoxGeometry(pW + wT, fH, wT), frameMat); m.position.set(0, fY, -hH + wT/2); m.userData = { ...data, _isStall: true }; grp.add(m); }
  if (!oB) { const m = new THREE.Mesh(new THREE.BoxGeometry(pW + wT, fH, wT), frameMat); m.position.set(0, fY, hH - wT/2); m.userData = { ...data, _isStall: true }; grp.add(m); }
  if (!oL) { const m = new THREE.Mesh(new THREE.BoxGeometry(wT, fH, pH + wT), frameMat); m.position.set(-hW + wT/2, fY, 0); m.userData = { ...data, _isStall: true }; grp.add(m); }
  if (!oR) { const m = new THREE.Mesh(new THREE.BoxGeometry(wT, fH, pH + wT), frameMat); m.position.set(hW - wT/2, fY, 0); m.userData = { ...data, _isStall: true }; grp.add(m); }

  // Corner columns only where at least one adjoining side is closed.
  [
    { px: -hW + wT/2, pz: -hH + wT/2, show: !oT || !oL },
    { px:  hW - wT/2, pz: -hH + wT/2, show: !oT || !oR },
    { px: -hW + wT/2, pz:  hH - wT/2, show: !oB || !oL },
    { px:  hW - wT/2, pz:  hH - wT/2, show: !oB || !oR }
  ].forEach(({ px, pz, show }) => {
    if (!show) return;
    const m = new THREE.Mesh(new THREE.BoxGeometry(2, wallH, 2), frameMat);
    m.position.set(px, wallY, pz); m.userData = { ...data, _isStall: true }; grp.add(m);
  });

  // ── NORMAL mode: table + chairs removed for optimized stall view ──

  // Reception desk
  if (pW >= 25 && pH >= 20) {
    let dZ = oB ? hH - 5 : oT ? -hH + 5 : 0;
    if (dZ !== 0) {
      mk(geo3DB, mat3DeskA, -hW + 7, flT + 3.75, dZ);
      mk(geo3DTop, mat3Desk, -hW + 7, flT + 7.5, dZ);
    }
  }

  // ── HD mode: plants + rounded counter ──
  if (currentQuality === 'hd' && pW > 30 && pH > 25) {
    // Plants at corners
    [[-hW + 5, hH - 5], [hW - 5, hH - 5]].forEach(([px, pz]) => {
      mk(geo3Pot,   mat3Pot,   px, flT + 1.5, pz);
      mk(geo3Plant, mat3Plant, px, flT + 11,  pz);
    });

    // Premium counter
    if (pW >= 40) {
      const cZ = oB ? hH - 6 : oT ? -hH + 6 : 0;
      if (cZ !== 0) {
        mk(geo3Counter,    mat3CounterWhite, -hW + 8, flT + 4, cZ);
        mk(geo3CounterTop, mat3Table,        -hW + 8, flT + 8.3, cZ);
      }
    }

    // LED strip along fascia
    const ledMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9 });
    const ledGeo = new THREE.BoxGeometry(pW - 2, 0.8, 0.8);
    const led = new THREE.Mesh(ledGeo, ledMat);
    led.position.set(0, fY + fH / 2 + 0.5, -hH + wT / 2);
    grp.add(led);
  }

  stallsGroup3.add(grp);
  addStallLabel3D(grp, data, flT + vH + 4, act);
}

/* ── Shared label builder ── */
function addStallLabel3D(grp, data, yOffset, act) {
  if (act) {
    activeStallPos3 = grp.position.clone();
    if (innerWidth <= 768) activeStallPos3.z -= 100;
    const div = document.createElement('div');
    div.innerHTML = `<div class="active-pin"><div class="pin-pulse"></div><div class="pin-label">${escapeHtmlLocal(data.StallNo)}</div></div>`;
    const lbl = new THREE.CSS2DObject(div);
    lbl.position.set(0, yOffset + 8, 0);
    grp.add(lbl);
  } else {
    const div = document.createElement('div');
    div.innerHTML = `<div class="stall-label" data-stall-width="${Number(data.dWidth) || 40}" data-stall-height="${Number(data.dHeight) || 40}">${escapeHtmlLocal(data.StallNo)}</div>`;
    const labelEl = div.querySelector('.stall-label');
    const lbl = new THREE.CSS2DObject(div);
    lbl.position.set(0, yOffset, 0);
    grp.add(lbl);
    stallLabel3DRefs.push({ element: labelEl, label: lbl, data });
  }
}

function buildUtil3(data) {
  if (!String(data.Text || '').trim()) return;
  const flT = 2;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(data.dWidth, flT, data.dHeight),
    new THREE.MeshLambertMaterial({ color: 0xffffff }));
  mesh.position.set(data.dLeft + data.dWidth / 2, flT / 2, data.dTop + data.dHeight / 2);
  mesh.userData = { isUtility: true, Text: data.Text };
  const div = document.createElement('div');
  div.innerHTML = `<div class="util-label">${data.Text}</div>`;
  const lbl = new THREE.CSS2DObject(div);
  lbl.position.set(0, flT + 1, 0);
  mesh.add(lbl);
  stallsGroup3.add(mesh);
}

function getStallDataFromHit(object) {
  let obj = object;
  while (obj) {
    if (obj.userData && obj.userData._isStall && obj.userData.StallNo) return obj.userData;
    obj = obj.parent;
  }
  return null;
}

function onCk3(e) {
  if (_multiTouchActive) return;
  const rect = renderer3.domElement.getBoundingClientRect();
  mouse3.x = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
  mouse3.y = -((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
  raycaster3.setFromCamera(mouse3, camera3);
  const hits = raycaster3.intersectObjects(stallsGroup3.children, true);
  if (hits.length > 0) {
    const hm = hits[0].object;
    if (hm.material && hm.material.opacity < .2) return;
    const d = getStallDataFromHit(hm);
    if (d && d.StallNo) showStallDialog(d);
  }
}

function hiG3(g, hex) {
  if (!g) return;
  routeHighlightedGroups3.add(g);
  g.traverse(c => {
    if (!c.isMesh || !c.material || c.userData.isTargetPin) return;
    // Clone material before coloring so highlight never leaks to other stalls using shared materials.
    if (!c.userData.routeOrigMaterial) c.userData.routeOrigMaterial = c.material;
    if (!c.userData.routeMat) c.userData.routeMat = c.userData.routeOrigMaterial.clone();
    c.material = c.userData.routeMat;
    if (c.material.color) c.material.color.setHex(hex);
    c.material.opacity = Math.max(.82, c.material.opacity || 1);
    c.material.transparent = true;
  });
}
function unHiG3(g) {
  if (!g) return;
  g.traverse(c => {
    if (!c.isMesh || c.userData.isTargetPin) return;
    if (c.userData.routeOrigMaterial) {
      if (c.material && c.material !== c.userData.routeOrigMaterial && c.material.dispose) c.material.dispose();
      c.material = c.userData.routeOrigMaterial;
      delete c.userData.routeOrigMaterial;
      delete c.userData.routeMat;
    }
  });
  routeHighlightedGroups3.delete(g);
}
function resetAllRouteHighlights3() {
  Array.from(routeHighlightedGroups3).forEach(g => unHiG3(g));
  routeHighlightedGroups3.clear();
}
function focusMode3(on) {
  stallsGroup3.children.forEach(g => {
    if (on && (g === startGroup3 || g === endGroup3)) return;
    g.traverse(c => { if (c.isMesh && c.material) {
      if (c.userData.focusOrigOp === undefined) c.userData.focusOrigOp = c.material.opacity !== undefined ? c.material.opacity : 1;
      if (on) { c.material.opacity = .10; c.material.transparent = true; }
      else { c.material.opacity = c.userData.focusOrigOp; c.material.transparent = c.userData.focusOrigOp < 1; delete c.userData.focusOrigOp; }
    }});
  });
}

/* ══════════════════════════════════════════
   3D FOCUS HELPERS
══════════════════════════════════════════ */
function rebuild3DAndFocus(stallNo) {
  clearStallGroup3();
  buildAll3D();
  setTimeout(() => focusStall3d(stallNo), 350);
}

function focusStall3d(stallNo) {
  let tg = null;
  stallsGroup3.children.forEach(g => {
    if (tg || !g.userData) return;
    const ok = searchTargetMatchMode === 'id'
      ? matchesStallBackendId(g.userData, stallNo)
      : matchesStallKey(g.userData, stallNo);
    if (ok) tg = g;
  });
  if (!tg) return;
  const pos = tg.position;
  controls3.target.set(pos.x, 0, pos.z);
  const distance = window.innerWidth <= 768 ? 500 : 350;
  camera3.position.set(pos.x, distance * 0.9, pos.z + distance);
  controls3.update();
}

/* ══════════════════════════════════════════
   AISLE-FIRST PATHFINDING ENGINE
   - If backend provides AISLE / WALK / PATH boxes in SpaceData, routing stays inside them.
   - Otherwise it falls back to inflated-stall grid routing with sharp 90° turns.
══════════════════════════════════════════ */
const CELL = 4;
// Keep the route close to the real aisle/open side. A very large clearance made the line float far away from stalls.
const ROUTE_CLEARANCE = 8;
const ROUTE_ENTRY_OFFSET = ROUTE_CLEARANCE + CELL;
// This is for the routing grid only. Camera/visual padding must not make outside labels like "HALL 5" walkable.
const ROUTE_EDGE_PADDING = 8;
let _grid = null, _gCols = 0, _gRows = 0, _gMinX = 0, _gMinY = 0, _gMaxX = 0, _gMaxY = 0, _usingWalkZones = false;
let _routeStallBounds = { x0: 0, x1: 0, y0: 0, y1: 0 };

function cellToWorld(c, r) { return { x: _gMinX + c * CELL + CELL / 2, y: _gMinY + r * CELL + CELL / 2 }; }
function worldToCell(wx, wy) { return { c: Math.floor((wx - _gMinX) / CELL), r: Math.floor((wy - _gMinY) / CELL) }; }
function routeCenter(d) { return { x: d.dLeft + d.dWidth / 2, y: d.dTop + d.dHeight / 2 }; }
function routeLabel(d, fallback) { return d?.StallNo || d?.Text || fallback || ''; }

function isRouteWalkZone(d) {
  // IMPORTANT: do not treat normal text labels like "AISLE A" / "ENTRY EXIT" as route zones.
  // Those labels are usually small annotations, not the actual walkable floor.
  // Backend/admin should create invisible utility boxes with these exact prefixes:
  // WALK-PATH-1, WALK-ZONE-1, ROUTE-ZONE-1, CORRIDOR-1, PATH-1.
  const raw = String(d.Text || d.Name || d.Type || d.RouteType || '').trim();
  const upper = raw.toUpperCase();
  const explicitByName = /^(WALK|WALK-PATH|WALK-ZONE|ROUTE|ROUTE-ZONE|PATH|CORRIDOR)(-|_|\s|\d)/.test(upper);
  const explicitByField = d.IsRoutePath === true || d.IsRoutePath === 'true' || d.IsWalkingPath === true || d.IsWalkingPath === 'true';
  const isBigEnough = (Number(d.dWidth) || 0) >= 12 && (Number(d.dHeight) || 0) >= 12;
  return (explicitByName || explicitByField) && isBigEnough;
}

function getRouteWalkZones() {
  return allUtilData.filter(isRouteWalkZone);
}

function markGridRect(grid, cols, rows, x0, y0, x1, y1, value) {
  const cS = Math.max(0, Math.floor((x0 - _gMinX) / CELL));
  const cE = Math.min(cols - 1, Math.ceil((x1 - _gMinX) / CELL));
  const rS = Math.max(0, Math.floor((y0 - _gMinY) / CELL));
  const rE = Math.min(rows - 1, Math.ceil((y1 - _gMinY) / CELL));
  for (let c = cS; c <= cE; c++) for (let r = rS; r <= rE; r++) grid[r * cols + c] = value;
}

function blockGridOuterFence(grid, cols, rows) {
  // A one-cell fence stops routes from escaping/clamping around the calculated hall edge.
  for (let c = 0; c < cols; c++) { grid[c] = 1; grid[(rows - 1) * cols + c] = 1; }
  for (let r = 0; r < rows; r++) { grid[r * cols] = 1; grid[r * cols + cols - 1] = 1; }
}

function connectNearbyWalkZones(grid, cols, rows, zones) {
  // Admin-created walking boxes may have tiny gaps between them.
  // Bridge only small aligned gaps so the visitor route remains in the aisle network.
  const GAP = 44;
  const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
  zones.forEach((a, i) => {
    zones.slice(i + 1).forEach(b => {
      const ax0 = a.dLeft, ax1 = a.dLeft + a.dWidth, ay0 = a.dTop, ay1 = a.dTop + a.dHeight;
      const bx0 = b.dLeft, bx1 = b.dLeft + b.dWidth, by0 = b.dTop, by1 = b.dTop + b.dHeight;
      const yOverlap = overlap(ay0, ay1, by0, by1);
      const xOverlap = overlap(ax0, ax1, bx0, bx1);

      // Horizontal bridge: boxes are left/right of each other with similar vertical band.
      if (yOverlap > Math.min(a.dHeight, b.dHeight) * 0.35) {
        const gap = bx0 > ax1 ? bx0 - ax1 : ax0 > bx1 ? ax0 - bx1 : 0;
        if (gap > 0 && gap <= GAP) {
          const yMid = (Math.max(ay0, by0) + Math.min(ay1, by1)) / 2;
          const h = Math.min(28, Math.max(12, yOverlap * 0.8));
          markGridRect(grid, cols, rows, Math.min(ax1, bx1), yMid - h / 2, Math.max(ax0, bx0), yMid + h / 2, 0);
        }
      }

      // Vertical bridge: boxes are above/below each other with similar horizontal band.
      if (xOverlap > Math.min(a.dWidth, b.dWidth) * 0.35) {
        const gap = by0 > ay1 ? by0 - ay1 : ay0 > by1 ? ay0 - by1 : 0;
        if (gap > 0 && gap <= GAP) {
          const xMid = (Math.max(ax0, bx0) + Math.min(ax1, bx1)) / 2;
          const w = Math.min(28, Math.max(12, xOverlap * 0.8));
          markGridRect(grid, cols, rows, xMid - w / 2, Math.min(ay1, by1), xMid + w / 2, Math.max(ay0, by0), 0);
        }
      }
    });
  });
}

function computeRouteBounds(all, zones, useZones) {
  // Use only real stalls to define the fallback routing boundary. Utility labels such as
  // "HALL 5", "ENTRY", etc. can sit outside the layout and must not extend the walkable map.
  const stallSource = allStallData.length ? allStallData : all.filter(d => d && (d.StallNo || d.SeatId));
  let sx0 = Infinity, sx1 = -Infinity, sy0 = Infinity, sy1 = -Infinity;
  stallSource.forEach(d => {
    sx0 = Math.min(sx0, d.dLeft); sx1 = Math.max(sx1, d.dLeft + d.dWidth);
    sy0 = Math.min(sy0, d.dTop);  sy1 = Math.max(sy1, d.dTop + d.dHeight);
  });
  if (!Number.isFinite(sx0) || !Number.isFinite(sy0)) { sx0 = 0; sy0 = 0; sx1 = 1000; sy1 = 1000; }
  _routeStallBounds = { x0: sx0, x1: sx1, y0: sy0, y1: sy1 };

  // Explicit admin walk zones may be outside the stall hull, so include them only in zone mode.
  const source = useZones && zones.length ? [...zones, ...stallSource] : stallSource;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  source.forEach(d => {
    x0 = Math.min(x0, d.dLeft); x1 = Math.max(x1, d.dLeft + d.dWidth);
    y0 = Math.min(y0, d.dTop);  y1 = Math.max(y1, d.dTop + d.dHeight);
  });
  if (!Number.isFinite(x0) || !Number.isFinite(y0)) { x0 = sx0; y0 = sy0; x1 = sx1; y1 = sy1; }
  const pad = useZones ? CELL * 2 : ROUTE_EDGE_PADDING;
  return { x0: x0 - pad, x1: x1 + pad, y0: y0 - pad, y1: y1 + pad };
}

function buildNavGrid(excludeFrom, excludeTo) {
  const all = [...allStallData, ...allUtilData];
  const zones = getRouteWalkZones();
  const zoneArea = zones.reduce((s, z) => s + (z.dWidth * z.dHeight), 0);
  const useZones = zones.length >= 2 || zoneArea > 4000;
  _usingWalkZones = useZones;

  const b = computeRouteBounds(all, zones, useZones);
  const x0 = b.x0, x1 = b.x1, y0 = b.y0, y1 = b.y1;
  const cols = Math.ceil((x1 - x0) / CELL) + 2, rows = Math.ceil((y1 - y0) / CELL) + 2;
  _gCols = cols; _gRows = rows; _gMinX = x0; _gMinY = y0; _gMaxX = x0 + cols * CELL; _gMaxY = y0 + rows * CELL;

  const grid = new Uint8Array(cols * rows);
  if (useZones) {
    // Backend-controlled walking boxes mode: only these boxes are walkable.
    grid.fill(1);
    zones.forEach(z => markGridRect(grid, cols, rows, z.dLeft, z.dTop, z.dLeft + z.dWidth, z.dTop + z.dHeight, 0));
    connectNearbyWalkZones(grid, cols, rows, zones);
  } else {
    // Fallback mode: start everything as BLOCKED, then carve out walkable space ONLY inside
    // the stall bounding hull. This prevents paths from routing around the outside perimeter.
    grid.fill(1);
    const sb = _routeStallBounds;
    if (Number.isFinite(sb.x0)) {
      // Carve the interior of the stall hull as walkable. We carve a slightly expanded area
      // so the aisles just outside the outermost stalls are also walkable.
      const HULL_PAD = CELL * 4;
      markGridRect(grid, cols, rows,
        sb.x0 - HULL_PAD, sb.y0 - HULL_PAD,
        sb.x1 + HULL_PAD, sb.y1 + HULL_PAD,
        0);
    } else {
      grid.fill(0);
    }
  }

  // Stalls are always obstacles, with padding, so route avoids cutting through booths.
  // IMPORTANT: do NOT remove from/to stalls from obstacles. We route from their aisle-side point,
  // not through the stall body. Excluding them allowed paths to visually cross start/end booths.
  allStallData.forEach(d => {
    markGridRect(
      grid, cols, rows,
      d.dLeft - ROUTE_CLEARANCE,
      d.dTop - ROUTE_CLEARANCE,
      d.dLeft + d.dWidth + ROUTE_CLEARANCE,
      d.dTop + d.dHeight + ROUTE_CLEARANCE,
      1
    );
    getStallCutouts(d).forEach(cut => {
      markGridRect(
        grid, cols, rows,
        cut.dLeft,
        cut.dTop,
        cut.dLeft + cut.dWidth,
        cut.dTop + cut.dHeight,
        0
      );
    });
  });

  blockGridOuterFence(grid, cols, rows);
  _grid = grid;
  return { grid, cols, rows, minX: x0, minY: y0, maxX: _gMaxX, maxY: _gMaxY, usingWalkZones: useZones };
}

function routeObstaclePenalty(grid, cols, rows, c, r) {
  // Hard obstacles/clearance are already blocked in buildNavGrid().
  // This is only a gentle preference for staying off stall edges. The old
  // 4-10 units PER CELL overwhelmed the turn penalty, creating zigzags
  // through otherwise straight, unobstructed exhibition aisles.
  let penalty = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nc = c + dx, nr = r + dy;
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
      if (grid[nr * cols + nc] === 1) {
        penalty += (Math.abs(dx) + Math.abs(dy) === 1) ? 0.2 : 0.08;
      }
    }
  }
  return Math.min(0.8, penalty);
}

function aStar2(sx, sy, ex, ey, grid, cols, rows) {
  if (sx < 0 || sx >= cols || sy < 0 || sy >= rows || ex < 0 || ex >= cols || ey < 0 || ey >= rows) return [];
  if (grid[sy * cols + sx] || grid[ey * cols + ex]) return [];
  if (sx === ex && sy === ey) return [];

  // Search (cell, incoming direction), not just cell. That way a modest turn
  // penalty can remove needless 1-cell zigzags without hiding actual turns.
  // All moves stay on walkable grid cells: no diagonal stall cut-throughs.
  const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const TURN_COST = 16;
  const count = cols * rows * 4;
  const gCost = new Float64Array(count).fill(Infinity);
  const parent = new Int32Array(count).fill(-1);
  const closed = new Uint8Array(count);
  const key = (c, r, dir) => ((r * cols + c) * 4 + dir);
  const heap = [];
  const push = item => {
    heap.push(item);
    for (let i = heap.length - 1; i > 0;) {
      const pi = (i - 1) >> 1;
      if (heap[pi].f <= heap[i].f) break;
      [heap[pi], heap[i]] = [heap[i], heap[pi]];
      i = pi;
    }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      for (let i = 0;;) {
        let s = i, l = i * 2 + 1, r = l + 1;
        if (l < heap.length && heap[l].f < heap[s].f) s = l;
        if (r < heap.length && heap[r].f < heap[s].f) s = r;
        if (s === i) break;
        [heap[i], heap[s]] = [heap[s], heap[i]];
        i = s;
      }
    }
    return top;
  };

  // Initial heading is unknown: starting in any direction has no turn cost.
  for (let d = 0; d < 4; d++) {
    const k = key(sx, sy, d);
    gCost[k] = 0;
    push({ c: sx, r: sy, dir: d, k, f: Math.abs(ex - sx) + Math.abs(ey - sy) });
  }

  while (heap.length) {
    const item = pop();
    if (closed[item.k]) continue;
    closed[item.k] = 1;
    if (item.c === ex && item.r === ey) {
      const path = [];
      let cur = item.k;
      while (parent[cur] !== -1) {
        const cell = Math.floor(cur / 4);
        path.push({ x: cell % cols, y: Math.floor(cell / cols) });
        cur = parent[cur];
      }
      path.reverse();
      return path;
    }

    for (let d = 0; d < 4; d++) {
      const nc = item.c + dirs[d][0], nr = item.r + dirs[d][1];
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows || grid[nr * cols + nc]) continue;
      const nk = key(nc, nr, d);
      if (closed[nk]) continue;
      const turn = d !== item.dir ? TURN_COST : 0;
      const reverse = d === (item.dir + 2) % 4 ? TURN_COST : 0;
      const nextG = gCost[item.k] + 1 + routeObstaclePenalty(grid, cols, rows, nc, nr) + turn + reverse;
      if (nextG >= gCost[nk]) continue;
      gCost[nk] = nextG;
      parent[nk] = item.k;
      const heuristic = Math.abs(ex - nc) + Math.abs(ey - nr);
      push({ c: nc, r: nr, dir: d, k: nk, f: nextG + heuristic });
    }
  }
  return [];
}

function openSidesForStall(d) {
  const raw = [
    d?.Positions, d?.Position, d?.OpenSide, d?.OpenSides,
    d?.SidePosition, d?.SideOpenPosition, d?.SideOpen
  ].filter(v => v != null).join(' ').toLowerCase();

  const sides = [];
  const add = side => { if (!sides.includes(side)) sides.push(side); };
  if (/\btop\b|\bnorth\b|\bfront-top\b/.test(raw) || raw.includes('top')) add('top');
  if (/\bbottom\b|\bsouth\b|\bfront-bottom\b/.test(raw) || raw.includes('bottom')) add('bottom');
  if (/\bleft\b|\bwest\b|\bfront-left\b/.test(raw) || raw.includes('left')) add('left');
  if (/\bright\b|\beast\b|\bfront-right\b/.test(raw) || raw.includes('right')) add('right');
  return sides;
}

function sideNormal(side) {
  if (side === 'top') return { x: 0, y: -1 };
  if (side === 'bottom') return { x: 0, y: 1 };
  if (side === 'left') return { x: -1, y: 0 };
  return { x: 1, y: 0 };
}

function sideAnchorPoint(d, side, t = 0.5, offset = ROUTE_ENTRY_OFFSET) {
  const n = sideNormal(side);
  const xAlong = d.dLeft + d.dWidth * t;
  const yAlong = d.dTop + d.dHeight * t;
  if (side === 'top') return { side, x: xAlong, y: d.dTop + n.y * offset };
  if (side === 'bottom') return { side, x: xAlong, y: d.dTop + d.dHeight + n.y * offset };
  if (side === 'left') return { side, x: d.dLeft + n.x * offset, y: yAlong };
  return { side, x: d.dLeft + d.dWidth + n.x * offset, y: yAlong };
}

function isPointOnDeclaredSide(d, side, p) {
  const tol = 1;
  if (side === 'top') return p.y <= d.dTop - tol;
  if (side === 'bottom') return p.y >= d.dTop + d.dHeight + tol;
  if (side === 'left') return p.x <= d.dLeft - tol;
  if (side === 'right') return p.x >= d.dLeft + d.dWidth + tol;
  return true;
}

function pointInsideStallHullPadding(p, pad = ROUTE_EDGE_PADDING + CELL * 2) {
  if (_usingWalkZones) return true;
  const b = _routeStallBounds;
  if (!b || !Number.isFinite(b.x0)) return true;
  return p.x >= b.x0 - pad && p.x <= b.x1 + pad && p.y >= b.y0 - pad && p.y <= b.y1 + pad;
}

function sidePointsOutsideStallHull(d, side, offset = ROUTE_ENTRY_OFFSET) {
  if (_usingWalkZones) return false;
  const b = _routeStallBounds;
  if (!b || !Number.isFinite(b.x0)) return false;
  const p = sideAnchorPoint(d, side, 0.5, offset);
  const tol = CELL * 0.75;
  if (side === 'right' && p.x > b.x1 + tol) return true;
  if (side === 'left' && p.x < b.x0 - tol) return true;
  if (side === 'bottom' && p.y > b.y1 + tol) return true;
  if (side === 'top' && p.y < b.y0 - tol) return true;
  return false;
}

function sideTryOrder(declaredSides, d = null) {
  const base = ['bottom', 'right', 'top', 'left'];
  const opposite = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
  const declared = (declaredSides || []).filter(Boolean);
  const out = [];

  // If the declared side points outside the hall hull, prefer its opposite side first.
  // Example: a right-edge stall whose metadata says right should route from the left/internal aisle.
  if (d) {
    declared.forEach(s => {
      if (sidePointsOutsideStallHull(d, s) && opposite[s] && !out.includes(opposite[s])) out.push(opposite[s]);
    });
  }

  declared.forEach(s => { if (!out.includes(s)) out.push(s); });
  base.forEach(s => { if (!out.includes(s)) out.push(s); });
  return out;
}

function nearestWalkableOnSide(d, side, grid, cols, rows) {
  // Reject an edge that points outside the real stall layout. This prevents routes from floating
  // in outer whitespace created by labels/utility boxes instead of staying inside the map aisles.
  if (sidePointsOutsideStallHull(d, side)) return null;

  // Search along the same edge first, keeping the line close to the stall/front aisle.
  const sideTs = [0.5, 0.38, 0.62, 0.25, 0.75, 0.12, 0.88];
  const offsets = [ROUTE_ENTRY_OFFSET, ROUTE_ENTRY_OFFSET + CELL, ROUTE_ENTRY_OFFSET + CELL * 2, ROUTE_ENTRY_OFFSET + CELL * 4, ROUTE_ENTRY_OFFSET + CELL * 6];
  let best = null;

  for (const offset of offsets) {
    if (sidePointsOutsideStallHull(d, side, offset)) continue;
    for (const t of sideTs) {
      const anchor = sideAnchorPoint(d, side, t, offset);
      const base = worldToCell(anchor.x, anchor.y);
      if (base.c < 0 || base.c >= cols || base.r < 0 || base.r >= rows) continue;
      const idx = base.r * cols + base.c;
      if (grid[idx] !== 0) continue;
      const wp = cellToWorld(base.c, base.r);
      if (!isPointOnDeclaredSide(d, side, wp) || !pointInsideStallHullPadding(wp)) continue;
      const dist = Math.hypot(wp.x - anchor.x, wp.y - anchor.y);
      if (!best || dist < best.dist) best = { point: wp, cell: { c: base.c, r: base.r }, dist, side };
    }
    if (best) return best;
  }

  // If exact samples are blocked by clearance/route zones, do a constrained BFS but still only accept cells on the same side.
  const centerAnchor = sideAnchorPoint(d, side, 0.5, ROUTE_ENTRY_OFFSET + CELL * 2);
  const predicate = (cell, world) => isPointOnDeclaredSide(d, side, world) && pointInsideStallHullPadding(world);
  const cell = nearestWalkable(centerAnchor.x, centerAnchor.y, grid, cols, rows, predicate, 36);
  if (!cell) return null;
  const wp = cellToWorld(cell.c, cell.r);
  return { point: wp, cell, dist: Math.hypot(wp.x - centerAnchor.x, wp.y - centerAnchor.y), side };
}

function stallEntryCandidates(d) {
  const sides = openSidesForStall(d);
  const order = sideTryOrder(sides.length ? sides : [], d);
  return order.map(side => sideAnchorPoint(d, side, 0.5, ROUTE_ENTRY_OFFSET));
}

function stallEntryPoint(d, grid, cols, rows) {
  if (!d) return null;
  // Utilities/areas without open sides use their nearest walkable center.
  if (!d.StallNo) {
    const c = routeCenter(d);
    const cell = nearestWalkable(c.x, c.y, grid, cols, rows);
    return cell ? cellToWorld(cell.c, cell.r) : null;
  }

  const declaredSides = openSidesForStall(d);
  const orderedSides = sideTryOrder(declaredSides, d);

  // First use only the declared open side(s), but only if that edge leads inside the real hall.
  let best = null;
  for (const side of declaredSides) {
    const entry = nearestWalkableOnSide(d, side, grid, cols, rows);
    if (entry && (!best || entry.dist < best.dist)) best = entry;
  }
  if (best) return best.point;

  // An explicitly declared entrance is authoritative. Never silently route visitors to
  // another (possibly closed) wall when the declared entry is not reachable.
  if (declaredSides.length) {
    console.warn('No accessible declared entrance for stall:', d.StallNo, declaredSides);
    return null;
  }

  // Legacy stalls without entrance metadata: allow a clearly marked best-effort
  // aisle-side fallback. This is NOT used for stalls with declared sides.
  for (const side of orderedSides) {
    const entry = nearestWalkableOnSide(d, side, grid, cols, rows);
    if (entry && (!best || entry.dist < best.dist)) best = entry;
  }
  return best ? best.point : null;
}

function nearestWalkable(wx, wy, grid, cols, rows, predicate = null, maxRadiusCells = null) {
  const clamp = (c, r) => ({ c: Math.max(0, Math.min(cols - 1, c)), r: Math.max(0, Math.min(rows - 1, r)) });
  const base = worldToCell(wx, wy);
  const { c, r } = clamp(base.c, base.r);
  const startWorld = cellToWorld(c, r);
  if (grid[r * cols + c] === 0 && (!predicate || predicate({ c, r }, startWorld))) return { c, r };
  const visited = new Uint8Array(cols * rows);
  const q = [{ c, r, depth: 0 }]; visited[r * cols + c] = 1;
  const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  while (q.length) {
    const { c: cc, r: cr, depth } = q.shift();
    if (maxRadiusCells != null && depth > maxRadiusCells) continue;
    const world = cellToWorld(cc, cr);
    if (grid[cr * cols + cc] === 0 && (!predicate || predicate({ c: cc, r: cr }, world))) return { c: cc, r: cr };
    for (const [dc, dr] of dirs) {
      const nc = cc + dc, nr = cr + dr;
      if (nc >= 0 && nc < cols && nr >= 0 && nr < rows && !visited[nr * cols + nc]) {
        visited[nr * cols + nc] = 1;
        q.push({ c: nc, r: nr, depth: depth + 1 });
      }
    }
  }
  return null;
}

// Grid-verified, orthogonal line check. Never straight-line across blocked
// cells: blocked cells contain stalls, clearance buffers and non-walk zones.
function clearStraightGridRun(a, b, grid, cols, rows) {
  if (a.x !== b.x && a.y !== b.y) return false;
  const dx = Math.sign(b.x - a.x), dy = Math.sign(b.y - a.y);
  const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
  for (let k = 0; k <= len; k++) {
    const x = a.x + k * dx, y = a.y + k * dy;
    if (x < 0 || y < 0 || x >= cols || y >= rows || grid[y * cols + x]) return false;
  }
  return true;
}

// Removes surplus stair-steps and doglegs from the real navigation path,
// not only from its drawing. Each shortcut is checked against the walking
// grid before it is accepted, so route geometry and spoken turns still agree.
function simplifyGridCellsToWaypoints(cells, grid, cols, rows) {
  if (!cells || !cells.length) return [];
  const points = cells.map(p => ({ x: p.x ?? p.c, y: p.y ?? p.r }));
  if (points.length < 2) return points.map(p => cellToWorld(p.x, p.y));

  const keep = [points[0]];
  let lastDir = null;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const dir = { x: Math.sign(b.x - a.x), y: Math.sign(b.y - a.y) };
    if (lastDir && (dir.x !== lastDir.x || dir.y !== lastDir.y)) keep.push(a);
    lastDir = dir;
  }
  keep.push(points[points.length - 1]);

  if (grid && cols && rows) {
    // A* may briefly shift one grid row to avoid a small proximity cost, then
    // shift right back. Remove such doglegs if a SINGLE unobstructed straight
    // grid run connects its endpoints. It remains an orthogonal route.
    for (let i = 0; i < keep.length - 2; i++) {
      for (let j = keep.length - 1; j >= i + 2; j--) {
        if (clearStraightGridRun(keep[i], keep[j], grid, cols, rows)) {
          keep.splice(i + 1, j - i - 1);
          break;
        }
      }
    }
  }
  return normalizeRoutePoints(keep.map(p => cellToWorld(p.x, p.y)));
}

function normalizeRoutePoints(points) {
  const out = [];
  for (const p of (points || [])) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const last = out[out.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 0.01) out.push({ x: p.x, y: p.y });
  }
  // Merge only forward-collinear legs. Opposite-direction legs are real
  // reversals and must not be removed from a route or from its directions.
  for (let i = out.length - 2; i >= 1; i--) {
    const a = out[i - 1], b = out[i], c = out[i + 1];
    const abx = b.x - a.x, aby = b.y - a.y;
    const bcx = c.x - b.x, bcy = c.y - b.y;
    const cross = abx * bcy - aby * bcx;
    const dot = abx * bcx + aby * bcy;
    const scale = Math.hypot(abx, aby) * Math.hypot(bcx, bcy);
    if (scale > 0 && Math.abs(cross) <= scale * 0.000001 && dot > 0) out.splice(i, 1);
  }
  return out;
}

function pointInInflatedStall(p, ignore = []) {
  const ignores = new Set(ignore.filter(Boolean));
  return allStallData.some(d => {
    if (ignores.has(d)) return false;
    return pointInStallShapeXY(p.x, p.y, d, 0.5);
  });
}

function segmentCrossesAnyStall(a, b, ignore = []) {
  // Sample along the visual segment. Cheap and reliable enough for our orthogonal map route.
  const len = Math.max(1, segLen(a, b));
  const samples = Math.ceil(len / 4);
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    if (pointInInflatedStall(p, ignore)) return true;
  }
  return false;
}

function routeCrossesAnyStall(points, ignore = []) {
  for (let i = 1; i < points.length; i++) {
    if (segmentCrossesAnyStall(points[i - 1], points[i], ignore)) return true;
  }
  return false;
}

function pointInsideRouteBounds(p) {
  return p && p.x >= _gMinX && p.x <= _gMaxX && p.y >= _gMinY && p.y <= _gMaxY;
}

function routeInsideBounds(points) {
  return (points || []).every(pointInsideRouteBounds);
}

function buildRouteWaypoints(fromD, toD) {
  const { grid, cols, rows } = buildNavGrid(fromD, toD);
  const fromEntry = stallEntryPoint(fromD, grid, cols, rows);
  const toEntry   = stallEntryPoint(toD, grid, cols, rows);
  if (!fromEntry || !toEntry) return [];

  const fCell = nearestWalkable(fromEntry.x, fromEntry.y, grid, cols, rows);
  const tCell = nearestWalkable(toEntry.x, toEntry.y, grid, cols, rows);
  if (!fCell || !tCell) return [];

  // Same aisle cell / adjacent stalls: keep it simple only if the visual segment is really clear.
  if (fCell.c === tCell.c && fCell.r === tCell.r) {
    const direct = normalizeRoutePoints([fromEntry, toEntry]);
    if (routeInsideBounds(direct) && !routeCrossesAnyStall(direct)) return direct;
  }

  const gridPath = aStar2(fCell.c, fCell.r, tCell.c, tCell.r, grid, cols, rows);
  if (!gridPath.length) return [];
  const cells = [{ x: fCell.c, y: fCell.r }, ...gridPath.map(p => ({ x: p.x, y: p.y }))];
  const aislePts = simplifyGridCellsToWaypoints(cells, grid, cols, rows);
  let finalPts = normalizeRoutePoints([fromEntry, ...aislePts, toEntry]);

  // Final safety: if a simplified visual segment somehow crosses a stall, fall back to unsimplified grid points.
  if (!routeInsideBounds(finalPts) || routeCrossesAnyStall(finalPts)) {
    const rawPts = cells.map(p => cellToWorld(p.x, p.y));
    finalPts = normalizeRoutePoints([fromEntry, ...rawPts, toEntry]);
  }

  // If even raw A* would visually cross a booth, reject instead of drawing a wrong route.
  if (!routeInsideBounds(finalPts) || routeCrossesAnyStall(finalPts)) return [];
  return compressDirectionPoints(finalPts);
}
/* ══════════════════════════════════════════
   DIRECTIONS ENGINE — CLEAN AISLE INSTRUCTIONS
   Goal: fewer, more human steps: mostly "Walk straight" until a real turn.
══════════════════════════════════════════ */
function headingDeg(a, b) { return Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI; }
function signedTurn(h0, h1) { let d = h1 - h0; while (d > 180) d -= 360; while (d < -180) d += 360; return d; }
function segLen(a, b) { return Math.hypot(b.x - a.x, b.y - a.y); }
function routeDistance(points) { return (points || []).reduce((s, p, i) => i ? s + segLen(points[i - 1], p) : 0, 0); }

function median(values) {
  const arr = values.filter(v => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (!arr.length) return null;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

function parseDimensionMeters(text) {
  const nums = String(text || '').match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 2) return null;
  const a = parseFloat(nums[0]);
  const b = parseFloat(nums[1]);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return null;
  return { w: a, h: b };
}

function estimateMetersPerUnit() {
  const ratios = [];
  allStallData.forEach(d => {
    const dm = parseDimensionMeters(d.Dimention || d.Dimension || d.Dimensions);
    if (!dm) return;
    const w = Number(d.dWidth), h = Number(d.dHeight);
    if (w > 0) ratios.push(dm.w / w);
    if (h > 0) ratios.push(dm.h / h);
  });
  const m = median(ratios.filter(v => v >= 0.02 && v <= 3));
  return m || 0.35;
}

function routeMeters(points) {
  return routeDistance(points) * estimateMetersPerUnit();
}

function formatMeters(m) {
  if (!Number.isFinite(m) || m <= 0) return '0 m';
  if (m >= 1000) return (m / 1000).toFixed(m >= 10000 ? 0 : 1).replace(/\.0$/, '') + ' km';
  return Math.max(1, Math.round(m)) + ' m';
}

function formatMinutesFromMeters(m) {
  // Indoor walking speed: ~75 m/min. We keep a minimum of 1 minute for human-friendly UI.
  if (!Number.isFinite(m) || m <= 0) return '1 min';
  const min = Math.max(1, Math.ceil(m / 75));
  return `${min} min`;
}

function updateRouteMetrics(points) {
  const m = routeMeters(points);
  routeMetrics = {
    distanceM: m,
    timeMin: Math.max(1, Math.ceil(m / 75)),
    distanceLabel: formatMeters(m),
    timeLabel: formatMinutesFromMeters(m)
  };
  try { window.__routeMetrics = routeMetrics; } catch (_) {}
  return routeMetrics;
}


function nearestStallLabel(wx, wy, excludeNos = []) {
  // Use distance to the actual stall boundary, not the booth centre.
  // Avoid labeling distant booths as landmarks across a wide aisle.
  const excluded = new Set(excludeNos.map(x => String(x || '').trim().toLowerCase()));
  let nearest = null;
  let bestDistance = Infinity;
  for (const d of allStallData) {
    const name = String(d.StallNo || '').trim();
    if (!name || excluded.has(name.toLowerCase())) continue;
    const x0 = d.dLeft, x1 = d.dLeft + d.dWidth;
    const y0 = d.dTop, y1 = d.dTop + d.dHeight;
    if (![x0, x1, y0, y1].every(Number.isFinite)) continue;
    const dx = Math.max(x0 - wx, 0, wx - x1);
    const dy = Math.max(y0 - wy, 0, wy - y1);
    const distance = Math.hypot(dx, dy);
    if (distance < bestDistance) {
      bestDistance = distance;
      nearest = { name, width: d.dWidth, height: d.dHeight };
    }
  }
  // Be conservative: wrong landmarks are worse than no landmark.
  if (!nearest) return null;
  const threshold = Math.max(10, Math.min(28, Math.min(nearest.width, nearest.height) * 0.75));
  return bestDistance <= threshold ? nearest.name : null;
}

function compressDirectionPoints(points) {
  // Route waypoints have already been reduced to grid turns. Never discard a
  // corner based on leg length: a short leg can represent a required turn.
  if (!points || points.length < 2) return points || [];
  const clean = normalizeRoutePoints(points);
  if (clean.length < 3) return clean;
  const out = [clean[0]];
  for (let i = 1; i < clean.length - 1; i++) {
    const a = out[out.length - 1], b = clean[i], c = clean[i + 1];
    const d0 = { x: b.x - a.x, y: b.y - a.y };
    const d1 = { x: c.x - b.x, y: c.y - b.y };
    const cross = d0.x * d1.y - d0.y * d1.x;
    const dot = d0.x * d1.x + d0.y * d1.y;
    // Remove only truly collinear forward points; preserve bends and U-turns.
    if (Math.abs(cross) <= 0.0001 * Math.hypot(d0.x, d0.y) * Math.hypot(d1.x, d1.y) && dot > 0) continue;
    out.push(b);
  }
  out.push(clean[clean.length - 1]);
  return out;
}

function humanTurn(angle) {
  const abs = Math.abs(angle);
  if (abs < 25) return { type: 'straight', verb: null };
  if (abs >= 155) return { type: 'uturn', verb: 'turn around' };
  return { type: angle > 0 ? 'right' : 'left', verb: angle > 0 ? 'turn right' : 'turn left' };
}

function destinationSideHint(waypoints, toD) {
  if (!waypoints || waypoints.length < 2 || !toD) return 'straight ahead';
  const lastWalk = waypoints[waypoints.length - 1];
  const prevWalk = waypoints[waypoints.length - 2];
  // Arrival hints describe the stall relative to the visitor at the aisle
  // endpoint; do not use the same point for both heading and destination.
  const dest = routeCenter(toD);
  if (segLen(lastWalk, dest) < 0.01) return 'straight ahead';
  const walkH = headingDeg(prevWalk, lastWalk);
  const destH = headingDeg(lastWalk, dest);
  const turn = signedTurn(walkH, destH);
  if (Math.abs(turn) < 32) return 'straight ahead';
  return turn > 0 ? 'on your right' : 'on your left';
}

function straightStepText(passList) {
  if (passList && passList.length) return `Walk straight, passing ${passList.slice(0, 2).join(', ')}`;
  return 'Walk straight through the aisle';
}

function buildDirections(waypoints, fromLabel, toLabel, meta = {}) {
  if (!waypoints || waypoints.length < 2) return [];
  // Waypoints here are the EXACT points used by the 2D/3D line.
  const pts = waypoints;
  const steps = [];
  steps.push({ type: 'start', icon: 'fa-circle-dot', iconClass: 'si-start', main: `Start at ${fromLabel}`, sub: 'Move to the nearest aisle', landmark: null, pathStartIndex: 0, pathEndIndex: 0 });

  if (pts.length < 2) {
    steps.push({ type: 'end', icon: 'fa-flag-checkered', iconClass: 'si-end', main: `Arrive at ${toLabel}`, sub: null, landmark: null, pathStartIndex: 0, pathEndIndex: 0 });
    return steps;
  }

  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const distM = Math.max(1, Math.round(segLen(a, b) * estimateMetersPerUnit()));
    // Do not hide the last segment: even short approaches can involve a turn.

    let type = 'straight';
    let icon = 'fa-arrow-up';
    let iconClass = 'si-straight';
    let main = `Go forward ${formatMeters(distM)}`;

    if (i > 1) {
      const turn = humanTurn(signedTurn(headingDeg(pts[i - 2], a), headingDeg(a, b)));
      if (turn.type === 'left' || turn.type === 'right') {
        type = turn.type;
        icon = turn.type === 'right' ? 'fa-turn-right' : 'fa-turn-left';
        iconClass = turn.type === 'right' ? 'si-right' : 'si-left';
        main = `${capitalise(turn.verb)} and go ahead for ${formatMeters(distM)}`;
      } else if (turn.type === 'uturn') {
        type = 'uturn';
        icon = 'fa-rotate-left';
        iconClass = 'si-uturn';
        main = `Turn around and go ahead for ${formatMeters(distM)}`;
      }
    }

    const midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
    const landmark = nearestStallLabel(midX, midY, [fromLabel, toLabel]);
    steps.push({ type, icon, iconClass, main, sub: landmark ? `Near stall ${landmark}` : null, landmark: null, pathStartIndex: i - 1, pathEndIndex: i });
  }

  const sideHint = destinationSideHint(pts, meta.toD);
  steps.push({ type: 'end', icon: 'fa-flag-checkered', iconClass: 'si-end', main: `${toLabel} is ${sideHint}`, sub: `You've arrived`, landmark: null, pathStartIndex: pts.length - 1, pathEndIndex: pts.length - 1 });

  // An offline guide combines a short approach with the following action,
  // preserving every real turn and original path indices. If the optional
  // helper isn't loaded, the existing detailed instructions still work.
  if (typeof window !== 'undefined' && window.HallNavGuide) {
    return window.HallNavGuide.enhanceSteps(steps, pts, estimateMetersPerUnit());
  }
  return steps;
}

function capitalise(str) { return str ? str.charAt(0).toUpperCase() + str.slice(1) : str; }
// Voice is opt-in and uses the browser's built-in speech engine. No
// microphone, geolocation permission, network request, or AI API is needed.
let voiceGuidanceOn = false;
function stopVoiceGuidance() {
  try { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); } catch (_) {}
}
function setVoiceGuideStatus(message) {
  const label = document.getElementById('voiceGuideStatus');
  if (label) label.textContent = message;
}
function updateVoiceGuideButtons() {
  const btn = document.getElementById('btnVoiceGuide');
  const repeat = document.getElementById('btnRepeatStep');
  const supported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  if (btn) {
    btn.disabled = !supported;
    btn.setAttribute('aria-pressed', String(voiceGuidanceOn));
    btn.classList.toggle('is-active', voiceGuidanceOn);
    btn.innerHTML = voiceGuidanceOn
      ? '<i class="fa fa-volume-high" aria-hidden="true"></i> Voice on'
      : '<i class="fa fa-volume-xmark" aria-hidden="true"></i> Listen';
    btn.title = supported ? 'Toggle spoken step-by-step directions' : 'Speech is unavailable in this browser';
  }
  if (repeat) repeat.disabled = !supported || !navStepsData.length;
  if (!supported) setVoiceGuideStatus('Voice directions are not supported in this browser.');
  else if (!voiceGuidanceOn) setVoiceGuideStatus('Tap Listen for spoken directions.');
}
function readCurrentStep() {
  const step = navStepsData[currentNavStepIdx];
  if (!step) return;
  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
    setVoiceGuideStatus('Voice directions are not supported in this browser.');
    return;
  }
  stopVoiceGuidance();
  try {
    const spoken = String(step.spoken || step.main || '');
    const extra = step.sub ? '. ' + String(step.sub) : '';
    const utterance = new SpeechSynthesisUtterance(spoken + extra);
    utterance.lang = 'en-IN';
    utterance.rate = 0.92;
    utterance.pitch = 1;
    utterance.onerror = function () {
      setVoiceGuideStatus('Audio could not play. You can still read the directions.');
    };
    window.speechSynthesis.speak(utterance);
    setVoiceGuideStatus('Reading step ' + (currentNavStepIdx + 1) + ' of ' + navStepsData.length);
  } catch (_) {
    setVoiceGuideStatus('Audio could not play. You can still read the directions.');
  }
}
function toggleVoiceGuidance() {
  voiceGuidanceOn = !voiceGuidanceOn;
  if (!voiceGuidanceOn) stopVoiceGuidance();
  updateVoiceGuideButtons();
  if (voiceGuidanceOn) readCurrentStep();
}
function setNavStep(index) {
  if (!Number.isInteger(index) || index < 0 || index >= navStepsData.length) return;
  currentNavStepIdx = index;
  renderDrawerSteps();
  if (voiceGuidanceOn) readCurrentStep();
  else stopVoiceGuidance();
}

/* ══════════════════════════════════════════
   NAV PANEL
══════════════════════════════════════════ */
function renderNavPanel(steps, fromLabel, toLabel) {
  stopVoiceGuidance();
  navStepsData = steps; currentNavStepIdx = 0;
  document.getElementById('navFabFrom').textContent = fromLabel;
  document.getElementById('navFabTo').textContent   = toLabel;
  document.getElementById('fabStepBadge').textContent = steps.length + ' steps';
  document.getElementById('navDrawerFrom').textContent = fromLabel;
  document.getElementById('navDrawerTo').textContent   = toLabel;
  const turns = steps.reduce((sum, step) => sum + (Number.isInteger(step.turnsCount) ? step.turnsCount : (['left','right','uturn'].includes(step.type) ? 1 : 0)), 0);
  document.getElementById('drawerStepCount').textContent   = routeMetrics.timeLabel || (steps.length + ' steps');
  document.getElementById('drawerSummaryText').textContent = `${routeMetrics.distanceLabel || ''}${routeMetrics.distanceLabel ? ' · ' : ''}${turns} turn${turns !== 1 ? 's' : ''} · ${_usingWalkZones ? 'shortest aisle route' : 'aisle-safe route'}`;
  document.body.classList.add('route-active');
  renderDrawerSteps();
  updateVoiceGuideButtons();
  document.getElementById('nav-fab').classList.add('show');
  openNavDrawer();
  // Keep the direction drawer open. Auto-closing made steps disappear while users were reading/clicking them.
}

function renderDrawerSteps() {
  const container = document.getElementById('drawerSteps');
  // Build text with textContent; company/stall names come from external API
  // data and should never be interpreted as executable HTML.
  container.replaceChildren();
  navStepsData.forEach((step, idx) => {
    const el = document.createElement('div');
    el.className = 'nav-step' + (idx === currentNavStepIdx ? ' step-active' : '');
    el.dataset.idx = idx;
    el.setAttribute('role', 'button');
    el.tabIndex = 0;
    el.setAttribute('aria-current', idx === currentNavStepIdx ? 'step' : 'false');
    el.setAttribute('aria-label', 'Step ' + (idx + 1) + ': ' + (step.main || 'Continue'));
    const ico = document.createElement('div');
    ico.className = 'step-icon ' + step.iconClass;
    const icon = document.createElement('i');
    icon.className = 'fa ' + step.icon;
    icon.setAttribute('aria-hidden', 'true');
    ico.appendChild(icon);
    const body = document.createElement('div');
    body.className = 'step-body';
    const main = document.createElement('div');
    main.className = 'step-main';
    main.textContent = step.main || 'Continue';
    body.appendChild(main);
    if (step.sub) {
      const sub = document.createElement('div');
      sub.className = 'step-sub';
      sub.textContent = step.sub;
      body.appendChild(sub);
    }
    if (step.type === 'bend') {
      const hint = document.createElement('div');
      hint.className = 'step-hint';
      hint.textContent = 'Two actions · highlighted together on the map';
      body.appendChild(hint);
    }
    const num = document.createElement('div');
    num.className = 'step-num';
    num.textContent = String(idx + 1);
    el.append(ico, body, num);
    el.addEventListener('click', () => setNavStep(idx));
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setNavStep(idx); }
    });
    container.appendChild(el);
  });
  scrollActiveStepIntoView();
  updateNavControls();
}

function scrollActiveStepIntoView() {
  const container = document.getElementById('drawerSteps');
  const active = container.querySelector('.step-active');
  if (!active) return;
  const containerHeight = container.clientHeight;
  const elementTop = active.offsetTop;
  const elementHeight = active.clientHeight;
  container.scrollTo({ top: Math.max(0, elementTop - (containerHeight / 2) + (elementHeight / 2)), behavior: 'smooth' });
}

function updateNavControls() {
  const total = navStepsData.length;
  document.getElementById('navStepCounter').textContent = `${currentNavStepIdx + 1} / ${total}`;
  document.getElementById('btnPrevStep').disabled = currentNavStepIdx === 0;
  document.getElementById('btnNextStep').disabled = currentNavStepIdx === total - 1;
  const pct = total > 1 ? (currentNavStepIdx / (total - 1)) * 100 : 100;
  document.getElementById('drawerProgressFill').style.width = pct + '%';
  document.getElementById('fabStepBadge').textContent = `${currentNavStepIdx + 1}/${total}`;
}

function navStepPrev() {
  if (currentNavStepIdx > 0) setNavStep(currentNavStepIdx - 1);
}
function navStepNext() {
  if (currentNavStepIdx < navStepsData.length - 1) setNavStep(currentNavStepIdx + 1);
}
function hideNavFab() {
  stopVoiceGuidance();
  document.getElementById('nav-fab').classList.remove('show');
  closeNavDrawer();
}

/* ══════════════════════════════════════════
   ROUTE LOCATION SEARCH HELPERS
   Route inputs support Stall No., Seat/Stall ID, company name, and area/utility text.
══════════════════════════════════════════ */
function findRouteLocation(query) {
  const q = normalizeStallKey(query);
  const qc = compactStallKey(query);
  if (!q) return null;
  const stallIdKeys = d => [d.StallNo, d.SeatId, d.StallId, d.StallID, d.stallID, d.stallId];
  const exactStall = allStallData.find(d => stallIdKeys(d).some(k => normalizeStallKey(k) === q || compactStallKey(k) === qc));
  if (exactStall) return exactStall;
  const exactUtil = allUtilData.find(d => normalizeStallKey(d.Text) === q || compactStallKey(d.Text) === qc);
  if (exactUtil) return exactUtil;
  const exactCompany = allStallData.find(d => normalizeStallKey(d.txtComName) === q || compactStallKey(d.txtComName) === qc);
  if (exactCompany) return exactCompany;
  const startsStall = allStallData.find(d => stallIdKeys(d).some(k => normalizeStallKey(k).startsWith(q) || compactStallKey(k).startsWith(qc)));
  if (startsStall) return startsStall;
  const startsCompany = allStallData.find(d => normalizeStallKey(d.txtComName).startsWith(q) || compactStallKey(d.txtComName).startsWith(qc));
  if (startsCompany) return startsCompany;
  const containsCompany = allStallData.find(d => normalizeStallKey(d.txtComName).includes(q) || compactStallKey(d.txtComName).includes(qc));
  if (containsCompany) return containsCompany;
  const containsStall = allStallData.find(d => stallIdKeys(d).some(k => normalizeStallKey(k).includes(q) || compactStallKey(k).includes(qc)));
  if (containsStall) return containsStall;
  const containsUtil = allUtilData.find(d => normalizeStallKey(d.Text).includes(q) || compactStallKey(d.Text).includes(qc));
  if (containsUtil) return containsUtil;
  return null;
}
function find3DGroupForData(data) {
  if (!data || !stallsGroup3) return null;
  let found = null;
  stallsGroup3.children.forEach(g => {
    if (found || !g.userData) return;
    if (data.StallNo && matchesStallKey(g.userData, data.StallNo)) found = g;
    else if (data.SeatId && matchesStallKey(g.userData, data.SeatId)) found = g;
    else if (data.StallId && matchesStallKey(g.userData, data.StallId)) found = g;
    else if (data.Text && normalizeStallKey(g.userData.Text) === normalizeStallKey(data.Text)) found = g;
  });
  return found;
}
function routeInputLabel(data, fallback) {
  if (!data) return fallback || '';
  return data.StallNo || data.Text || data.txtComName || fallback || '';
}

/* ══════════════════════════════════════════
   ROUTE CALCULATION — 2D
══════════════════════════════════════════ */
function calculateRoute2d(fv, tv) {
  const fromD = findRouteLocation(fv);
  const toD   = findRouteLocation(tv);
  if (!fromD) return alert("Could not find 'From' location: " + fv + "\nTip: use stall number or company name.");
  if (!toD)   return alert("Could not find 'To' location: " + tv + "\nTip: use stall number or company name.");

  const pts = buildRouteWaypoints(fromD, toD);
  if (!pts.length) { alert('No walkable path found between these stalls. Please check the aisle/path boxes for this hall.'); return; }

  routePath2d = pts;
  routeStart2d = pts[0];
  routeEnd2d = pts[pts.length - 1];

  const fromLabel = routeInputLabel(fromD, fv), toLabel = routeInputLabel(toD, tv);
  updateRouteMetrics(pts);
  const steps = buildDirections(pts, fromLabel, toLabel, { fromD, toD });
  renderNavPanel(steps, fromLabel, toLabel);
  closeSidebar();
}

/* ══════════════════════════════════════════
   ROUTE CALCULATION — 3D
══════════════════════════════════════════ */
function calculateRoute3d(fv, tv) {
  const fromD = findRouteLocation(fv);
  const toD   = findRouteLocation(tv);
  if (!fromD) return alert("Could not find 'From' location: " + fv + "\nTip: use stall number or company name.");
  if (!toD) return alert("Could not find 'To' location: " + tv + "\nTip: use stall number or company name.");
  let sG = find3DGroupForData(fromD);
  let eG = find3DGroupForData(toD);
  if (!sG || !eG) {
    clearStallGroup3();
    buildAll3D();
    sG = find3DGroupForData(fromD);
    eG = find3DGroupForData(toD);
  }
  if (!sG) return alert("Could not show 'From' location in 3D.");
  if (!eG) return alert("Could not show 'To' location in 3D.");

  const worldPts = buildRouteWaypoints(fromD, toD);
  if (!worldPts.length) { alert('No walkable path found. Please check the aisle/path boxes for this hall.'); return; }

  startGroup3 = sG; endGroup3 = eG;
  focusMode3(true);
  hiG3(sG, 0x059669);
  hiG3(eG, 0xef4444);

  buildSharpRoute3D(worldPts);

  const sn3 = routeInputLabel(fromD, fv), en3 = routeInputLabel(toD, tv);
  startMark3 = new THREE.Mesh(makeConeGeo(), new THREE.MeshLambertMaterial({ color: 0x059669, emissive: 0x059669, emissiveIntensity: 1.5 }));
  startMark3.position.set(worldPts[0].x, 25, worldPts[0].y);
  const sDiv = document.createElement('div'); sDiv.className = 'route-badge badge-start';
  sDiv.innerHTML = `<i class="fa fa-map-marker-alt"></i> START: ${sn3}`;
  const sLbl = new THREE.CSS2DObject(sDiv); sLbl.position.set(0, 10, 0); startMark3.add(sLbl); scene.add(startMark3);

  endMark3 = new THREE.Mesh(makeConeGeo(), new THREE.MeshLambertMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 1.5 }));
  const last = worldPts[worldPts.length - 1];
  endMark3.position.set(last.x, 25, last.y);
  const eDiv = document.createElement('div'); eDiv.className = 'route-badge badge-end';
  eDiv.innerHTML = `<i class="fa fa-flag-checkered"></i> END: ${en3}`;
  const eLbl = new THREE.CSS2DObject(eDiv); eLbl.position.set(0, 10, 0); endMark3.add(eLbl); scene.add(endMark3);

  const box = new THREE.Box3().setFromObject(sG).expandByObject(eG);
  const ctr = box.getCenter(new THREE.Vector3());
  controls3.target.copy(ctr);
  const sz  = box.getSize(new THREE.Vector3());
  camera3.position.set(ctr.x, Math.max(sz.x, sz.z) * 1.5, ctr.z + 500 + (innerWidth <= 768 ? 300 : 0));

  updateRouteMetrics(worldPts);
  const steps = buildDirections(worldPts, sn3, en3, { fromD, toD });
  renderNavPanel(steps, sn3, en3);
  closeSidebar();
}

function makeRouteCylinder3(a, b, radius, material) {
  const va = new THREE.Vector3(a.x, 5, a.y);
  const vb = new THREE.Vector3(b.x, 5, b.y);
  const dir = new THREE.Vector3().subVectors(vb, va);
  const len = dir.length();
  if (len < 1) return null;
  const geo = new THREE.CylinderGeometry(radius, radius, len, 10, 1, false);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.copy(va).add(vb).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  return mesh;
}

function buildSharpRoute3D(worldPts) {
  clearRoute3d(false);
  routeWorldPts3 = worldPts.map(p => ({ x: p.x, y: p.y }));
  routeTotalLen3 = 0;
  for (let i = 1; i < routeWorldPts3.length; i++) routeTotalLen3 += segLen(routeWorldPts3[i - 1], routeWorldPts3[i]);

  pathMesh3 = new THREE.Group();
  const coreMat = new THREE.MeshLambertMaterial({ color: 0x1e3a8a, emissive: 0x1d4ed8, emissiveIntensity: .85, transparent: true, opacity: .96 });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x2563eb, transparent: true, opacity: .16, blending: THREE.AdditiveBlending, depthWrite: false });

  for (let i = 1; i < routeWorldPts3.length; i++) {
    const glow = makeRouteCylinder3(routeWorldPts3[i - 1], routeWorldPts3[i], 6, glowMat);
    const core = makeRouteCylinder3(routeWorldPts3[i - 1], routeWorldPts3[i], 2.6, coreMat);
    if (glow) pathMesh3.add(glow);
    if (core) pathMesh3.add(core);
  }

  // Animated white beads moving along the 3D route.
  pathAnimDots3 = [];
  const dotCount = Math.min(5, Math.max(2, Math.floor(routeTotalLen3 / 180)));
  const dotGeo = new THREE.SphereGeometry(6, 14, 14);
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (let i = 0; i < dotCount; i++) {
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.userData.routeOffset = i * (routeTotalLen3 / dotCount);
    pathMesh3.add(dot);
    pathAnimDots3.push(dot);
  }
  scene.add(pathMesh3);
}

function pointOnRoute3(distanceOnPath) {
  if (!routeWorldPts3 || routeWorldPts3.length < 2 || routeTotalLen3 <= 0) return null;
  let remaining = distanceOnPath;
  for (let i = 1; i < routeWorldPts3.length; i++) {
    const a = routeWorldPts3[i - 1], b = routeWorldPts3[i];
    const len = segLen(a, b);
    if (len <= 0) continue;
    if (remaining <= len) {
      const t = remaining / len;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    remaining -= len;
  }
  return routeWorldPts3[routeWorldPts3.length - 1];
}

function updateRouteAnimation3(now) {
  if (!pathAnimDots3.length || routeTotalLen3 <= 0) return;
  pathAnimDots3.forEach(dot => {
    const p = pointOnRoute3((now * .045 + dot.userData.routeOffset) % routeTotalLen3);
    if (p) dot.position.set(p.x, 12 + Math.sin(now * .006) * 1.2, p.y);
  });
}

function disposeRouteObject3(obj) {
  if (!obj) return;
  obj.traverse(child => {
    if (child.isCSS2DObject && child.element?.parentNode) child.element.parentNode.removeChild(child.element);
    if (child.geometry && child.geometry.dispose) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach(m => m.dispose && m.dispose());
      else if (child.material.dispose) child.material.dispose();
    }
  });
}

function clearRoute3d(resetHighlights = true) {
  if (pathMesh3 && scene) {
    scene.remove(pathMesh3);
    disposeRouteObject3(pathMesh3);
    pathMesh3 = null;
  }
  [startMark3, endMark3].forEach(m => {
    if (m && scene) { scene.remove(m); disposeRouteObject3(m); }
  });
  startMark3 = null; endMark3 = null;
  pathAnimDots3 = [];
  routeWorldPts3 = [];
  routeTotalLen3 = 0;

  if (resetHighlights) {
    resetAllRouteHighlights3();
    focusMode3(false);
    startGroup3 = null;
    endGroup3 = null;
  }
}

/* ══════════════════════════════════════════
   VIEW SWITCHING
══════════════════════════════════════════ */
function fullStateReset() {
  setActiveStallTarget('', 'any');
  document.getElementById('globalSearchInput').value = '';
  document.getElementById('sidebarSearchInput').value = '';
  document.getElementById('searchResultsDropdown').classList.remove('open');
  document.getElementById('searchResultsDropdown').style.display = 'none';
  document.getElementById('sidebarSearchResults').style.display = 'none';
  document.getElementById('routeFrom').value = '';
  document.getElementById('routeTo').value   = '';
  document.getElementById('btnClear').style.display = 'none';
  routePath2d = null; routeStart2d = null; routeEnd2d = null;
  routeMetrics = { distanceM: 0, timeMin: 0, distanceLabel: '', timeLabel: '' };
  try { window.__routeMetrics = routeMetrics; } catch (_) {}
  document.body.classList.remove('route-active');
  clearRoute3d();
  navStepsData = []; currentNavStepIdx = 0;
  hideNavFab(); closeNavDrawer(); closeSidebar();
}

function switchView(v) {
  fullStateReset();
  currentView = v;
  const c2 = document.getElementById('canvas-2d');
  const r3 = renderer3?.domElement, l3 = labelRenderer3?.domElement;
  const zc = document.getElementById('zoomControls');
  const qs = document.getElementById('qualitySection');
  const fps = document.getElementById('fps-indicator');

  if (v === '2d') {
    c2.style.display = 'block';
    if (r3) r3.style.display = 'none'; if (l3) l3.style.display = 'none';
    zc.style.display = 'flex';
    if (qs) qs.classList.remove('visible');
    fps.classList.remove('show');
    document.getElementById('btn2D').classList.add('active');
    document.getElementById('btn3D').classList.remove('active');
    fitCamera2d();
    draw2d();
  } else {
    c2.style.display = 'none';
    if (r3) r3.style.display = 'block'; if (l3) l3.style.display = 'block';
    zc.style.display = 'flex';
    if (qs) qs.classList.remove('visible');
    fps.classList.add('show');
    document.getElementById('btn3D').classList.add('active');
    document.getElementById('btn2D').classList.remove('active');
    clearStallGroup3();
    buildAll3D();
  }
}

/* ══════════════════════════════════════════
   STALL DIALOG
══════════════════════════════════════════ */
function showStallDialog(data) {

  console.log(data);
  

    const cat = data.Category === 'General'
        ? 'Silver'
        : (data.Category || 'Standard');

    // ==========================================
    // 1. PROVISIONALLY BOOKED - YELLOW
    // Same condition used by original map logic
    // ==========================================
    if (
        data.blBooked !== 'false' &&
        data.blPreBooked === '1'
    ) {

        jq('#myModal').html(`
            <div class="stall-card">

                <div class="card-head">
                    <div class="card-title">
                        Stall ${data.StallNo}
                    </div>

                    <span class="card-badge cb-hold">
                        <i class="fa fa-clock"></i>
                        Provisionally Booked
                    </span>
                </div>

                <div class="info-grid">

                    <div class="info-cell">
                        <div class="info-label">Area</div>
                        <div class="info-val">
                            <i class="fa fa-vector-square"></i>
                            ${data.Area} m²
                        </div>
                    </div>

                    <div class="info-cell">
                        <div class="info-label">Dimensions</div>
                        <div class="info-val">
                            <i class="fa fa-ruler-combined"></i>
                            ${data.Dimention}
                        </div>
                    </div>

                    <div class="info-cell">
                        <div class="info-label">Open Sides</div>
                        <div class="info-val">
                            <i class="fa fa-door-open"></i>
                            ${data.SideOpen}
                        </div>
                    </div>

                    <div class="info-cell">
                        <div class="info-label">Category</div>
                        <div class="info-val">
                            <i class="fa fa-star"></i>
                            ${cat}
                        </div>
                    </div>

                </div>

            </div>
        `).dialog({
            modal: true,
            width: Math.min(innerWidth * .9, 390),
            buttons: [{
                text: 'Close',
                click: function () {
                    jq(this).dialog('close');
                }
            }]
        });

        return;
    }


    // ==========================================
    // 2. ACTUALLY BOOKED - RED
    // Existing booked logic
    // ==========================================
    else if (data.blBooked !== 'false') {

        const init = data.txtComName
            ? data.txtComName.charAt(0).toUpperCase()
            : 'B';

        jq('#DivBook').html(`
            <div class="stall-card">

                <div style="text-align:center;margin-bottom:8px">

                    <div class="co-avatar">
                        ${init}
                    </div>

                    <div class="co-name">
                        ${data.txtComName || 'Booked'}
                    </div>

                    <span class="card-badge cb-booked">
                        <i class="fa fa-lock"></i>
                        Allotted
                    </span>

                </div>

                <div class="info-grid">

                    <div class="info-cell">
                        <div class="info-label">Stall No.</div>
                        <div class="info-val">
                            <i class="fa fa-hashtag"></i>
                            ${data.StallNo}
                        </div>
                    </div>

                    <div class="info-cell">
                        <div class="info-label">Area</div>
                        <div class="info-val">
                            <i class="fa fa-vector-square"></i>
                            ${data.Area} m²
                        </div>
                    </div>

                    <div class="info-cell">
                        <div class="info-label">Dimensions</div>
                        <div class="info-val">
                            <i class="fa fa-ruler-combined"></i>
                            ${data.Dimention}
                        </div>
                    </div>

                    <div class="info-cell">
                        <div class="info-label">Open Sides</div>
                        <div class="info-val">
                            <i class="fa fa-door-open"></i>
                            ${data.SideOpen}
                        </div>
                    </div>

                </div>

                <a
                    class="btn-profile"
                    href="https://register.acrex.in/ViewhallLayout.html?stallID=${data.SeatId}"
                    target="_blank">
                    View Exhibitor
                    <i class="fa fa-arrow-right"></i>
                </a>

            </div>
        `).dialog({
            modal: true,
            width: Math.min(innerWidth * .9, 390),
            buttons: [{
                text: 'Close',
                click: function () {
                    jq(this).dialog('close');
                }
            }]
        });

        return;
    }


    // ==========================================
    // 3. AVAILABLE
    // Existing available logic
    // ==========================================
    else if (
        data.blBooked === 'false' &&
        data.blTemp === 'false' &&
        data.blPreBooked !== '1'
    ) {

        jq('#myModal').html(`
            <div class="stall-card">

                <div class="card-head">

                    <div class="card-title">
                        Stall ${data.StallNo}
                    </div>

                    <span class="card-badge cb-available">
                        <i class="fa fa-check-circle"></i>
                        Available
                    </span>

                </div>

                <div class="info-grid">

                    <div class="info-cell">
                        <div class="info-label">Area</div>
                        <div class="info-val">
                            <i class="fa fa-vector-square"></i>
                            ${data.Area} m²
                        </div>
                    </div>

                    <div class="info-cell">
                        <div class="info-label">Dimensions</div>
                        <div class="info-val">
                            <i class="fa fa-ruler-combined"></i>
                            ${data.Dimention}
                        </div>
                    </div>

                    <div class="info-cell">
                        <div class="info-label">Open Sides</div>
                        <div class="info-val">
                            <i class="fa fa-door-open"></i>
                            ${data.SideOpen}
                        </div>
                    </div>

                    <div class="info-cell">
                        <div class="info-label">Category</div>
                        <div class="info-val">
                            <i class="fa fa-star"></i>
                            ${cat}
                        </div>
                    </div>

                    <div class="info-cell" style="grid-column:span 2">
                        <div class="info-label">Scheme</div>
                        <div class="info-val">
                            <i class="fa fa-layer-group"></i>
                            ${data.Scheme}
                        </div>
                    </div>

                </div>

            </div>
        `).dialog({
            modal: true,
            width: Math.min(innerWidth * .9, 390),
            buttons: [{
                text: 'Close',
                click: function () {
                    jq(this).dialog('close');
                }
            }]
        });

        return;
    }


    // ==========================================
    // 4. PROVISIONALLY BLOCKED / HOLD
    // Existing hold logic
    // ==========================================
    else {

        jq('#myModal').html(`
            <div class="stall-card">

                <div class="card-head">

                    <div class="card-title">
                        Stall ${data.StallNo}
                    </div>

                    <span class="card-badge cb-hold">
                        <i class="fa fa-clock"></i>
                        Prov. Blocked
                    </span>

                </div>

                <div class="info-grid">

                    <div class="info-cell">
                        <div class="info-label">Area</div>
                        <div class="info-val">
                            <i class="fa fa-vector-square"></i>
                            ${data.Area} m²
                        </div>
                    </div>

                    <div class="info-cell">
                        <div class="info-label">Dimensions</div>
                        <div class="info-val">
                            <i class="fa fa-ruler-combined"></i>
                            ${data.Dimention}
                        </div>
                    </div>

                </div>

            </div>
        `).dialog({
            modal: true,
            width: Math.min(innerWidth * .9, 390),
            buttons: [{
                text: 'Close',
                click: function () {
                    jq(this).dialog('close');
                }
            }]
        });

        return;
    }
}

/* ══════════════════════════════════════════
   FULL HALL CHANGE RESET
══════════════════════════════════════════ */
function closeAnyOpenDialogs() {
  try {
    if (window.jq) {
      ['#myModal', '#DivBook'].forEach(sel => {
        const el = jq(sel);
        if (el && el.hasClass('ui-dialog-content')) el.dialog('close');
      });
    }
  } catch (e) {}
}

function clearSearchUiFields() {
  ['globalSearchInput', 'sidebarSearchInput', 'wowSearchInput'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  ['searchResultsDropdown', 'sidebarSearchResults', 'wowSearchResults'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.innerHTML = '';
      el.classList.remove('open');
      el.style.display = 'none';
    }
  });
}

function clearRouteInputFields() {
  const from = document.getElementById('routeFrom');
  const to = document.getElementById('routeTo');
  if (from) from.value = '';
  if (to) to.value = '';
}

function clearMapTransientState(options = {}) {
  const clearInputs = options.clearInputs !== false;
  const clearSearch = options.clearSearch !== false;
  const clearSelection = options.clearSelection !== false;

  if (clearSelection) setActiveStallTarget('', 'any');
  activeStallPos3 = null;
  routePath2d = null;
  routeStart2d = null;
  routeEnd2d = null;
  routeMetrics = { distanceM: 0, timeMin: 0, distanceLabel: '', timeLabel: '' };
  try { window.__routeMetrics = routeMetrics; } catch (_) {}
  document.body.classList.remove('route-active');
  _grid = null;
  navStepsData = [];
  currentNavStepIdx = 0;

  if (clearInputs) clearRouteInputFields();
  if (clearSearch) clearSearchUiFields();

  try { hideNavFab(); } catch (e) { document.getElementById('nav-fab')?.classList.remove('show'); }
  try { closeNavDrawer(); } catch (e) { document.getElementById('nav-drawer')?.classList.remove('open'); }
  try { closeSidebar(); } catch (e) {}
  try { if (window.closeSearchSheet) window.closeSearchSheet(); } catch (e) {}
  try { if (window.hideStallBottomCard) window.hideStallBottomCard(); } catch (e) {}
  closeAnyOpenDialogs();

  const btnClear = document.getElementById('btnClear');
  if (btnClear) btnClear.style.display = 'none';

  try { clearRoute3d(); } catch (e) {}

  // Force-clear any route start/end material left on 3D stalls before/after hall switches.
  if (currentView === '3d' && typeof clearStallGroup3 === 'function') {
    try { clearStallGroup3(); } catch (e) {}
  }

  if (currentView === '2d' && typeof render2dFrame === 'function') {
    try { render2dFrame(); } catch (e) {}
  }
}

function updateUrlForHallChange(hallId, hallName) {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('HallId', hallId);
    if (hallName) url.searchParams.set('hallName', hallName);
    ['StallId', 'stallId', 'SeatId', 'seatId', 'StallNo', 'stallNo', 'from', 'to'].forEach(k => url.searchParams.delete(k));
    history.replaceState(null, '', url.toString());
  } catch (e) {}
}

function resetForHallChange(hallId, hallName) {
  clearMapTransientState({ clearInputs: true, clearSearch: true, clearSelection: true });
  updateUrlForHallChange(hallId, hallName);
  try {
    document.dispatchEvent(new CustomEvent('stallmap:hall-changing', { detail: { hallId, hallName } }));
  } catch (e) {}
}

/* ══════════════════════════════════════════
   URL PARAMS
══════════════════════════════════════════ */
function parseURLParams() {
  const url = new URL(location.href);
  const hId = url.searchParams.get('HallId');
  const idParam = url.searchParams.get('StallId') || url.searchParams.get('stallId') || url.searchParams.get('SeatId') || url.searchParams.get('seatId');
  const stallNoParam = url.searchParams.get('StallNo') || url.searchParams.get('stallNo');
  const sId = idParam || stallNoParam;
  const hn  = url.searchParams.get('hallName');
  if (sId) setActiveStallTarget(sId, idParam ? 'id' : 'any');
  if (hId) {
    jq('#HallId').val(hId);
    const li = document.querySelector(`#hallDropdown li[data-v="${hId}"]`);
    const name = hn || (li ? li.getAttribute('data-n') : 'Selected Hall');
    setHallUI(hId, name);
  } else {
    setHallUI(jq('#HallId').val(), 'HALL 1');
  }
}

function setHallUI(val, name) {
  document.getElementById('hallBtnText').textContent = name;
  document.querySelectorAll('#hallDropdown li').forEach(li => li.classList.toggle('selected', li.getAttribute('data-v') === String(val)));
  if (name) { const pn = name.replace(/HALL\s*/i, ''); jq('#hallPdf').attr('href', 'pdf/HALL_' + pn + '.pdf'); }
}

/* ══════════════════════════════════════════
   DATA LOADING
══════════════════════════════════════════ */
function LoadSearchData() {
  if (jq('#HallId').val() === '1') { alert('Please select a hall.'); return; }
  jq('#loader').fadeIn(200);
  // Clear all visible route/UI leftovers before loading a hall. Keep searchTargetStallId here
  // so deep-link highlight still works when the page first loads with StallId/StallNo.
  clearMapTransientState({ clearInputs: false, clearSearch: false, clearSelection: false });
  allStallData = []; allUtilData = [];
  _stallLabelCache.clear();
  clearStallGroup3();
  document.getElementById('stallList').innerHTML = '';
  jq.ajax({
    type: 'POST',
    url: 'https://register.acrex.in/Admin/SeatLayout.aspx/GetSeachLayout',
    data: `{HallId:"${jq('#HallId').val()}",Area:"${jq('#ddlArea').val()}",Scheme:"",OpenSide:"${jq('#ddlOpenSide').val()}",Category:"${jq('#ddlCategory').val()}",Mezzanine:""}`,
    contentType: 'application/json; charset=utf-8',
    dataType: 'json',
    success: OnSuccess,
    error: e => { console.error('AJAX', e); jq('#loader').fadeOut(200); if (window.showMapError) window.showMapError('Unable to load hall layout. Please check internet and try again.'); }
  });
}

/* ── Closed-side adjacency correction ────────────────────────────────
   The backend can return tiny coordinate gaps between stalls that are
   actually back-to-back / side-by-side. `Positions` tells us which edges
   are OPEN. When two nearby facing edges are BOTH CLOSED, split the tiny
   gap between the two stalls so they meet at one shared boundary.

   Important: only small gaps are corrected. Real aisles remain untouched.
   Geometry is corrected once after the API payload is parsed, so 2D, 3D,
   hit-testing and route obstacles all use the same no-gap coordinates.
────────────────────────────────────────────────────────────────────── */
const CLOSED_SIDE_SNAP_MAX = 24;     // world units; genuine aisles are normally much wider
const CLOSED_SIDE_MIN_OVERLAP = 0.45; // facing stalls must overlap by at least 45%

function stallSideIsOpen(d, side) {
  const pos = String(d && d.Positions || '').toLowerCase();
  return pos.includes(side);
}

function overlapRatio1d(a0, a1, b0, b1) {
  const overlap = Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
  const smaller = Math.max(0.001, Math.min(a1 - a0, b1 - b0));
  return overlap / smaller;
}

function closeSmallGapsBetweenClosedStalls(stalls) {
  if (!Array.isArray(stalls) || stalls.length < 2) return;

  // Always calculate adjacency from the untouched API geometry. This avoids
  // one correction influencing the next pair while we scan the hall.
  const raw = stalls.map(d => ({
    l: Number(d.dLeft) || 0,
    t: Number(d.dTop) || 0,
    w: Math.max(0.001, Number(d.dWidth) || 0.001),
    h: Math.max(0.001, Number(d.dHeight) || 0.001)
  }));

  const ext = stalls.map(() => ({ l: 0, r: 0, t: 0, b: 0 }));
  const EPS = 0.05;

  function snapHorizontal(leftIndex, rightIndex, gap) {
    if (hasStallCutouts(stalls[leftIndex]) || hasStallCutouts(stalls[rightIndex])) return;
    const a = raw[leftIndex], b = raw[rightIndex];
    const verticalOverlap = overlapRatio1d(a.t, a.t + a.h, b.t, b.t + b.h);
    if (verticalOverlap < CLOSED_SIDE_MIN_OVERLAP) return;
    if (stallSideIsOpen(stalls[leftIndex], 'right')) return;
    if (stallSideIsOpen(stalls[rightIndex], 'left')) return;

    const half = gap / 2;
    ext[leftIndex].r = Math.max(ext[leftIndex].r, half);
    ext[rightIndex].l = Math.max(ext[rightIndex].l, gap - half);
  }

  function snapVertical(topIndex, bottomIndex, gap) {
    if (hasStallCutouts(stalls[topIndex]) || hasStallCutouts(stalls[bottomIndex])) return;
    const a = raw[topIndex], b = raw[bottomIndex];
    const horizontalOverlap = overlapRatio1d(a.l, a.l + a.w, b.l, b.l + b.w);
    if (horizontalOverlap < CLOSED_SIDE_MIN_OVERLAP) return;
    if (stallSideIsOpen(stalls[topIndex], 'bottom')) return;
    if (stallSideIsOpen(stalls[bottomIndex], 'top')) return;

    const half = gap / 2;
    ext[topIndex].b = Math.max(ext[topIndex].b, half);
    ext[bottomIndex].t = Math.max(ext[bottomIndex].t, gap - half);
  }

  for (let i = 0; i < stalls.length; i++) {
    const a = raw[i];
    const ar = a.l + a.w, ab = a.t + a.h;

    for (let j = i + 1; j < stalls.length; j++) {
      const b = raw[j];
      const br = b.l + b.w, bb = b.t + b.h;

      // A is left of B.
      let gap = b.l - ar;
      if (gap > EPS && gap <= CLOSED_SIDE_SNAP_MAX) snapHorizontal(i, j, gap);

      // B is left of A.
      gap = a.l - br;
      if (gap > EPS && gap <= CLOSED_SIDE_SNAP_MAX) snapHorizontal(j, i, gap);

      // A is above B.
      gap = b.t - ab;
      if (gap > EPS && gap <= CLOSED_SIDE_SNAP_MAX) snapVertical(i, j, gap);

      // B is above A.
      gap = a.t - bb;
      if (gap > EPS && gap <= CLOSED_SIDE_SNAP_MAX) snapVertical(j, i, gap);
    }
  }

  stalls.forEach((d, i) => {
    const r = raw[i], e = ext[i];
    if (!(e.l || e.r || e.t || e.b)) return;

    // Keep the original values available for debugging/admin comparison.
    d._apiDLeft = r.l; d._apiDTop = r.t;
    d._apiDWidth = r.w; d._apiDHeight = r.h;

    d.dLeft = r.l - e.l;
    d.dTop = r.t - e.t;
    d.dWidth = r.w + e.l + e.r;
    d.dHeight = r.h + e.t + e.b;
    d._closedGapAdjusted = true;
  });
}

function OnSuccess(resp) {
  const xml = jq(jq.parseXML(resp.d));
  const dl  = document.getElementById('stallList');
  xml.find('Table1').each(function () {
    const sn = jq(this).find('StallNo').text();
    const companyName = jq(this).find('txtComName').text();
    if (sn) dl.innerHTML += `<option value="${escapeAttrLocal(sn)}"${companyName ? ` label="${escapeAttrLocal(companyName)}"` : ''}>`;
    if (companyName) dl.innerHTML += `<option value="${escapeAttrLocal(companyName)}" label="${escapeAttrLocal(sn || 'Company')}">`;
    allStallData.push({
      SeatId: jq(this).find('SeatId').text(),
      StallId: jq(this).find('StallId').text() || jq(this).find('StallID').text() || jq(this).find('stallID').text() || jq(this).find('stallId').text(),
      StallNo: sn,
      Scheme: jq(this).find('Scheme').text(), SideOpen: jq(this).find('SideOpen').text(),
      Area: jq(this).find('area').text(), Dimention: jq(this).find('Dimension').text(),
      dHeight: parseFloat(jq(this).find('dHeight').text()) || 40,
      dWidth:  parseFloat(jq(this).find('dWidth').text())  || 40,
      dTop:    parseFloat(jq(this).find('dTop').text())    || 0,
      dLeft:   parseFloat(jq(this).find('dLeft').text())   || 0,
      blStatus: jq(this).find('blStatus').text(),
      blBooked: jq(this).find('blBooked').text(),
      Positions: jq(this).find('Positions').text(),
      blTemp: jq(this).find('blTemp').text(),
      txtComName: jq(this).find('txtComName').text(),
      Category: jq(this).find('Category').text(),
      Mezzanine: jq(this).find('Mezzanine').text(),
      blPreBooked: jq(this).find('blPreBooked').text(),
      sStatus: jq(this).find('sStatus').text()
    });
  });
  let sp = xml.find('Table2'); if (!sp.length) sp = xml.find('SpaceData');
  const allSpaceData = [];
  sp.each(function () {
    const rawLabels = [];
    let txt = '';

    jq(this).children().each(function () {
      const tag = String(this.tagName || '').toLowerCase();
      const val = jq(this).text().trim();
      if (!val) return;

      // Preserve every textual field so a SpaceData row containing 14.14D can
      // be matched even when another field (e.g. type/name) appears first.
      if (!['dtop', 'dleft', 'dwidth', 'dheight', 'seatid'].includes(tag) && isNaN(val)) {
        rawLabels.push(val);
        if (!txt) txt = val;
      }
    });

    allSpaceData.push({
      Text: txt,
      _rawLabels: rawLabels,
      dHeight: parseFloat(jq(this).find('dHeight').text()) || 40,
      dWidth:  parseFloat(jq(this).find('dWidth').text())  || 100,
      dTop:    parseFloat(jq(this).find('dTop').text())    || 0,
      dLeft:   parseFloat(jq(this).find('dLeft').text())   || 0
    });
  });

  // First attach backend overlay rectangles to their booth using the untouched
  // API geometry. This is critical for corner cutouts / L-shaped stalls.
  attachOverlaySpacesToStalls(allStallData, allSpaceData);

  // Then remove tiny gaps between normal rectangular closed-side stalls.
  // L-shaped stalls are intentionally skipped so their notch stays aligned.
  closeSmallGapsBetweenClosedStalls(allStallData);

  allUtilData = allSpaceData.filter(space => !!space.Text && !space._isStallCutout);
  allUtilData.forEach(space => {
    dl.innerHTML += `<option value="${escapeAttrLocal(space.Text)}">`;
  });

  // Expose latest hall data for enhancement/search modules loaded from separate JS files.
  window.__allStallData = allStallData;
  window.__allUtilData = allUtilData;
  window.__lShapeDebug = allStallData
    .filter(d => Array.isArray(d._cutouts) && d._cutouts.length)
    .map(d => ({ StallNo: d.StallNo, cutouts: d._cutouts }));

  jq('#loader').fadeOut(200);
  updateStats();
  fitCamera2d();
  if (searchTargetStallId) {
    // Delay and retry once because canvas size/layout can settle after WebView load.
    focusStall2d(searchTargetStallId);
    setTimeout(() => focusStall2d(searchTargetStallId), 80);
  }
  if (currentView === '3d') buildAll3D(); else draw2d();
}

function buildAll3D() {
  allStallData.forEach(d => build3DStall(d));
  allUtilData.forEach(d => buildUtil3(d));
  const box = new THREE.Box3().setFromObject(stallsGroup3);
  const ctr = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
  mapBaseSize = Math.max(sz.x, sz.z) || 2000;
  setTimeout(() => {
    if (activeStallPos3) {
      controls3.target.copy(activeStallPos3);
      camera3.position.set(activeStallPos3.x, 800, activeStallPos3.z + 800 + (innerWidth <= 768 ? 300 : 0));
    } else if (stallsGroup3.children.length) {
      controls3.target.copy(ctr);
      camera3.position.set(ctr.x, mapBaseSize * 1.2, ctr.z + mapBaseSize * .8);
    }
    controls3.update();
  }, 300);
}

/* ══════════════════════════════════════════
   ROUTE ENTRY POINTS
══════════════════════════════════════════ */
function hasActiveRoute() {
  return !!(routePath2d || pathMesh3 || navStepsData.length || startMark3 || endMark3);
}

function resetRouteVisualState(keepInputs = true) {
  routePath2d = null;
  routeStart2d = null;
  routeEnd2d = null;
  routeMetrics = { distanceM: 0, timeMin: 0, distanceLabel: '', timeLabel: '' };
  try { window.__routeMetrics = routeMetrics; } catch (_) {}
  document.body.classList.remove('route-active');
  clearRoute3d();
  hideNavFab();
  closeNavDrawer();
  navStepsData = [];
  currentNavStepIdx = 0;
  document.getElementById('btnClear').style.display = 'none';
  if (!keepInputs) {
    document.getElementById('routeFrom').value = '';
    document.getElementById('routeTo').value = '';
  }
  // In 3D, rebuilding is the safest way to remove any lingering highlighted material after route changes.
  if (currentView === '3d' && scene) {
    clearStallGroup3();
    buildAll3D();
  } else if (currentView === '2d' && typeof render2dFrame === 'function') {
    render2dFrame();
  }
}

function resetRouteIfInputsChanged() {
  if (hasActiveRoute()) resetRouteVisualState(true);
}

function calculateRoute() {
  const fv = document.getElementById('routeFrom').value.trim();
  const tv = document.getElementById('routeTo').value.trim();
  if (!fv || !tv) return alert('Please enter both From and To locations.');
  routePath2d = null; routeStart2d = null; routeEnd2d = null;
  clearRoute3d(); hideNavFab(); closeNavDrawer();
  navStepsData = []; currentNavStepIdx = 0;
  if (currentView === '2d') calculateRoute2d(fv, tv);
  else calculateRoute3d(fv, tv);
  document.getElementById('btnClear').style.display = 'block';
}

function clearRoute() {
  // Hard reset all route state so START/END markers and green path never remain after Clear.
  resetRouteVisualState(false);
}

/* ══════════════════════════════════════════
   CUSTOM ROUTE COMBO DROPDOWNS
   Replaces native <datalist> for both From/To
   inputs with a fully custom searchable list
   that never hides behind the mobile keyboard.
══════════════════════════════════════════ */
(function () {
  function buildRouteCombo(inputId, dropId) {
    const input = document.getElementById(inputId);
    const drop  = document.getElementById(dropId);
    if (!input || !drop) return;

    let activeIdx = -1;
    let items = [];

    function escH(v) {
      return String(v ?? '').replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[c]);
    }

    function scoreItem(d, q, qc) {
      const stall   = normalizeStallKey(d.StallNo);
      const stallC  = compactStallKey(d.StallNo);
      const company = normalizeStallKey(d.txtComName);
      const companyC = compactStallKey(d.txtComName);
      if (stall === q || stallC === qc)           return 100;
      if (company === q || companyC === qc)       return 90;
      if (stall.startsWith(q) || stallC.startsWith(qc)) return 80;
      if (company.startsWith(q) || companyC.startsWith(qc)) return 70;
      if (stall.includes(q) || stallC.includes(qc))    return 60;
      if (company.includes(q) || companyC.includes(qc)) return 50;
      return 0;
    }

    function renderDrop(query) {
      const q  = normalizeStallKey(query);
      const qc = compactStallKey(query);
      if (!q || !allStallData.length) { closeDrop(); return; }
      items = allStallData
        .map(d => ({ d, score: scoreItem(d, q, qc) }))
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score || String(a.d.StallNo).localeCompare(String(b.d.StallNo)))
        .slice(0, 15)
        .map(x => x.d);
      if (!items.length) {
        drop.innerHTML = `<div class="rcd-empty">No results for "${escH(query)}"</div>`;
      } else {
        drop.innerHTML = items.map((d, i) => {
          const status = d.blBooked !== 'false' ? 'booked' : (d.blPreBooked === '1' || d.blTemp !== 'false') ? 'hold' : 'available';
          const label  = status === 'available' ? 'Free' : status === 'booked' ? 'Taken' : 'Hold';
          return `<div class="rcd-item" data-idx="${i}" data-stall="${escH(d.StallNo)}">
            <span class="rcd-no">${escH(d.StallNo)}</span>
            <span class="rcd-company">${d.txtComName ? escH(d.txtComName) : '<span style="color:var(--muted)">No exhibitor</span>'}</span>
            <span class="rcd-badge ${status}">${label}</span>
          </div>`;
        }).join('');
        // Attach click handlers
        drop.querySelectorAll('.rcd-item').forEach(el => {
          el.addEventListener('mousedown', e => {
            e.preventDefault(); // prevent blur firing before click
            selectItem(parseInt(el.dataset.idx));
          });
        });
      }
      activeIdx = -1;
      openDrop();
    }

    function selectItem(idx) {
      const d = items[idx];
      if (!d) return;
      input.value = d.StallNo;
      closeDrop();
      resetRouteIfInputsChanged();
    }

    function openDrop() {
      drop.classList.add('open');
      // Mobile: scroll sidebar so input is visible above keyboard
      if (window.innerWidth <= 768) {
        setTimeout(() => {
          input.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 80);
      }
    }

    function closeDrop() {
      drop.classList.remove('open');
      activeIdx = -1;
    }

    function highlightItem(idx) {
      drop.querySelectorAll('.rcd-item').forEach((el, i) => {
        el.classList.toggle('rcd-active', i === idx);
        if (i === idx) el.scrollIntoView({ block: 'nearest' });
      });
      activeIdx = idx;
    }

    input.addEventListener('input', function () {
      renderDrop(this.value.trim());
    });

    input.addEventListener('focus', function () {
      if (this.value.trim()) renderDrop(this.value.trim());
    });

    input.addEventListener('keydown', function (e) {
      if (!drop.classList.contains('open')) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        highlightItem(Math.min(activeIdx + 1, items.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        highlightItem(Math.max(activeIdx - 1, 0));
      } else if (e.key === 'Enter') {
        if (activeIdx >= 0) { e.preventDefault(); selectItem(activeIdx); }
        else closeDrop();
      } else if (e.key === 'Escape') {
        closeDrop();
      }
    });

    input.addEventListener('blur', function () {
      // Short delay so mousedown on item fires before blur hides the list
      setTimeout(closeDrop, 150);
    });

    // Close when clicking outside
    document.addEventListener('click', function (e) {
      if (!input.contains(e.target) && !drop.contains(e.target)) closeDrop();
    });
  }

  // Init after DOM ready — wait for allStallData to be available via mutation
  function tryInit() {
    buildRouteCombo('routeFrom', 'routeFromDrop');
    buildRouteCombo('routeTo',   'routeToDrop');
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInit);
  } else {
    tryInit();
  }
})();


document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeSidebar(); closeNavDrawer();
    document.getElementById('searchResultsDropdown').classList.remove('open');
    document.getElementById('routeFromDrop').classList.remove('open');
    document.getElementById('routeToDrop').classList.remove('open');
  }
  if (e.key === 'ArrowRight' && navStepsData.length) navStepNext();
  if (e.key === 'ArrowLeft'  && navStepsData.length) navStepPrev();
  if ((e.key === 'f' || e.key === 'F') && !e.target.matches('input')) fitCamera2d();
});

/* ══════════════════════════════════════════
   INIT
══════════════════════════════════════════ */
jq(function () {
  parseURLParams();
  updateQualityUI(currentQuality);

  const hallBtn = document.getElementById('hallBtn');
  const hallDD  = document.getElementById('hallDropdown');
  hallBtn.addEventListener('click', e => { e.stopPropagation(); hallDD.classList.toggle('open'); hallBtn.classList.toggle('open'); });
  document.addEventListener('click', () => { hallDD.classList.remove('open'); hallBtn.classList.remove('open'); });
  hallDD.querySelectorAll('li').forEach(li => {
    li.addEventListener('click', () => {
      const v = li.getAttribute('data-v'), n = li.getAttribute('data-n');
      if (v) { resetForHallChange(v, n); jq('#HallId').val(v); setHallUI(v, n); LoadSearchData(); }
      hallDD.classList.remove('open'); hallBtn.classList.remove('open');
    });
  });

  document.getElementById('routeFrom').addEventListener('keydown', e => { if (e.key === 'Enter') calculateRoute(); });
  document.getElementById('routeTo').addEventListener('keydown',   e => { if (e.key === 'Enter') calculateRoute(); });
  ['input', 'change'].forEach(evt => {
    document.getElementById('routeFrom').addEventListener(evt, resetRouteIfInputsChanged);
    document.getElementById('routeTo').addEventListener(evt, resetRouteIfInputsChanged);
  });

  resize2d();
  window.addEventListener('resize', () => {
    resize2d();
    resize3d();
  });

  init3D();
  LoadSearchData();
  draw2d();
});
