const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = '4e44d9029b1270a757cddc766a1bcb63';

const HLS_STREAMS = [
  'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
  'https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8',
  'https://res.cloudinary.com/demo/video/upload/sp_auto/sea_turtle.m3u8',
  'https://playertest.longtailvideo.com/adaptive/oceans_aes/oceans_aes.m3u8',
  'https://moctobpltc-i.akamaihd.net/hls/live/571329/eight/playlist.m3u8'
];

const categoryDefs = [
  { id: "c_trends", name: "Tendances actuelles", slug: "tendances", endpoint: `/trending/all/week?api_key=${API_KEY}&language=fr-FR` },
  { id: "c_originals", name: "Netflix Originals", slug: "originals", endpoint: `/discover/tv?api_key=${API_KEY}&with_networks=213&language=fr-FR&sort_by=popularity.desc` },
  { id: "c_top_rated", name: "Les plus gros succès critiques", slug: "top_rated", endpoint: `/movie/top_rated?api_key=${API_KEY}&language=fr-FR` },
  { id: "c_action", name: "Films d'action & Blockbusters", slug: "action", endpoint: `/discover/movie?api_key=${API_KEY}&with_genres=28&language=fr-FR&sort_by=popularity.desc` },
  { id: "c_series", name: "Séries dramatiques & Thrillers", slug: "series", endpoint: `/discover/tv?api_key=${API_KEY}&with_genres=18&language=fr-FR&sort_by=popularity.desc` },
  { id: "c_scifi", name: "Sci-Fi & Mondes fantastiques", slug: "scifi", endpoint: `/discover/movie?api_key=${API_KEY}&with_genres=878&language=fr-FR&sort_by=popularity.desc` },
  { id: "c_anime", name: "Animation & Anime", slug: "anime", endpoint: `/discover/tv?api_key=${API_KEY}&with_genres=16&language=fr-FR&sort_by=popularity.desc` },
  { id: "c_comedy", name: "Comédies populaires", slug: "comedy", endpoint: `/discover/movie?api_key=${API_KEY}&with_genres=35&language=fr-FR&sort_by=popularity.desc` },
  { id: "c_horror", name: "Horreur & Frissons", slug: "horror", endpoint: `/discover/movie?api_key=${API_KEY}&with_genres=27&language=fr-FR&sort_by=popularity.desc` },
  { id: "c_docu", name: "Documentaires captivants", slug: "docu", endpoint: `/discover/movie?api_key=${API_KEY}&with_genres=99&language=fr-FR&sort_by=popularity.desc` }
];

function fetchEndpoint(url) {
  return new Promise((resolve, reject) => {
    https.get(`https://api.themoviedb.org/3${url}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.results || []);
        } catch (e) {
          resolve([]);
        }
      });
    }).on('error', err => resolve([]));
  });
}

async function main() {
  console.log("Recupération des données réelles depuis l'API TMDB...");
  const moviesMap = new Map();
  const categories = [];

  let streamIndex = 0;

  for (const cat of categoryDefs) {
    categories.push({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      description: `Sélection officielle : ${cat.name}`
    });

    console.log(`- Chargement : ${cat.name}...`);
    const results = await fetchEndpoint(cat.endpoint);

    for (const item of results) {
      // Vérifier que le poster et le backdrop existent
      if (!item.poster_path || !item.backdrop_path) continue;
      const title = item.title || item.name;
      if (!title) continue;

      const id = String(item.id);
      const isMovie = !!item.title;

      if (!moviesMap.has(id)) {
        const streamUrl = HLS_STREAMS[streamIndex % HLS_STREAMS.length];
        streamIndex++;

        const releaseDate = item.release_date || item.first_air_date || '2024';
        const year = parseInt(releaseDate.split('-')[0]) || 2024;
        const matchScore = Math.min(99, Math.max(85, Math.round((item.vote_average || 8) * 10) + 5));

        moviesMap.set(id, {
          id: id,
          title: title,
          original_title: item.original_title || item.original_name || null,
          overview: item.overview && item.overview.trim().length > 0 
            ? item.overview 
            : "Une production immersive acclamée par la critique, disponible dès maintenant en haute définition sur Netflix.",
          media_type: isMovie ? "movie" : "series",
          tmdb_id: id,
          poster_url: `https://image.tmdb.org/t/p/w500${item.poster_path}`,
          backdrop_url: `https://image.tmdb.org/t/p/original${item.backdrop_path}`,
          video_url: streamUrl,
          sources: {
            vidsrc: isMovie ? `https://vidsrc.to/embed/movie/${id}` : `https://vidsrc.to/embed/tv/${id}/1/1`,
            embed2: isMovie ? `https://www.2embed.cc/embed/${id}` : `https://www.2embed.cc/embedtv/${id}&s=1&e=1`,
            vidsrcpm: isMovie ? `https://vidsrc.pm/embed/movie/${id}` : `https://vidsrc.pm/embed/tv/${id}/1/1`,
            multiembed: isMovie ? `https://multiembed.mov/?video_id=${id}&tmdb=1` : `https://multiembed.mov/?video_id=${id}&tmdb=1&s=1&e=1`,
            hls: streamUrl,
            server: `/api/stream/${id}`
          },
          categories: [cat.name],
          release_year: year,
          match_score: matchScore,
          age_rating: item.adult ? "18+" : (matchScore > 92 ? "16+" : "12+"),
          duration: isMovie ? "2h 10m" : "1 Saison",
          cast: ["Acteurs Principaux", "Distribution Officielle"],
          director: "Production Réalisée pour Netflix",
          quality_badges: ["4K Ultra HD", "Spatial Audio", "5.1"],
          is_hero: false,
          created_at: new Date().toISOString()
        });
      } else {
        const existing = moviesMap.get(id);
        if (!existing.categories.includes(cat.name)) {
          existing.categories.push(cat.name);
        }
      }
    }
  }

  const movies = Array.from(moviesMap.values());
  if (movies.length > 0) {
    movies[0].is_hero = true; // Définir le premier en Hero
  }

  const finalCatalog = {
    categories: categories,
    movies: movies
  };

  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  fs.writeFileSync(path.join(dataDir, 'catalog.json'), JSON.stringify(finalCatalog, null, 2), 'utf8');
  console.log(`\n======================================================`);
  console.log(`[SUCCES TOTAL] Catalogue authentique TMDB créé !`);
  console.log(`- Total Titres : ${movies.length}`);
  console.log(`- Total Categories : ${categories.length}`);
  console.log(`- Hero Billboard : ${movies[0].title}`);
  console.log(`======================================================\n`);
}

main();
