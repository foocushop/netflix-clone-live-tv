use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};

use crate::db::DbHandle;
use crate::models::{ApiResponse, AuthInput, CreateMovieInput, Movie, UpdateMovieInput};

fn is_authorized(headers: &HeaderMap) -> bool {
    if let Some(pass) = headers.get("x-admin-password") {
        if pass == "1965" {
            return true;
        }
    }
    if let Some(auth) = headers.get("authorization") {
        if let Ok(s) = auth.to_str() {
            if s.trim_start_matches("Bearer ").trim() == "1965" {
                return true;
            }
        }
    }
    false
}

pub async fn auth_admin(
    Json(payload): Json<AuthInput>,
) -> (StatusCode, Json<ApiResponse<String>>) {
    if payload.password.trim() == "1965" {
        (
            StatusCode::OK,
            Json(ApiResponse::success("Authentification réussie".to_string())),
        )
    } else {
        (
            StatusCode::UNAUTHORIZED,
            Json(ApiResponse::error("Mot de passe ou code PIN incorrect")),
        )
    }
}

pub async fn get_admin_stats(
    headers: HeaderMap,
    State(db): State<DbHandle>,
) -> (StatusCode, Json<ApiResponse<crate::models::AdminStats>>) {
    if !is_authorized(&headers) {
        return (
            StatusCode::UNAUTHORIZED,
            Json(ApiResponse::error("Accès refusé : authentification requise")),
        );
    }
    let stats = db.get_stats().await;
    (StatusCode::OK, Json(ApiResponse::success(stats)))
}

pub async fn list_admin_movies(
    headers: HeaderMap,
    State(db): State<DbHandle>,
) -> (StatusCode, Json<ApiResponse<Vec<Movie>>>) {
    if !is_authorized(&headers) {
        return (
            StatusCode::UNAUTHORIZED,
            Json(ApiResponse::error("Accès refusé : authentification requise")),
        );
    }
    let movies = db.get_all_movies().await;
    (StatusCode::OK, Json(ApiResponse::success(movies)))
}

pub async fn create_movie(
    headers: HeaderMap,
    State(db): State<DbHandle>,
    Json(payload): Json<CreateMovieInput>,
) -> (StatusCode, Json<ApiResponse<Movie>>) {
    if !is_authorized(&headers) {
        return (
            StatusCode::UNAUTHORIZED,
            Json(ApiResponse::error("Accès refusé : authentification requise")),
        );
    }
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
    headers: HeaderMap,
    State(db): State<DbHandle>,
    Path(id): Path<String>,
    Json(payload): Json<UpdateMovieInput>,
) -> (StatusCode, Json<ApiResponse<Movie>>) {
    if !is_authorized(&headers) {
        return (
            StatusCode::UNAUTHORIZED,
            Json(ApiResponse::error("Accès refusé : authentification requise")),
        );
    }
    match db.update_movie(&id, payload).await {
        Ok(movie) => (StatusCode::OK, Json(ApiResponse::success(movie))),
        Err(err) => (
            StatusCode::NOT_FOUND,
            Json(ApiResponse::error(err)),
        ),
    }
}

pub async fn delete_movie(
    headers: HeaderMap,
    State(db): State<DbHandle>,
    Path(id): Path<String>,
) -> (StatusCode, Json<ApiResponse<String>>) {
    if !is_authorized(&headers) {
        return (
            StatusCode::UNAUTHORIZED,
            Json(ApiResponse::error("Accès refusé : authentification requise")),
        );
    }
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
    headers: HeaderMap,
    State(db): State<DbHandle>,
    Path(id): Path<String>,
) -> (StatusCode, Json<ApiResponse<Movie>>) {
    if !is_authorized(&headers) {
        return (
            StatusCode::UNAUTHORIZED,
            Json(ApiResponse::error("Accès refusé : authentification requise")),
        );
    }
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
