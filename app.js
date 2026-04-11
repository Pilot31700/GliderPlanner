/****************************************************
 *  Glide Planner – APP.JS (Version A fidèle corrigée)
 ****************************************************/
let _volInitialized = false;
/* HELPERS – Enable / Disable map interactions */
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

/* NAVIGATION – goTo() */
function goTo(screenId){
  const screens = ['homeScreen','prepScreen','volScreen','manuelScreen'];
  const mapEl = document.getElementById('map');

  // bascule les écrans
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

  // 👉 PATCH : affichage du bouton Carte
  const btnCarte = document.getElementById("layerToggleBtn");
  const panelCarte = document.getElementById("layerPanel");

  if (screenId === "prepScreen" || screenId === "volScreen") {
      btnCarte.style.display = "block";
      panelCarte.style.display = "none";
  } else {
      btnCarte.style.display = "none";
      panelCarte.style.display = "none";
  }
  // 👈 FIN PATCH

  if (!mapEl) return;

  const map = window._glide_map || null;

  // gérer l'affichage du volRadiusDisplay uniquement en Mode VOL
  const volRadiusEl = document.getElementById('volRadiusDisplay');
  if (volRadiusEl) {
    volRadiusEl.style.display = (screenId === 'volScreen') ? 'block' : 'none';
  }

  // comportement carte / interactions
  if (screenId === 'prepScreen' || screenId === 'volScreen') {
    mapEl.classList.remove('map-blurred');
    mapEl.classList.add('map-absolute');

    const prep = document.getElementById('prepScreen');
    if (prep) prep.style.pointerEvents = 'none';

    if (map) {
      enableMapInteractions(map);
      setTimeout(()=> map.invalidateSize(), 120);
    }
  } else {
    mapEl.classList.add('map-blurred');
    mapEl.classList.remove('map-absolute');

    const prep = document.getElementById('prepScreen');
    if (prep) prep.style.pointerEvents = 'auto';

    if (map) disableMapInteractions(map);
  }

  // initialisation / arrêt spécifiques au Mode VOL
  if (screenId === 'volScreen') {
    try { initVolMode(); } catch (e) { console.warn('initVolMode error', e); }
    try { startVolGps(); } catch (e) { console.warn('startVolGps error', e); }
  } else {
    try {
      if (typeof volGpsWatchId === 'number' && volGpsWatchId !== null) {
        navigator.geolocation.clearWatch(volGpsWatchId);
        volGpsWatchId = null;
      }
    } catch (e) { /* ignore */ }
  }
}
/* DOMContentLoaded – INITIALISATION GLOBALE */
document.addEventListener('DOMContentLoaded', function () {

  /* NAVIGATION BUTTONS */
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

/* MAP */
const map = L.map('map', { preferCanvas: true, tap: true }).setView([43.8, 0.1], 9);
window._glide_map = map;

// --- LAYER SYSTEM OSM + OpenAIP Aviation ---
const API_KEY = "e21af8d83997e96b1f6e68551e8c2a78";

// Fond OSM (toujours visible)
const osmLayer = L.tileLayer(
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  { maxZoom: 19, attribution: "© OpenStreetMap" }
).addTo(map);

// OpenAIP Aviation (overlay)
const openAIPLayer = L.tileLayer(
  `https://api.tiles.openaip.net/api/data/openaip/{z}/{x}/{y}.png?apiKey=${API_KEY}`,
  { maxZoom: 14, opacity: 1 }
);

// --- UI LOGIC ---
const layerpanel = document.getElementById("layerPanel");
const btn = document.getElementById("layerToggleBtn");
const toggleAIP = document.getElementById("toggleAIP");
const opacityAIP = document.getElementById("opacityAIP");
const filter4Letters = document.getElementById("filter4Letters");

filter4Letters.addEventListener("change", () => {
    if (filter4Letters.checked) {
        allTerrainMarkers.forEach(m => window._glide_map.removeLayer(m));
        filteredTerrainMarkers.forEach(m => m.addTo(window._glide_map));
    } else {
        filteredTerrainMarkers.forEach(m => window._glide_map.removeLayer(m));
        allTerrainMarkers.forEach(m => m.addTo(window._glide_map));
    }
});
// Ouvrir / fermer panneau
btn.addEventListener("click", () => {
  layerpanel.style.display = layerpanel.style.display === "none" ? "block" : "none";
});

// Activer / désactiver OpenAIP Aviation
toggleAIP.addEventListener("change", () => {
  if (toggleAIP.checked) {
    openAIPLayer.addTo(map);
  } else {
    map.removeLayer(openAIPLayer);
  }
});

// Régler la transparence
opacityAIP.addEventListener("input", () => {
  const value = opacityAIP.value / 100;
  openAIPLayer.setOpacity(value);
});

// Désactiver interactions si tu utilises cette fonction (doit recevoir map)
if (typeof disableMapInteractions === 'function') {
  disableMapInteractions(map);
}

// position utilisateur et écoute du déplacement
let userPos = { lat: 43.8, lon: 0.1 };
map.on('moveend', () => {
  const c = map.getCenter();
  userPos = { lat: c.lat, lon: c.lng };
  if (typeof update === 'function') update();
});

// now that map exists, show home
if (typeof goTo === 'function') goTo('homeScreen');
  // --- MODE PREP : Ajout d'un terrain via popup stylé ---
let pendingClickLatLon = null;

map.on('click', function(e) {
  const prepVisible = document.getElementById('prepScreen')?.style.display !== 'none';
  if (!prepVisible) return;

  pendingClickLatLon = { lat: e.latlng.lat, lon: e.latlng.lng };

  document.getElementById('addTerrainModal').style.display = 'flex';
  document.getElementById('newTerrainName').value = "";
  document.getElementById('newTerrainAlt').value = "";
});

// Boutons popup
document.getElementById('addTerrainCancel').addEventListener('click', () => {
  document.getElementById('addTerrainModal').style.display = 'none';
  pendingClickLatLon = null;
});

document.getElementById('addTerrainConfirm').addEventListener('click', () => {
  const name = document.getElementById('newTerrainName').value.trim();
  const alt = parseFloat(document.getElementById('newTerrainAlt').value);

  if (!name) {
    alert("Nom invalide");
    return;
  }
  if (isNaN(alt)) {
    alert("Altitude invalide");
    return;
  }

  const id = name.toUpperCase().replace(/[^A-Z0-9]/g, "_");

  const newTerrain = {
    id: id,
    lat: pendingClickLatLon.lat,
    lon: pendingClickLatLon.lon,
    alt: alt
  };

  terrainsAll.push(newTerrain);

  // Ajout dans la liste de référence
  if (refSelect) {
    const opt = document.createElement("option");
    opt.value = id;
    opt.innerText = id;
    refSelect.appendChild(opt);
  }

  // Marqueur visuel
  L.marker([newTerrain.lat, newTerrain.lon]).addTo(map);

  // Recalcul
  update();

  document.getElementById('addTerrainModal').style.display = 'none';
  pendingClickLatLon = null;
});

// Evite double initialisation du Mode VOL
let _volInitialized = false;
  
  /* TERRAINS JSON */
  let terrainsAll = [];
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

 let allTerrainMarkers = [];
let filteredTerrainMarkers = [];

function createTerrainMarkers(terrains) {
    allTerrainMarkers = terrains.map(t => {
        return L.marker([t.lat, t.lon], {
            title: t.id
        });
    });

    filteredTerrainMarkers = allTerrainMarkers.filter(m => {
        const id = m.options.title;
        return /^[A-Z]{4}$/.test(id);
    });

    allTerrainMarkers.forEach(m => m.addTo(window._glide_map));
}

fetch("terrains.json")
  .then(r => r.json())
  .then(data => {
      createTerrainMarkers(data);
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

  /* UPDATE */
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

  /* DRAGGABLE PANELS */
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

// charger manuel externe et l'insérer dans #manuelCard
function loadManuel() {
  fetch('manuel.html')
    .then(response => {
      if (!response.ok) throw new Error('manuel.html non trouvé');
      return response.text();
    })
    .then(html => {
      const container = document.getElementById('manuelCard');
      if (!container) return;
      container.innerHTML = html;

      // exécuter les scripts éventuels contenus dans manuel.html
      const scripts = container.querySelectorAll('script');
      scripts.forEach(oldScript => {
        const s = document.createElement('script');
        if (oldScript.src) {
          s.src = oldScript.src;
          s.async = false;
        } else {
          s.textContent = oldScript.textContent;
        }
        document.body.appendChild(s);
        s.remove();
      });
    })
    .catch(err => {
      console.error('Erreur chargement manuel:', err);
    });
}

// appeler après l'initialisation (par exemple à la fin de DOMContentLoaded)
loadManuel();
  
  // initialize wind labels
  windLayers.forEach(w => {
    const s = document.getElementById(w.v);
    const lbl = document.getElementById(w.v + '_label');
    if (s && lbl) lbl.innerText = s.value + ' km/h';
  });

  // expose update and map for debugging
  window._glide_update = update;
  window._glide_map = map;
}); 
/* ============================================================
   MODE VOL – MODULE COMPLET
   ============================================================ */

let volObjects = [];
let volGpsWatchId = null;
let volAutoCenter = true;

function initVolMode() {
  // Ne rien faire si déjà initialisé
  if (_volInitialized) return;
  _volInitialized = true;

  // Vérifier que terrainsAll est prêt
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

  // remplir la liste des terrains si vide
  if (volRefSelect && terrainsAll.length && volRefSelect.children.length === 0) {
    terrainsAll.forEach(t => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.innerText = t.id;
      volRefSelect.appendChild(opt);
    });
  }

  // afficher / masquer panel
  btnVolMenu.addEventListener('click', () => {
    volPanel.style.display = (volPanel.style.display === 'none' || volPanel.style.display === '') ? 'block' : 'none';
  });

  // recentrage
  btnRecenter?.addEventListener('click', () => {
    volAutoCenter = true;
    if (window._glide_plane_pos && window._glide_map) {
      window._glide_map.setView([window._glide_plane_pos.lat, window._glide_plane_pos.lon]);
    }
  });

  // sliders affichent leur valeur et déclenchent update
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

  // rendre le panel déplaçable (assure-toi que makeDraggable existe)
  try { makeDraggable(volPanel); } catch (e) { console.warn('makeDraggable absent', e); }

  // démarrer GPS si nécessaire
  startVolGps();

  // affichage initial
  updateVolCircle();
}
function startVolGps() {
  if (!navigator.geolocation) {
    console.warn("Géolocalisation non supportée");
    return;
  }

  if (volGpsWatchId !== null) {
    navigator.geolocation.clearWatch(volGpsWatchId);
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

  // désactive recentrage auto si utilisateur déplace la carte
  window._glide_map.on('dragstart', () => {
    volAutoCenter = false;
  });
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

  // cercle planeur
  const circle = L.circle([pos.lat, pos.lon], {
    radius: d,
    color: '#00aaff',
    weight: 2,
    fill: false
  }).addTo(window._glide_map);

  volObjects.push(circle);

  // afficher rayon
  const radiusDisplay = document.getElementById('volRadiusDisplay');
  if (radiusDisplay) {
    radiusDisplay.innerText = `Distance franchissable : ${Math.round(d / 1000)} km`;
  }

  // cercles terrains
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
