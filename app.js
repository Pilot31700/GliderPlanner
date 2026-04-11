/* ============================================================
   MODE VOL – MODULE COMPLET
   ============================================================ */

let volObjects = [];
let volGpsWatchId = null;
let volAutoCenter = true;

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
