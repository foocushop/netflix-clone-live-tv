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

fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("\n=======================================================");
    println!("  🦀 VÉRIFICATION DU CATALOGUE & DES SOURCES EN RUST");
    println!("=======================================================");

    let catalog_path = Path::new("data/catalog.json");
    if !catalog_path.exists() {
        eprintln!("❌ Erreur : Fichier data/catalog.json introuvable !");
        std::process::exit(1);
    }

    let content = fs::read_to_string(catalog_path)?;
    let catalog = match serde_json::from_str::<CatalogData>(&content) {
        Ok(data) => {
            println!("✅ Désérialisation JSON -> Structs Rust : SUCCÈS ({} titres, {} catégories)",
                     data.movies.len(), data.categories.len());
            data
        },
        Err(e) => {
            eprintln!("❌ Erreur de parsing JSON dans data/catalog.json : {}", e);
            std::process::exit(1);
        }
    };

    let mut id_map: HashMap<String, usize> = HashMap::new();
    let mut tmdb_map: HashMap<String, usize> = HashMap::new();
    let mut daddy_map: HashMap<String, usize> = HashMap::new();
    let mut title_map: HashMap<String, usize> = HashMap::new();

    let mut dup_ids = Vec::new();
    let mut dup_tmdb = Vec::new();
    let mut dup_daddy = Vec::new();
    let mut dup_titles = Vec::new();

    let mut channels_count = 0;
    let mut movies_count = 0;
    let mut series_count = 0;

    for (idx, m) in catalog.movies.iter().enumerate() {
        match m.media_type.as_str() {
            "channel" => channels_count += 1,
            "movie" => movies_count += 1,
            "series" => series_count += 1,
            _ => {}
        }

        // Vérification ID unique
        if let Some(prev) = id_map.insert(m.id.clone(), idx) {
            dup_ids.push((m.id.clone(), prev, idx));
        }

        // Vérification TMDB ID unique (si renseigné)
        if let Some(ref tmdb) = m.tmdb_id {
            if !tmdb.is_empty() {
                if let Some(prev) = tmdb_map.insert(tmdb.clone(), idx) {
                    dup_tmdb.push((tmdb.clone(), prev, idx));
                }
            }
        }

        // Vérification DaddyLive ID unique (si renseigné)
        let daddy_val = m.daddy_id.as_ref().or_else(|| {
            m.sources.as_ref().and_then(|s| s.get("daddylive_id"))
        });
        if let Some(d) = daddy_val {
            let key = d.to_string();
            if let Some(prev) = daddy_map.insert(key.clone(), idx) {
                dup_daddy.push((key, prev, idx));
            }
        }

        // Vérification Titre unique
        if let Some(prev) = title_map.insert(m.title.clone(), idx) {
            dup_titles.push((m.title.clone(), prev, idx));
        }
    }

    println!("📊 Répartition du catalogue :");
    println!("   • Films   : {}", movies_count);
    println!("   • Séries  : {}", series_count);
    println!("   • Chaînes : {} (Live TV Multi-Serveurs)", channels_count);

    let mut has_error = false;

    if !dup_ids.is_empty() {
        has_error = true;
        eprintln!("❌ DOUBLONS DÉTECTÉS pour 'id' ({} occurrences) :", dup_ids.len());
        for (id, p, c) in &dup_ids {
            eprintln!("   - id '{}' présent aux indices {} et {}", id, p, c);
        }
    } else {
        println!("✅ Zéro doublon sur les IDs uniques ('id')");
    }

    if !dup_tmdb.is_empty() {
        has_error = true;
        eprintln!("❌ DOUBLONS DÉTECTÉS pour 'tmdb_id' ({} occurrences) :", dup_tmdb.len());
        for (tmdb, p, c) in &dup_tmdb {
            eprintln!("   - tmdb_id '{}' présent aux indices {} et {}", tmdb, p, c);
        }
    } else {
        println!("✅ Zéro doublon sur les TMDB IDs ('tmdb_id')");
    }

    if !dup_daddy.is_empty() {
        has_error = true;
        eprintln!("❌ DOUBLONS DÉTECTÉS pour les flux TV 'daddy_id' ({} occurrences) :", dup_daddy.len());
        for (d, p, c) in &dup_daddy {
            eprintln!("   - daddy_id '{}' présent aux indices {} et {}", d, p, c);
        }
    } else {
        println!("✅ Zéro doublon sur les flux TV ('daddy_id')");
    }

    if !dup_titles.is_empty() {
        has_error = true;
        eprintln!("❌ DOUBLONS DÉTECTÉS pour les titres 'title' ({} occurrences) :", dup_titles.len());
        for (t, p, c) in &dup_titles {
            eprintln!("   - title '{}' présent aux indices {} et {}", t, p, c);
        }
    } else {
        println!("✅ Zéro doublon sur les titres ('title')");
    }

    // Vérification des catégories
    let mut cat_set = HashSet::new();
    let mut dup_cats = Vec::new();
    for c in &catalog.categories {
        if !cat_set.insert(c.id.clone()) {
            dup_cats.push(c.id.clone());
        }
    }
    if !dup_cats.is_empty() {
        has_error = true;
        eprintln!("❌ Doublons de catégories : {:?}", dup_cats);
    } else {
        println!("✅ Zéro doublon sur les catégories");
    }

    println!("=======================================================");
    if has_error {
        eprintln!("❌ VÉRIFICATION ÉCHOUÉE : Veuillez corriger les doublons signalés.");
        std::process::exit(1);
    } else {
        println!("🎉 TOUS LES FLUX ET SOURCES SONT PARFAITEMENT DÉDOUBLONNÉS !");
        println!("=======================================================\n");
    }

    Ok(())
}
