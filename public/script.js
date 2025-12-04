/* =========================================================================
   GeoGuess Lite - NEW script.js
   - Street View snaps to the nearest panorama (robust against non-road coords)
   - Difficulty filter (Easy=country, Medium=city/place, Hard=place only)
   - Weighted random selection from places.json
   - Score (+1 correct, -1 wrong or give up)
   - No repeats until pool is exhausted
   - Google callback: window.initMap

   Expected HTML element IDs:
     #streetview, #guessInput, #guessBtn, #giveUpBtn, #nextBtn,
     #score, #status, #meta, (optional) #difficultySelect

   Example difficultySelect values (optional):
     "easy-country", "medium-city", "hard-place"
   ========================================================================= */

(() => {
  // ------------------------------
  // Global state
  // ------------------------------
  let panorama = null;
  let map = null;

  /** @type {Array<Object>} */
  let PLACES = [];

  /** @type {Set<string>} */
  const usedPlaceIds = new Set();

  /** @type {Object|null} */
  let currentPlace = null;

  /** @type {Map<string, google.maps.LatLng>} cache found panoramas by place id */
  const COVERAGE_CACHE = new Map();

  let score = 0;
  let roundsPlayed = 0;

  const els = {
    streetview: null,
    guessInput: null,
    guessBtn: null,
    giveUpBtn: null,
    nextBtn: null,
    score: null,
    status: null,
    meta: null,
    difficultySelect: null
  };

  // ------------------------------
  // Utilities
  // ------------------------------
  function setStatus(msg, type = 'info') {
    if (!els.status) return;
    els.status.textContent = msg;
    els.status.className = '';
    els.status.classList.add('status', `status--${type}`);
  }

  function renderScore() {
    if (!els.score) return;
    els.score.textContent = `Score: ${score} • Rounds: ${roundsPlayed}`;
  }

  function resetRoundUI() {
    if (els.guessInput) {
      els.guessInput.value = '';
      els.guessInput.disabled = false;
      els.guessInput.focus();
    }
    if (els.guessBtn) els.guessBtn.disabled = false;
    if (els.giveUpBtn) els.giveUpBtn.disabled = false;
    if (els.nextBtn) els.nextBtn.disabled = true;
    if (els.meta) els.meta.textContent = '';
    setStatus('Make a guess!', 'info');
  }

  function lockRoundUI() {
    if (els.guessInput) els.guessInput.disabled = true;
    if (els.guessBtn) els.guessBtn.disabled = true;
    if (els.giveUpBtn) els.giveUpBtn.disabled = true;
    if (els.nextBtn) els.nextBtn.disabled = false;
  }

  function defaultWeightFromDifficulty(diff) {
    switch ((diff || '').toLowerCase()) {
      case 'easy': return 5;
      case 'medium': return 3;
      case 'hard': return 1;
      default: return 2;
    }
  }

  function norm(s) {
    return (s || '')
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, ''); // strip accents
  }

  function getGuessMode() {
    const val = els.difficultySelect?.value || '';
    if (val === 'easy-country') return 'country';
    if (val === 'hard-place') return 'place';
    // default
    return 'city-or-place';
  }

  function isGuessCorrect(guess, place, mode) {
    const g = norm(guess);
    const name = norm(place.name);
    const city = norm(place.city);
    const country = norm(place.country);

    if (!g) return false;

    switch (mode) {
      case 'country':
        return !!country && g.includes(country);
      case 'place':
        // strict: place name match (fallback to city if name missing)
        return (name && g.includes(name)) || (!name && city && g.includes(city));
      case 'city-or-place':
      default:
        return (name && g.includes(name)) || (city && g.includes(city)) || (country && g.includes(country));
    }
  }

  function renderMeta(place) {
    if (!els.meta) return;
    const loc = [place.name, place.city, place.country].filter(Boolean).join(', ');
    const latlng = `Lat: ${Number(place.lat).toFixed(5)} • Lng: ${Number(place.lng).toFixed(5)}`;
    const diff = place.difficulty ? ` • Difficulty: ${place.difficulty}` : '';
    els.meta.innerHTML = `${loc} • ${latlng}${diff}`;
  }

  // Weighted pool excluding used
  function buildWeightedPool() {
    const pool = [];
    PLACES.forEach((p, idx) => {
      if (!p?.id || usedPlaceIds.has(p.id)) return;
      const w = Number.isFinite(p.weight) ? Math.max(1, Math.floor(p.weight)) : defaultWeightFromDifficulty(p.difficulty);
      for (let i = 0; i < w; i++) pool.push(idx);
    });
    return pool;
  }

  function pickRandomIndex(pool) {
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // ------------------------------
  // Street View helpers
  // ------------------------------
  function findPanoramaNear(lat, lng) {
    return new Promise((resolve) => {
      const svService = new google.maps.StreetViewService();
      const target = new google.maps.LatLng(lat, lng);
      const radii = [50, 150, 300, 600]; // progressively wider search

      const attempt = (i) => {
        if (i >= radii.length) return resolve(null);
        svService.getPanorama({ location: target, radius: radii[i] }, (data, status) => {
          if (status === google.maps.StreetViewStatus.OK && data?.location?.latLng) {
            resolve(data.location.latLng);
          } else {
            attempt(i + 1);
          }
        });
      };
      attempt(0);
    });
  }

  async function ensureCoverage(place) {
    if (COVERAGE_CACHE.has(place.id)) {
      return COVERAGE_CACHE.get(place.id);
    }
    const panoPos = await findPanoramaNear(place.lat, place.lng);
    if (panoPos) COVERAGE_CACHE.set(place.id, panoPos);
    return panoPos;
  }

  function showPanoramaAt(latLng, place) {
    if (!panorama) {
      panorama = new google.maps.StreetViewPanorama(els.streetview, {
        position: latLng,
        pov: place.pov || { heading: 0, pitch: 0 },
        linksControl: true,
        addressControl: false,
        panControl: true,
        enableCloseButton: false,
        fullscreenControl: true
      });
    } else {
      panorama.setPosition(latLng);
