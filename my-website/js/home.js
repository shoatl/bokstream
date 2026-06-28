const API_KEY = '9871bc59ef6f90d08eec9c49639c6151';
const BASE_URL = 'https://api.themoviedb.org/3';
const IMG_URL = 'https://image.tmdb.org/t/p/original';
const KISSKH_API = 'https://kisskh.megaplay.su';
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

  if (server === "vidsrc.cc") {
    embedURL = `https://vidsrc.cc/v2/embed/${type}/${currentItem.id}`;
  } else if (server === "vidsrc.me") {
    embedURL = `https://vidsrc.net/embed/${type}/?tmdb=${currentItem.id}`;
  } else if (server === "player.videasy.net") {
    embedURL = `https://player.videasy.net/${type}/${currentItem.id}`;
  } else if (server === "kisskh") {
    embedURL = await getKissKHEmbed(currentItem, type);
  }

  // Debugging help: print the URL so you can inspect it in console
  console.info('Setting video src ->', embedURL);
  document.getElementById('modal-video').src = embedURL;
}

// Updated KissKH handler using embed format from docs
async function getKissKHEmbed(item, type) {
  const title = item.title || item.name || '';
  const externalIds = item.external_ids || {};
  
  // Method 1: Use TVDB ID for TV shows, IMDb ID for movies (direct embed)
  if (type === 'tv' && externalIds.tvdb_id) {
    console.info('Trying KissKH embed with TVDB ID:', externalIds.tvdb_id);
    return `${KISSKH_API}/embed/tv/${externalIds.tvdb_id}`;
  } else if (type === 'movie' && externalIds.imdb_id) {
    console.info('Trying KissKH embed with IMDb ID:', externalIds.imdb_id);
    return `${KISSKH_API}/embed/movie/${externalIds.imdb_id}`;
  }

  // Method 2: Try title-based search
  try {
    console.info('Searching KissKH for:', title);
    const searchRes = await fetch(`${KISSKH_API}/api/search?q=${encodeURIComponent(title)}`);
    
    if (!searchRes.ok) throw new Error('KissKH search failed');
    
    const searchData = await searchRes.json();
    console.info('KissKH search response:', searchData);
    
    if (searchData && searchData.length > 0) {
      const result = searchData[0];
      const id = result.id || result.tv_id || result.movie_id;
      console.info('Found KissKH result:', result, 'ID:', id);
      return `${KISSKH_API}/embed/${type}/${id}`;
    }
  } catch (err) {
    console.warn('KissKH search failed:', err.message);
  }

  // Method 3: Direct title search on KissKH site
  console.info('Falling back to KissKH search page');
  return `${KISSKH_API}/?s=${encodeURIComponent(title)}`;
}

function closeModal() {
  document.getElementById('modal').style.display = 'none';
  document.getElementById('modal-video').src = '';
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
