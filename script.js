let apiKey = 'YOUR_API_KEY';
let locations = [
    {lat: 48.8584, lng: 2.2945, country: 'France', city: 'Paris'}, // Eiffel Tower
    {lat: 40.6892, lng: -74.0445, country: 'USA', city: 'New York'}, // Statue of Liberty
    {lat: 35.6586, lng: 139.7454, country: 'Japan', city: 'Tokyo'}, // Tokyo Tower
    {lat: -33.8568, lng: 151.2153, country: 'Australia', city: 'Sydney'}, // Sydney Opera House
    {lat: 51.5007, lng: -0.1246, country: 'UK', city: 'London'} // Big Ben
];

let currentLocation;
let score = 0;

function loadImage() {
    currentLocation = locations[Math.floor(Math.random() * locations.length)];
    let imageUrl = `https://maps.googleapis.com/maps/api/streetview?size=600x400&location=${currentLocation.lat},${currentLocation.lng}&key=${apiKey}`;
    document.getElementById('street-view').src = imageUrl;
}

function submitGuess() {
    let guess = document.getElementById('guess').value.trim().toLowerCase();
    let mode = document.getElementById('mode').value;
    let result = document.getElementById('result');

    if ((mode === 'easy' && guess === currentLocation.country.toLowerCase()) ||
        (mode === 'hard' && guess === currentLocation.city.toLowerCase())) {
        score++;
        result.textContent = 'Correct!';
    } else {
        result.textContent = `Wrong! It was ${mode === 'easy' ? currentLocation.country : currentLocation.city}.`;
    }
    document.getElementById('score').textContent = `Score: ${score}`;
    document.getElementById('guess').value = '';
    loadImage();
}

window.onload = loadImage;
