use axum::{
    routing::{get, post, put},
    Router,
};
use std::net::SocketAddr;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::ServeDir;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod db;
mod handlers;
mod models;

use db::Database;
use handlers::{admin, catalog, stream};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialisation du logging tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "netflix_clone_rust=debug,tower_http=info,axum=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!("Démarrage du serveur Netflix Clone (Rust + Axum)...");

    // Création et amorçage du catalogue persistant
    let db = Database::init("data").await;

    // Configuration des permissions CORS pour tests et intégrations
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Construction du routeur d'API REST
    let api_routes = Router::new()
        // Routes publiques du catalogue
        .route("/catalog", get(catalog::get_grouped_catalog))
        .route("/movies", get(catalog::get_movies))
        .route("/movies/hero", get(catalog::get_hero))
        .route("/movies/:id", get(catalog::get_movie_by_id))
        .route("/categories", get(catalog::get_categories))
        .route("/search", get(catalog::search_movies))
        // Routes de streaming vidéo avec support HTTP Range (206)
        .route("/stream/:id", get(stream::stream_movie))
        .route("/stream/file/:filename", get(stream::stream_raw_file))
        // Routes du Studio Administrateur
        .route("/admin/auth", post(admin::auth_admin))
        .route("/admin/stats", get(admin::get_admin_stats))
        .route("/admin/movies", get(admin::list_admin_movies).post(admin::create_movie))
        .route(
            "/admin/movies/:id",
            put(admin::update_movie).delete(admin::delete_movie),
        )
        .route("/admin/movies/:id/hero", post(admin::set_hero))
        .with_state(db.clone());

    // Vérifier que le dossier static existe, sinon le créer
    if !std::path::Path::new("static").exists() {
        let _ = tokio::fs::create_dir_all("static").await;
    }
    if !std::path::Path::new("videos").exists() {
        let _ = tokio::fs::create_dir_all("videos").await;
    }

    // Application principale avec API et distribution des assets statiques (HTML/CSS/JS)
    let app = Router::new()
        .nest("/api", api_routes)
        .nest_service("/", ServeDir::new("static"))
        .layer(cors);

    let host = [0, 0, 0, 0];
    let port = 8080;
    let addr = SocketAddr::from((host, port));

    println!("\n=======================================================");
    println!("  🍿 NETFLIX CLONE - PROPULSE PAR RUST (AXUM + TOKIO)");
    println!("=======================================================");
    println!("  🚀 Serveur démarré avec succès !");
    println!("  🌐 Accès Web : http://127.0.0.1:{}", port);
    println!("  ⚙️  Mode Admin : Accédez au menu profil en haut à droite");
    println!("  📡 API REST  : http://127.0.0.1:{}/api/catalog", port);
    println!("=======================================================\n");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
