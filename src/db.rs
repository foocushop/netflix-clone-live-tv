use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::RwLock;
use serde::{Deserialize, Serialize};
use chrono::Utc;

use crate::models::{AdminStats, Category, CreateMovieInput, Movie, UpdateMovieInput};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatalogData {
    pub movies: Vec<Movie>,
    pub categories: Vec<Category>,
}

pub struct Database {
    data_path: PathBuf,
    state: RwLock<CatalogData>,
    start_time: Instant,
}

pub type DbHandle = Arc<Database>;

impl Database {
    pub async fn init<P: AsRef<Path>>(data_dir: P) -> DbHandle {
        let dir = data_dir.as_ref();
        if !dir.exists() {
            let _ = tokio::fs::create_dir_all(dir).await;
        }

        let file_path = dir.join("catalog.json");
        let catalog_data = if file_path.exists() {
            match tokio::fs::read_to_string(&file_path).await {
                Ok(content) => match serde_json::from_str::<CatalogData>(&content) {
                    Ok(data) => {
                        tracing::info!("Catalogue chargé avec succès depuis {:?}", file_path);
                        data
                    }
                    Err(err) => {
                        tracing::warn!("Erreur lors du parsing de catalog.json ({}), réinitialisation avec les données par défaut", err);
                        Self::default_seed()
                    }
                },
                Err(err) => {
                    tracing::warn!("Erreur de lecture de catalog.json ({}), initialisation par défaut", err);
                    Self::default_seed()
                }
            }
        } else {
            tracing::info!("Fichier catalog.json introuvable, création du catalogue par défaut");
            let default_data = Self::default_seed();
            let _ = Self::write_disk(&file_path, &default_data).await;
            default_data
        };

        Arc::new(Database {
            data_path: file_path,
            state: RwLock::new(catalog_data),
            start_time: Instant::now(),
        })
    }

    async fn write_disk(path: &Path, data: &CatalogData) -> Result<(), std::io::Error> {
        let json = serde_json::to_string_pretty(data)?;
        tokio::fs::write(path, json).await
    }

    pub async fn persist(&self) -> Result<(), std::io::Error> {
        let state = self.state.read().await;
        Self::write_disk(&self.data_path, &state).await
    }

    pub async fn get_all_movies(&self) -> Vec<Movie> {
        self.state.read().await.movies.clone()
    }

    pub async fn get_movie_by_id(&self, id: &str) -> Option<Movie> {
        self.state
            .read()
            .await
            .movies
            .iter()
            .find(|m| m.id == id || m.tmdb_id.as_deref() == Some(id))
            .cloned()
    }

    pub async fn get_hero_movie(&self) -> Option<Movie> {
        let state = self.state.read().await;
        state.movies.iter().find(|m| m.is_hero).cloned().or_else(|| state.movies.first().cloned())
    }

    pub async fn set_hero_movie(&self, id: &str) -> Result<Movie, String> {
        let mut state = self.state.write().await;
        let mut found = false;
        let mut updated_movie = None;

        for m in state.movies.iter_mut() {
            if m.id == id {
                m.is_hero = true;
                found = true;
                updated_movie = Some(m.clone());
            } else {
                m.is_hero = false;
            }
        }

        if !found {
            return Err("Média introuvable".to_string());
        }

        drop(state);
        let _ = self.persist().await;
        Ok(updated_movie.unwrap())
    }

    pub async fn get_categories(&self) -> Vec<Category> {
        self.state.read().await.categories.clone()
    }

    pub async fn search_movies(&self, query: &str) -> Vec<Movie> {
        let q = query.trim().to_lowercase();
        if q.is_empty() {
            return self.get_all_movies().await;
        }

        let state = self.state.read().await;
        state.movies.iter().filter(|m| {
            m.title.to_lowercase().contains(&q)
                || m.overview.to_lowercase().contains(&q)
                || m.categories.iter().any(|c| c.to_lowercase().contains(&q))
                || m.cast.iter().any(|actor| actor.to_lowercase().contains(&q))
                || m.director.as_ref().map_or(false, |d| d.to_lowercase().contains(&q))
        }).cloned().collect()
    }

    pub async fn create_movie(&self, input: CreateMovieInput) -> Result<Movie, String> {
        let mut state = self.state.write().await;
        let new_id = format!("m_{}", Utc::now().timestamp_millis());

        let is_hero = input.is_hero.unwrap_or(false);
        if is_hero {
            for m in state.movies.iter_mut() {
                m.is_hero = false;
            }
        }

        let movie = Movie {
            id: new_id,
            title: input.title,
            original_title: input.original_title,
            overview: input.overview,
            media_type: input.media_type.unwrap_or_else(|| "movie".to_string()),
            poster_url: input.poster_url,
            backdrop_url: input.backdrop_url,
            video_url: input.video_url,
            categories: if input.categories.is_empty() {
                vec!["Tendances".to_string()]
            } else {
                input.categories
            },
            release_year: input.release_year.unwrap_or(2025),
            match_score: input.match_score.unwrap_or(95),
            age_rating: input.age_rating.unwrap_or_else(|| "16+".to_string()),
            duration: input.duration.unwrap_or_else(|| "2h 10m".to_string()),
            cast: input.cast.unwrap_or_else(Vec::new),
            director: input.director,
            quality_badges: vec!["4K Ultra HD".to_string(), "Spatial Audio".to_string(), "5.1".to_string()],
            is_hero,
            created_at: Utc::now().to_rfc3339(),
            tmdb_id: None,
            daddy_id: None,
            channel_number: None,
            is_live: None,
            sources: None,
            seasons: input.seasons,
        };

        state.movies.push(movie.clone());
        drop(state);
        let _ = self.persist().await;
        Ok(movie)
    }

    pub async fn update_movie(&self, id: &str, input: UpdateMovieInput) -> Result<Movie, String> {
        let mut state = self.state.write().await;

        if input.is_hero == Some(true) {
            for m in state.movies.iter_mut() {
                if m.id != id {
                    m.is_hero = false;
                }
            }
        }

        let movie_idx = state.movies.iter().position(|m| m.id == id);
        match movie_idx {
            Some(idx) => {
                let m = &mut state.movies[idx];
                if let Some(t) = input.title { m.title = t; }
                if let Some(ot) = input.original_title { m.original_title = Some(ot); }
                if let Some(ov) = input.overview { m.overview = ov; }
                if let Some(mt) = input.media_type { m.media_type = mt; }
                if let Some(pu) = input.poster_url { m.poster_url = pu; }
                if let Some(bu) = input.backdrop_url { m.backdrop_url = bu; }
                if let Some(vu) = input.video_url { m.video_url = vu; }
                if let Some(cats) = input.categories { m.categories = cats; }
                if let Some(ry) = input.release_year { m.release_year = ry; }
                if let Some(ms) = input.match_score { m.match_score = ms; }
                if let Some(ar) = input.age_rating { m.age_rating = ar; }
                if let Some(dur) = input.duration { m.duration = dur; }
                if let Some(c) = input.cast { m.cast = c; }
                if let Some(d) = input.director { m.director = Some(d); }
                if let Some(h) = input.is_hero { m.is_hero = h; }
                if let Some(s) = input.seasons { m.seasons = Some(s); }

                let updated = m.clone();
                drop(state);
                let _ = self.persist().await;
                Ok(updated)
            }
            None => Err("Média introuvable".to_string()),
        }
    }

    pub async fn delete_movie(&self, id: &str) -> Result<(), String> {
        let mut state = self.state.write().await;
        let before_len = state.movies.len();
        state.movies.retain(|m| m.id != id && m.tmdb_id.as_deref() != Some(id));

        if state.movies.len() == before_len {
            return Err("Média introuvable".to_string());
        }

        // S'il n'y a plus de hero, promouvoir le premier
        if !state.movies.iter().any(|m| m.is_hero) && !state.movies.is_empty() {
            state.movies[0].is_hero = true;
        }

        drop(state);
        let _ = self.persist().await;
        Ok(())
    }

    pub async fn get_stats(&self) -> AdminStats {
        let state = self.state.read().await;
        let total_titles = state.movies.len();
        let total_movies = state.movies.iter().filter(|m| m.media_type == "movie").count();
        let total_series = state.movies.iter().filter(|m| m.media_type == "series").count();
        let total_categories = state.categories.len();
        let active_hero_title = state.movies.iter().find(|m| m.is_hero).map(|m| m.title.clone());

        AdminStats {
            total_titles,
            total_movies,
            total_series,
            total_categories,
            server_uptime_seconds: self.start_time.elapsed().as_secs(),
            active_hero_title,
            rust_engine: "Axum v0.7 + Tokio + Tower-HTTP".to_string(),
            system_status: "Opérationnel (100% Rust)".to_string(),
        }
    }

    fn default_seed() -> CatalogData {
        let categories = vec![
            Category {
                id: "c_trends".to_string(),
                name: "Tendances actuelles".to_string(),
                slug: "tendances".to_string(),
                description: Some("Les titres les plus visionnés aujourd'hui".to_string()),
            },
            Category {
                id: "c_originals".to_string(),
                name: "Netflix Originals".to_string(),
                slug: "originals".to_string(),
                description: Some("Créations exclusives Netflix".to_string()),
            },
            Category {
                id: "c_scifi".to_string(),
                name: "Sci-Fi & Fantastique".to_string(),
                slug: "scifi".to_string(),
                description: Some("Mondes futuristes et récits immersifs".to_string()),
            },
            Category {
                id: "c_action".to_string(),
                name: "Films d'action spectaculaires".to_string(),
                slug: "action".to_string(),
                description: Some("Adrénaline, cascades et affrontements intenses".to_string()),
            },
            Category {
                id: "c_drama".to_string(),
                name: "Séries dramatiques & Suspense".to_string(),
                slug: "drama".to_string(),
                description: Some("Intrigue psychologique et tensions narratives".to_string()),
            },
            Category {
                id: "c_animation".to_string(),
                name: "Animation & Anime".to_string(),
                slug: "animation".to_string(),
                description: Some("Chef-d'œuvres visuels et animes cultes".to_string()),
            },
        ];

        let movies = vec![
            Movie {
                id: "stranger-things".to_string(),
                title: "Stranger Things".to_string(),
                original_title: Some("Stranger Things 5".to_string()),
                overview: "Quand un jeune garçon disparaît soudainement, une petite ville découvre une conspiration d'expériences secrètes, des forces surnaturelles terrifiantes et une fillette aux étranges pouvoirs télékinésiques.".to_string(),
                media_type: "series".to_string(),
                poster_url: "https://image.tmdb.org/t/p/w500/49WJfeN0moxb9IPfGn8AIqMGskD.jpg".to_string(),
                backdrop_url: "https://image.tmdb.org/t/p/original/56v2KjBlU4XaOv9rVYEQypROD7P.jpg".to_string(),
                video_url: "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8".to_string(),
                categories: vec!["Tendances".to_string(), "Netflix Originals".to_string(), "Sci-Fi & Fantastique".to_string()],
                release_year: 2025,
                match_score: 99,
                age_rating: "16+".to_string(),
                duration: "4 Saisons".to_string(),
                cast: vec!["Millie Bobby Brown".to_string(), "David Harbour".to_string(), "Winona Ryder".to_string(), "Finn Wolfhard".to_string()],
                director: Some("Les Frères Duffer".to_string()),
                quality_badges: vec!["4K Ultra HD".to_string(), "Dolby Vision".to_string(), "Dolby Atmos".to_string()],
                is_hero: true,
                created_at: Utc::now().to_rfc3339(),
                tmdb_id: Some("66732".to_string()),
                daddy_id: None,
                channel_number: None,
                is_live: None,
                sources: None,
                seasons: None,
            },
            Movie {
                id: "squid-game".to_string(),
                title: "Squid Game".to_string(),
                original_title: Some("Squid Game: Saison 2".to_string()),
                overview: "Des centaines de personnes fauchées acceptent une étrange invitation à s'affronter dans des jeux d'enfants traditionnels pour une somme colossale. Mais les enjeux sont mortels.".to_string(),
                media_type: "series".to_string(),
                poster_url: "https://image.tmdb.org/t/p/w500/dDlGgwXjB19p0p2aK275ZJ2GgqV.jpg".to_string(),
                backdrop_url: "https://image.tmdb.org/t/p/original/y4a02U0qQc0q66UaX06Qo2t4q4F.jpg".to_string(),
                video_url: "https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8".to_string(),
                categories: vec!["Tendances".to_string(), "Netflix Originals".to_string(), "Séries dramatiques & Suspense".to_string()],
                release_year: 2024,
                match_score: 97,
                age_rating: "18+".to_string(),
                duration: "2 Saisons".to_string(),
                cast: vec!["Lee Jung-jae".to_string(), "Park Hae-soo".to_string(), "Wi Ha-joon".to_string()],
                director: Some("Hwang Dong-hyuk".to_string()),
                quality_badges: vec!["4K Ultra HD".to_string(), "HDR".to_string(), "5.1".to_string()],
                is_hero: false,
                created_at: Utc::now().to_rfc3339(),
                tmdb_id: Some("93405".to_string()),
                daddy_id: None,
                channel_number: None,
                is_live: None,
                sources: None,
                seasons: None,
            },
            Movie {
                id: "inception".to_string(),
                title: "Inception".to_string(),
                original_title: Some("Inception".to_string()),
                overview: "Dom Cobb est un voleur chevronné, le meilleur dans l'art périlleux de l'extraction : s'emparer des secrets les plus précieux d'une personne dans son subconscient pendant son sommeil.".to_string(),
                media_type: "movie".to_string(),
                poster_url: "https://image.tmdb.org/t/p/w500/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg".to_string(),
                backdrop_url: "https://image.tmdb.org/t/p/original/s3TBrRGB1iav7gFOCNx3H31MoES.jpg".to_string(),
                video_url: "https://res.cloudinary.com/demo/video/upload/sp_auto/sea_turtle.m3u8".to_string(),
                categories: vec!["Films d'action spectaculaires".to_string(), "Sci-Fi & Fantastique".to_string(), "Tendances".to_string()],
                release_year: 2010,
                match_score: 98,
                age_rating: "12+".to_string(),
                duration: "2h 28m".to_string(),
                cast: vec!["Leonardo DiCaprio".to_string(), "Joseph Gordon-Levitt".to_string(), "Elliot Page".to_string(), "Tom Hardy".to_string()],
                director: Some("Christopher Nolan".to_string()),
                quality_badges: vec!["4K Ultra HD".to_string(), "Spatial Audio".to_string()],
                is_hero: false,
                created_at: Utc::now().to_rfc3339(),
                tmdb_id: Some("27205".to_string()),
                daddy_id: None,
                channel_number: None,
                is_live: None,
                sources: None,
                seasons: None,
            },
            Movie {
                id: "cyberpunk-edgerunners".to_string(),
                title: "Cyberpunk: Edgerunners".to_string(),
                original_title: Some("Cyberpunk: Edgerunners".to_string()),
                overview: "Dans une mégalopole obsédée par la technologie et les modifications corporelles, un gamin de la rue talentueux mais impulsif tente de survivre en devenant un mercenaire hors-la-loi : un edgerunner.".to_string(),
                media_type: "series".to_string(),
                poster_url: "https://image.tmdb.org/t/p/w500/7jsw9e5unwUioLh1i1q1n2K2nQ9.jpg".to_string(),
                backdrop_url: "https://image.tmdb.org/t/p/original/m9P8iA1R8nQ2y1v1m0g9l8l3h0o.jpg".to_string(),
                video_url: "https://playertest.longtailvideo.com/adaptive/oceans_aes/oceans_aes.m3u8".to_string(),
                categories: vec!["Animation & Anime".to_string(), "Sci-Fi & Fantastique".to_string(), "Netflix Originals".to_string()],
                release_year: 2022,
                match_score: 96,
                age_rating: "18+".to_string(),
                duration: "1 Saison".to_string(),
                cast: vec!["KENN".to_string(), "Aoi Yuuki".to_string(), "Hiroki Touchi".to_string()],
                director: Some("Hiroyuki Imaishi (Studio Trigger)".to_string()),
                quality_badges: vec!["HDR".to_string(), "5.1".to_string()],
                is_hero: false,
                created_at: Utc::now().to_rfc3339(),
                tmdb_id: Some("105248".to_string()),
                daddy_id: None,
                channel_number: None,
                is_live: None,
                sources: None,
                seasons: None,
            },
            Movie {
                id: "interstellar".to_string(),
                title: "Interstellar".to_string(),
                original_title: Some("Interstellar".to_string()),
                overview: "Alors que la Terre se meurt, un groupe d'explorateurs franchit un trou de ver récemment découvert pour repousser les limites humaines et partir à la conquête des distances interstellaires.".to_string(),
                media_type: "movie".to_string(),
                poster_url: "https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg".to_string(),
                backdrop_url: "https://image.tmdb.org/t/p/original/rAiYTsqJJR0dHw9yQy2Zg4K0Q2F.jpg".to_string(),
                video_url: "https://moctobpltc-i.akamaihd.net/hls/live/571329/eight/playlist.m3u8".to_string(),
                categories: vec!["Sci-Fi & Fantastique".to_string(), "Tendances".to_string()],
                release_year: 2014,
                match_score: 99,
                age_rating: "Tous publics".to_string(),
                duration: "2h 49m".to_string(),
                cast: vec!["Matthew McConaughey".to_string(), "Anne Hathaway".to_string(), "Jessica Chastain".to_string(), "Michael Caine".to_string()],
                director: Some("Christopher Nolan".to_string()),
                quality_badges: vec!["4K Ultra HD".to_string(), "Dolby Atmos".to_string(), "IMAX Enhanced".to_string()],
                is_hero: false,
                created_at: Utc::now().to_rfc3339(),
                tmdb_id: Some("157336".to_string()),
                daddy_id: None,
                channel_number: None,
                is_live: None,
                sources: None,
                seasons: None,
            },
            Movie {
                id: "arcane".to_string(),
                title: "Arcane".to_string(),
                original_title: Some("Arcane: League of Legends".to_string()),
                overview: "Au milieu du conflit entre les cités jumelles de Piltover et Zaun, deux sœurs se battent dans des camps opposés au cours d'une guerre opposant des technologies magiques et des croyances incompatibles.".to_string(),
                media_type: "series".to_string(),
                poster_url: "https://image.tmdb.org/t/p/w500/fqldf2t8ztc9aiwn396FQEGvZY4.jpg".to_string(),
                backdrop_url: "https://image.tmdb.org/t/p/original/8h1r62F7Yx0v7w62sJ8mYk5j7s2.jpg".to_string(),
                video_url: "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8".to_string(),
                categories: vec!["Animation & Anime".to_string(), "Sci-Fi & Fantastique".to_string(), "Netflix Originals".to_string()],
                release_year: 2024,
                match_score: 99,
                age_rating: "16+".to_string(),
                duration: "2 Saisons".to_string(),
                cast: vec!["Hailee Steinfeld".to_string(), "Ella Purnell".to_string(), "Katie Leung".to_string()],
                director: Some("Fortiche Production".to_string()),
                quality_badges: vec!["4K Ultra HD".to_string(), "HDR".to_string(), "Dolby Atmos".to_string()],
                is_hero: false,
                created_at: Utc::now().to_rfc3339(),
                tmdb_id: Some("94605".to_string()),
                daddy_id: None,
                channel_number: None,
                is_live: None,
                sources: None,
                seasons: None,
            },
            Movie {
                id: "la-casa-de-papel".to_string(),
                title: "La Casa de Papel".to_string(),
                original_title: Some("Money Heist".to_string()),
                overview: "Huit voleurs font une prise d'otages dans la Maison royale de la Monnaie d'Espagne, tandis qu'un génie du crime manipule la police pour mettre son plan à exécution.".to_string(),
                media_type: "series".to_string(),
                poster_url: "https://image.tmdb.org/t/p/w500/reEMJA1uzscCbk5r6rgAGHG24UW.jpg".to_string(),
                backdrop_url: "https://image.tmdb.org/t/p/original/gFZri2YbFUBulAcPNGIRTeiqkqn.jpg".to_string(),
                video_url: "https://cph-p2p-msl.akamaized.net/hls/live/2000341/test/master.m3u8".to_string(),
                categories: vec!["Séries dramatiques & Suspense".to_string(), "Films d'action spectaculaires".to_string(), "Netflix Originals".to_string()],
                release_year: 2021,
                match_score: 95,
                age_rating: "16+".to_string(),
                duration: "5 Parties".to_string(),
                cast: vec!["Álvaro Morte".to_string(), "Úrsula Corberó".to_string(), "Pedro Alonso".to_string()],
                director: Some("Álex Pina".to_string()),
                quality_badges: vec!["HD".to_string(), "5.1".to_string()],
                is_hero: false,
                created_at: Utc::now().to_rfc3339(),
                tmdb_id: Some("71446".to_string()),
                daddy_id: None,
                channel_number: None,
                is_live: None,
                sources: None,
                seasons: None,
            },
            Movie {
                id: "top-gun-maverick".to_string(),
                title: "Top Gun: Maverick".to_string(),
                original_title: Some("Top Gun: Maverick".to_string()),
                overview: "Après plus de 30 ans de service en tant que l'un des meilleurs aviateurs de la Navy, Pete 'Maverick' Mitchell est à sa place, repoussant les limites comme pilote d'essai audacieux.".to_string(),
                media_type: "movie".to_string(),
                poster_url: "https://image.tmdb.org/t/p/w500/62HCnUTziyWcpDaBO2i1DX17ljH.jpg".to_string(),
                backdrop_url: "https://image.tmdb.org/t/p/original/odJ4hx6g6vBt4lBWKFD1tI8WS4x.jpg".to_string(),
                video_url: "https://res.cloudinary.com/demo/video/upload/sp_auto/sea_turtle.m3u8".to_string(),
                categories: vec!["Films d'action spectaculaires".to_string(), "Tendances".to_string()],
                release_year: 2022,
                match_score: 97,
                age_rating: "Tous publics".to_string(),
                duration: "2h 10m".to_string(),
                cast: vec!["Tom Cruise".to_string(), "Miles Teller".to_string(), "Jennifer Connelly".to_string(), "Jon Hamm".to_string()],
                director: Some("Joseph Kosinski".to_string()),
                quality_badges: vec!["4K Ultra HD".to_string(), "Dolby Atmos".to_string()],
                is_hero: false,
                created_at: Utc::now().to_rfc3339(),
                tmdb_id: Some("361743".to_string()),
                daddy_id: None,
                channel_number: None,
                is_live: None,
                sources: None,
                seasons: None,
            },
        ];

        CatalogData { movies, categories }
    }
}
