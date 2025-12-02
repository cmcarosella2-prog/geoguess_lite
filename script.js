
let apiKey = 'YOUR_API_KEY'; // Replace with your Google API key
let locations = [
    {lat: 48.8584, lng: 2.2945, country: 'France', city: 'Paris'},
    {lat: 40.6892, lng: -74.0445, country: 'USA', city: 'New York'},
    {lat: 35.6586, lng: 139.7454, country: 'Japan', city: 'Tokyo'},
    {lat: -33.8568, lng: 151.2153, country: 'Australia', city: 'Sydney'},
    {lat: 51.5007, lng: -0.1246, country: 'UK', city: 'London'}
];

let currentLocation;
let score = 0;
let maxScore = 10; // For progress bar

function showSpinner(show) {
    document.getElementById('spinner').style.display = show ? 'block' : 'none';
}

function updateProgressBar() {
    let progress = (score / maxScore) * 100;
    document.getElementById('progress-bar').style.width = progress + '%';
}

function loadImage() {
    showSpinner(true);
    currentLocation = locations[Math.floor(Math.random() * locations.length)];
    let imageUrl = `https://maps.googleapis.com/maps/api/streetview?size=600x400&location=${currentLocation.lat},${currentLocation.lng}&key=${apiKey}`;
    
    let img = document.getElementById('street-view');
    img.onload = () => showSpinner(false);
    img.src = imageUrl;
}

function submitGuess() {
    let guess = document.getElementById('guess').value.trim().toLowerCase();
    let mode = document.getElementById('mode').value;
    let result = document.getElementById('result';

    if ((mode === 'easy' && guess === currentLocation.country.toLowerCase()) ||
        (mode === 'hard' && guess === currentLocation.city.toLowerCase())) {
        score++;
        result.textContent = '✅ Correct!';
    } else {
        result.textContent = `❌ Wrong! It was ${mode === 'easy' ? currentLocation.country : currentLocation.city}.`;
    }

    document.getElementById('score').textContent = `Score: ${score}`;
    updateProgressBar();
    document.getElementById('guess').value = '';
    loadImage();
}

window.onload = () => {
    loadImage();
    updateProgressBar();
};

