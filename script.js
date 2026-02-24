// Spotify Web API Configuration
let CLIENT_ID = '';
let CLIENT_SECRET = '';

// DOM Elements
const artistInput = document.getElementById('artistInput');
const searchBtn = document.getElementById('searchBtn');
const loadingSpinner = document.getElementById('loadingSpinner');
const errorMessage = document.getElementById('errorMessage');
const resultsSection = document.getElementById('resultsSection');
const resultsTitle = document.getElementById('resultsTitle');
const albumGrid = document.getElementById('albumGrid');
const container = document.querySelector('.container');
const header = document.querySelector('header');
const main = document.querySelector('main');
const footer = document.querySelector('footer');

// Global variables
let accessToken = null;

// Event Listeners
document.addEventListener('DOMContentLoaded', initializeApp);
searchBtn.addEventListener('click', handleSearch);
artistInput.addEventListener('keypress', handleKeyPress);

// Initialize the application
async function initializeApp() {
    try {
        await loadEnvConfig();
        await getAccessToken();
        console.log('App initialized successfully');
        // Set initial centered state
        centerLayout();
    } catch (error) {
        showError('Failed to initialize application. Please check your API credentials.');
        console.error('Initialization error:', error);
    }
}

// Load environment values from .env file
async function loadEnvConfig() {
    const response = await fetch('.env', { cache: 'no-store' });

    if (!response.ok) {
        throw new Error('Could not load .env file. Run the app with a local server and ensure .env exists.');
    }

    const envText = await response.text();
    const env = parseEnvFile(envText);

    CLIENT_ID = env.CLIENT_ID || env.SPOTIFY_CLIENT_ID || '';
    CLIENT_SECRET = env.CLIENT_SECRET || env.SPOTIFY_CLIENT_SECRET || '';

    if (!CLIENT_ID || !CLIENT_SECRET) {
        throw new Error('Missing CLIENT_ID or CLIENT_SECRET in .env file.');
    }
}

function parseEnvFile(content) {
    return content
        .split(/\r?\n/)
        .reduce((acc, line) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) {
                return acc;
            }

            const separatorIndex = trimmed.indexOf('=');
            if (separatorIndex === -1) {
                return acc;
            }

            const key = trimmed.slice(0, separatorIndex).trim();
            const value = trimmed.slice(separatorIndex + 1).trim();

            if (key) {
                acc[key] = value;
            }

            return acc;
        }, {});
}

// Handle enter key press in input field
function handleKeyPress(event) {
    if (event.key === 'Enter') {
        handleSearch();
    }
}

// Handle search button click
async function handleSearch() {
    const artistName = artistInput.value.trim();
    
    if (!artistName) {
        showError('Please enter an artist name');
        return;
    }
    
    if (!accessToken) {
        showError('Authentication failed. Please check your API credentials.');
        return;
    }
    
    try {
        showLoading();
        hideError();
        hideResults();
        
        const artistId = await searchArtist(artistName);
        if (!artistId) {
            showError(`Artist "${artistName}" not found. Please try a different name.`);
            hideLoading();
            return;
        }
        
        const albums = await getArtistAlbums(artistId);
        hideLoading();
        
        if (albums.length === 0) {
            showError(`No albums found for "${artistName}".`);
        } else {
            displayAlbums(albums, artistName);
        }
        
    } catch (error) {
        hideLoading();
        showError('An error occurred while searching. Please try again.');
        console.error('Search error:', error);
    }
}

// Get Spotify access token using Client Credentials flow
async function getAccessToken() {
    if (!CLIENT_ID || !CLIENT_SECRET) {
        throw new Error('Please set your Spotify API credentials');
    }
    
    const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`
        },
        body: 'grant_type=client_credentials'
    });
    
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    accessToken = data.access_token;
    
    // Refresh token before it expires
    setTimeout(() => {
        getAccessToken();
    }, (data.expires_in - 60) * 1000);
    
    return accessToken;
}

// Search for artist and return artist ID
async function searchArtist(artistName) {
    const response = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(artistName)}&type=artist&limit=1`,
        {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        }
    );
    
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.artists.items.length === 0) {
        return null;
    }
    
    return data.artists.items[0].id;
}

// Get albums for a specific artist
async function getArtistAlbums(artistId) {
    const response = await fetch(
        `https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=album,single&market=US&limit=50`,
        {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        }
    );
    
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Remove duplicates, filter by track count > 3, and sort by release date (newest first)
    const uniqueAlbums = removeDuplicateAlbums(data.items);
    const filteredAlbums = uniqueAlbums.filter(album => album.total_tracks > 3);
    return filteredAlbums.sort((a, b) => new Date(b.release_date) - new Date(a.release_date));
}

// Remove duplicate albums (same name, different markets)
function removeDuplicateAlbums(albums) {
    const seen = new Set();
    return albums.filter(album => {
        const key = `${album.name.toLowerCase()}-${album.release_date}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

// Display albums in the grid
function displayAlbums(albums, artistName) {
    resultsTitle.textContent = `Albums by ${artistName} (${albums.length} found)`;
    albumGrid.innerHTML = '';
    
    albums.forEach((album, index) => {
        const albumCard = createAlbumCard(album, index);
        albumGrid.appendChild(albumCard);
    });
    
    showResults();
    uncenterLayout();
}

// Create individual album card element
function createAlbumCard(album, index) {
    const card = document.createElement('div');
    card.className = 'album-card';
    card.style.animationDelay = `${index * 0.1}s`;
    
    const imageUrl = album.images && album.images.length > 0 
        ? album.images[0].url 
        : 'https://via.placeholder.com/300x300?text=No+Image';
    
    const releaseYear = new Date(album.release_date).getFullYear();
    const albumType = album.album_type.charAt(0).toUpperCase() + album.album_type.slice(1);
    
    card.innerHTML = `
        <img src="${imageUrl}" alt="${album.name}" class="album-image" loading="lazy">
        <div class="album-info">
            <h3 class="album-name">${escapeHtml(album.name)}</h3>
            <p class="album-artist">${escapeHtml(album.artists.map(artist => artist.name).join(', '))}</p>
            <p class="album-year">${releaseYear} • ${albumType}</p>
            <p class="album-tracks">${album.total_tracks} track${album.total_tracks !== 1 ? 's' : ''}</p>
        </div>
    `;
    
    // Add click handler to open album in Spotify
    card.addEventListener('click', () => {
        if (album.external_urls && album.external_urls.spotify) {
            window.open(album.external_urls.spotify, '_blank');
        }
    });
    
    // Add keyboard navigation
    card.setAttribute('tabindex', '0');
    card.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            card.click();
        }
    });
    
    return card;
}

// Utility function to escape HTML
function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// UI Helper Functions
function showLoading() {
    loadingSpinner.classList.remove('hidden');
}

function hideLoading() {
    loadingSpinner.classList.add('hidden');
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
}

function hideError() {
    errorMessage.classList.add('hidden');
}

function showResults() {
    resultsSection.classList.remove('hidden');
}

function hideResults() {
    resultsSection.classList.add('hidden');
}

// Layout functions
function centerLayout() {
    container.classList.add('centered');
    header.classList.add('centered');
    main.classList.add('centered');
    footer.classList.add('hidden');
}

function uncenterLayout() {
    container.classList.remove('centered');
    header.classList.remove('centered');
    main.classList.remove('centered');
    footer.classList.remove('hidden');
}

// Handle API errors gracefully
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    hideLoading();
    showError('An unexpected error occurred. Please try again.');
});

// Add some example searches for demonstration
function addExampleSearches() {
    const examples = ['The Beatles', 'Taylor Swift', 'Radiohead', 'Beyoncé', 'Ed Sheeran'];
    
    // You could add buttons for quick example searches
    const examplesContainer = document.createElement('div');
    examplesContainer.className = 'examples-container';
    examplesContainer.innerHTML = `
        <p>Try searching for: ${examples.map(artist => 
            `<button class="example-btn" onclick="searchExample('${artist}')">${artist}</button>`
        ).join(' ')}</p>
    `;
    
    // Uncomment to add example buttons
    // document.querySelector('.search-section').appendChild(examplesContainer);
}

function searchExample(artistName) {
    artistInput.value = artistName;
    handleSearch();
}

// Initialize example searches (commented out by default)
// addExampleSearches();