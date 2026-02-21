use std::fs;
use std::path::Path;

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use lofty::file::{AudioFile, TaggedFileExt};
use lofty::picture::PictureType;
use lofty::tag::Accessor;

use crate::error::AppError;
use crate::models::track::{Track, TrackDetails};

pub fn read_metadata(file_path: &str) -> Result<Track, AppError> {
    let path = Path::new(file_path);

    let tagged_file = lofty::read_from_path(path).map_err(|e| AppError::Metadata(e.to_string()))?;

    let fallback_title = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Unknown Title")
        .to_string();

    #[allow(clippy::cast_possible_wrap)]
    let file_size_bytes = fs::metadata(path).map(|m| m.len() as i64).unwrap_or(0);

    let properties = tagged_file.properties();
    let duration_secs = properties.duration().as_secs_f64();

    let tag = tagged_file
        .primary_tag()
        .or_else(|| tagged_file.first_tag());

    let (title, artist, album) = match tag {
        Some(t) => {
            let title = t.title().map_or(fallback_title, |s| s.to_string());
            let artist = t
                .artist()
                .map_or_else(|| "Unknown Artist".to_string(), |s| s.to_string());
            let album = t
                .album()
                .map_or_else(|| "Unknown Album".to_string(), |s| s.to_string());
            (title, artist, album)
        }
        None => (
            fallback_title,
            "Unknown Artist".to_string(),
            "Unknown Album".to_string(),
        ),
    };

    Ok(Track {
        id: 0,
        file_path: file_path.to_string(),
        title,
        artist,
        album,
        duration_secs,
        cover_art: None,
        cover_art_path: None,
        file_size_bytes,
        play_count: 0,
        last_played_at: None,
    })
}

pub fn read_track_details(file_path: &str, track: &Track) -> Result<TrackDetails, AppError> {
    let path = Path::new(file_path);

    let tagged_file = lofty::read_from_path(path).map_err(|e| AppError::Metadata(e.to_string()))?;

    let properties = tagged_file.properties();

    let bitrate_kbps = properties.overall_bitrate();
    let sample_rate_hz = properties.sample_rate();
    let channels = properties.channels();
    let bits_per_sample = properties.bit_depth();

    let format = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_uppercase();

    #[allow(clippy::cast_possible_wrap)]
    let file_size_bytes = fs::metadata(path)
        .map(|m| m.len() as i64)
        .unwrap_or(track.file_size_bytes);

    Ok(TrackDetails {
        id: track.id,
        file_path: track.file_path.clone(),
        title: track.title.clone(),
        artist: track.artist.clone(),
        album: track.album.clone(),
        duration_secs: track.duration_secs,
        file_size_bytes,
        bitrate_kbps,
        sample_rate_hz,
        channels,
        format,
        bits_per_sample,
    })
}

/// Extract raw cover art bytes and MIME type from an audio file.
pub fn extract_cover_art_bytes(file_path: &str) -> Option<(Vec<u8>, String)> {
    let tagged_file = lofty::read_from_path(file_path).ok()?;
    let tag = tagged_file
        .primary_tag()
        .or_else(|| tagged_file.first_tag())?;

    let picture = tag
        .pictures()
        .iter()
        .find(|p| p.pic_type() == PictureType::CoverFront)
        .or_else(|| tag.pictures().first())?;

    let mime = match picture.mime_type() {
        Some(mime) => mime.as_str().to_string(),
        None => "image/jpeg".to_string(),
    };

    Some((picture.data().to_vec(), mime))
}

/// Save cover art bytes to the filesystem and return the file path.
pub fn save_cover_art(
    app_data_dir: &Path,
    track_id: i64,
    data: &[u8],
    mime: &str,
) -> Result<String, AppError> {
    let covers_dir = app_data_dir.join("covers");
    fs::create_dir_all(&covers_dir)?;

    let ext = match mime {
        "image/png" => "png",
        "image/gif" => "gif",
        "image/bmp" => "bmp",
        "image/webp" => "webp",
        _ => "jpg",
    };

    let file_path = covers_dir.join(format!("{track_id}.{ext}"));
    fs::write(&file_path, data)?;

    Ok(file_path.to_string_lossy().to_string())
}

/// Read a cover art file from disk and return as a base64 data URI.
pub fn read_cover_art_from_file(cover_art_path: &str) -> Option<String> {
    let path = Path::new(cover_art_path);
    let data = fs::read(path).ok()?;

    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("jpg");
    let mime = match ext {
        "png" => "image/png",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        "webp" => "image/webp",
        _ => "image/jpeg",
    };

    let b64 = STANDARD.encode(&data);
    Some(format!("data:{mime};base64,{b64}"))
}
