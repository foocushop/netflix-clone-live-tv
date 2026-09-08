const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'data', 'catalog.json');
const catalog = JSON.parse(fs.readFileSync(file, 'utf8'));

// Check if already exists
const existing = catalog.movies.find(m => m.id === '68628' || m.title.toLowerCase().includes('la villa des'));
if (existing) {
  console.log('Already exists:', existing.title);
  process.exit(0);
}

const newEntry = {
  id: '68628',
  title: 'La Villa des Cœurs Brisés',
  original_title: 'La Villa des Cœurs Brisés',
  overview: "D'anciens candidats d'émissions de télé-réalité célibataires ayant essuyé des déceptions amoureuses, logés dans une luxueuse villa doivent, chaque semaine, suivre des coachings organisés par Lucie Mariotti, la love coach. Chaque semaine, elle s'occupe des Cœurs brisés en leur proposant des rendez-vous avec des prétendants venus spécialement pour eux, ou en effectuant une mission de coaching pour les aider à répondre à leurs problématiques.",
  media_type: 'series',
  tmdb_id: '68628',
  poster_url: 'https://image.tmdb.org/t/p/w500/5xlxVueaXHxWLSoOaBVCv4s3PZV.jpg',
  backdrop_url: 'https://image.tmdb.org/t/p/original/qSJmzqBvb4hGCTw9i9y0GzFLDzN.jpg',
  video_url: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
  sources: {
    vidsrc: 'https://vidsrc.to/embed/tv/68628/1/1',
    embed2: 'https://www.2embed.cc/embedtv/68628&s=1&e=1',
    vidsrcpm: 'https://vidsrc.pm/embed/tv/68628/1/1',
    multiembed: 'https://multiembed.mov/?video_id=68628&tmdb=1&s=1&e=1',
    hls: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
    server: '/api/stream/68628'
  },
  categories: [
    'Tendances actuelles',
    'Séries dramatiques & Thrillers',
    'Comédies populaires'
  ],
  release_year: 2015,
  match_score: 96,
  age_rating: '12+',
  duration: '11 Saisons',
  cast: [
    'Lucie Mariotti',
    'Les Cœurs Brisés',
    'Les Prétendants'
  ],
  director: 'Ah! Production / TFX',
  quality_badges: [
    'HD',
    '5.1',
    'VF'
  ],
  is_hero: false,
  created_at: new Date().toISOString()
};

catalog.movies.unshift(newEntry);
fs.writeFileSync(file, JSON.stringify(catalog, null, 2), 'utf8');
console.log(`Successfully added "${newEntry.title}" to catalog! Total movies: ${catalog.movies.length}`);
