use axum::{
    body::Body,
    extract::{Path, State},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use std::path::PathBuf;
use tokio::fs::File;
use tokio::io::{AsyncReadExt, AsyncSeekExt, SeekFrom};
use tokio_util::io::ReaderStream;

use crate::db::DbHandle;

const CHUNK_SIZE: u64 = 1024 * 1024 * 2; // 2 Mo par segment pour fluidité optimale

pub async fn stream_movie(
    State(db): State<DbHandle>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Response {
    let movie = match db.get_movie_by_id(&id).await {
        Some(m) => m,
        None => {
            return (StatusCode::NOT_FOUND, "Média introuvable").into_response();
        }
    };

    // Si l'URL est externe (http/https), on redirige directement vers le flux avec support streaming
    if movie.video_url.starts_with("http://") || movie.video_url.starts_with("https://") {
        return Response::builder()
            .status(StatusCode::TEMPORARY_REDIRECT)
            .header(header::LOCATION, movie.video_url)
            .body(Body::empty())
            .unwrap();
    }

    // Sinon, fichier local dans videos/
    let local_path = PathBuf::from(&movie.video_url);
    serve_range_file(local_path, headers).await
}

pub async fn stream_raw_file(
    Path(filename): Path<String>,
    headers: HeaderMap,
) -> Response {
    let path = PathBuf::from("videos").join(&filename);
    serve_range_file(path, headers).await
}

pub async fn serve_range_file(path: PathBuf, headers: HeaderMap) -> Response {
    if !path.exists() {
        return (StatusCode::NOT_FOUND, "Fichier vidéo non trouvé").into_response();
    }

    let metadata = match tokio::fs::metadata(&path).await {
        Ok(m) => m,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Erreur métadonnées fichier").into_response(),
    };

    let file_size = metadata.len();
    let mime = mime_guess::from_path(&path)
        .first_or_octet_stream()
        .to_string();

    let range_header = headers.get(header::RANGE).and_then(|val| val.to_str().ok());

    let (start, end) = match range_header {
        Some(range) if range.starts_with("bytes=") => {
            let parts: Vec<&str> = range["bytes=".len()..].split('-').collect();
            let start = parts[0].parse::<u64>().unwrap_or(0);
            let end = if parts.len() > 1 && !parts[1].is_empty() {
                parts[1].parse::<u64>().unwrap_or(file_size - 1)
            } else {
                std::cmp::min(start + CHUNK_SIZE, file_size - 1)
            };
            (start, end)
        }
        _ => {
            // Requête complète sans range
            let file = match File::open(&path).await {
                Ok(f) => f,
                Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Erreur lecture").into_response(),
            };
            let stream = ReaderStream::new(file);
            return Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, mime)
                .header(header::CONTENT_LENGTH, file_size)
                .header(header::ACCEPT_RANGES, "bytes")
                .body(Body::from_stream(stream))
                .unwrap();
        }
    };

    if start >= file_size || end >= file_size || start > end {
        return Response::builder()
            .status(StatusCode::RANGE_NOT_SATISFIABLE)
            .header(header::CONTENT_RANGE, format!("bytes */{}", file_size))
            .body(Body::empty())
            .unwrap();
    }

    let chunk_len = end - start + 1;
    let mut file = match File::open(&path).await {
        Ok(f) => f,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "Erreur ouverture").into_response(),
    };

    if let Err(_) = file.seek(SeekFrom::Start(start)).await {
        return (StatusCode::INTERNAL_SERVER_ERROR, "Erreur déplacement fichier").into_response();
    }

    let limited_reader = file.take(chunk_len);
    let stream = ReaderStream::new(limited_reader);

    Response::builder()
        .status(StatusCode::PARTIAL_CONTENT)
        .header(header::CONTENT_TYPE, mime)
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CONTENT_LENGTH, chunk_len)
        .header(
            header::CONTENT_RANGE,
            format!("bytes {}-{}/{}", start, end, file_size),
        )
        .body(Body::from_stream(stream))
        .unwrap()
}
