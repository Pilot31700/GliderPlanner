/****************************************************
 * Glide Planner - app.js (version complète corrigée)
 *
 * Principes appliqués :
 * - GPS demandé et utilisé uniquement en mode VOL
 * - Cercle bleu (planeur) affiché uniquement en VOL
 * - Pas de cercles "fixes" indésirables
 * - Cercles de calcul en PREP avec labels sur le périmètre
 * - Un seul marqueur piste par terrain (ICAO si demandé)
 * - makeDraggable défini tôt pour éviter ReferenceError
 * - Tous les calques dynamiques sont suivis et nettoyés correctement
 ****************************************************/

/* Globals */
let _volInitialized = false;
let terrainsAll = [];
let terrains = [];
let filterOnly4Letters = false;
let objs = [];        // PREP dynamic layers (circles, polygons, label markers, terrain markers)
let volObjects = [];  // VOL dynamic layers (plane circle, vol-specific markers)
let volGpsWatchId = null;
let volAutoCenter = true;

/* -------------------------
   Utility helpers
   ------------------------- */
function safe(fn) { try { return fn(); } catch (e) { console.warn(e); return null; } }

function enableMapInteractions(map) {
  try {
    if (!map) return;
    map.dragging?.enable?.();
    map.scrollWheelZoom?.enable?.();
    map.touchZoom?.enable?.();
    map.doubleClickZoom?.enable?.();
    map.boxZoom?.enable?.();
    map.keyboard?.enable?.();
    map.tap?.enable?.();
    const el = map.getContainer ? map.getContainer() : document.getElementById('map');
    if (el) { el.style.pointerEvents = 'auto'; el.style.touchAction = 'pan-x pan-y pinch-zoom'; }
  } catch (e) { console.warn('enableMapInteractions', e); }
}

function disableMapInteractions(map) {
  try {
    if (!map) return;
    map.dragging?.disable?.();
    map.scrollWheelZoom?.disable?.();
    map.touchZoom?.disable?.();
    map.doubleClickZoom?.disable?.();
    map.boxZoom?.disable?.();
    map.keyboard?.disable?.();
    map.tap?.disable?.();
    const el = map.getContainer ? map.getContainer() : document.getElementById('map');
    if (el) { el.style.pointerEvents = 'none'; el.style.touchAction = 'none'; }
  } catch (e) { console.warn('disableMapInteractions', e); }
}

/* -------------------------
   Draggable helper (defined early)
   ------------------------- */
function makeDraggable(el) {
  if (!el) return;
  let dragging = false, offsetX = 0, offsetY = 0;
  function isFormControl(target) {
    if (!target) return false;
    return !!target.closest('input, select, textarea, button, label, [role="slider"], .no-drag');
  }
  el.addEventListener('pointerdown', function (e) {
    if (e.button && e.button !== 0) return;
    if (isFormControl(e.target)) return;
    dragging = true;
    try { el.setPointerCapture(e.pointerId); } catch (err) {}
    offsetX = e.clientX - el.offsetLeft;
    offsetY = e.clientY - el.offsetTop;
    el.style.cursor = 'grabbing';
    e.preventDefault();
  });
  el.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    let left = e.clientX - offsetX, top = e.clientY - offsetY;
    left = Math.max(0, Math.min(window.innerWidth - el.offsetWidth, left));
    top = Math.max(0, Math.min(window.innerHeight - el.offsetHeight, top));
    el.style.left = left + 'px'; el.style.top = top + 'px';
  });
  el.addEventListener('pointerup', function (e) {
    if (!dragging) return;
    dragging = false;
    try { el.releasePointerCapture(e.pointerId); } catch (err) {}
    el.style.cursor = 'default';
  });
  el.addEventListener('pointercancel', function () { dragging = false; el.style.cursor = 'default'; });
}

/* -------------------------
   Navigation between screens
   ------------------------- */
function goTo(screenId) {
  const screens = ['homeScreen', 'prepScreen', 'volScreen', 'manuelScreen'];
  const mapEl = document.getElementById('map');
  const btnCarte = document.getElementById('layerToggleBtn');

  if (btnCarte) btnCarte.style.display = (screenId === 'homeScreen' || screenId === 'manuelScreen') ? 'none' : 'block';

  screens.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === screenId) { el.style.display = (id === 'homeScreen') ? 'flex' : 'block'; el.removeAttribute('aria-hidden'); }
    else { el.style.display = 'none'; el.setAttribute('aria-hidden', 'true'); }
  });

  const map = window._glide_map || null;
  const volRadiusEl = document.getElementById('volRadiusDisplay');
  if (volRadiusEl) volRadiusEl.style.display = (screenId === 'volScreen') ? 'block' : 'none';

  if (screenId === 'prepScreen' || screenId === 'volScreen') {
    mapEl?.classList.remove('map-blurred'); mapEl?.classList.add('map-absolute');
    const prep = document.getElementById('prepScreen'); if (prep) prep.style.pointerEvents = 'none';
    if (map) { enableMapInteractions(map); setTimeout(()=> map.invalidateSize(), 120); }
  } else {
    mapEl?.classList.add('map-blurred'); mapEl?.classList.remove('map-absolute');
    const prep = document.getElementById('prepScreen'); if (prep) prep.style.pointerEvents = 'auto';
    if (map) disableMapInteractions(map);
  }

  // VOL lifecycle
  if (screenId === 'volScreen') {
    try { initVolMode(); } catch (e) { console.warn('initVolMode error', e); }
    try { startVolGps(); } catch (e) { console.warn('startVolGps error', e); }
  } else {
    try { if (typeof volGpsWatchId === 'number' && volGpsWatchId !== null) { navigator.geolocation.clearWatch(volGpsWatchId); volGpsWatchId = null; } } catch(e){}
    try { clearVolObjects(); } catch(e){}
  }
}

/* -------------------------
   DOMContentLoaded init
   ------------------------- */
document.addEventListener('DOMContentLoaded', function () {
  // DOM refs
  const panel = document.getElementById('panel');
  const menuVent = document.getElementById('menuVent');
  const btnPanel = document.getElementById('btnPanel');
  const btnVent = document.getElementById('btnVent');
  const btnRecalc = document.getElementById('btnRecalc');
  const btnRecalcWind = document.getElementById('btnRecalcWind');

  const hVal = document.getElementById('hVal');
  const slider = document.getElementById('slider');
  const finesse = document.getElementById('finesse');
  const fb = document.getElementById('fb');
  const seuil = document.getElementById('seuil');
  const marge = document.getElementById('marge');
  const vCruiseInput = document.getElementById('vCruise');
  const mode = document.getElementById('mode');
  const labels = document.getElementById('labels');
  const all = document.getElementById('all');
  const refSelect = document.getElementById('refSelect');
  const rangeKm = document.getElementById('rangeKm');
  const applyWind = document.getElementById('applyWind');
  const filter4Letters = document.getElementById("filter4Letters");

  // Map init
  const map = L.map('map', { preferCanvas: true, tap: true }).setView([43.8, 0.1], 9);
  window._glide_map = map;

  // Airfield icon
  const airfieldIcon = L.icon({
    iconUrl: 'icons/airfield-runway.svg',
    iconRetinaUrl: 'icons/airfield-runway@2x.svg',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
    className: 'airfield-marker'
  });

  function addAirfieldMarker(lat, lon, id, showLabel) {
    const m = L.marker([lat, lon], { icon: airfieldIcon, title: id });
    m.addTo(map);
    if (showLabel) m.bindTooltip(id, { permanent: true, direction: 'top', className: 'terrain-label' }).openTooltip();
    objs.push(m);
    return m;
  }

  // Layers
  const API_KEY = "e21af8d83997e96b1f6e68551e8c2a78";
  const osmLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
  const openAIPLayer = L.tileLayer(`https://api.tiles.openaip.net/api/data/openaip/{z}/{x}/{y}.png?apiKey=${API_KEY}`, { maxZoom: 14, opacity: 1 });

  const layerpanel = document.getElementById("layerPanel");
  const btn = document.getElementById("layerToggleBtn");
  const toggleAIP = document.getElementById("toggleAIP");
  const opacityAIP = document.getElementById("opacityAIP");
  const opacityOSM = document.getElementById('opacityOSM');

  if (btn) btn.addEventListener("click", () => { if (!layerpanel) return; layerpanel.style.display = layerpanel.style.display === "none" ? "block" : "none"; });

  try {
    const savedAIP = localStorage.getItem('glide_toggleAIP');
    if (toggleAIP) {
      toggleAIP.checked = (savedAIP === 'true') || false;
      if (toggleAIP.checked) openAIPLayer.addTo(map);
      toggleAIP.addEventListener('change', (e) => {
        const on = e.target.checked;
        try { localStorage.setItem('glide_toggleAIP', String(on)); } catch (err) {}
        if (on) openAIPLayer.addTo(map); else map.removeLayer(openAIPLayer);
      });
    }
  } catch (e) { if (toggleAIP) toggleAIP.checked = false; }

  if (opacityAIP) opacityAIP.addEventListener("input", () => { openAIPLayer.setOpacity(opacityAIP.value / 100); });

  if (opacityOSM) {
    try { const saved = localStorage.getItem('glide_opacity_osm'); if (saved !== null) opacityOSM.value = Math.max(0, Math.min(100, parseInt(saved, 10))); } catch(e){}
    const applyOsmOpacity = (v) => { const val = (typeof v === 'string') ? parseInt(v,10) : v; const opacity = Math.max(0, Math.min(100, val)) / 100; osmLayer.setOpacity(opacity); };
    applyOsmOpacity(opacityOSM.value);
    let osmDebounceTimer = null;
    opacityOSM.addEventListener('input', (e) => { const v = e.target.value; if (osmDebounceTimer) clearTimeout(osmDebounceTimer); osmDebounceTimer = setTimeout(()=>{ applyOsmOpacity(v); try{ localStorage.setItem('glide_opacity_osm', String(v)); }catch(e){} }, 80); });
    opacityOSM.addEventListener('change', (e) => { applyOsmOpacity(e.target.value); try{ localStorage.setItem('glide_opacity_osm', String(e.target.value)); }catch(e){} });
  }

  // disable interactions initially if desired
  if (typeof disableMapInteractions === 'function') disableMapInteractions(map);

  // user position fallback (map center)
  let userPos = { lat: 43.8, lon: 0.1 };
  map.on('moveend', () => { const c = map.getCenter(); userPos = { lat: c.lat, lon: c.lng }; if (typeof update === 'function') update(); });

  // show home screen
  if (typeof goTo === 'function') goTo('homeScreen');

  // Add terrain via click (PREP)
  let pendingClickLatLon = null;
  map.on('click', function (e) {
    const prepVisible = document.getElementById('prepScreen')?.style.display !== 'none';
    if (!prepVisible) return;
    pendingClickLatLon = { lat: e.latlng.lat, lon: e.latlng.lng };
    const modal = document.getElementById('addTerrainModal');
    if (!modal) return;
    modal.style.display = 'flex';
    const nameEl = document.getElementById('newTerrainName');
    const altEl = document.getElementById('newTerrainAlt');
    if (nameEl) nameEl.value = "";
    if (altEl) altEl.value = "";
  });

  document.getElementById('addTerrainCancel')?.addEventListener('click', () => { document.getElementById('addTerrainModal')?.style.display = 'none'; pendingClickLatLon = null; });
  document.getElementById('addTerrainConfirm')?.addEventListener('click', () => {
    const nameEl = document.getElementById('newTerrainName');
    const altEl = document.getElementById('newTerrainAlt');
    const name = nameEl ? nameEl
