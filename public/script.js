let places = [];
let usedPlaces = new Set();
let currentPlace = null;
let score = 0;
function initMap() {
  const mapOptions = {
    center: { lat: -34.397, lng: 150.644 }, // Initial center coordinates
    zoom: 8, // Initial zoom level
  };

  const map = new google.maps.Map(document.getElementById("map"), mapOptions);

  // You can add markers, info windows, or other features here
  const marker = new google.maps.Marker({
    position: { lat: -34.397, lng: 150.644 },
    map: map,
    title: "Hello Google Maps!",
  });
}
// Load places from places.json
async function loadPlaces() {
    const response = await fetch('places.json');
    places = await response.json();
    nextLocation();
}

// Pick next location based on score weighting
function nextLocation() {
    let difficultyPool;

    if (score <= 7) {
        difficultyPool = places.filter(p => p.difficulty === 'easy');
    } else if (score <= 15) {
        difficultyPool = places.filter(p => p.difficulty === 'medium' || p.difficulty === 'easy');
    } else {
        difficultyPool = places.filter(p => ['easy', 'medium', 'hard'].includes(p.difficulty));
    }

    // Remove used places
    difficultyPool = difficultyPool.filter(p => !usedPlaces.has(p.name));

    if (difficultyPool.length === 0) {
        alert('No more locations available!');
        return;
    }

    // Random pick
    currentPlace = difficultyPool[Math.floor(Math.random() * difficultyPool.length)];
    usedPlaces.add(currentPlace.name);

    // Show Street View
    showStreetView(currentPlace.lat, currentPlace.lng);
}

// Google Maps Street View
function showStreetView(lat, lng) {
    const panorama = new google.maps.StreetViewPanorama(
        document.getElementById('street-view'),
        {
            position: { lat: lat, lng: lng },
            pov: { heading: 165, pitch: 0 },
            zoom: 1
        }
    );
}

// Submit guess
function submitGuess() {
    const guess = document.getElementById('guess').value.trim().toLowerCase();
    const correctCity = currentPlace.city.toLowerCase();
    const correctCountry = currentPlace.country.toLowerCase();

    if (guess === correctCity || guess === correctCountry) {
        alert('✅ Correct!');
        score++;
    } else {
        alert('❌ Incorrect!');
        score--;
    }

    document.getElementById('score').innerText = `Score: ${score}`;
    document.getElementById('guess').value = '';
    nextLocation();
}

// Give up button
function giveUp() {
    alert(`The correct answer was: ${currentPlace.city}, ${currentPlace.country}`);
    nextLocation();
}

// Initialize game
window.onload = loadPlaces;
