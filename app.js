/****************************************************
 *  Glide Planner – APP.JS (Version B optimisée)
 *  Structure :
 *   1. Navigation & interactions globales
 *   2. Helpers (enable/disable map, goTo)
 *   3. DOMContentLoaded → initialisation complète
 *   4. Carte Leaflet
 *   5. Terrains (JSON)
 *   6. Vent
 *   7. Calculs & update()
 *   8. UI events
 *   9. Draggable panels
 ****************************************************/


/* ============================================================
   1. HELPERS – Enable / Disable map interactions
   ============================================================ */
function enableMapInteractions(map) {
  try {
    if (!map) return;
    if (map.dragging?.enable) map.dragging.enable();
    if (map.scrollWheelZoom?.enable) map.scrollWheelZoom.enable();
    if (map.touchZoom?.enable) map.touchZoom.enable();
    if (map.doubleClickZoom?.enable) map.doubleClickZoom.enable();
    if (map.boxZoom?.enable) map.boxZoom.enable();
    if (map.keyboard?.enable) map.keyboard.enable();
    if (map.tap?.enable) map.tap.enable();

    const el = map.getContainer();
    if (el) {
      el.style.pointerEvents = 'auto';
      el.style.touchAction = 'pan-x pan-y pinch-zoom';
    }
  } catch (e) { console.warn('enableMapInteractions', e); }
}

function disableMapInteractions(map) {
  try {
    if (!map) return;
    if (map.dragging?.disable) map.dragging.disable();
    if (map.scrollWheelZoom?.disable) map.scrollWheelZoom.disable();
    if (map.touchZoom?.disable) map.touchZoom.disable();
    if (map.doubleClickZoom?.disable) map.doubleClickZoom.disable();
    if (map.boxZoom?.disable) map.boxZoom.disable();
    if (map.keyboard?.disable) map.keyboard.disable();
    if (map.tap?.disable) map.tap.disable();

    const el = map.getContainer();
    if (el) {
      el.style.pointerEvents = 'none';
      el.style.touchAction = 'none';
    }
  } catch (e) { console.warn('disableMapInteractions', e); }
}


/* ============================================================
   2. NAVIGATION – goTo()
   ============================================================ */
function goTo(screenId) {
  const screens = ['homeScreen', 'prepScreen', 'volScreen', 'manuelScreen'];
  const mapEl = document.getElementById('map');

  screens.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === screenId) {
      el.style.display = (id === 'homeScreen') ? 'flex' : 'block';
      el.removeAttribute('aria-hidden');
    } else {
      el.style.display = 'none';
      el.setAttribute('aria-hidden', 'true');
    }
  });

  if (!mapEl) return;

  if (screenId === 'prepScreen' || screenId === 'volScreen') {
    mapEl.classList.remove('map-blurred');
    mapEl.classList.add('map-absolute');

    const prep = document.getElementById('prepScreen');
    if (prep) prep.style.pointerEvents = 'none';

    enableMapInteractions(window._glide_map);
    setTimeout(() => window._glide_map.invalidateSize(), 120);

  } else {
    mapEl.classList.add('map-blurred');
    mapEl.classList.remove('map-absolute');

    const prep = document.getElementById('prepScreen');
    if (prep) prep.style.pointerEvents = 'auto';

    disableMapInteractions(window._glide_map);
  }
}


/* ============================================================
   3. DOMContentLoaded – INITIALISATION GLOBALE
   ============================================================ */
document.addEventListener('DOMContentLoaded', function () {

  /* ------------------------------
     3.1 Navigation buttons
     ------------------------------ */
  const btnGoPrep = document.getElementById('btnGoPrep');
  const btnGoVol = document.getElementById('btnGoVol');
  const btnGoManuel = document.getElementById('btnGoManuel');
  const backFromPrep = document.getElementById('backFromPrep');
  const backFromVol = document.getElementById('backFromVol');
  const backFromManuel = document.getElementById('backFromManuel');

  btnGoPrep?.addEventListener('click', e => { e.preventDefault(); goTo('prepScreen'); });
  btnGoVol?.addEventListener('click', e => { e.preventDefault(); goTo('volScreen'); });
  btnGoManuel?.addEventListener('click', e => { e.preventDefault(); goTo('manuelScreen'); });

  backFromPrep?.addEventListener('click', e => { e.preventDefault(); goTo('homeScreen'); });
  backFromVol?.addEventListener('click', e => { e.preventDefault(); goTo('homeScreen'); });
  backFromManuel?.addEventListener('click', e => { e.preventDefault(); goTo('homeScreen'); });

  goTo('homeScreen'); // default


  /* ============================================================
     4. MAP INITIALISATION
     ============================================================ */
  const map = L.map('map', { preferCanvas: true, tap: true }).setView([43.8, 0.1], 9);
  window._glide_map = map;

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  disableMapInteractions(map);

  let userPos = { lat: 43.8, lon: 0.1 };
  map.on('moveend', () => {
    const c = map.getCenter();
    userPos = { lat: c.lat, lon: c.lng };
    update();
  });


  /* ============================================================
     5. TERRAINS – JSON
     ============================================================ */
  let terrainsAll = [];
  let terrains = [];

  const refSelect = document.getElementById('refSelect');

  function populateRef() {
    if (!refSelect) return;
    refSelect.innerHTML = "";
    terrainsAll.forEach(t => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.innerText = t.id;
      refSelect.appendChild(opt);
    });
  }

  fetch("terrains.json")
    .then(r => r.json())
    .then(data => {
      terrainsAll = data;
      terrains = data;
      populateRef();
      update();
    })
    .catch(err => console.error("Erreur chargement terrains.json :", err));


  /* ============================================================
     6. VENT
     ============================================================ */
  const windLayers = [
    { label: "0-500", v: "v0", d: "d0" },
    { label: "500-1000", v: "v1", d: "d1" },
    { label: "1000-1500", v: "v2", d: "d2" },
    { label: "1500-2000", v: "v3", d: "d3" },
    { label: "2000-2500", v: "v4", d: "d4" },
    { label: "2500-3000", v: "v5", d: "d5" }
  ];

  function initWindMenu() {
    const container = document.getElementById('windControls');
    if (!container) return;

    container.innerHTML = '';

    windLayers.forEach(w => {
      const block = document.createElement('div');
      block.className = 'wind-row';
      block.innerHTML = `
        <div style="min-width:80px;"><b style="font-size:12px;">${w.label} m</b></div>
        <input type="range" id="${w.v}" min="0" max="50" value="0" style="flex:1;">
        <span id="${w.v}_label" style="width:60px;text-align:right;font-size:12px;">0 km/h</span>
        <input type="number" id="${w.d}" value="0" style="width:70px;">
      `;
      container.appendChild(block);

      const slider = block.querySelector(`#${w.v}`);
      const label = block.querySelector(`#${w.v}_label`);
      slider?.addEventListener('input', () => { label.innerText = slider.value + ' km/h'; });
    });
  }
  initWindMenu();

  function getWindForLayer(idx) {
    const layer = windLayers[Math.max(0, Math.min(windLayers.length - 1, idx))];
    const vEl = document.getElementById(layer.v);
    const dEl = document.getElementById(layer.d);
    const v = parseFloat(vEl?.value ?? 0);
    const d = parseFloat(dEl?.value ?? 0);
    return { v: isNaN(v) ? 0 : v, d: isNaN(d) ? 0 : d };
  }


  /* ============================================================
     7. CALCULS – UPDATE()
     ============================================================ */
  const panel = document.getElementById('panel');
  const menuVent = document.getElementById('menuVent');

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
  const rangeKm = document.getElementById('rangeKm');
  const applyWind = document.getElementById('applyWind');

  let objs = [];

  function clearObjs() {
    objs.forEach(o => map.removeLayer(o));
    objs = [];
  }

  function distanceKm(a, b) {
    const R = 6371;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLon = (b.lon - a.lon) * Math.PI / 180;
    const x = Math.sin(dLat / 2) ** 2 +
      Math.cos(a.lat * Math.PI / 180) *
      Math.cos(b.lat * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  function color(h) {
    const r = Math.round(255 * (1 - (h / 3000)));
    const g = Math.round(255 * (h / 3000));
    return `rgb(${r},${g},0)`;
  }

  function update() {
    clearObjs();

    const range = parseFloat(rangeKm?.value ?? 100);
    terrains = terrainsAll.filter(t => distanceKm(userPos, t) <= range);

    const h = parseInt(slider?.value ?? 0, 10);
    if (hVal) hVal.innerText = h;

    const f = parseFloat(finesse?.value ?? 30);
    const fbVal = parseFloat(fb?.value ?? 10);
    const seuilVal = parseFloat(seuil?.value ?? 500);
    const margeVal = parseFloat(marge?.value ?? 250);
    const vCruise = parseFloat(vCruiseInput?.value ?? 100);
    const modeVal = mode?.value ?? 'QFE';
    const showLabels = labels?.checked ?? false;
    const allVal = all?.checked ?? false;
    const useWind = applyWind?.checked ?? false;

    const ref = terrainsAll.find(t => refSelect && t.id === refSelect.value);
    const refAlt = ref ? ref.alt : 0;

    terrains.forEach(t => {
      const hMin = allVal ? 0 : h;
      const hMax = allVal ? 3000 : h;

      for (let hh = hMin; hh <= hMax; hh += 100) {
        let h_rel;
        if (modeVal === "QFE") h_rel = hh;
        else if (modeVal === "QNH") h_rel = hh - t.alt;
        else h_rel = hh - (t.alt - refAlt);

        if (h_rel <= 0) continue;

        const finesseUse = (h_rel <= seuilVal) ? fbVal : f;
        const h_util = h_rel - margeVal;
        if (h_util <= 0) continue;

        const d = h_util * finesseUse;

        if (!useWind) {
          const circle = L.circle([t.lat, t.lon], { radius: d, color: color(hh), weight: 2, fill: false }).addTo(map);
          objs.push(circle);

          if (showLabels) {
            [0, 180].forEach(a => {
              const rad = a * Math.PI / 180;
              const latOff = (d / 111000) * Math.cos(rad);
              const lonOff = (d / (111000 * Math.cos(t.lat * Math.PI / 180))) * Math.sin(rad);
              objs.push(L.marker([t.lat + latOff, t.lon + lonOff], {
                icon: L.divIcon({ className: 'label', html: `${hh}m-F${Math.round(finesseUse)}-${t.id}` })
              }).addTo(map));
            });
          }

        } else {
          const polyPts = [];
          const step = 6;

          for (let a = 0; a < 360; a += step) {
            const alphaRad = a * Math.PI / 180;

            let layerIdx = Math.floor(hh / 500);
            if (layerIdx > windLayers.length - 1) layerIdx = windLayers.length - 1;

            const wind = getWindForLayer(layerIdx);
            const W = wind.v;
            const dir = wind.d;
            const dirRad = (dir + 180) * Math.PI / 180;

            const projWind = W * Math.cos(alphaRad - dirRad);

            let denom = vCruise - projWind;
            if (denom < 5) denom = 5;

            const effDist = d * (vCruise / denom);

            const latOff = (effDist / 111000) * Math.cos(alphaRad);
            const lonOff = (effDist / (111000 * Math.cos(t.lat * Math.PI / 180))) * Math.sin(alphaRad);

            polyPts.push([t.lat + latOff, t.lon + lonOff]);
          }

          const poly = L.polygon(polyPts, { color: color(hh), weight: 2, fill: false }).addTo(map);
          objs.push(poly);

          if (showLabels) {
            [0, 180].forEach(a => {
              const rad = a * Math.PI / 180;
              const latOff = (d / 111000) * Math.cos(rad);
              const lonOff = (d / (111000 * Math.cos(t.lat * Math.PI / 180))) * Math.sin(rad);
              objs.push(L.marker([t.lat + latOff, t.lon + lonOff], {
                icon: L.divIcon({ className: 'label', html: `${hh}m-F${Math.round(finesseUse)}-${t.id}` })
              }).addTo(map));
            });
          }
        }
      }

      objs.push(L.marker([t.lat, t.lon]).addTo(map));
    });
  }

  update();


  /* ============================================================
     8. UI EVENTS
     ============================================================ */
  const btnPanel = document.getElementById('btnPanel');
  const btnVent = document.getElementById('btnVent');
  const btnRecalc = document.getElementById('btnRecalc');
  const btnRecalcWind = document.getElementById('btnRecalcWind');

  slider?.addEventListener('input', () => { hVal.innerText = slider.value; update(); });
  btnRecalc?.addEventListener('click', e => { e.preventDefault(); update(); });
  btnRecalcWind?.addEventListener('click', e => { e.preventDefault(); update(); });

  [
    finesse, fb, seuil, marge, vCruiseInput,
    mode, labels, all, rangeKm, refSelect, applyWind
  ].forEach(el => el?.addEventListener('change', update));

  btnPanel?.addEventListener('click', () => {
    panel.style.display = (panel.style.display === 'none' || panel.style.display === '') ? 'block' : 'none';
  });

  btnVent?.addEventListener('click', () => {
    menuVent.style.display = (menuVent.style.display === 'none' || menuVent.style.display === '') ? 'block' : 'none';
  });


  /* ============================================================
     9. DRAGGABLE PANELS
     ============================================================ */
  function makeDraggable(el) {
    if (!el) return;
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    function isFormControl(target) {
      return !!target.closest('input, select, textarea, button, label, [role="slider"], .no-drag');
    }

    el.addEventListener('pointerdown', e => {
      if (e.button && e.button !== 0) return;
      if (isFormControl(e.target)) return;

      dragging = true;
      try { el.setPointerCapture(e.pointerId); } catch (err) {}
      offsetX = e.clientX - el.offsetLeft;
      offsetY = e.clientY - el.offsetTop;
      el.style.cursor = 'grabbing';
      e.preventDefault();
    });

    el.add
