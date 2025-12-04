/* GeoGuess Lite — robust Street View with coverage checks */

(() => {
  let panorama = null;
  let map = null;

  let PLACES = [];
  const used = new Set();
  let current = null;

  const els = {
    streetview: null, score: null, status: null,
    guessInput: null, guessBtn: null, giveUpBtn: null, nextBtn: null, meta: null
  };

  const log = (...args) => console.debug('[GeoGuess]', ...args);

  function setStatus(msg, type = 'info') {
    if (!els.status) return;
    els.status.textContent = msg;
    els.status.className = '';
    els.status.classList.add('status', `status--${type}`);
    log(type.toUpperCase() + ':', msg);
  }

  function renderScore(score, rounds) {
    if (els.score) els.score.textContent = `Score: ${score} • Rounds: ${rounds}`;
  }

  let score = 0, rounds = 0;

  async function loadPlaces() {
    try {
      const res = await fetch(`places.json?cb=${Math.random().toString(36).slice(2)}`);
      if (!res.ok) throw new Error(`places.json ${res.status} ${res.statusText}`);
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) throw new Error('places.json empty or not array');
      PLACES = data
        .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng))
        .map(p => ({
          id: p.id || `${p.name || 'place'}-${p.lat}-${p.lng}`,
          name: p.name || '', city: p.city || '', country: p.country || '',
          lat: p.lat, lng: p.lng, pov: p.pov || null
        }));
      log('Loaded places:', PLACES.length);
      return true;
    } catch (e) {
      console.error(e);
      setStatus(`Error loading places.json: ${e.message}`, 'error');
      return false;
    }
  }

  // Find nearest panorama using StreetViewService (robust to non-road coords)
  function findPanoramaNear(lat, lng) {
    return new Promise((resolve) => {
      const sv = new google.maps.StreetViewService();
      const target = new google.maps.LatLng(lat, lng);
      const radii = [50, 150, 300, 600]; // meters

      const attempt = (i) => {
        if (i >= radii.length) return resolve(null);
        sv.getPanorama({ location: target, radius: radii[i] })
          .then(({ data }) => {
            if (data?.location?.latLng) {
              resolve(data.location.latLng);
            } else {
              attempt(i + 1);
            }
          })
          .catch(() => attempt(i + 1));
      };
      attempt(0);
    });
  }

  function showPanoramaAt(latLng, place) {
    if (!panorama) {
      panorama = new google.maps.StreetViewPanorama(els.streetview, {
        position: latLng,
        pov: place.pov || { heading: 0, pitch: 0 },
        linksControl: true,
        panControl: true,
        addressControl: false,
        enableCloseButton: false,
        fullscreenControl: true
      });
    } else {
      panorama.setPosition(latLng);
      if (place.pov) panorama.setPov(place.pov);
    }

    if (map) {
      map.setCenter(latLng);
      map.setZoom(14);
      map.setStreetView(panorama);
    }
  }

  function resetRoundUI() {
    els.guessInput.value = '';
    els.guessInput.disabled = false;
    els.guessBtn.disabled = false;
    els.giveUpBtn.disabled = false;
    els.nextBtn.disabled = true;
    els.guessInput.focus();
    if (els.meta) els.meta.textContent = '';
    setStatus('Make a guess!', 'info');
  }

  function lockRoundUI() {
    els.guessInput.disabled = true;
    els.guessBtn.disabled = true;
    els.giveUpBtn.disabled = true;
    els.nextBtn.disabled = false;
  }

  async function startRound() {
    // pick a random unused place
    const candidates = PLACES.filter(p => !used.has(p.id));
    if (!candidates.length) {
      used.clear();
      setStatus('All locations used — restarting pool…', 'info');
    }
    const pool = PLACES.filter(p => !used.has(p.id));
    if (!pool.length) {
      setStatus('No valid places available. Update places.json.', 'error');
      return;
    }
    const place = pool[Math.floor(Math.random() * pool.length)];
    const panoPos = await findPanoramaNear(place.lat, place.lng);
    if (!panoPos) {
      used.add(place.id); // skip uncovered
      setStatus('No Street View near this location — picking another…', 'warn');
      return startRound();
    }

    current = place;
    used.add(place.id);
    showPanoramaAt(panoPos, place);
    resetRoundUI();
  }

  function isGuessCorrect(guess, place) {
    const g = guess.toLowerCase().trim();
    return (
      (place.name && g.includes(place.name.toLowerCase())) ||
      (place.city && g.includes(place.city.toLowerCase())) ||
      (place.country && g.includes(place.country.toLowerCase()))
    );
  }

  function handleGuess() {
    if (!current) return;
    const guess = els.guessInput.value.trim();
    if (!guess) return setStatus('Type a guess first.', 'warn');
    rounds += 1;

    if (isGuessCorrect(guess, current)) {
      score += 1;
      setStatus(`✅ Correct! ${current.name || current.city || current.country}`, 'success');
    } else {
      score -= 1;
      const reveal = [current.name, current.city, current.country].filter(Boolean).join(', ');
      setStatus(`❌ Not quite. Answer: ${reveal}`, 'error');
      if (els.meta) els.meta.textContent = reveal;
    }
    renderScore(score, rounds);
    lockRoundUI();
  }

  function handleGiveUp() {
    if (!current) return;
    rounds += 1;
    score -= 1;
    const reveal = [current.name, current.city, current.country].filter(Boolean).join(', ');
    setStatus(`👐 You gave up. Answer: ${reveal}`, 'warn');
    if (els.meta) els.meta.textContent = reveal;
    renderScore(score, rounds);
    lockRoundUI();
  }

  function handleNext() {
    startRound();
  }

  // Google callback
  window.initMap = async function initMap() {
    els.streetview = document.getElementById('streetview');
    els.score = document.getElementById('score');
    els.status = document.getElementById('status');
    els.guessInput = document.getElementById('guessInput');
    els.guessBtn = document.getElementById('guessBtn');
    els.giveUpBtn = document.getElementById('giveUpBtn');
    els.nextBtn = document.getElementById('nextBtn');
    els.meta = document.getElementById('meta');

    // off-DOM map to bind Street View
    map = new google.maps.Map(document.createElement('div'), {
      center: { lat: 0, lng: 0 }, zoom: 2, streetViewControl: false
    });

    // events
    els.guessBtn.addEventListener('click', handleGuess);
    els.giveUpBtn.addEventListener('click', handleGiveUp);
    els.nextBtn.addEventListener('click', handleNext);
    els.guessInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleGuess(); });

    // initial UI
    renderScore(score, rounds);
    setStatus('Loading locations…', 'info');

    if (location.protocol === 'file:') {
      setStatus('Serve over http:// (not file://) so places.json can be fetched.', 'warn');
    }

    if (!(await loadPlaces())) return;
    startRound();
  };
})();
