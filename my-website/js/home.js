const API_KEY = '9871bc59ef6f90d08eec9c49639c6151';
const BASE_URL = 'https://api.themoviedb.org/3';
const IMG_URL = 'https://image.tmdb.org/t/p/original';
const KISSKH_BASE = 'https://kisskh.nl';
const KISSKH_API = 'https://kisskh.nl/api';
const CORS_PROXY = 'https://cors-anywhere.herokuapp.com/';

// HLS Aggregators
const VIDTUBE_BASE = 'https://vidtube.site';
const ANINAMI_BASE = 'https://www.aninami.site';

let currentItem;

async function fetchTrending(type) {
  const res = await fetch(`${BASE_URL}/trending/${type}/week?api_key=${API_KEY}`);
  const data = await res.json();
  return data.results;
}

async function fetchTrendingAnime() {
  let allResults = [];

  // Fetch from multiple pages to get more anime (max 3 pages for demo)
  for (let page = 1; page <= 3; page++) {
    const res = await fetch(`${BASE_URL}/trending/tv/week?api_key=${API_KEY}&page=${page}`);
    const data = await res.json();
    const filtered = data.results.filter(item =>
      item.original_language === 'ja' && item.genre_ids.includes(16)
    );
    allResults = allResults.concat(filtered);
  }

  return allResults;
}

// New: fetch external IDs (imdb_id, tvdb_id, etc.) from TMDB for the item
async function fetchExternalIds(item) {
  if (!item || !item.id) return;
  const type = item.media_type === "movie" ? "movie" : "tv";
  try {
    const res = await fetch(`${BASE_URL}/${type}/${item.id}/external_ids?api_key=${API_KEY}`);
    if (!res.ok) {
      console.warn('External IDs fetch failed:', res.status, res.statusText);
      return;
    }
    const data = await res.json();
    item.external_ids = data; // attach to the item for later use
    console.info('External IDs fetched:', data);
  } catch (err) {
    console.warn('Error fetching external IDs', err);
  }
}

function displayBanner(item) {
  document.getElementById('banner').style.backgroundImage = `url(${IMG_URL}${item.backdrop_path})`;
  document.getElementById('banner-title').textContent = item.title || item.name;
}

function displayList(items, containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  items.forEach(item => {
    const img = document.createElement('img');
    img.src = `${IMG_URL}${item.poster_path}`;
    img.alt = item.title || item.name;
    img.onclick = () => showDetails(item);
    container.appendChild(img);
  });
}

async function showDetails(item) {
  currentItem = item;
  // fetch external ids before building embeds (so we can use imdb_id, tvdb_id, etc.)
  await fetchExternalIds(currentItem);

  document.getElementById('modal-title').textContent = item.title || item.name;
  document.getElementById('modal-description').textContent = item.overview;
  document.getElementById('modal-image').src = `${IMG_URL}${item.poster_path}`;
  document.getElementById('modal-rating').innerHTML = '★'.repeat(Math.round(item.vote_average / 2));
  changeServer();
  document.getElementById('modal').style.display = 'flex';
}

async function changeServer() {
  const server = document.getElementById('server').value;
  const type = currentItem.media_type === "movie" ? "movie" : "tv";
  let embedURL = "";
  let streamType = "iframe"; // iframe or hls

  if (server === "vidsrc.cc") {
    embedURL = `https://vidsrc.cc/v2/embed/${type}/${currentItem.id}`;
    streamType = "iframe";
  } else if (server === "vidsrc.me") {
    embedURL = `https://vidsrc.net/embed/${type}/?tmdb=${currentItem.id}`;
    streamType = "iframe";
  } else if (server === "player.videasy.net") {
    embedURL = `https://player.videasy.net/${type}/${currentItem.id}`;
    streamType = "iframe";
  } else if (server === "kisskh") {
    embedURL = await getKissKHLink(currentItem);
    streamType = "iframe";
  } else if (server === "vidtube") {
    const hlsUrl = await getVidtubeLink(currentItem);
    if (hlsUrl) {
      embedURL = hlsUrl;
      streamType = "hls";
    }
  } else if (server === "aninami") {
    const hlsUrl = await getAniamiLink(currentItem);
    if (hlsUrl) {
      embedURL = hlsUrl;
      streamType = "hls";
    }
  }

  // Debugging help: print the URL so you can inspect it in console
  console.info('Setting video src ->', embedURL, '(Type:', streamType + ')');
  
  // Switch between iframe and HLS video player
  if (streamType === "hls") {
    loadHLSPlayer(embedURL);
  } else {
    loadIframePlayer(embedURL);
  }
}

function loadIframePlayer(embedURL) {
  // Hide video player, show iframe
  const videoElement = document.getElementById('modal-video');
  const iframeElement = document.getElementById('modal-iframe');
  
  if (videoElement) videoElement.style.display = 'none';
  if (iframeElement) {
    iframeElement.style.display = 'block';
    iframeElement.src = embedURL;
  }
}

function loadHLSPlayer(hlsURL) {
  // Show video player, hide iframe
  const videoElement = document.getElementById('modal-video');
  const iframeElement = document.getElementById('modal-iframe');
  
  if (iframeElement) iframeElement.style.display = 'none';
  if (videoElement) {
    videoElement.style.display = 'block';
    
    // Clear previous source
    videoElement.innerHTML = '';
    
    // Add HLS source
    const source = document.createElement('source');
    source.src = hlsURL;
    source.type = 'application/x-mpegurl';
    videoElement.appendChild(source);
    
    // Initialize HLS player with hls.js if available
    if (window.HLS) {
      const hls = new HLS();
      hls.loadSource(hlsURL);
      hls.attachMedia(videoElement);
    }
  }
}

// VidTube handler - HLS aggregator
async function getVidtubeLink(item) {
  const title = item.title || item.name || '';
  
  try {
    console.info('Searching VidTube for:', title);
    
    // VidTube search
    const searchUrl = `${VIDTUBE_BASE}/api/search?q=${encodeURIComponent(title)}`;
    const searchRes = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!searchRes.ok) {
      console.warn('VidTube search failed:', searchRes.status);
      return null;
    }
    
    const searchData = await searchRes.json();
    console.info('VidTube search response:', searchData);
    
    if (searchData && searchData.results && searchData.results.length > 0) {
      const result = searchData.results[0];
      console.info('Found VidTube video:', result.title);
      
      // Return HLS URL or embed page
      if (result.hls_url) {
        return result.hls_url;
      } else if (result.id) {
        return `${VIDTUBE_BASE}/watch/${result.id}`;
      }
    } else {
      console.warn('No VidTube results found for:', title);
    }
  } catch (err) {
    console.warn('VidTube search failed:', err.message);
  }
  
  return null;
}

// Aninami handler - HLS aggregator (anime focused)
async function getAniamiLink(item) {
  const title = item.title || item.name || '';
  
  try {
    console.info('Searching Aninami for:', title);
    
    // Aninami search
    const searchUrl = `${ANINAMI_BASE}/api/search?q=${encodeURIComponent(title)}`;
    const searchRes = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!searchRes.ok) {
      console.warn('Aninami search failed:', searchRes.status);
      return null;
    }
    
    const searchData = await searchRes.json();
    console.info('Aninami search response:', searchData);
    
    if (searchData && searchData.results && searchData.results.length > 0) {
      const result = searchData.results[0];
      console.info('Found Aninami video:', result.title);
      
      // Return HLS URL or embed page
      if (result.hls_url) {
        return result.hls_url;
      } else if (result.id) {
        return `${ANINAMI_BASE}/watch/${result.id}`;
      }
    } else {
      console.warn('No Aninami results found for:', title);
    }
  } catch (err) {
    console.warn('Aninami search failed:', err.message);
  }
  
  return null;
}

// Updated KissKH handler using CORS proxy to bypass restrictions
async function getKissKHLink(item) {
  const title = item.title || item.name || '';
  
  try {
    console.info('Searching KissKH for:', title);
    
    // Try with CORS proxy first
    const proxyUrl = `${CORS_PROXY}${KISSKH_API}/DramaList/Search?q=${encodeURIComponent(title)}`;
    const searchRes = await fetch(proxyUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!searchRes.ok) {
      console.warn('KissKH search returned status:', searchRes.status);
      throw new Error('KissKH search failed');
    }
    
    const searchData = await searchRes.json();
    console.info('KissKH search response:', searchData);
    
    if (searchData && Array.isArray(searchData) && searchData.length > 0) {
      const result = searchData[0];
      const dramaId = result.id;
      const dramaTitle = result.title || title;
      
      console.info('Found KissKH drama:', dramaTitle, 'ID:', dramaId);
      
      // Return direct link to the drama page
      return `${KISSKH_BASE}/Drama/${dramaId}`;
    } else {
      console.warn('No results found for:', title);
    }
  } catch (err) {
    console.warn('KissKH search failed:', err.message);
  }

  // Fallback: direct search page (will load the full site as backup)
  console.info('Falling back to KissKH search page');
  return `${KISSKH_BASE}/?s=${encodeURIComponent(title)}`;
}

function closeModal() {
  document.getElementById('modal').style.display = 'none';
  const videoElement = document.getElementById('modal-video');
  const iframeElement = document.getElementById('modal-iframe');
  if (videoElement) videoElement.src = '';
  if (iframeElement) iframeElement.src = '';
}

function openSearchModal() {
  document.getElementById('search-modal').style.display = 'flex';
  document.getElementById('search-input').focus();
}

function closeSearchModal() {
  document.getElementById('search-modal').style.display = 'none';
  document.getElementById('search-results').innerHTML = '';
}

async function searchTMDB() {
  const query = document.getElementById('search-input').value;
  if (!query.trim()) {
    document.getElementById('search-results').innerHTML = '';
    return;
  }

  const res = await fetch(`${BASE_URL}/search/multi?api_key=${API_KEY}&query=${query}`);
  const data = await res.json();

  const container = document.getElementById('search-results');
  container.innerHTML = '';
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
}

async function init() {
  const movies = await fetchTrending('movie');
  const tvShows = await fetchTrending('tv');
  const anime = await fetchTrendingAnime();

  displayBanner(movies[Math.floor(Math.random() * movies.length)]);
  displayList(movies, 'movies-list');
  displayList(tvShows, 'tvshows-list');
  displayList(anime, 'anime-list');
}

init();
