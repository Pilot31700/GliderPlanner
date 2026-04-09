// app.js - logique principale (carte, UI, calculs)
// Chargé avec defer depuis index.html

// Helpers pour activer/désactiver interactions Leaflet
function enableMapInteractions(map) {
  try {
    if (!map) return;
    if (map.dragging && map.dragging.enable) map.dragging.enable();
    if (map.scrollWheelZoom && map.scrollWheelZoom.enable) map.scrollWheelZoom.enable();
    if (map.touchZoom && map.touchZoom.enable) map.touchZoom.enable();
    if (map.doubleClickZoom && map.doubleClickZoom.enable) map.doubleClickZoom.enable();
    if (map.boxZoom && map.boxZoom.enable) map.boxZoom.enable();
    if (map.keyboard && map.keyboard.enable) map.keyboard.enable();
    if (map.tap && map.tap.enable) map.tap.enable();
    const el = map.getContainer ? map.getContainer() : document.getElementById('map');
    if (el) {
      el.style.pointerEvents = 'auto';
      el.style.touchAction = 'pan-x pan-y pinch-zoom';
    }
  } catch (e) { console.warn('enableMapInteractions', e); }
}

function disableMapInteractions(map) {
  try {
    if (!map) return;
    if (map.dragging && map.dragging.disable) map.dragging.disable();
    if (map.scrollWheelZoom && map.scrollWheelZoom.disable) map.scrollWheelZoom.disable();
    if (map.touchZoom && map.touchZoom.disable) map.touchZoom.disable();
    if (map.doubleClickZoom && map.doubleClickZoom.disable) map.doubleClickZoom.disable();
    if (map.boxZoom && map.boxZoom.disable) map.boxZoom.disable();
    if (map.keyboard && map.keyboard.disable) map.keyboard.disable();
    if (map.tap && map.tap.disable) map.tap.disable();
    const el = map.getContainer ? map.getContainer() : document.getElementById('map');
    if (el) {
      el.style.pointerEvents = 'none';
      el.style.touchAction = 'none';
    }
  } catch (e) { console.warn('disableMapInteractions', e); }
}

// Navigation et état des écrans
function goTo(screenId){
  const screens = ['homeScreen','prepScreen','volScreen','manuelScreen'];
  const mapEl = document.getElementById('map');

  screens.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === screenId) {
      el.style.display = (id === 'homeScreen') ? 'flex' : 'block';
      el.removeAttribute('aria-hidden');
    } else {
      el.style.display = 'none';
      el.setAttribute('aria-hidden','true');
    }
  });

  if (!mapEl) return;

  if (screenId === 'prepScreen' || screenId === 'volScreen') {
    mapEl.classList.remove('map-blurred');
    mapEl.classList.add('map-absolute');
    const prep = document.getElementById('prepScreen');
    if (prep) prep.style.pointerEvents = 'none';
    enableMapInteractions(window._glide_map);
    setTimeout(()=> window._glide_map.invalidateSize(), 120);
  } else {
    mapEl.classList.add('map-blurred');
    mapEl.classList.remove('map-absolute');
    const prep = document.getElementById('prepScreen');
    if (prep) prep.style.pointerEvents = 'auto';
    disableMapInteractions(window._glide_map);
  }
}

// DOM ready
document.addEventListener('DOMContentLoaded', function(){
  // navigation buttons
  const btnGoPrep = document.getElementById('btnGoPrep');
  const btnGoVol = document.getElementById('btnGoVol');
  const btnGoManuel = document.getElementById('btnGoManuel');
  const backFromPrep = document.getElementById('backFromPrep');
  const backFromVol = document.getElementById('backFromVol');
  const backFromManuel = document.getElementById('backFromManuel');

  if(btnGoPrep) btnGoPrep.addEventListener('click', (e) => { e.preventDefault(); goTo('prepScreen'); });
  if(btnGoVol) btnGoVol.addEventListener('click', (e) => { e.preventDefault(); goTo('volScreen'); });
  if(btnGoManuel) btnGoManuel.addEventListener('click', (e) => { e.preventDefault(); goTo('manuelScreen'); });

  if(backFromPrep) backFromPrep.addEventListener('click', (e) => { e.preventDefault(); goTo('homeScreen'); });
  if(backFromVol) backFromVol.addEventListener('click', (e) => { e.preventDefault(); goTo('homeScreen'); });
  if(backFromManuel) backFromManuel.addEventListener('click', (e) => { e.preventDefault(); goTo('homeScreen'); });

  // initialize map and app logic
  initApp();
});

// Main app init
function initApp(){
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

  // map
  const map = L.map('map', { preferCanvas: true, tap: true }).setView([43.8, 0.1], 9);
  window._glide_map = map;
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  disableMapInteractions(map);

  // terrains
  let terrainsAll = [
    { id: "LFDA", lat: 43.709, lon: -0.249, alt: 80 },
    { id: "LFID", lat: 43.955, lon: 0.373, alt: 130 },
    { id: "LFCN", lat: 43.762, lon: -0.036, alt: 100 },
    { id: "LFDH", lat: 43.646, lon: 0.601, alt: 130 },
    { id: "LFBM", lat: 43.911, lon: -0.507, alt: 52 },
    { id: "LFCL", lat: 43.586, lon: 1.499, alt: 152 }
  ];
  let terrains = [];

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
  populateRef();

  function color(h) {
    const r = Math.round(255 * (1 - (h / 3000)));
    const g = Math.round(255 * (h / 3000));
    return "rgb(" + r + "," + g + ",0)";
  }

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

      const sliderEl = block.querySelector(`#${w.v}`);
      const label = block.querySelector(`#${w.v}_label`);
      if (sliderEl && label) sliderEl.addEventListener('input', () => { label.innerText = sliderEl.value + ' km/h'; });
    });
  }
  initWindMenu();

  function getWindForLayer(idx) {
    const layer = windLayers[Math.max(0, Math.min(windLayers.length - 1, idx))];
    const vEl = document.getElementById(layer.v);
    const dEl = document.getElementById(layer.d);
    const v = vEl ? parseFloat(vEl.value) : 0;
    const d = dEl ? parseFloat(dEl.value) : 0;
    return { v: isNaN(v) ? 0 : v, d: isNaN(d) ? 0 : d };
  }

  // distance util
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

  // state
  let userPos = { lat: 43.8, lon: 0.1 };
  map.on('moveend', () => {
    const c = map.getCenter();
    userPos = { lat: c.lat, lon: c.lng };
    update();
  });

  let objs = [];
  function clearObjs() {
    objs.forEach(o => map.removeLayer(o));
    objs = [];
  }

  function update() {
    clearObjs();

    const range = (rangeKm && rangeKm.value) ? parseFloat(rangeKm.value) : 100;
    terrains = terrainsAll.filter(t => distanceKm(userPos, t) <= range);

    const h = (slider && slider.value) ? parseInt(slider.value, 10) : 0;
    if (hVal) hVal.innerText = h;

    const f = (finesse && finesse.value) ? parseFloat(finesse.value) : 30;
    const fbVal = (fb && fb.value) ? parseFloat(fb.value) : 10;
    const seuilVal = (seuil && seuil.value) ? parseFloat(seuil.value) : 500;
    const margeVal = (marge && marge.value) ? parseFloat(marge.value) : 250;
    const vCruise = (vCruiseInput && vCruiseInput.value) ? parseFloat(vCruiseInput.value) : 100;
    const modeVal = (mode && mode.value) ? mode.value : 'QFE';
    const showLabels = (labels && labels.checked) ? true : false;
    const allVal = (all && all.checked) ? true : false;
    const useWind = (applyWind && applyWind.checked) ? true : false;

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

        const d = h_util * finesseUse; // portée sans vent (m)

        if (!useWind) {
          const circle = L.circle([t.lat, t.lon], { radius: d, color: color(hh), weight: 2, fill: false }).addTo(map);
          objs.push(circle);

          if (showLabels) {
            [0, 180].forEach(a => {
              const rad = a * Math.PI / 180;
              const latOff = (d / 111000) * Math.cos(rad);
              const lonOff = (d / (111000 * Math.cos(t.lat * Math.PI / 180))) * Math.sin(rad);
              objs.push(L.marker([t.lat + latOff, t.lon + lonOff], {
                icon: L.divIcon({ className: 'label', html: hh + "m-F" + Math.round(finesseUse) + "-" + t.id })
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
                icon: L.divIcon({ className: 'label', html: hh + "m-F" + Math.round(finesseUse) + "-" + t.id })
              }).addTo(map));
            });
          }
        }
      }
      objs.push(L.marker([t.lat, t.lon]).addTo(map));
    });
  }

  // initial update
  update();

  // add terrain on map click
  map.on('click', function (e) {
    const nom = prompt("Nom terrain ?");
    if (!nom) return;
    const altStr = prompt("Altitude m ?");
    const alt = parseFloat(altStr);
    if (isNaN(alt)) return;
    terrainsAll.push({ id: nom, lat: e.latlng.lat, lon: e.latlng.lng, alt: alt });
    populateRef();
    update();
  });

  // UI events
  if (slider) slider.addEventListener('input', () => { if (hVal) hVal.innerText = slider.value; update(); });
  if (btnRecalc) btnRecalc.addEventListener('click', (e) => { e.preventDefault(); update(); });
  if (btnRecalcWind) btnRecalcWind.addEventListener('click', (e) => { e.preventDefault(); update(); });

  [
    finesse, fb, seuil, marge, vCruiseInput, mode, labels, all, rangeKm, refSelect, applyWind
  ].forEach(el => {
    if (!el) return;
    el.addEventListener('change', update);
  });

  // toggle panels
  if (btnPanel) btnPanel.addEventListener('click', () => {
    if (!panel) return;
    panel.style.display = (panel.style.display === 'none' || panel.style.display === '') ? 'block' : 'none';
  });
  if (btnVent) btnVent.addEventListener('click', () => {
    if (!menuVent) return;
    menuVent.style.display = (menuVent.style.display === 'none' || menuVent.style.display === '') ? 'block' : 'none';
  });

  // draggable panels
  function makeDraggable(el) {
    if (!el) return;
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

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
      let left = e.clientX - offsetX;
      let top = e.clientY - offsetY;
      left = Math.max(0, Math.min(window.innerWidth - el.offsetWidth, left));
      top = Math.max(0, Math.min(window.innerHeight - el.offsetHeight, top));
      el.style.left = left + 'px';
      el.style.top = top + 'px';
    });

    el.addEventListener('pointerup', function (e) {
      if (!dragging) return;
      dragging = false;
      try { el.releasePointerCapture(e.pointerId); } catch (err) {}
      el.style.cursor = 'default';
    });

    el.addEventListener('pointercancel', function () {
      dragging = false;
      el.style.cursor = 'default';
    });
  }

  makeDraggable(panel);
  makeDraggable(menuVent);

  // init wind labels
  windLayers.forEach(w => {
    const s = document.getElementById(w.v);
    const lbl = document.getElementById(w.v + '_label');
    if (s && lbl) lbl.innerText = s.value + ' km/h';
  });

  // expose for debug
  window._glide_update = update;
  window._glide_map = map;
}
