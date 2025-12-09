/* GeoGuess Lite — robust Street View script matching your HTML IDs */

(() => {
  let panorama = null;        // street-view viewer
  let map = null;             // Optional off-DOM map to bind SV
  let PLACES = [];            // Loaded from places.json
  const used = new Set();     // Avoid repeats
  let current = null;         // Current place

  const els = {
    sv: null,      // #street-view
    mode: null,    // #mode
    guess: null,   // #guess
    result: null,  // #result
    score: null    // #score
  };

  let score = 0;

  function setResult(msg) {
    if (els.result) els.result.textContent = msg || '';
  }
  function renderScore() {
    if (els.score) els.score.textContent = `Score: ${score}`;
  }

  // ----- Load places.json from site root -----
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
          name: p.name || '',
          city: p.city || '',
          country: p.country || '',
          lat: p.lat,
          lng: p.lng,
          pov: p.pov && typeof p.pov === 'object' ? p.pov : null
        }));

      return true;
    } catch (e) {
      console.error('places.json load error:', e);
      setResult(`Error loading places.json: ${e.message}`);
      return false;
    }
  }

  // ----- Find nearest panorama using StreetViewService -----
  function findPanoramaNear(lat, lng) {
    return new Promise((resolve) => {
      const sv = new google.maps.StreetViewService();
      const target = new google.maps.LatLng(lat, lng);
      const radii = [50, 150, 300, 600]; // progressively widen search

      const attempt = (i) => {
        if (i >= radii.length) return resolve(null);
        sv.getPanorama({ location: target, radius: radii[i] })
          .then(({ data }) => {
            const pos = data?.location?.latLng || null;
            resolve(pos || null);
          })
          .catch(() => attempt(i + 1));
      };
      attempt(0);
    });
  }

  // ----- Create/Update Street View viewer -----
  function showPanoramaAt(latLng, place) {
    if (!panorama) {
      // IMPORTANT: Street View uses StreetViewPanorama, not Map
      panorama = new google.maps.StreetViewPanorama(els.sv, {
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

    // Optional: bind to a map (off-DOM) to keep Street View in sync
    if (map) {
      map.setCenter(latLng);
      map.setZoom(14);
      map.setStreetView(panorama);
    }
  }

  // ----- Game flow: pick a place with coverage -----
  async function startRound() {
    setResult('Loading a location…');

    // Build pool excluding used
    const pool = PLACES.filter(p => !used.has(p.id));
    if (!pool.length) {
      used.clear();
    }

    const candidates = PLACES.filter(p => !used.has(p.id));
    if (!candidates.length) {
      setResult('No valid places available. Update places.json.');
      return;
    }

    // Try a few picks to find one with coverage
    const maxAttempts = PLACES.length || 1;
    for (let i = 0; i < maxAttempts; i++) {
      const place = candidates[Math.floor(Math.random() * candidates.length)];
      if (!place) break;

      const panoPos = await findPanoramaNear(place.lat, place.lng);
      if (panoPos) {
        current = place;
        used.add(place.id);
        showPanoramaAt(panoPos, place);
        setResult('Make a guess!');
        return;
      } else {
        // mark used so we don’t keep retrying uncovered coords
        used.add(place.id);
      }
    }

    setResult('No Street View coverage for remaining locations. Please update places.json.');
  }

  // ----- Guess logic tied to your mode & input IDs -----
  function isGuessCorrect(guess, place, mode) {
    const g = (guess || '').toLowerCase().trim();
    const name = (place.name || '').toLowerCase();
    const city = (place.city || '').toLowerCase();
    const country = (place.country || '').toLowerCase();

    if (!g) return false;
    if (mode === 'easy') {
      return country && g.includes(country);
    } else { // 'hard' (City)
      return (city && g.includes(city)) || (name && g.includes(name));
    }
  }

  // ----- Inline handlers expected by your HTML -----
  window.submitGuess = function submitGuess() {
    if (!current) return;
    const mode = els.mode?.value || 'easy';
    const guess = els.guess?.value || '';
    const correct = isGuessCorrect(guess, current, mode);
    if (correct) {
      score += 1;
      setResult(`✅ Correct: ${current.name || current.city || current.country}`);
    } else {
      score -= 1;
      const reveal = [current.name, current.city, current.country].filter(Boolean).join(', ');
      setResult(`❌ Not quite. Answer: ${reveal}`);
    }
    renderScore();
    setTimeout(startRound, 800);
  };

  window.giveUp = function giveUp() {
    if (!current) return;
    score -= 1;
    const reveal = [current.name, current.city, current.country].filter(Boolean).join(', ');
    setResult(`👐 You gave up. Answer: ${reveal}`);
    renderScore();
    setTimeout(startRound, 800);
  };

  // ----- Google callback (must exist before API loads) -----
  window.initMap = async function initMap() {
    // Bind DOM
    els.sv     = document.getElementById('street-view'); // Street View container
    els.mode   = document.getElementById('mode');
    els.guess  = document.getElementById('guess');
    els.result = document.getElementById('result');
    els.score  = document.getElementById('score');

    // Create an off-DOM map to bind Street View (optional)
    map = new google.maps.Map(document.createElement('div'), {
      center: { lat: 0, lng: 0 }, zoom: 2, streetViewControl: false
    });

    renderScore();

    const ok = await loadPlaces();
    if (!ok) return;

    startRound();
  };
})();
