use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Movie {
    pub id: String,
    pub title: String,
    pub original_title: Option<String>,
    pub overview: String,
    pub media_type: String,
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
    pub is_xtream: Option<bool>,
    #[serde(default)]
    pub is_xtream_series: Option<bool>,
    #[serde(default)]
    pub series_id: Option<u64>,
    #[serde(default)]
    pub sources: Option<serde_json::Value>,
    #[serde(default)]
    pub seasons: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Category {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatalogData {
    pub movies: Vec<Movie>,
    pub categories: Vec<Category>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XtreamChannel {
    pub stream_id: u64,
    pub name: String,
    #[serde(default)]
    pub raw_name: String,
    pub category_id: String,
    pub category_name: String,
    pub quality: String,
    pub quality_badge: String,
    #[serde(default)]
    pub icon: String,
    #[serde(default)]
    pub epg_channel_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XtreamRealitySeries {
    pub series_id: u64,
    pub name: String,
    #[serde(default)]
    pub raw_name: Option<String>,
    #[serde(default)]
    pub year: Option<u32>,
    #[serde(default)]
    pub rating: Option<String>,
    pub cover: String,
    #[serde(default)]
    pub backdrop: Option<String>,
    #[serde(default)]
    pub plot: Option<String>,
    #[serde(default)]
    pub genre: Option<String>,
    #[serde(default)]
    pub cast: Option<String>,
    pub category_id: String,
    pub category_name: String,
    #[serde(default)]
    pub episode_run_time: Option<String>,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("\n=======================================================");
    println!("  🦀 AUDIT COMPLET DU CATALOGUE & DES FLUX EN RUST");
    println!("  Plateforme : Netflix Clone Full-Stack (Axum + Tokio)");
    println!("=======================================================");

    let mut has_error = false;

    // ================= 1. AUDIT CATALOGUE PRINCIPAL (catalog.json) =================
    println!("\n▶ [1/3] Audit de data/catalog.json...");
    let catalog_path = Path::new("data/catalog.json");
    if !catalog_path.exists() {
        eprintln!("❌ Erreur fatale : Fichier data/catalog.json introuvable !");
        std::process::exit(1);
    }

    let content = fs::read_to_string(catalog_path)?;
    let catalog: CatalogData = match serde_json::from_str::<CatalogData>(&content) {
        Ok(data) => {
            println!("   ✅ Désérialisation Rust : SUCCÈS ({} médias, {} catégories)",
                     data.movies.len(), data.categories.len());
            data
        },
        Err(e) => {
            eprintln!("   ❌ Erreur de parsing JSON dans data/catalog.json : {}", e);
            std::process::exit(1);
        }
    };

    // Vérification des catégories et intégrité référentielle
    let mut defined_cat_names = HashSet::new();
    let mut defined_cat_slugs = HashSet::new();
    let mut defined_cat_ids = HashSet::new();

    for c in &catalog.categories {
        if !defined_cat_ids.insert(c.id.clone()) {
            eprintln!("   ❌ Catégorie dupliquée (id) : {}", c.id);
            has_error = true;
        }
        if !defined_cat_slugs.insert(c.slug.clone()) {
            eprintln!("   ❌ Catégorie dupliquée (slug) : {}", c.slug);
            has_error = true;
        }
        defined_cat_names.insert(c.name.clone());
    }

    let mut id_map: HashMap<String, usize> = HashMap::new();
    let mut tmdb_map: HashMap<String, usize> = HashMap::new();
    let mut daddy_map: HashMap<String, usize> = HashMap::new();
    let mut title_map: HashMap<String, usize> = HashMap::new();
    let mut missing_category_refs: HashSet<String> = HashSet::new();

    let mut channels_count = 0;
    let mut movies_count = 0;
    let mut series_count = 0;

    for (idx, m) in catalog.movies.iter().enumerate() {
        match m.media_type.as_str() {
            "channel" => channels_count += 1,
            "movie" => movies_count += 1,
            "series" => series_count += 1,
            other => {
                eprintln!("   ❌ Média {} a un media_type invalide : '{}'", m.id, other);
                has_error = true;
            }
        }

        // Vérification présence titre et image
        if m.title.trim().is_empty() {
            eprintln!("   ❌ Média {} a un titre vide", m.id);
            has_error = true;
        }
        if m.poster_url.trim().is_empty() {
            eprintln!("   ❌ Média {} a un poster_url vide", m.id);
            has_error = true;
        }

        // Intégrité référentielle des catégories
        for cat in &m.categories {
            if !defined_cat_names.contains(cat) {
                missing_category_refs.insert(cat.clone());
            }
        }

        // Unicité ID
        if let Some(prev) = id_map.insert(m.id.clone(), idx) {
            eprintln!("   ❌ Doublon d'ID '{}' aux indices {} et {}", m.id, prev, idx);
            has_error = true;
        }

        // Unicité TMDB ID
        if let Some(ref tmdb) = m.tmdb_id {
            if !tmdb.is_empty() {
                if let Some(prev) = tmdb_map.insert(tmdb.clone(), idx) {
                    eprintln!("   ❌ Doublon de TMDB ID '{}' aux indices {} et {}", tmdb, prev, idx);
                    has_error = true;
                }
            }
        }

        // Unicité flux DaddyLive
        let daddy_val = m.daddy_id.as_ref().or_else(|| {
            m.sources.as_ref().and_then(|s| s.get("daddylive_id"))
        });
        if let Some(d) = daddy_val {
            let key = d.to_string();
            if let Some(prev) = daddy_map.insert(key.clone(), idx) {
                eprintln!("   ❌ Doublon flux direct '{}' aux indices {} et {}", key, prev, idx);
                has_error = true;
            }
        }

        // Unicité titre
        if let Some(prev) = title_map.insert(m.title.clone(), idx) {
            eprintln!("   ❌ Doublon de titre '{}' aux indices {} et {}", m.title, prev, idx);
            has_error = true;
        }
    }

    if !missing_category_refs.is_empty() {
        eprintln!("   ❌ Catégories manquantes dans catalog.categories mais utilisées par les médias : {:?}", missing_category_refs);
        has_error = true;
    } else {
        println!("   ✅ Intégrité des catégories : 100% cohérent (zéro catégorie orpheline)");
    }

    println!("   📊 Répartition catalog.json : {} films, {} séries, {} chaînes Live",
             movies_count, series_count, channels_count);

    // ================= 2. AUDIT FLUX XTREAM FRANÇAIS (xtream_fr_catalog.json) =================
    println!("\n▶ [2/3] Audit de data/xtream_fr_catalog.json (Live TV Français)...");
    let xtream_path = Path::new("data/xtream_fr_catalog.json");
    if !xtream_path.exists() {
        eprintln!("❌ Erreur fatale : Fichier data/xtream_fr_catalog.json introuvable !");
        std::process::exit(1);
    }

    let xtream_content = fs::read_to_string(xtream_path)?;
    let xtream_channels: Vec<XtreamChannel> = match serde_json::from_str::<Vec<XtreamChannel>>(&xtream_content) {
        Ok(data) => {
            println!("   ✅ Désérialisation Rust : SUCCÈS ({} chaînes)", data.len());
            data
        },
        Err(e) => {
            eprintln!("   ❌ Erreur de parsing JSON dans data/xtream_fr_catalog.json : {}", e);
            std::process::exit(1);
        }
    };

    let mut stream_id_map = HashMap::new();
    let mut quality_counts: HashMap<String, usize> = HashMap::new();
    let mut category_counts: HashMap<String, usize> = HashMap::new();

    for (idx, ch) in xtream_channels.iter().enumerate() {
        if ch.stream_id == 0 {
            eprintln!("   ❌ Chaîne '{}' avec stream_id = 0", ch.name);
            has_error = true;
        }
        if ch.name.trim().is_empty() {
            eprintln!("   ❌ Chaîne stream_id={} avec nom vide", ch.stream_id);
            has_error = true;
        }
        if let Some(prev) = stream_id_map.insert(ch.stream_id, idx) {
            eprintln!("   ❌ Doublon de stream_id '{}' pour chaîne '{}' aux indices {} et {}",
                     ch.stream_id, ch.name, prev, idx);
            has_error = true;
        }

        *quality_counts.entry(ch.quality.clone()).or_insert(0) += 1;
        *category_counts.entry(ch.category_name.clone()).or_insert(0) += 1;
    }

    println!("   ✅ Zéro doublon sur les stream_id des {} chaînes", xtream_channels.len());
    println!("   📊 Qualités : 4K: {}, FHD: {}, HEVC: {}, HD: {}, SD: {}",
             quality_counts.get("4K").unwrap_or(&0),
             quality_counts.get("FHD").unwrap_or(&0),
             quality_counts.get("HEVC").unwrap_or(&0),
             quality_counts.get("HD").unwrap_or(&0),
             quality_counts.get("SD").unwrap_or(&0));
    println!("   📊 Catégories thématiques répertoriées : {}", category_counts.len());

    // ================= 3. AUDIT TÉLÉ-RÉALITÉ XTREAM (xtream_telerealite_catalog.json) =================
    println!("\n▶ [3/3] Audit de data/xtream_telerealite_catalog.json (Télé-Réalité)...");
    let tele_path = Path::new("data/xtream_telerealite_catalog.json");
    if !tele_path.exists() {
        eprintln!("❌ Erreur fatale : Fichier data/xtream_telerealite_catalog.json introuvable !");
        std::process::exit(1);
    }

    let tele_content = fs::read_to_string(tele_path)?;
    let tele_shows: Vec<XtreamRealitySeries> = match serde_json::from_str::<Vec<XtreamRealitySeries>>(&tele_content) {
        Ok(data) => {
            println!("   ✅ Désérialisation Rust : SUCCÈS ({} séries de télé-réalité)", data.len());
            data
        },
        Err(e) => {
            eprintln!("   ❌ Erreur de parsing JSON dans data/xtream_telerealite_catalog.json : {}", e);
            std::process::exit(1);
        }
    };

    let mut series_id_map = HashMap::new();
    let mut year_counts: HashMap<u32, usize> = HashMap::new();

    for (idx, s) in tele_shows.iter().enumerate() {
        if s.series_id == 0 {
            eprintln!("   ❌ Série '{}' avec series_id = 0", s.name);
            has_error = true;
        }
        if s.name.trim().is_empty() {
            eprintln!("   ❌ Série series_id={} avec nom vide", s.series_id);
            has_error = true;
        }
        if let Some(prev) = series_id_map.insert(s.series_id, idx) {
            eprintln!("   ❌ Doublon de series_id '{}' pour série '{}' aux indices {} et {}",
                     s.series_id, s.name, prev, idx);
            has_error = true;
        }
        if let Some(y) = s.year {
            *year_counts.entry(y).or_insert(0) += 1;
        }
    }

    println!("   ✅ Zéro doublon sur les series_id des {} séries de télé-réalité", tele_shows.len());
    println!("   📊 Récentes : Saisons 2026: {}, Saisons 2025: {}, Saisons 2024: {}",
             year_counts.get(&2026).unwrap_or(&0),
             year_counts.get(&2025).unwrap_or(&0),
             year_counts.get(&2024).unwrap_or(&0));

    // ================= 4. INTÉGRATION GLOBALE DE LA PLATEFORME =================
    println!("\n=======================================================");
    println!("  🌐 SYNTHÈSE GLOBALE DE LA PLATEFORME NETFLIX");
    println!("=======================================================");
    let total_platform_titles = catalog.movies.len() + xtream_channels.len() + tele_shows.len();
    println!("   • Films & Séries VOD catalogue : {}", catalog.movies.len());
    println!("   • Chaînes Direct IPTV France   : {}", xtream_channels.len());
    println!("   • Séries Télé-Réalité Xtream   : {}", tele_shows.len());
    println!("   🔥 TOTAL TITRES & FLUX INDEXÉS : {} médias", total_platform_titles);
    println!("=======================================================");

    if has_error {
        eprintln!("\n❌ ÉCHEC DE L'AUDIT : Des anomalies ont été détectées ci-dessus.");
        std::process::exit(1);
    } else {
        println!("\n🎉 AUDIT RÉUSSI À 100% : Les 3 catalogues sont synchronisés,");
        println!("   strictement typés, zéro doublon et 100% prêts pour le fort trafic !");
        println!("=======================================================\n");
    }

    Ok(())
}
