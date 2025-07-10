const fetch = require('node-fetch');

const ALLOWED_ORIGINS = [
  'https://harib-naim.fr',
  'null', 
];

const getHeaders = (event) => {
  const origin = event.headers.origin;
  const headers = {};
  if (ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
  }
  return headers;
};

// Fonction pour obtenir le jeton d'accès de Spotify
const getSpotifyToken = async () => {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64'),
    },
    body: 'grant_type=client_credentials',
  });

  const data = await response.json();
  return data.access_token;
};

exports.handler = async function (event) {
  const headers = getHeaders(event);
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: 'Méthode non autorisée' };
  }

  try {
    const { query } = JSON.parse(event.body);
    if (!query) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'La requête de recherche est vide.' }) };
    }

    const token = await getSpotifyToken();
    const searchUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=10`;

    const searchResponse = await fetch(searchUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!searchResponse.ok) {
      throw new Error('La recherche Spotify a échoué.');
    }

    const searchData = await searchResponse.json();
    const tracks = searchData.tracks.items.map(track => ({
      songId: track.id,
      title: track.name,
      artist: track.artists.map(a => a.name).join(', '),
      albumArtUrl: track.album.images[0]?.url || '',
      spotifyUrl: track.external_urls.spotify,
    }));

    return {
      statusCode: 200,
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(tracks),
    };

  } catch (error) {
    console.error("[search-spotify] Function Error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || "Impossible d'effectuer la recherche sur Spotify." }),
    };
  }
};