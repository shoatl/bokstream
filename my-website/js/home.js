const API_KEY = '9871bc59ef6f90d08eec9c49639c6151';
const BASE_URL = 'https://api.themoviedb.org/3';
const IMG_URL = 'https://image.tmdb.org/t/p/original';

// Active, cloud-maintained scraping endpoint
const ANIME_API_STREAM = 'https://api.consumet.org/anime/gogoanime';

let currentItem;

// Safely fetch media lists from TMDB
async function fetchTrending(type) {
  try {
    const res = await fetch(`${BASE_URL}/trending/${type}/week?api_key=${API_KEY}`);
    if (!res.ok) throw new Error(`TMDB HTTP Error: ${res.status}`);
    const data = await res.json();
    return data.results || [];
  } catch (err) {
    console.error(`Error fetching trending ${type}:`, err);
    return []; // Return fallback empty array so main thread doesn't halt
  }
}

// Safely fetch and compile Japanese Anime listings
async function fetchTrendingAnime() {
  let allResults = [];
  try {
    for (let page = 1; page <= 3; page++) {
      const res = await fetch(`${BASE_URL}/trending/tv/week?api_key=${API_KEY}&page=${page}`);
      if (!res.ok) continue; // Skip a corrupted page instead of crashing everything
      const data = await res.json();
      if (data.results) {
        const filtered = data.results.filter(item =>
          item.original_language === 'ja' && item.genre_ids && item.genre_ids.includes(16)
        );
        allResults = allResults.concat(filtered);
      }
    }
  } catch (err) {
    console.error("Error fetching anime compilation:", err);
  }
  return allResults;
}

// Fetch external database identifiers (e.g., imdb_id) for advanced matching
async function fetchExternalIds(item) {
  if (!item || !item.id) return;
  const type = item.media_type === "movie" ? "movie" : "tv";
  try {
    const res = await fetch(`${BASE_URL}/${type}/${item.id}/external_ids?api_key=${API_KEY}`);
    if (!res.ok) {
      console.warn('External IDs fetch failed:', res.status);
      return;
    }
    const data = await res.json();
    item.external_ids = data;
    console.info('External IDs attached:', data);
  } catch (err) {
    console.warn('Error fetching external IDs', err);
  }
}

function displayBanner(item) {
  const banner = document.getElementById('banner');
  const titleElement = document.getElementById('banner-title');
  if (banner && item.backdrop_path) {
    banner.style.backgroundImage = `url(${IMG_URL}${item.backdrop_path})`;
  }
  if (titleElement) {
    titleElement.textContent = item.title || item.name || "Featured Title";
  }
}

function displayList(items, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  
  items.forEach(item => {
    if (!item.poster_path) return;
    const img = document.createElement('img');
    img.src = `${IMG_URL}${item.poster_path}`;
    img.alt = item.title || item.name;
    img.onclick = () => showDetails(item);
    container.appendChild(img);
  });
}

async function showDetails(item) {
  currentItem = item;
  await fetchExternalIds(currentItem);

  document.getElementById('modal-title').textContent = item.title || item.name;
  document.getElementById('modal-description').textContent = item.overview || "No description available.";
  document.getElementById('modal-image').src = `${IMG_URL}${item.poster_path}`;
  
  const ratingContainer = document.getElementById('modal-rating');
  if (ratingContainer && item.vote_average) {
    ratingContainer.innerHTML = '★'.repeat(Math.round(item.vote_average / 2));
  }
  
  changeServer();
  document.getElementById('modal').style.display = 'flex';
}

async function changeServer() {
  const server = document.getElementById('server').value;
  const isMovie = currentItem.media_type === "movie";
  const tmdbId = currentItem.id;
  const title = currentItem.title || currentItem.name;
  
  const season = 1;
  const episode = 1;
  let embedURL = "";

  if (server === "gogo-scraper") {
    console.info(`[Scraper] Launching cloud parser parameters for: ${title}`);
    const directStreamUrl = await fetchDirectScrapedStream(title, episode);
    
    if (directStreamUrl) {
      loadHLSPlayer(directStreamUrl);
      return; // Route cleanly directly into hls.js module canvas
    } else {
      console.warn("[Scraper] Scraper execution returned null. Auto-routing embed fallback option.");
      embedURL = `https://vidsrc.to/embed/movie/${tmdbId}`;
    }
  } else if (server === "vidsrc.to") {
    embedURL = isMovie ? `https://vidsrc.to/embed/movie/${tmdbId}` : `https://vidsrc.to/embed/tv/${tmdbId}/${season}/${episode}`;
  } else if (server === "smashystream") {
    embedURL = isMovie ? `https://player.smashy.stream/movie/${tmdbId}` : `https://player.smashy.stream/tv/${tmdbId}?s=${season}&e=${episode}`;
  }

  console.info('Setting video src ->', embedURL, '(Type: iframe)');
  loadIframePlayer(embedURL);
}

// Clean cloud scraper execution mapping matching index data models
async function fetchDirectScrapedStream(animeTitle, episodeNum) {
  try {
    const cleanTitle = encodeURIComponent(animeTitle.toLowerCase().replace(/[^a-z0-9 ]/g, ''));
    
    const searchResponse = await fetch(`${ANIME_API_STREAM}/${cleanTitle}`);
    if (!searchResponse.ok) return null;
    
    const searchData = await searchResponse.json();
    if (!searchData.results || searchData.results.length === 0) return null;

    const animeId = searchData.results[0].id;
    const episodeId = `${animeId}-episode-${episodeNum}`;
    
    const streamResponse = await fetch(`${ANIME_API_STREAM}/watch/${episodeId}`);
    if (!streamResponse.ok) return null;

    const streamData = await streamResponse.json();

    if (streamData && streamData.sources && streamData.sources.length > 0) {
      const targetSource = streamData.sources.find(src => src.quality === 'default' || src.quality === 'auto') || streamData.sources[0];
      console.info("[Scraper Source Extracted]", targetSource.url);
      return targetSource.url; 
    }
  } catch (error) {
    console.error("[Scraper API Offline Fallback Flagged]", error.message);
  }
  return null;
}

function loadIframePlayer(embedURL) {
  const videoElement = document.getElementById('modal-video');
  const iframeElement = document.getElementById('modal-iframe');
  
  if (videoElement) {
    videoElement.style.display = 'none';
    videoElement.pause();
    videoElement.src = "";
  }
  if (iframeElement) {
    iframeElement.style.display = 'block';
    iframeElement.src = embedURL;
  }
}

function loadHLSPlayer(hlsURL) {
  const videoElement = document.getElementById('modal-video');
  const iframeElement = document.getElementById('modal-iframe');
  
  if (iframeElement) {
    iframeElement.style.display = 'none';
    iframeElement.src = "";
  }
  
  if (videoElement) {
    videoElement.style.display = 'block';
    videoElement.innerHTML = ''; // Clear prior tracking instances
    
    // Check if the native browser or external Hls integration handles adaptive manifests
    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(hlsURL);
      hls.attachMedia(videoElement);
      hls.on(Hls.Events.MANIFEST_PARSED, function() {
        videoElement.play();
      });
    } else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
      // Native Safari fallback structures
      videoElement.src = hlsURL;
      videoElement.addEventListener('loadedmetadata', function() {
        videoElement.play();
      });
    }
  }
}

function closeModal() {
  document.getElementById('modal').style.display = 'none';
  const videoElement = document.getElementById('modal-video');
  const iframeElement = document.getElementById('modal-iframe');
  if (videoElement) {
    videoElement.pause();
    videoElement.src = '';
  }
  if (iframeElement) iframeElement.src = '';
}

function openSearchModal() {
  document.getElementById('search-modal').style.display = 'flex';
  document.getElementById('search-input').focus();
}

function closeSearchModal() {
  document.getElementById('search-modal').style.display = 'none';
  document.getElementById('search-results').innerHTML = '';
  document.getElementById('search-input').value = '';
}

async function searchTMDB() {
  const query = document.getElementById('search-input').value;
  if (!query.trim()) {
    document.getElementById('search-results').innerHTML = '';
    return;
  }

  try {
    const res = await fetch(`${BASE_URL}/search/multi?api_key=${API_KEY}&query=${encodeURIComponent(query)}`);
    const data = await res.json();
    const container = document.getElementById('search-results');
    container.innerHTML = '';
    
    if (!data.results) return;
    
    data.results.forEach(item => {
      if (!item.poster_path) return;
      const img = document.createElement('img');
      img.src = `${IMG_URL}${item.poster_path}`;
      img.alt = item.title || item.name;
      img.onclick = () => {
        closeSearchModal();
        showDetails(item);
      };
      container.appendChild(img);
    });
  } catch (err) {
    console.error("Search module error tracking down query:", err);
  }
}

// Thread Bootstrapper and Initialize Execution
async function init() {
  console.info("Initializing BokStream application data modules...");
  
  const movies = await fetchTrending('movie');
  const tvShows = await fetchTrending('tv');
  const anime = await fetchTrendingAnime();

  console.info(`Initial Data Payload Loaded Status -> Movies: ${movies.length}, TV: ${tvShows.length}, Anime: ${anime.length}`);

  if (movies.length > 0) {
    displayBanner(movies[Math.floor(Math.random() * movies.length)]);
  } else {
    document.getElementById('banner-title').textContent = "BokStream Hub";
  }

  displayList(movies, 'movies-list');
  displayList(tvShows, 'tvshows-list');
  displayList(anime, 'anime-list');
}

// Start app
init();
