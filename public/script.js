/* =========================================================================
   Street View Guessing Game - script.js
   Features:
     - Google Maps Street View integration
     - Difficulty weighting & random selection from places.json
     - Score tracking (+1 / -1)
     - "I Give Up" button
     - No repeats in a session
     - Google Maps API callback: initMap()

   Expected HTML elements (by id):
     - #streetview           : container div for Street View
     - #score                : element to show score
     - #status               : small text area for messages (correct/incorrect/etc.)
     - #guessInput           : text input for user guess (e.g., city or place name)
     - #guessBtn             : button to submit guess
     - #giveUpBtn            : button to give up the current round
     - #nextBtn              : button to move to next location
     - (optional) #meta      : element to show meta info after reveal

   Google Maps script tag (in HTML):
     https://maps.googleapis.com/maps/api/js?key=YOUR_API_KEY&callback=initMap</script>

   NOTE:
     - Ensure this script is included BEFORE the Maps API script tag:
       script.js</script>
       https://maps.googleapis.com/maps/api/js?key=YOUR_API_KEY&callback=initMap</script>
   ========================================================================= */

(() => {
  // ------------------------------
  // Global state
  // ------------------------------
  let map = null; // Not displayed, but can be used if you want a static map later
  let panorama = null;

  /** @type {Array<Object>} loaded from places.json */
  let PLACES = [];

  /** @type {Set<string>} keep track of used IDs to avoid repeats */
  const usedPlaceIds = new Set();

  /** @type {Object|null} the currently active place object */
  let currentPlace = null;

  /** Score tracking */
  let score = 0;
  let roundsPlayed = 0;

  // ------------------------------
  // UI elements (queried lazily after DOM is ready)
  // ------------------------------
  const els = {
    streetview: null,
    score: null,
    status: null,
    guessInput: null,
    guessBtn: null,
    giveUpBtn: null,
    nextBtn: null,
    meta: null
  };

  // ------------------------------
  // Utility functions
  // ------------------------------

  /**
   * Map difficulty to a default weight if `weight` is missing.
   * Higher weight => higher probability to be chosen.
   * Adjust these values to tune game balance.
   */
  function defaultWeightFromDifficulty(diff) {
    switch ((diff || '').toLowerCase()) {
      case 'easy': return 5;
      case 'medium': return 3;
      case 'hard': return 1;
      default: return 2; // fallback
    }
  }

  /**
   * Shuffle array in-place using Fisher-Yates.
   */
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /**
   * Build a weighted pool of indexes for random selection.
   * Excludes already-used places.
   */
  function buildWeightedPool() {
    const pool = [];
    PLACES.forEach((p, idx) => {
      if (!p || !p.id) return;
      if (usedPlaceIds.has(p.id)) return; // skip repeats
      const w = Number.isFinite(p.weight)
        ? Math.max(1, Math.floor(p.weight))
        : defaultWeightFromDifficulty(p.difficulty);
      for (let i = 0; i < w; i++) pool.push(idx);
    });
    return pool.length ? shuffle(pool) : [];
  }

  /**
   * Select a new random place using weighted pool.
   * Returns the selected place object or null if exhausted.
   */
  function pickNextPlace() {
    const pool = buildWeightedPool();
    if (!pool.length) return null;
    const nextIndex = pool[Math.floor(Math.random() * pool.length)];
    return PLACES[nextIndex] || null;
  }

  /**
   * Normalize strings for loose matching (name/city/country).
   */
  function norm(s) {
    return (s || '').toLowerCase().trim();
  }

  /**
   * A simple correctness check:
   * - If user includes the place name OR city in their guess => correct.
   * You can tighten/expand this logic depending on your game rules.
   */
  function isGuessCorrect(guess, place) {
    const g = norm(guess);
    const name = norm(place.name);
    const city = norm(place.city);
    const country = norm(place.country);
    if (!g) return false;
    // Correct if includes name OR city (and optionally country helps)
    return (
      (name && g.includes(name)) ||
      (city && g.includes(city)) ||
      (country && g.includes(country))
    );
  }

  /**
   * Update score display.
   */
  function renderScore() {
    if (els.score) {
      els.score.textContent = `Score: ${score}  •  Rounds: ${roundsPlayed}`;
    }
  }

  /**
   * Show a status message.
   */
  function setStatus(msg, type = 'info') {
    if (!els.status) return;
    els.status.textContent = msg;
    els.status.className = ''; // reset classes
    els.status.classList.add('status', `status--${type}`);
  }

  /**
   * Populate meta info after reveal (optional element).
   */
  function renderMeta(place) {
    if (!els.meta) return;
    const parts = [];
    if (place.name) parts.push(`<strong>${place.name}</strong>`);
    const loc = [place.city, place.country].filter(Boolean).join(', ');
    if (loc) parts.push(loc);
    parts.push(`Lat: ${place.lat?.toFixed?.(5)}, Lng: ${place.lng?.toFixed?.(5)}`);
    if (place.difficulty) parts.push(`Difficulty: ${place.difficulty}`);
    els.meta.innerHTML = parts.join(' • ');
  }

  /**
   * Reset UI for a fresh round.
   */
  function resetRoundUI() {
    if (els.guessInput) {
      els.guessInput.value = '';
      els.guessInput.disabled = false;
      els.guessInput.focus();
    }
    if (els.guessBtn) els.guessBtn.disabled = false;
    if (els.giveUpBtn) els.giveUpBtn.disabled = false;
    if (els.nextBtn) els.nextBtn.disabled = true; // prevent skipping before a guess
    setStatus('Make a guess!', 'info');
    if (els.meta) els.meta.textContent = '';
  }

  /**
   * Disable interaction after reveal.
   */
  function lockRoundUI() {
    if (els.guessInput) els.guessInput.disabled = true;
    if (els.guessBtn) els.guessBtn.disabled = true;
    if (els.giveUpBtn) els.giveUpBtn.disabled = true;
    if (els.nextBtn) els.nextBtn.disabled = false;
  }

  // ------------------------------
  // Core game actions
  // ------------------------------

  /**
   * Load places.json (same origin).
   * Cache-bust with a small random param to avoid stale loads during dev.
   */
  async function loadPlaces() {
    try {
      const res = await fetch(`places.json?cb=${Math.random().toString(36).slice(2)}`);
      if (!res.ok) throw new Error(`Failed to load places.json: ${res.status} ${res.statusText}`);
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('places.json is empty or not an array.');
      }
      // Validate minimal fields and normalize
      PLACES = data
        .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng))
        .map(p => ({
          id: p.id || `${p.name || 'place'}-${p.lat}-${p.lng}`,
          name: p.name || '',
          city: p.city || '',
          country: p.country || '',
          lat: p.lat,
          lng: p.lng,
          difficulty: p.difficulty || '',
          weight: Number.isFinite(p.weight) ? p.weight : undefined,
          // Optional POV hints (if provided in JSON)
          pov: p.pov && typeof p.pov === 'object' ? p.pov : null
        }));
      return true;
    } catch (err) {
      console.error(err);
      setStatus(`Error: ${err.message}`, 'error');
      return false;
    }
  }

  /**
   * Start a new round: pick a place, set Street View.
   */
  function startRound() {
    const place = pickNextPlace();
    if (!place) {
      // Exhausted: all places used
      currentPlace = null;
      setStatus('You’ve seen all locations! Resetting…', 'info');
      // Reset used set and start again
      usedPlaceIds.clear();
      renderScore();
      setTimeout(() => {
        const p2 = pickNextPlace();
        if (!p2) {
          setStatus('No valid places available. Check places.json.', 'error');
          return;
        }
        currentPlace = p2;
        usedPlaceIds.add(currentPlace.id);
        showStreetView(currentPlace);
        resetRoundUI();
      }, 600);
      return;
    }
    currentPlace = place;
    usedPlaceIds.add(currentPlace.id);
    showStreetView(currentPlace);
    resetRoundUI();
  }

  /**
   * Initialize or update Street View at the selected place.
   */
  function showStreetView(place) {
    if (!panorama) {
      panorama = new google.maps.StreetViewPanorama(els.streetview, {
        position: { lat: place.lat, lng: place.lng },
        pov: place.pov || { heading: 0, pitch: 0 },
        linksControl: true,
        addressControl: false,
        panControl: true,
        enableCloseButton: false,
        fullscreenControl: true,
        zoom: 1
      });
    } else {
      panorama.setPosition({ lat: place.lat, lng: place.lng });
      if (place.pov) panorama.setPov(place.pov);
    }
    // Optionally, you could randomize POV slightly to add challenge:
    // panorama.setPov({ heading: Math.floor(Math.random() * 360), pitch: 0 });

    // If you want to keep a hidden map in sync:
    if (map) {
      map.setCenter({ lat: place.lat, lng: place.lng });
      map.setZoom(14);
      map.setStreetView(panorama);
    }
  }

  /**
   * Handle guess submission: updates score and locks the round.
   */
  function handleGuess() {
    if (!currentPlace) return;
    const guess = (els.guessInput?.value || '').trim();
    if (!guess) {
      setStatus('Type a guess (place or city) before submitting.', 'warn');
      return;
    }
    const correct = isGuessCorrect(guess, currentPlace);
    roundsPlayed += 1;
    if (correct) {
      score += 1;
      setStatus(`✅ Correct! It was ${currentPlace.name || currentPlace.city || 'this location'}.`, 'success');
    } else {
      score -= 1;
      const locText = [currentPlace.name, currentPlace.city, currentPlace.country]
        .filter(Boolean).join(', ');
      setStatus(`❌ Not quite. Answer: ${locText}`, 'error');
      renderMeta(currentPlace);
    }
    renderScore();
    lockRoundUI();
  }

  /**
   * Handle "I Give Up": reveal and penalize.
   */
  function handleGiveUp() {
    if (!currentPlace) return;
    roundsPlayed += 1;
    score -= 1;
    const locText = [currentPlace.name, currentPlace.city, currentPlace.country]
      .filter(Boolean).join(', ');
    setStatus(`👐 You gave up. Answer: ${locText}`, 'warn');
    renderMeta(currentPlace);
    renderScore();
    lockRoundUI();
  }

  /**
   * Move to next round (after reveal or guess).
   */
  function handleNext() {
    startRound();
  }

  // ------------------------------
  // Initialization & Google callback
  // ------------------------------

  /**
   * Called by Google Maps API via &callback=initMap
   * Ensure this function is in global scope.
   */
  window.initMap = async function initMap() {
    // Hook up DOM
    els.streetview = document.getElementById('streetview');
    els.score = document.getElementById('score');
    els.status = document.getElementById('status');
    els.guessInput = document.getElementById('guessInput');
    els.guessBtn = document.getElementById('guessBtn');
    els.giveUpBtn = document.getElementById('giveUpBtn');
    els.nextBtn = document.getElementById('nextBtn');
    els.meta = document.getElementById('meta');

    // Optional: create an invisible map for Street View binding
    // (If you want a visible map, add a container and assign here.)
    map = new google.maps.Map(document.createElement('div'), {
      center: { lat: 0, lng: 0 },
      zoom: 2,
      streetViewControl: false,
      mapTypeControl: false
    });

    // Wire events
    if (els.guessBtn) els.guessBtn.addEventListener('click', handleGuess);
    if (els.giveUpBtn) els.giveUpBtn.addEventListener('click', handleGiveUp);
    if (els.nextBtn) els.nextBtn.addEventListener('click', handleNext);
