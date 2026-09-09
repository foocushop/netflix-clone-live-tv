use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Movie {
    pub id: String,
    pub title: String,
    pub original_title: Option<String>,
    pub overview: String,
    pub media_type: String, // "movie" | "series"
    pub poster_url: String,
    pub backdrop_url: String,
    pub video_url: String,
    pub categories: Vec<String>,
    #[serde(default)]
    pub release_year: u32,
    #[serde(default)]
    pub match_score: u32,
    #[serde(default)]
    pub age_rating: String,
    #[serde(default)]
    pub duration: String,
    #[serde(default)]
    pub cast: Vec<String>,
    pub director: Option<String>,
    #[serde(default)]
    pub quality_badges: Vec<String>,
    #[serde(default)]
    pub is_hero: bool,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub tmdb_id: Option<String>,
    #[serde(default)]
    pub daddy_id: Option<serde_json::Value>,
    #[serde(default)]
    pub channel_number: Option<serde_json::Value>,
    #[serde(default)]
    pub is_live: Option<bool>,
    #[serde(default)]
    pub sources: Option<serde_json::Value>,
    #[serde(default)]
    pub seasons: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateMovieInput {
    pub title: String,
    pub original_title: Option<String>,
    pub overview: String,
    pub media_type: Option<String>,
    pub poster_url: String,
    pub backdrop_url: String,
    pub video_url: String,
    pub categories: Vec<String>,
    pub release_year: Option<u32>,
    pub match_score: Option<u32>,
    pub age_rating: Option<String>,
    pub duration: Option<String>,
    pub cast: Option<Vec<String>>,
    pub director: Option<String>,
    pub is_hero: Option<bool>,
    pub seasons: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateMovieInput {
    pub title: Option<String>,
    pub original_title: Option<String>,
    pub overview: Option<String>,
    pub media_type: Option<String>,
    pub poster_url: Option<String>,
    pub backdrop_url: Option<String>,
    pub video_url: Option<String>,
    pub categories: Option<Vec<String>>,
    pub release_year: Option<u32>,
    pub match_score: Option<u32>,
    pub age_rating: Option<String>,
    pub duration: Option<String>,
    pub cast: Option<Vec<String>>,
    pub director: Option<String>,
    pub is_hero: Option<bool>,
    pub seasons: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AuthInput {
    pub password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Category {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdminStats {
    pub total_titles: usize,
    pub total_movies: usize,
    pub total_series: usize,
    pub total_categories: usize,
    pub server_uptime_seconds: u64,
    pub active_hero_title: Option<String>,
    pub rust_engine: String,
    pub system_status: String,
}

#[derive(Debug, Serialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub message: Option<String>,
    pub data: Option<T>,
}

impl<T> ApiResponse<T> {
    pub fn success(data: T) -> Self {
        Self {
            success: true,
            message: None,
            data: Some(data),
        }
    }

    pub fn error(msg: impl Into<String>) -> Self {
        Self {
            success: false,
            message: Some(msg.into()),
            data: None,
        }
    }
}
