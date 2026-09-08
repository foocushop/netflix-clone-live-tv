use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};

use crate::db::DbHandle;
use crate::models::{ApiResponse, CreateMovieInput, Movie, UpdateMovieInput};

pub async fn get_admin_stats(State(db): State<DbHandle>) -> impl IntoResponse {
    let stats = db.get_stats().await;
    Json(ApiResponse::success(stats))
}

pub async fn list_admin_movies(State(db): State<DbHandle>) -> impl IntoResponse {
    let movies = db.get_all_movies().await;
    Json(ApiResponse::success(movies))
}

pub async fn create_movie(
    State(db): State<DbHandle>,
    Json(payload): Json<CreateMovieInput>,
) -> (StatusCode, Json<ApiResponse<Movie>>) {
    if payload.title.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::error("Le titre ne peut pas être vide")),
        );
    }

    match db.create_movie(payload).await {
        Ok(movie) => (StatusCode::CREATED, Json(ApiResponse::success(movie))),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::error(err)),
        ),
    }
}

pub async fn update_movie(
    State(db): State<DbHandle>,
    Path(id): Path<String>,
    Json(payload): Json<UpdateMovieInput>,
) -> (StatusCode, Json<ApiResponse<Movie>>) {
    match db.update_movie(&id, payload).await {
        Ok(movie) => (StatusCode::OK, Json(ApiResponse::success(movie))),
        Err(err) => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::error(err)),
        ),
    }
}

pub async fn delete_movie(
    State(db): State<DbHandle>,
    Path(id): Path<String>,
) -> (StatusCode, Json<ApiResponse<String>>) {
    match db.delete_movie(&id).await {
        Ok(_) => (
            StatusCode::OK,
            Json(ApiResponse::success("Média supprimé avec succès".to_string())),
        ),
        Err(err) => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::error(err)),
        ),
    }
}

pub async fn set_hero(
    State(db): State<DbHandle>,
    Path(id): Path<String>,
) -> (StatusCode, Json<ApiResponse<Movie>>) {
    match db.set_hero_movie(&id).await {
        Ok(movie) => (
            StatusCode::OK,
            Json(ApiResponse::success(movie)),
        ),
        Err(err) => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::error(err)),
        ),
    }
}
