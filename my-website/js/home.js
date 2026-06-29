// The underlying scraping engine base used by animeflix
const GOGO_SCRAPER_API = 'https://gogoanime.consumet.stream'; 
const PROXY_SERVER = 'https://api.allorigins.win/raw?url=';

async function changeServer() {
  const server = document.getElementById('server').value;
  const isMovie = currentItem.media_type === "movie";
  const tmdbId = currentItem.id;
  const title = currentItem.title || currentItem.name;
  
  // Standard fallbacks for TV/Anime series mapping
  const season = 1;
  const episode = 1;
  let embedURL = "";

  if (server === "gogo-scraper") {
    console.info(`[Gogo-Scraper] Initializing search pipeline for: ${title}`);
    
    // Trigger direct scraping sequence
    const directStreamUrl = await fetchDirectScrapedStream(title, episode);
    
    if (directStreamUrl) {
      loadHLSPlayer(directStreamUrl);
      return; // Break execution to pass flow directly to hls.js player
    } else {
      console.warn("[Gogo-Scraper] Streams missing or lookup failed. Falling back to external frame.");
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

// Pure scraper extraction pipeline
async function fetchDirectScrapedStream(animeTitle, episodeNum) {
  try {
    // Step 1: Clean and format title slug
    const cleanTitle = encodeURIComponent(animeTitle.toLowerCase().replace(/[^a-z0-9 ]/g, ''));
    const searchUrl = `${GOGO_SCRAPER_API}/search?keyw=${cleanTitle}`;
    
    // Route request through proxy to strip browser CORS limits
    const searchResponse = await fetch(`${PROXY_SERVER}${encodeURIComponent(searchUrl)}`);
    if (!searchResponse.ok) return null;
    
    const searchResults = await searchResponse.json();
    if (!searchResults || searchResults.length === 0) return null;

    // Isolate target item identifier
    const animeId = searchResults[0].animeId;
    const targetEpisodeId = `${animeId}-episode-${episodeNum}`;
    
    // Step 2: Fetch decrypted video file streaming pointers
    const streamLookupUrl = `${GOGO_SCRAPER_API}/vidcdn/watch/${targetEpisodeId}`;
    const streamResponse = await fetch(`${PROXY_SERVER}${encodeURIComponent(streamLookupUrl)}`);
    if (!streamResponse.ok) return null;

    const streamData = await streamResponse.json();

    // Step 3: Parse and extract master manifest file path
    if (streamData && streamData.sources && streamData.sources.length > 0) {
      // Prioritize primary adaptive file stream over structural fragments
      console.info("[Gogo-Scraper] Direct stream found:", streamData.sources[0].file);
      return streamData.sources[0].file; 
    }
  } catch (error) {
    console.error("[Scraper Error] Pipeline execution halted:", error.message);
  }
  return null;
}
