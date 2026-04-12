/****************************************************
 *  Glide Planner – APP.JS (Version propre)
 ****************************************************/

let _volInitialized = false;
let userPos = { lat: 43.8, lon: 0.1 };
let volObjects = [];
let volGpsWatchId = null;
let volAutoCenter = true;



/* HELPERS – Enable / Disable map interactions */
function enableMapInteractions(map) {
  try {
    if (!map) return;
    map.dragging?.enable();
    map.scrollWheelZoom?.enable();
    map.touchZoom?.enable();
    map.doubleClickZoom?.enable();
    map.boxZoom?.enable();
    map.keyboard?.enable();
    map.tap?.enable();
    const el = map.getContainer?.();
    if (el) {
      el.style.pointerEvents = 'auto';
      el.style.touchAction = 'pan-x pan-y pinch-zoom';
    }
  } catch (e) {}
}

function disableMapInteractions(map) {
  try {
    if (!map) return;
    map.dragging?.disable();
    map.scrollWheelZoom?.disable();
    map.touchZoom?.disable();
    map.doubleClickZoom?.disable();
    map.boxZoom?.disable();
    map.keyboard?.disable();
    map.tap?.disable();
    const el = map.getContainer?.();
    if (el) {
      el.style.pointerEvents = 'none';
      el.style.touchAction = 'none';
    }
  } catch (e) {}
}

/* NAVIGATION */
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

  const btnCarte = document.getElementById("layerToggleBtn");
  const panelCarte = document.getElementById("layerPanel");

  if (screenId === "prepScreen" || screenId === "volScreen") {
      btnCarte.style.display = "block";
      panelCarte.style.display = "none";
  } else {
      btnCarte.style.display = "none";
      panelCarte.style.display = "none";
  }

  if (!mapEl) return;

  const map = window._glide_map;

  const volRadiusEl = document.getElementById('volRadiusDisplay');
  if (volRadiusEl)
    volRadiusEl.style.display = (screenId === 'volScreen') ? 'block' : 'none';

  if (screenId === 'prepScreen' || screenId === 'volScreen') {
    mapEl.classList.remove('map-blurred');
    mapEl.classList.add('map-absolute');
    document.getElementById('prepScreen').style.pointerEvents = 'none';
    enableMapInteractions(map);
    setTimeout(()=> map.invalidateSize(), 120);
  } else {
    mapEl.classList.add('map-blurred');
    mapEl.classList.remove('map-absolute');
    document.getElementById('prepScreen').style.pointerEvents = 'auto';
    disableMapInteractions(map);
  }

  if (screenId === 'volScreen') {
    initVolMode();
    startVolGps();
  } else {
    if (typeof volGpsWatchId === 'number') {
      navigator.geolocation.clearWatch(volGpsWatchId);
      volGpsWatchId = null;
    }
  }
}

/* DOMContentLoaded */
document.addEventListener('DOMContentLoaded', function () {

  /* NAVIGATION BUTTONS */
  document.getElementById('btnGoPrep')?.addEventListener('click', e => { e.preventDefault(); goTo('prepScreen'); });
  document.getElementById('btnGoVol')?.addEventListener('click', e => { e.preventDefault(); goTo('volScreen'); });
  document.getElementById('btnGoManuel')?.addEventListener('click', e => { e.preventDefault(); goTo('manuelScreen'); });

  document.getElementById('backFromPrep')?.addEventListener('click', e => { e.preventDefault(); goTo('homeScreen'); });
  document.getElementById('backFromVol')?.addEventListener('click', e => { e.preventDefault(); goTo('homeScreen'); });
  document.getElementById('backFromManuel')?.addEventListener('click', e => { e.preventDefault(); goTo('homeScreen'); });

  /* MAP */
  const map = L.map('map', { preferCanvas: true, tap: true }).setView([43.8, 0.1], 9);
  window._glide_map = map;
/* --- Initialisation carte et UI (doit être exécutée immédiatement) --- */
const API_KEY = "e21af8d83997e96b1f6e68551e8c2a78";

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  { maxZoom: 19, attribution: "© OpenStreetMap" }
).addTo(map);

const openAIPLayer = L.tileLayer(
  `https://api.tiles.openaip.net/api/data/openaip/{z}/{x}/{y}.png?apiKey=${API_KEY}`,
  { maxZoom: 14, opacity: 1 }
);

/* Icône terrain – Aviation Pro */
const terrainIcon = L.divIcon({
  className: "terrain-icon",
  html: `
    <div style="
      width:12px;
      height:12px;
      background:#0033aa;
      border:2px solid white;
      border-radius:50%;
      box-shadow:0 0 4px rgba(0,0,0,0.4);
    "></div>
  `,
  iconSize: [16, 16],
  iconAnchor: [8, 8]
});

/* UI LOGIC */
const layerpanel = document.getElementById("layerPanel");
const btn = document.getElementById("layerToggleBtn");
const toggleAIP = document.getElementById("toggleAIP");
const opacityAIP = document.getElementById("opacityAIP");
const filter4Letters = document.getElementById("filter4Letters");

btn?.addEventListener("click", () => {
  if (!layerpanel) return;
  layerpanel.style.display = layerpanel.style.display === "none" ? "block" : "none";
});

toggleAIP?.addEventListener("change", () => {
  if (toggleAIP.checked) openAIPLayer.addTo(map);
  else map.removeLayer(openAIPLayer);
});

opacityAIP?.addEventListener("input", () => {
  openAIPLayer.setOpacity(opacityAIP.value / 100);
});

/* --- Listener carte : moveend (met à jour userPos) --- */
map.on('moveend', () => {
  const c = map.getCenter();
  userPos = { lat: c.lat, lon: c.lng };
  update();
});

/* --- Listener carte : click (mode PREP) --- */
map.on('click', function(e) {
  const prepVisible = document.getElementById('prepScreen')?.style.display !== 'none';
  if (!prepVisible) return;

  pendingClickLatLon = { lat: e.latlng.lat, lon: e.latlng.lng };

  document.getElementById('addTerrainModal').style.display = 'flex';
  document.getElementById('newTerrainName').value = "";
  document.getElementById('newTerrainAlt').value = "";
});

/* Affiche l'écran d'accueil (après initialisation) */
goTo('homeScreen');/* ============================================================
   TERRAINS + FILTRE 4 LETTRES + UPDATE()
   ============================================================ */

let terrainsAll = [];
let terrains = [];
let filterOnly4Letters = false;

/* Remplir la liste des terrains dans PREP */
function populateRef() {
  const refSelect = document.getElementById('refSelect');
  if (!refSelect) return;
  refSelect.innerHTML = "";
  terrainsAll.forEach(t => {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.innerText = t.id;
    refSelect.appendChild(opt);
  });
}

/* Listener du filtre 4 lettres */
document.getElementById("filter4Letters")?.addEventListener("change", () => {
  filterOnly4Letters = document.getElementById("filter4Letters").checked;
  update();
});

/* Chargement terrains.json */
/* Chargement terrains.json (sécurisé vis-à-vis de l'initialisation de la map) */
let terrainsLoaded = false;

fetch("terrains.json")
  .then(r => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  })
  .then(data => {
    terrainsAll = data;
    terrains = data;
    populateRef();
    terrainsLoaded = true;

    // Si la map est déjà initialisée, on lance update et initVolMode
    if (window._glide_map) {
      update();
      initVolMode();
    }
    // Sinon, DOMContentLoaded déclenchera update (voir plus bas)
  })
  .catch(err => console.error("Erreur chargement terrains.json :", err));

/* ============================================================
   UPDATE() — Calcul des cercles + labels + icône terrain
   ============================================================ */

let objs = [];

function clearObjs() {
  objs.forEach(o => window._glide_map.removeLayer(o));
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

  const map = window._glide_map;
  if (!map) return;

  const range = parseFloat(document.getElementById('rangeKm')?.value ?? 100);
  const slider = document.getElementById('slider');
  const hVal = document.getElementById('hVal');
  const finesse = document.getElementById('finesse');
  const fb = document.getElementById('fb');
  const seuil = document.getElementById('seuil');
  const marge = document.getElementById('marge');
  const vCruiseInput = document.getElementById('vCruise');
  const mode = document.getElementById('mode');
  const labels = document.getElementById('labels');
  const all = document.getElementById('all');
  const applyWind = document.getElementById('applyWind');
  const refSelect = document.getElementById('refSelect');

  /* Filtrage terrains */
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

      const d = h_util * finesseUse;

      if (!useWind) {
        const circle = L.circle([t.lat, t.lon], {
          radius: d,
          color: color(hh),
          weight: 2,
          fill: false
        }).addTo(map);
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
      }
    }

    /* Marqueur terrain — icône Aviation Pro */
    objs.push(L.marker([t.lat, t.lon], { icon: terrainIcon }).addTo(map));
  });
}
/* ============================================================
   MODE PREP — AJOUT TERRAIN + UI
   ============================================================ */

let pendingClickLatLon = null;

document.getElementById('addTerrainCancel').addEventListener('click', () => {
  document.getElementById('addTerrainModal').style.display = 'none';
  pendingClickLatLon = null;
});

document.getElementById('addTerrainConfirm').addEventListener('click', () => {
  if (!pendingClickLatLon) {
    return alert("Aucun emplacement sélectionné. Cliquez sur la carte en mode Préparation pour ajouter un terrain.");
  }

  const name = document.getElementById('newTerrainName').value.trim();
  const alt = parseFloat(document.getElementById('newTerrainAlt').value);

  if (!name) return alert("Nom invalide");
  if (isNaN(alt)) return alert("Altitude invalide");
  const id = name.toUpperCase().replace(/[^A-Z0-9]/g, "_");

  const newTerrain = {
    id,
    lat: pendingClickLatLon.lat,
    lon: pendingClickLatLon.lon,
    alt
  };

  terrainsAll.push(newTerrain);

  const refSelect = document.getElementById('refSelect');
  if (refSelect) {
    const opt = document.createElement("option");
    opt.value = id;
    opt.innerText = id;
    refSelect.appendChild(opt);
  }

  L.marker([newTerrain.lat, newTerrain.lon], { icon: terrainIcon }).addTo(window._glide_map);

  update();

  document.getElementById('addTerrainModal').style.display = 'none';
  pendingClickLatLon = null;
});

/* ============================================================
   VENT — MENU + SLIDERS
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

    const sliderEl = block.querySelector(`#${w.v}`);
    const label = block.querySelector(`#${w.v}_label`);
    if (sliderEl && label)
      sliderEl.addEventListener('input', () => {
        label.innerText = sliderEl.value + ' km/h';
      });
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

/* ============================================================
   UI EVENTS (PREP)
   ============================================================ */

document.getElementById('slider')?.addEventListener('input', () => {
  document.getElementById('hVal').innerText = document.getElementById('slider').value;
  update();
});

document.getElementById('btnRecalc')?.addEventListener('click', e => {
  e.preventDefault();
  update();
});

document.getElementById('btnRecalcWind')?.addEventListener('click', e => {
  e.preventDefault();
  update();
});

[
  'finesse','fb','seuil','marge','vCruise',
  'mode','labels','all','rangeKm','refSelect','applyWind'
].forEach(id => {
  const el = document.getElementById(id);
  el?.addEventListener('change', update);
});

/* ============================================================
   PANNEAUX DÉPLAÇABLES
   ============================================================ */

function makeDraggable(el) {
  if (!el) return;
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  function isFormControl(target) {
    return !!target.closest('input, select, textarea, button, label, [role="slider"], .no-drag');
  }

  el.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    if (isFormControl(e.target)) return;
    dragging = true;
    try { el.setPointerCapture(e.pointerId); } catch {}
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
    try { el.releasePointerCapture(e.pointerId); } catch {}
    el.style.cursor = 'default';
  });

  el.addEventListener('pointercancel', function () {
    dragging = false;
    el.style.cursor = 'default';
  });
}

makeDraggable(document.getElementById('panel'));
makeDraggable(document.getElementById('menuVent'));

/* ============================================================
   MANUEL — Chargement manuel.html
   ============================================================ */

function loadManuel() {
  fetch('manuel.html')
    .then(r => r.text())
    .then(html => {
      const container = document.getElementById('manuelCard');
      if (!container) return;
      container.innerHTML = html;

      const scripts = container.querySelectorAll('script');
      scripts.forEach(oldScript => {
        const s = document.createElement('script');
        if (oldScript.src) s.src = oldScript.src;
        else s.textContent = oldScript.textContent;
        document.body.appendChild(s);
        s.remove();
      });
    })
    .catch(err => console.error('Erreur chargement manuel:', err));
}

loadManuel();

/* ============================================================
   MODE VOL – MODULE COMPLET
   ============================================================ */

function initVolMode() {
  if (_volInitialized) return;
  _volInitialized = true;

  if (!Array.isArray(terrainsAll)) {
    console.warn('initVolMode: terrainsAll non disponible');
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
    console.warn('initVolMode: éléments DOM manquants');
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
    volPanel.style.display =
      (volPanel.style.display === 'none' || volPanel.style.display === '') ? 'block' : 'none';
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

  [volMarge, volAltMode, volRefSelect, volGpsEnabled, volAltManual]
    .forEach(el => el?.addEventListener('change', updateVolCircle));

  try { makeDraggable(volPanel); } catch {}

  startVolGps();
  updateVolCircle();
}

function startVolGps() {
  if (!navigator.geolocation) {
    console.warn("Géolocalisation non supportée");
    return;
  }

  if (volGpsWatchId !== null)
    navigator.geolocation.clearWatch(volGpsWatchId);

  volGpsWatchId = navigator.geolocation.watchPosition(
    pos => {
      const coords = pos.coords;
      window._glide_plane_pos = { lat: coords.latitude, lon: coords.longitude };
      window._glide_gps_alt = coords.altitude ?? parseFloat(document.getElementById('volAltManual').value);

      if (volAutoCenter && window._glide_map)
        window._glide_map.setView([coords.latitude, coords.longitude]);

      updateVolCircle();
    },
    err => console.warn("Erreur GPS :", err.message),
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 10000 }
  );

  window._glide_map.on('dragstart', () => { volAutoCenter = false; });
}

function getPlaneAltitude() {
  const gpsEnabled = document.getElementById('volGpsEnabled').checked;
  const altMode = document.getElementById('volAltMode').value;
  const altManual = parseFloat(document.getElementById('volAltManual').value);
  const gpsAlt = gpsEnabled ? window._glide_gps_alt ?? altManual : altManual;

  if (altMode === 'QNH') return gpsAlt;

  if (altMode === 'QFE') {
    let nearest = null;
    let bestDist = Infinity;
    terrainsAll.forEach(t => {
      const d = distanceKm(window._glide_plane_pos, t);
      if (d < bestDist) { bestDist = d; nearest = t; }
    });
    return gpsAlt - (nearest?.alt ?? 0);
  }

  if (altMode === 'QFE_REF') {
    const refId = document.getElementById('volRefSelect').value;
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
  volObjects.forEach(o => window._glide_map.removeLayer(o));
  volObjects = [];
}

function updateVolCircle() {
  if (!window._glide_map) return;

  clearVolObjects();

  const pos = window._glide_plane_pos ?? { lat: 43.8, lon: 0.1 };

  const h = getPlaneAltitude();
  const finesse = parseFloat(document.getElementById('volFinesse').value);
  const fb = parseFloat(document.getElementById('volFb').value);
  const seuil = parseFloat(document.getElementById('volSeuil').value);
  const marge = parseFloat(document.getElementById('volMarge').value);

  const d = computeGlideDistance(h, finesse, fb, seuil, marge);

  const circle = L.circle([pos.lat, pos.lon], {
    radius: d,
    color: '#00aaff',
    weight: 2,
    fill: false
  }).addTo(window._glide_map);

  volObjects.push(circle);

  const radiusDisplay = document.getElementById('volRadiusDisplay');
  if (radiusDisplay)
    radiusDisplay.innerText = `Distance franchissable : ${Math.round(d / 1000)} km`;

  terrainsAll.forEach(t => {
    const hTerrain = h - (t.alt - 0);
    const dT = computeGlideDistance(hTerrain, finesse, fb, seuil, marge);
    if (dT > 0) {
      const c = L.circle([t.lat, t.lon], {
        radius: dT,
        color: '#ffaa00',
        weight: 1,
        fill: false
      }).addTo(window._glide_map);
      volObjects.push(c);
    }
  });
}


/* Fin du module VOL */

/* Rien d’autre en dessous */
