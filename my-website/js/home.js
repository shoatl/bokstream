const API_KEY = '9871bc59ef6f90d08eec9c49639c6151';
const BASE_URL = 'https://api.themoviedb.org/3';
const IMG_URL = 'https://image.tmdb.org/t/p/original';

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

// Fetch external IDs (imdb_id, etc.) from TMDB for the item
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
  // Fetch external ids before building embeds so we can pass imdb_id if necessary
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
  const isMovie = currentItem.media_type === "movie";
  const tmdbId = currentItem.id;
  const imdbId = currentItem.external_ids?.imdb_id || "";
  
  // Hardcoded fallback details for TV shows (Defaulting to Season 1 Episode 1 if not built into your UI context)
  const season = 1;
  const episode = 1;

  let embedURL = "";

  switch (server) {
    case "vidsrc.to":
      // Supports IMDb ID ('tt...') for Movies or TMDB ID for both
      if (isMovie) {
        embedURL = imdbId ? `https://vidsrc.to/embed/movie/${imdbId}` : `https://vidsrc.to/embed/movie/${tmdbId}`;
      } else {
        embedURL = `https://vidsrc.to/embed/tv/${tmdbId}/${season}/${episode}`;
      }
      break;

    case "smashystream":
      if (isMovie) {
        embedURL = `https://player.smashy.stream/movie/${tmdbId}`;
      } else {
        embedURL = `https://player.smashy.stream/tv/${tmdbId}?s=${season}&e=${episode}`;
      }
      break;

    case "2embed":
      if (isMovie) {
        embedURL = `https://www.2embed.cc/embed/${tmdbId}`;
      } else {
        embedURL = `https://www.2embed.cc/embedtv/${tmdbId}&s=${season}&e=${episode}`;
      }
      break;

    case "vidify":
      if (isMovie) {
        embedURL = `https://player.vidify.top/embed/movie/${tmdbId}?autoplay=true`;
      } else {
        embedURL = `https://player.vidify.top/embed/tv/${tmdbId}/${season}/${episode}?autoplay=true`;
      }
      break;

    default:
      // Fallback fallback option
      embedURL = `https://vidsrc.to/embed/movie/${tmdbId}`;
  }

  console.info('Setting video src ->', embedURL, '(Type: iframe)');
  loadIframePlayer(embedURL);
}

function loadIframePlayer(embedURL) {
  const videoElement = document.getElementById('modal-video');
  const iframeElement = document.getElementById('modal-iframe');
  
  if (videoElement) videoElement.style.display = 'none';
  if (iframeElement) {
    iframeElement.style.display = 'block';
    iframeElement.src = embedURL;
  }
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
