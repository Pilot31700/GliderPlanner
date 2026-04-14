/****************************************************
 *  Glide Planner – app.js (réécriture complète)
 *
 *  Changements appliqués :
 *  - Aucun accès GPS en mode PREP ; GPS demandé et utilisé uniquement en VOL
 *  - Cercle bleu (planeur) affiché uniquement en VOL
 *  - Suppression des "cercles fixes" indésirables
 *  - Cercles de calcul (finesse / vent) conservés en PREP
 *  - Étiquette réduite à l'ICAO (t.id) uniquement
 *  - Icône piste stylisée pour tous les terrains
 *  - Slider opacité OSM + toggle OpenAIP (décoché par défaut)
 *  - loadManuel sécurisé (n'injecte que le fragment utile)
 *  - Définitions et guards pour éviter ReferenceError (makeDraggable, etc.)
 *
 *  Remplace entièrement ton app.js par ce fichier.
 ****************************************************/

/* Globals */
let _volInitialized = false;
let terrainsAll = [];
let terrains = [];
let filterOnly4Letters = false;
let objs = []; // calques dynamiques (PREP)
let volObjects = []; // calques spécifiques au mode VOL
let volGpsWatchId = null;
let volAutoCenter = true;

/* -------------------------
   Helpers : activer / désactiver interactions carte
   ------------------------- */
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

/* -------------------------
   Draggable helper (défini tôt pour éviter ReferenceError)
   ------------------------- */
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

/* -------------------------
   Navigation entre écrans
   ------------------------- */
function goTo(screenId){
  const screens = ['homeScreen','prepScreen','volScreen','manuelScreen'];
  const mapEl = document.getElementById('map');
  const btnCarte = document.getElementById('layerToggleBtn');

  if (btnCarte) {
    btnCarte.style.display = (screenId === 'homeScreen' || screenId === 'manuelScreen') ? 'none' : 'block';
  }

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

  const map = window._glide_map || null;

  // afficher/masquer volRadiusDisplay
  const volRadiusEl = document.getElementById('volRadiusDisplay');
  if (volRadiusEl) volRadiusEl.style.display = (screenId === 'volScreen') ? 'block' : 'none';

  // comportement interactions carte
  if (screenId === 'prepScreen' || screenId === 'volScreen') {
    mapEl?.classList.remove('map-blurred');
    mapEl?.classList.add('map-absolute');
    const prep = document.getElementById('prepScreen');
    if (prep) prep.style.pointerEvents = 'none';
    if (map) {
      enableMapInteractions(map);
      setTimeout(()=> map.invalidateSize(), 120);
    }
  } else {
    mapEl?.classList.add('map-blurred');
    mapEl?.classList.remove('map-absolute');
    const prep = document.getElementById('prepScreen');
    if (prep) prep.style.pointerEvents = 'auto';
    if (map) disableMapInteractions(map);
  }

  // lifecycle mode VOL : démarrer/arrêter GPS et nettoyer objets vol
  if (screenId === 'volScreen') {
    try { initVolMode(); } catch (e) { console.warn('initVolMode error', e); }
    try { startVolGps(); } catch (e) { console.warn('startVolGps error', e); }
  } else {
    // quitter VOL : arrêter GPS et nettoyer objets vol
    try {
      if (typeof volGpsWatchId === 'number' && volGpsWatchId !== null) {
        navigator.geolocation.clearWatch(volGpsWatchId);
        volGpsWatchId = null;
      }
    } catch (e) { /* ignore */ }
    try { clearVolObjects(); } catch (e) { /* ignore */ }
  }
}

/* -------------------------
   DOMContentLoaded – initialisation
   ------------------------- */
document.addEventListener('DOMContentLoaded', function () {

  /* NAVIGATION BUTTONS */
  const btnGoPrep = document.getElementById('btnGoPrep');
  const btnGoVol = document.getElementById('btnGoVol');
  const btnGoManuel = document.getElementById('btnGoManuel');
  const backFromPrep = document.getElementById('backFromPrep');
  const backFromVol = document.getElementById('backFromVol');
  const backFromManuel = document.getElementById('backFromManuel');
  const filter4Letters = document.getElementById("filter4Letters");

  if (filter4Letters) {
    filter4Letters.addEventListener("change", () => {
      filterOnly4Letters = filter4Letters.checked;
      update();
    });
  }
  if(btnGoPrep) btnGoPrep.addEventListener('click', (e) => { e.preventDefault(); goTo('prepScreen'); });
  if(btnGoVol) btnGoVol.addEventListener('click', (e) => { e.preventDefault(); goTo('volScreen'); });
  if(btnGoManuel) btnGoManuel.addEventListener('click', (e) => { e.preventDefault(); goTo('manuelScreen'); });

  if(backFromPrep) backFromPrep.addEventListener('click', (e) => { e.preventDefault(); goTo('homeScreen'); });
  if(backFromVol) backFromVol.addEventListener('click', (e) => { e.preventDefault(); goTo('homeScreen'); });
  if(backFromManuel) backFromManuel.addEventListener('click', (e) => { e.preventDefault(); goTo('homeScreen'); });

  /* DOM ELEMENTS */
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

  /* MAP init */
  const map = L.map('map', { preferCanvas: true, tap: true }).setView([43.8, 0.1], 9);
  window._glide_map = map;

  /* Icône piste stylisée (réutiliser pour tous les marqueurs) */
  const airfieldIcon = L.icon({
    iconUrl: 'icons/airfield-runway.svg',
    iconRetinaUrl: 'icons/airfield-runway@2x.svg', // optionnel
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
    className: 'airfield-marker'
  });

  /* Helper utilitaire pour ajouter un marqueur terrain */
  function addAirfieldMarker(lat, lon, id, showLabel) {
    const m = L.marker([lat, lon], { icon: airfieldIcon, title: id });
    m.addTo(map);
    if (showLabel) {
      m.bindTooltip(id, { permanent: true, direction: 'top', className: 'terrain-label' }).openTooltip();
    }
    objs.push(m);
    return m;
  }

  /* --- LAYERS --- */
  const API_KEY = "e21af8d83997e96b1f6e68551e8c2a78";

  const osmLayer = L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    { maxZoom: 19, attribution: "© OpenStreetMap" }
  ).addTo(map);

  const openAIPLayer = L.tileLayer(
    `https://api.tiles.openaip.net/api/data/openaip/{z}/{x}/{y}.png?apiKey=${API_KEY}`,
    { maxZoom: 14, opacity: 1 }
  );

  /* Layer panel elements */
  const layerpanel = document.getElementById("layerPanel");
  const btn = document.getElementById("layerToggleBtn");
  const toggleAIP = document.getElementById("toggleAIP");
  const opacityAIP = document.getElementById("opacityAIP");
  const opacityOSM = document.getElementById('opacityOSM');

  /* Ouvrir / fermer panneau */
  if (btn) {
    btn.addEventListener("click", () => {
      if (!layerpanel) return;
      layerpanel.style.display = layerpanel.style.display === "none" ? "block" : "none";
    });
  }

  /* toggleAIP : restaurer préférence ou forcer décoché par défaut */
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
  } catch (e) {
    if (toggleAIP) toggleAIP.checked = false;
  }

  /* opacityAIP control */
  if (opacityAIP) {
    opacityAIP.addEventListener("input", () => {
      const value = opacityAIP.value / 100;
      openAIPLayer.setOpacity(value);
    });
  }

  /* opacityOSM control (nouveau slider) */
  if (opacityOSM) {
    try {
      const saved = localStorage.getItem('glide_opacity_osm');
      if (saved !== null) opacityOSM.value = Math.max(0, Math.min(100, parseInt(saved, 10)));
    } catch (e) {}
    const applyOsmOpacity = (v) => {
      const val = (typeof v === 'string') ? parseInt(v, 10) : v;
      const opacity = Math.max(0, Math.min(100, val)) / 100;
      if (osmLayer && osmLayer.setOpacity) osmLayer.setOpacity(opacity);
    };
    applyOsmOpacity(opacityOSM.value);
    let osmDebounceTimer = null;
    opacityOSM.addEventListener('input', (e) => {
      const v = e.target.value;
      if (osmDebounceTimer) clearTimeout(osmDebounceTimer);
      osmDebounceTimer = setTimeout(() => {
        applyOsmOpacity(v);
        try { localStorage.setItem('glide_opacity_osm', String(v)); } catch(e){}
      }, 80);
    });
    opacityOSM.addEventListener('change', (e) => {
      applyOsmOpacity(e.target.value);
      try { localStorage.setItem('glide_opacity_osm', String(e.target.value)); } catch(e){}
    });
  }

  /* Désactiver interactions si nécessaire */
  if (typeof disableMapInteractions === 'function') {
    disableMapInteractions(map);
  }

  /* position utilisateur (on utilise le centre de la carte comme fallback) */
  let userPos = { lat: 43.8, lon: 0.1 };
  map.on('moveend', () => {
    const c = map.getCenter();
    userPos = { lat: c.lat, lon: c.lng };
    if (typeof update === 'function') update();
  });

  /* Afficher l'écran d'accueil */
  if (typeof goTo === 'function') goTo('homeScreen');

  /* Ajout terrain via clic (mode PREP) */
  let pendingClickLatLon = null;
  map.on('click', function(e) {
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

  const addTerrainCancel = document.getElementById('addTerrainCancel');
  const addTerrainConfirm = document.getElementById('addTerrainConfirm');
  if (addTerrainCancel) addTerrainCancel.addEventListener('click', () => {
    const modal = document.getElementById('addTerrainModal');
    if (modal) modal.style.display = 'none';
    pendingClickLatLon = null;
  });

  if (addTerrainConfirm) addTerrainConfirm.addEventListener('click', () => {
    const nameEl = document.getElementById('newTerrainName');
    const altEl = document.getElementById('newTerrainAlt');
    const name = nameEl ? nameEl.value.trim() : '';
    const alt = altEl ? parseFloat(altEl.value) : NaN;
    if (!name) { alert("Nom invalide"); return; }
    if (isNaN(alt)) { alert("Altitude invalide"); return; }
    const id = name.toUpperCase().replace(/[^A-Z0-9]/g, "_");
    const newTerrain = { id: id, lat: pendingClickLatLon.lat, lon: pendingClickLatLon.lon, alt: alt };
    terrainsAll.push(newTerrain);
    if (refSelect) {
      const opt = document.createElement("option");
      opt.value = id; opt.innerText = id; refSelect.appendChild(opt);
    }
    // Marqueur visuel : utiliser airfieldIcon et ajouter à objs pour nettoyage futur
    const newMarker = L.marker([newTerrain.lat, newTerrain.lon], { icon: airfieldIcon, title: newTerrain.id });
    newMarker.addTo(map);
    objs.push(newMarker);
    update();
    const modal = document.getElementById('addTerrainModal');
    if (modal) modal.style.display = 'none';
    pendingClickLatLon = null;
  });

  /* TERRAINS JSON */
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
      // initVolMode sera appelé plus tard si nécessaire (goTo('volScreen') l'appelle aussi)
      initVolMode();
    })
    .catch(err => console.error("Erreur chargement terrains.json :", err));

  /* VENT */
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

  /* =========================
     UPDATE : calculs et rendu (PREP)
     - dessine uniquement les cercles/polygones de calcul
     - pas de cercles fixes indésirables
     - un seul marqueur par terrain, label = ICAO si demandé
     ========================= */
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
    terrains = terrainsAll.filter(t => {
      if (filterOnly4Letters && !/^[A-Z]{4}$/.test(t.id)) return false;
      return distanceKm(userPos, t) <= range;
    });

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

        const d = h_util * finesseUse; // distance en mètres

        if (!useWind) {
          // Cercle de calcul (finesse) — affiché en PREP
          const circle = L.circle([t.lat, t.lon], {
            radius: d,
            color: color(hh),
            weight: 2,
            fill: false
          }).addTo(map);
          objs.push(circle);
        } else {
          // Mode vent : polygone approximatif
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
        }
      } // fin boucle hh

      // Un seul marqueur par terrain, étiquette = ICAO si demandé
      addAirfieldMarker(t.lat, t.lon, t.id, showLabels ? t.id : null);
    }); // fin terrains.forEach
  } // fin update

  update();

  /* UI EVENTS */
  slider && slider.addEventListener('input', () => { if (hVal) hVal.innerText = slider.value; update(); });
  btnRecalc && btnRecalc.addEventListener('click', (e) => { e.preventDefault(); update(); });
  btnRecalcWind && btnRecalcWind.addEventListener('click', (e) => { e.preventDefault(); update(); });

  [
    finesse, fb, seuil, marge, vCruiseInput,
    mode, labels, all, rangeKm, refSelect, applyWind
  ].forEach(el => {
    if (!el) return;
    el.addEventListener('change', update);
  });

  btnPanel && btnPanel.addEventListener('click', () => {
    if (!panel) return;
    panel.style.display = (panel.style.display === 'none' || panel.style.display === '') ? 'block' : 'none';
  });

  btnVent && btnVent.addEventListener('click', () => {
    if (!menuVent) return;
    menuVent.style.display = (menuVent.style.display === 'none' || menuVent.style.display === '') ? 'block' : 'none';
  });

  makeDraggable(panel);
  makeDraggable(menuVent);

  /* loadManuel sécurisé */
  function loadManuel() {
    fetch('manuel.html')
      .then(response => {
        if (!response.ok) throw new Error('manuel.html non trouvé');
        return response.text();
      })
      .then(html => {
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        const fragment = tmp.querySelector('.manual-reader') || tmp.querySelector('#manuelCard') || tmp;
        const container = document.getElementById('manuelCard');
        if (!container) return;
        container.innerHTML = fragment.innerHTML || fragment.textContent || '';

        const scripts = fragment.querySelectorAll('script');
        scripts.forEach(oldScript => {
          const s = document.createElement('script');
          if (oldScript.src) {
            s.src = oldScript.src;
            s.async = false;
            document.body.appendChild(s);
          } else {
            s.textContent = oldScript.textContent;
            document.body.appendChild(s);
          }
          setTimeout(() => { try { s.remove(); } catch(e){} }, 2000);
        });
      })
      .catch(err => {
        console.error('Erreur chargement manuel:', err);
      });
  }

  loadManuel();

  /* init wind labels */
  windLayers.forEach(w => {
    const s = document.getElementById(w.v);
    const lbl = document.getElementById(w.v + '_label');
    if (s && lbl) lbl.innerText = s.value + ' km/h';
  });

  /* expose update and map for debugging */
  window._glide_update = update;
  window._glide_map = map;
}); // fin DOMContentLoaded

/* ============================================================
   MODE VOL – module
   - GPS watch started only when entering VOL (startVolGps called from goTo)
   - plane circle drawn only in VOL
   ============================================================ */

function initVolMode() {
  if (_volInitialized) return;
  _volInitialized = true;

  if (typeof terrainsAll === 'undefined' || !Array.isArray(terrainsAll)) {
    console.warn('initVolMode: terrainsAll non disponible, initialisation différée.');
    return;
  }

  const btnVolMenu = document.getElementById('btnVolMenu');
  const volPanel = document.getElementById('volPanel');
  const volFinesse = document.getElementById('volFinesse');
  const volFb = document.getElementById('volFb');
  const volSeuil = document.getElementById('volSeuil');
  const volMarge = document.getElementById('volMarge');
  const volAltMode = document.getElementById('volAltMode');
  const volRefSelect = document.getElementById('volRefSelect');
  const volGpsEnabled = document.getElementById('volGpsEnabled');
  const volAltManual = document.getElementById('volAltManual');
  const btnRecenter = document.getElementById('btnRecenter');

  if (!btnVolMenu || !volPanel) {
    console.warn('initVolMode: éléments DOM du Mode VOL manquants.');
    return;
  }

  if (volRefSelect && terrainsAll.length && volRefSelect.children.length === 0) {
    terrainsAll.forEach(t => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.innerText = t.id;
      volRefSelect.appendChild(opt);
    });
  }

  btnVolMenu.addEventListener('click', () => {
    volPanel.style.display = (volPanel.style.display === 'none' || volPanel.style.display === '') ? 'block' : 'none';
  });

  btnRecenter?.addEventListener('click', () => {
    volAutoCenter = true;
    if (window._glide_plane_pos && window._glide_map) {
      window._glide_map.setView([window._glide_plane_pos.lat, window._glide_plane_pos.lon]);
    }
  });

  volFinesse?.addEventListener('input', () => {
    document.getElementById('volFinesseVal').innerText = volFinesse.value;
    updateVolCircle();
  });
  volFb?.addEventListener('input', () => {
    document.getElementById('volFbVal').innerText = volFb.value;
    updateVolCircle();
  });
  volSeuil?.addEventListener('input', () => {
    document.getElementById('volSeuilVal').innerText = volSeuil.value;
    updateVolCircle();
  });

  [volMarge, volAltMode, volRefSelect, volGpsEnabled, volAltManual].forEach(el => el?.addEventListener('change', updateVolCircle));

  try { makeDraggable(volPanel); } catch (e) { console.warn('makeDraggable absent', e); }

  // startVolGps is intentionally NOT called here automatically;
  // it will be called when the user actually switches to volScreen (goTo('volScreen')).
  updateVolCircle();
}

function startVolGps() {
  if (!navigator.geolocation) {
    console.warn("Géolocalisation non supportée");
    return;
  }

  // clear previous watch if any
  if (volGpsWatchId !== null) {
    try { navigator.geolocation.clearWatch(volGpsWatchId); } catch(e){}
    volGpsWatchId = null;
  }

  volGpsWatchId = navigator.geolocation.watchPosition(
    pos => {
      const coords = pos.coords;
      window._glide_plane_pos = { lat: coords.latitude, lon: coords.longitude };
      window._glide_gps_alt = coords.altitude ?? parseFloat(document.getElementById('volAltManual').value);
      if (volAutoCenter && window._glide_map) {
        window._glide_map.setView([coords.latitude, coords.longitude]);
      }
      updateVolCircle();
    },
    err => {
      console.warn("Erreur GPS :", err.message);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 10000,
      timeout: 10000
    }
  );

  // disable auto-centering when user drags the map
  window._glide_map.on('dragstart', () => {
    volAutoCenter = false;
  });
}

function getPlaneAltitude() {
  const gpsEnabled = document.getElementById('volGpsEnabled')?.checked ?? false;
  const altMode = document.getElementById('volAltMode')?.value ?? 'QNH';
  const altManual = parseFloat(document.getElementById('volAltManual')?.value ?? 0);
  const gpsAlt = gpsEnabled ? (window._glide_gps_alt ?? altManual) : altManual;

  if (altMode === 'QNH') return gpsAlt;

  if (altMode === 'QFE') {
    let nearest = null;
    let bestDist = Infinity;
    terrainsAll.forEach(t => {
      const d = distanceKm(window._glide_plane_pos ?? { lat: 43.8, lon: 0.1 }, t);
      if (d < bestDist) { bestDist = d; nearest = t; }
    });
    return gpsAlt - (nearest?.alt ?? 0);
  }

  if (altMode === 'QFE_REF') {
    const refId = document.getElementById('volRefSelect')?.value;
    const ref = terrainsAll.find(t => t.id === refId);
    return gpsAlt - (ref?.alt ?? 0);
  }

  return gpsAlt;
}

function computeGlideDistance(h, finesse, finesseBasse, seuil, marge) {
  const hRel = h - marge;
  if (hRel <= 0) return 0;
  const f = (h <= seuil) ? finesseBasse : finesse;
  return hRel * f;
}

function clearVolObjects() {
  volObjects.forEach(o => {
    try { window._glide_map.removeLayer(o); } catch(e){}
  });
  volObjects = [];
}

function updateVolCircle() {
  // Guard : ne rien faire si on n'est pas en écran VOL
  const volScreenEl = document.getElementById('volScreen');
  if (!volScreenEl || volScreenEl.style.display === 'none') {
    // nettoyer au cas où
    clearVolObjects();
    return;
  }

  if (!window._glide_map) return;
  clearVolObjects();

  const pos = window._glide_plane_pos ?? { lat: 43.8, lon: 0.1 };

  const h = getPlaneAltitude();
  const finesse = parseFloat(document.getElementById('volFinesse')?.value ?? 30);
  const fb = parseFloat(document.getElementById('volFb')?.value ?? 10);
  const seuil = parseFloat(document.getElementById('volSeuil')?.value ?? 500);
  const marge = parseFloat(document.getElementById('volMarge')?.value ?? 250);

  const d = computeGlideDistance(h, finesse, fb, seuil, marge);

  // Cercle planeur (affiché uniquement en VOL)
  const circle = L.circle([pos.lat, pos.lon], {
    radius: d,
    color: '#00aaff',
    weight: 2,
    fill: false
  }).addTo(window._glide_map);
  volObjects.push(circle);

  const radiusDisplay = document.getElementById('volRadiusDisplay');
  if (radiusDisplay) radiusDisplay.innerText = `Distance franchissable : ${Math.round(d / 1000)} km`;

  // Ne pas dessiner ici de cercles terrains "fixes" — ceux de PREP sont gérés par update()
}

/* End of file */
