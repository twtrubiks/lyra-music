//! Online lyrics lookup via the LRCLIB API (<https://lrclib.net>).
//!
//! Strictly user-triggered — nothing here runs automatically, so the app
//! stays fully offline unless the user explicitly asks for an online search.

use std::path::Path;
use std::time::Duration;

use serde::Deserialize;

use crate::error::AppError;

const LRCLIB_GET_URL: &str = "https://lrclib.net/api/get";
/// LRCLIB asks clients to identify themselves via User-Agent.
const USER_AGENT: &str = concat!(
    "Lyra Music v",
    env!("CARGO_PKG_VERSION"),
    " (https://github.com/twtrubiks/lyra-music)"
);

/// Lyrics returned by LRCLIB: synced (`.lrc` format) or plain text.
pub enum FetchedLyrics {
    Synced(String),
    Plain(String),
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LrclibGetResponse {
    synced_lyrics: Option<String>,
    plain_lyrics: Option<String>,
}

/// Pick usable lyrics out of a LRCLIB `/api/get` response body: synced wins
/// over plain, and blank strings count as absent (instrumental tracks report
/// null/empty lyrics fields).
fn parse_response(body: &str) -> Result<Option<FetchedLyrics>, serde_json::Error> {
    let resp: LrclibGetResponse = serde_json::from_str(body)?;
    let non_blank = |s: Option<String>| s.filter(|text| !text.trim().is_empty());
    Ok(non_blank(resp.synced_lyrics)
        .map(FetchedLyrics::Synced)
        .or_else(|| non_blank(resp.plain_lyrics).map(FetchedLyrics::Plain)))
}

/// Query LRCLIB for a track's lyrics. `Ok(None)` means LRCLIB has no entry
/// for the track; `Err` means the lookup itself failed (offline, timeout,
/// unexpected response). Album and duration narrow the match when known —
/// LRCLIB matches duration with a ±2s tolerance.
pub fn fetch(
    artist: &str,
    title: &str,
    album: &str,
    duration_secs: f64,
) -> Result<Option<FetchedLyrics>, AppError> {
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(10)))
        .user_agent(USER_AGENT)
        .http_status_as_error(false)
        .build()
        .into();

    let mut request = agent
        .get(LRCLIB_GET_URL)
        .query("artist_name", artist)
        .query("track_name", title);
    if !album.trim().is_empty() && album != "Unknown Album" {
        request = request.query("album_name", album);
    }
    if duration_secs > 0.0 {
        request = request.query("duration", (duration_secs.round() as i64).to_string());
    }

    let mut response = request
        .call()
        .map_err(|e| AppError::Network(e.to_string()))?;
    match response.status().as_u16() {
        200 => {}
        404 => return Ok(None),
        code => return Err(AppError::Network(format!("LRCLIB returned HTTP {code}"))),
    }
    let body = response
        .body_mut()
        .read_to_string()
        .map_err(|e| AppError::Network(e.to_string()))?;
    parse_response(&body).map_err(|e| AppError::Network(format!("unexpected LRCLIB response: {e}")))
}

/// Cache synced lyrics as a sidecar `.lrc` next to the audio file so the next
/// lookup is local. Best-effort: an existing sidecar is never overwritten and
/// write failures (read-only dir, …) only log — the fetched lyrics are still
/// returned to the caller either way.
pub fn save_sidecar_if_absent(audio_path: &str, lyrics: &str) {
    use std::io::Write;

    let path = Path::new(audio_path).with_extension("lrc");
    match std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
    {
        Ok(mut file) => {
            if let Err(e) = file.write_all(lyrics.as_bytes()) {
                eprintln!(
                    "[lyra] failed to write lyrics sidecar {}: {e}",
                    path.display()
                );
            }
        }
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {}
        Err(e) => {
            eprintln!(
                "[lyra] failed to create lyrics sidecar {}: {e}",
                path.display()
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn text(lyrics: FetchedLyrics) -> String {
        match lyrics {
            FetchedLyrics::Synced(t) | FetchedLyrics::Plain(t) => t,
        }
    }

    #[test]
    fn parse_prefers_synced_over_plain() {
        let body = r#"{"syncedLyrics":"[00:01.00] hi","plainLyrics":"hi","instrumental":false}"#;
        let got = parse_response(body).unwrap().unwrap();
        assert!(matches!(got, FetchedLyrics::Synced(_)));
        assert_eq!(text(got), "[00:01.00] hi");
    }

    #[test]
    fn parse_falls_back_to_plain_when_synced_blank() {
        let body = r#"{"syncedLyrics":"  \n","plainLyrics":"just words"}"#;
        let got = parse_response(body).unwrap().unwrap();
        assert!(matches!(got, FetchedLyrics::Plain(_)));
        assert_eq!(text(got), "just words");
    }

    #[test]
    fn parse_returns_none_for_instrumental_nulls() {
        let body = r#"{"syncedLyrics":null,"plainLyrics":null,"instrumental":true}"#;
        assert!(parse_response(body).unwrap().is_none());
    }

    #[test]
    fn parse_rejects_malformed_json() {
        assert!(parse_response("<html>not json</html>").is_err());
    }

    #[test]
    fn sidecar_written_next_to_audio_file() {
        let dir = tempfile::tempdir().unwrap();
        let audio = dir.path().join("song.mp3");
        std::fs::write(&audio, b"fake").unwrap();

        save_sidecar_if_absent(audio.to_str().unwrap(), "[00:01.00] hi");

        let written = std::fs::read_to_string(dir.path().join("song.lrc")).unwrap();
        assert_eq!(written, "[00:01.00] hi");
    }

    /// Hits the real LRCLIB API — run manually with
    /// `cargo test --lib lyrics_online -- --ignored`.
    #[test]
    #[ignore = "requires network"]
    fn fetch_known_track_returns_synced_lyrics() {
        let got = fetch("Coldplay", "Yellow", "Parachutes", 266.0).unwrap();
        assert!(matches!(got, Some(FetchedLyrics::Synced(_))));
        let miss = fetch("NoSuchArtistZzz", "NoSuchSongZzz", "", 0.0).unwrap();
        assert!(miss.is_none());
    }

    #[test]
    fn sidecar_never_overwrites_existing_file() {
        let dir = tempfile::tempdir().unwrap();
        let audio = dir.path().join("song.mp3");
        let sidecar = dir.path().join("song.lrc");
        std::fs::write(&audio, b"fake").unwrap();
        std::fs::write(&sidecar, "original").unwrap();

        save_sidecar_if_absent(audio.to_str().unwrap(), "fetched");

        assert_eq!(std::fs::read_to_string(&sidecar).unwrap(), "original");
    }
}
