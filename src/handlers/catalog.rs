use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::Deserialize;

use crate::db::DbHandle;
use crate::models::{ApiResponse, Category, Movie};

#[derive(Debug, Deserialize)]
pub struct SearchParams {
    pub q: Option<String>,
}

#[derive(Debug, serde::Serialize)]
pub struct GroupedCatalog {
    pub hero: Option<Movie>,
    pub rows: Vec<CatalogRow>,
}

#[derive(Debug, serde::Serialize)]
pub struct CatalogRow {
    pub category: Category,
    pub movies: Vec<Movie>,
}

pub async fn get_movies(State(db): State<DbHandle>) -> impl IntoResponse {
    let movies = db.get_all_movies().await;
    Json(ApiResponse::success(movies))
}

pub async fn get_grouped_catalog(State(db): State<DbHandle>) -> impl IntoResponse {
    let hero = db.get_hero_movie().await;
    let categories = db.get_categories().await;
    let all_movies = db.get_all_movies().await;

    let mut rows = Vec::new();

    for cat in categories {
        let cat_movies: Vec<Movie> = all_movies
            .iter()
            .filter(|m| {
                m.categories.iter().any(|c| {
                    c.to_lowercase().contains(&cat.name.to_lowercase())
                        || cat.name.to_lowercase().contains(&c.to_lowercase())
                        || c.to_lowercase().contains(&cat.slug.to_lowercase())
                })
            })
            .cloned()
            .collect();

        if !cat_movies.is_empty() {
            rows.push(CatalogRow {
                category: cat,
                movies: cat_movies,
            });
        }
    }

    if rows.is_empty() && !all_movies.is_empty() {
        rows.push(CatalogRow {
            category: Category {
                id: "c_all".to_string(),
                name: "Tous les titres".to_string(),
                slug: "tous".to_string(),
                description: None,
            },
            movies: all_movies,
        });
    }

    Json(ApiResponse::success(GroupedCatalog { hero, rows }))
}

pub async fn get_movie_by_id(
    State(db): State<DbHandle>,
    Path(id): Path<String>,
) -> (StatusCode, Json<ApiResponse<Movie>>) {
    match db.get_movie_by_id(&id).await {
        Some(movie) => (StatusCode::OK, Json(ApiResponse::success(movie))),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::error("Média introuvable")),
        ),
    }
}

pub async fn get_hero(State(db): State<DbHandle>) -> (StatusCode, Json<ApiResponse<Movie>>) {
    match db.get_hero_movie().await {
        Some(hero) => (StatusCode::OK, Json(ApiResponse::success(hero))),
        None => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::error("Aucun film en vedette")),
        ),
    }
}

pub async fn get_categories(State(db): State<DbHandle>) -> impl IntoResponse {
    let categories = db.get_categories().await;
    Json(ApiResponse::success(categories))
}

pub async fn search_movies(
    State(db): State<DbHandle>,
    Query(params): Query<SearchParams>,
) -> impl IntoResponse {
    let query = params.q.unwrap_or_default();
    let results = db.search_movies(&query).await;
    Json(ApiResponse::success(results))
}
