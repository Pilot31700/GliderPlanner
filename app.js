/****************************************************
 *  Glide Planner – APP.JS (Version propre & corrigée)
 ****************************************************/

let _volInitialized = false;

/* HELPERS – Enable / Disable map interactions */
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
    const el = map.getContainer?.() ?? document.getElementById('map');
    if (el) {
      el.style.pointerEvents = 'auto';
      el.style.touchAction = 'pan-x pan-y pinch-zoom';
    }
  } catch (e) {}
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
    const el = map.getContainer?.() ?? document.getElementById('map');
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

  btn.addEventListener("click", () => {
    layerpanel.style.display = layerpanel.style.display === "none" ? "block" : "none";
  });

  toggleAIP.addEventListener("change", () => {
    if (toggleAIP.checked) openAIPLayer.addTo(map);
    else map.removeLayer(openAIPLayer);
  });

  opacityAIP.addEventListener("input", () => {
    openAIPLayer.setOpacity(opacityAIP.value / 100);
  });

  /* Position utilisateur */
  let userPos = { lat: 43.8, lon: 0.1 };
  map.on('moveend', () => {
    const c = map.getCenter();
    userPos = { lat: c.lat, lon: c.lng };
    update();
  });

  goTo('homeScreen');

  /* MODE PREP – Ajout terrain */
  let pendingClickLatLon = null;

  map.on('click', function(e) {
    const prepVisible = document.getElementById('prepScreen').style.display !== 'none';
    if (!prepVisible) return;

    pendingClickLatLon = { lat: e.latlng.lat, lon: e.latlng.lng };

    document.getElementById('addTerrainModal').style.display = 'flex';
    document.getElementById('newTerrainName').value = "";
    document.getElementById('newTerrainAlt').value = "";
  });

  document.getElementById('addTerrainCancel').addEventListener('click', () => {
    document.getElementById('addTerrainModal').style.display = 'none';
    pendingClickLatLon = null;
  });

  document.getElementById('addTerrainConfirm').addEventListener('click', () => {
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

    if (refSelect) {
      const opt = document.createElement("option");
      opt.value = id;
      opt.innerText = id;
      refSelect.appendChild(opt);
    }

    L.marker([newTerrain.lat, newTerrain.lon], { icon: terrainIcon }).addTo(map);

    update();

    document.getElementById('addTerrainModal').style.display = 'none';
    pendingClickLatLon = null;
  });

  /* TERRAINS JSON */
  let terrainsAll = [];
  let terrains = [];
  let filterOnly4Letters = false;

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

  filter4Letters.addEventListener("change", () => {
    filterOnly4Letters = filter4Letters.checked;
    update();
  });

  fetch("terrains.json")
    .then(r => r.json())
    .then(data => {
      terrainsAll = data;
      terrains = data;
      populateRef();
      update();
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
      if (sliderEl && label)
        sliderEl.addEventListener('input', () => { label.innerText = sliderEl.value + ' km/h'; });
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
