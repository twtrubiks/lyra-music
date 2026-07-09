//! Online lyrics lookup via the LRCLIB API (<https://lrclib.net>).
//!
//! Strictly user-triggered — nothing here runs automatically, so the app
//! stays fully offline unless the user explicitly asks for an online search.

use std::path::Path;
use std::time::Duration;

use serde::Deserialize;

use crate::error::AppError;

const LRCLIB_GET_URL: &str = "https://lrclib.net/api/get";
const LRCLIB_SEARCH_URL: &str = "https://lrclib.net/api/search";
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

/// One entry of a LRCLIB `/api/search` response. Missing fields default to
/// empty/None so a partial entry simply never matches.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LrclibSearchItem {
    #[serde(default)]
    artist_name: String,
    #[serde(default)]
    track_name: String,
    #[serde(default)]
    duration: Option<f64>,
    synced_lyrics: Option<String>,
    plain_lyrics: Option<String>,
}

fn non_blank(s: Option<String>) -> Option<String> {
    s.filter(|text| !text.trim().is_empty())
}

/// Pick usable lyrics out of a LRCLIB `/api/get` response body: synced wins
/// over plain, and blank strings count as absent (instrumental tracks report
/// null/empty lyrics fields).
fn parse_response(body: &str) -> Result<Option<FetchedLyrics>, serde_json::Error> {
    let resp: LrclibGetResponse = serde_json::from_str(body)?;
    Ok(non_blank(resp.synced_lyrics)
        .map(FetchedLyrics::Synced)
        .or_else(|| non_blank(resp.plain_lyrics).map(FetchedLyrics::Plain)))
}

/// Search candidates further than this from the local file's duration are
/// rejected outright. The fallback exists for re-encode/trailing-silence
/// drift (seconds, not tens of seconds); anything further is a different
/// edition whose lyrics and timeline are both suspect.
const MAX_DURATION_DIST_SECS: f64 = 15.0;

/// Pick the best candidate out of a LRCLIB `/api/search` response body.
///
/// Search is fuzzy, so guard against wrong lyrics: only candidates whose
/// artist and title equal ours (trimmed, case-insensitive) qualify — that
/// rejects medleys and "Jay Chou 周杰倫"-style alternate artist spellings.
/// Among them, take the one closest to the local file's duration (most
/// likely to have a matching timeline) within [`MAX_DURATION_DIST_SECS`];
/// on a tie, synced beats plain.
fn pick_search_match(
    body: &str,
    artist: &str,
    title: &str,
    duration_secs: f64,
) -> Result<Option<FetchedLyrics>, serde_json::Error> {
    let items: Vec<LrclibSearchItem> = serde_json::from_str(body)?;
    let normalize = |s: &str| s.trim().to_lowercase();

    let mut best: Option<(f64, u8, FetchedLyrics)> = None;
    for item in items {
        if normalize(&item.artist_name) != normalize(artist)
            || normalize(&item.track_name) != normalize(title)
        {
            continue;
        }
        let Some(lyrics) = non_blank(item.synced_lyrics)
            .map(FetchedLyrics::Synced)
            .or_else(|| non_blank(item.plain_lyrics).map(FetchedLyrics::Plain))
        else {
            continue;
        };
        // Unknown local duration (0) treats every candidate as equally
        // close, so synced-preference and list order decide. A candidate
        // missing its duration gets f64::MAX and falls to the cap below.
        let dist = if duration_secs > 0.0 {
            (item.duration.unwrap_or(f64::MAX) - duration_secs).abs()
        } else {
            0.0
        };
        if dist > MAX_DURATION_DIST_SECS {
            continue;
        }
        let rank = match lyrics {
            FetchedLyrics::Synced(_) => 0_u8,
            FetchedLyrics::Plain(_) => 1,
        };
        if best
            .as_ref()
            .is_none_or(|(b_dist, b_rank, _)| (dist, rank) < (*b_dist, *b_rank))
        {
            best = Some((dist, rank, lyrics));
        }
    }
    Ok(best.map(|(_, _, lyrics)| lyrics))
}

/// Query LRCLIB for a track's lyrics. `Ok(None)` means LRCLIB has no entry
/// for the track; `Err` means the lookup itself failed (offline, timeout,
/// unexpected response).
///
/// Two-stage lookup: `/api/get` first (exact match; duration tolerance is
/// only ±2s, so re-encoded rips with trailing silence routinely miss), then
/// fall back to `/api/search` and pick the closest-duration candidate (within
/// ±15s) whose artist and title match exactly (see [`pick_search_match`]).
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

    if let Some(lyrics) = fetch_exact(&agent, artist, title, album, duration_secs)? {
        return Ok(Some(lyrics));
    }
    fetch_search_fallback(&agent, artist, title, duration_secs)
}

/// Exact-match lookup via `/api/get`. `Ok(None)` on 404.
fn fetch_exact(
    agent: &ureq::Agent,
    artist: &str,
    title: &str,
    album: &str,
    duration_secs: f64,
) -> Result<Option<FetchedLyrics>, AppError> {
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

/// Fuzzy lookup via `/api/search`, filtered down by [`pick_search_match`].
fn fetch_search_fallback(
    agent: &ureq::Agent,
    artist: &str,
    title: &str,
    duration_secs: f64,
) -> Result<Option<FetchedLyrics>, AppError> {
    let mut response = agent
        .get(LRCLIB_SEARCH_URL)
        .query("artist_name", artist)
        .query("track_name", title)
        .call()
        .map_err(|e| AppError::Network(e.to_string()))?;
    let status = response.status().as_u16();
    if status != 200 {
        return Err(AppError::Network(format!("LRCLIB returned HTTP {status}")));
    }
    let body = response
        .body_mut()
        .read_to_string()
        .map_err(|e| AppError::Network(e.to_string()))?;
    pick_search_match(&body, artist, title, duration_secs)
        .map_err(|e| AppError::Network(format!("unexpected LRCLIB response: {e}")))
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

    fn search_item(artist: &str, title: &str, duration: f64, synced: &str, plain: &str) -> String {
        format!(
            r#"{{"artistName":{},"trackName":{},"duration":{duration},"syncedLyrics":{},"plainLyrics":{}}}"#,
            serde_json::to_string(artist).unwrap(),
            serde_json::to_string(title).unwrap(),
            serde_json::to_string(synced).unwrap(),
            serde_json::to_string(plain).unwrap(),
        )
    }

    #[test]
    fn search_picks_closest_duration_match() {
        // Local file is 299s: the 305s edition beats the 231s original.
        let body = format!(
            "[{},{}]",
            search_item("周杰倫", "回到過去", 231.0, "[00:01.00] short version", ""),
            search_item("周杰倫", "回到過去", 305.77, "[00:01.00] long version", ""),
        );
        let got = pick_search_match(&body, "周杰倫", "回到過去", 299.0)
            .unwrap()
            .unwrap();
        assert_eq!(text(got), "[00:01.00] long version");
    }

    #[test]
    fn search_rejects_mismatched_artist_and_title() {
        // Medleys and different-artist covers must not be picked even when
        // they are the only candidates.
        let body = format!(
            "[{},{}]",
            search_item(
                "周杰倫",
                "星晴+回到過去+最後的戰役",
                763.0,
                "[00:01.00] medley",
                ""
            ),
            search_item(
                "Jay Chou 周杰倫",
                "回到過去",
                231.0,
                "[00:01.00] alt artist",
                ""
            ),
        );
        assert!(
            pick_search_match(&body, "周杰倫", "回到過去", 299.0)
                .unwrap()
                .is_none()
        );
    }

    #[test]
    fn search_matching_ignores_case_and_whitespace() {
        let body = format!(
            "[{}]",
            search_item("Jay Chou", "Yellow", 266.0, "", "words")
        );
        let got = pick_search_match(&body, " jay chou ", "YELLOW", 266.0)
            .unwrap()
            .unwrap();
        assert!(matches!(got, FetchedLyrics::Plain(_)));
    }

    #[test]
    fn search_skips_candidates_without_usable_lyrics() {
        // Closest-duration candidate has blank lyrics — fall through to the
        // next usable one instead of returning nothing.
        let body = format!(
            "[{},{}]",
            search_item("周杰倫", "回到過去", 299.0, "  \n", ""),
            search_item("周杰倫", "回到過去", 290.0, "[00:01.00] usable", ""),
        );
        let got = pick_search_match(&body, "周杰倫", "回到過去", 299.0)
            .unwrap()
            .unwrap();
        assert_eq!(text(got), "[00:01.00] usable");
    }

    #[test]
    fn search_prefers_synced_on_duration_tie() {
        let body = format!(
            "[{},{}]",
            search_item("周杰倫", "回到過去", 231.0, "", "plain only"),
            search_item("周杰倫", "回到過去", 231.0, "[00:01.00] synced", ""),
        );
        let got = pick_search_match(&body, "周杰倫", "回到過去", 231.0)
            .unwrap()
            .unwrap();
        assert!(matches!(got, FetchedLyrics::Synced(_)));
    }

    #[test]
    fn search_rejects_sole_candidate_beyond_duration_cap() {
        // A 231s radio edit against a 299s local rip: the synced timeline
        // would drift by a minute — not-found beats wrong lyrics.
        let body = format!(
            "[{}]",
            search_item("周杰倫", "回到過去", 231.0, "[00:01.00] radio edit", ""),
        );
        assert!(
            pick_search_match(&body, "周杰倫", "回到過去", 299.0)
                .unwrap()
                .is_none()
        );
    }

    #[test]
    fn search_rejects_candidate_without_duration_when_local_known() {
        let body = r#"[{"artistName":"周杰倫","trackName":"回到過去","duration":null,"syncedLyrics":"[00:01.00] hi","plainLyrics":null}]"#;
        assert!(
            pick_search_match(body, "周杰倫", "回到過去", 299.0)
                .unwrap()
                .is_none()
        );
    }

    #[test]
    fn search_with_unknown_local_duration_still_matches() {
        let body = format!(
            "[{}]",
            search_item("周杰倫", "回到過去", 231.0, "[00:01.00] hi", ""),
        );
        let got = pick_search_match(&body, "周杰倫", "回到過去", 0.0)
            .unwrap()
            .unwrap();
        assert_eq!(text(got), "[00:01.00] hi");
    }

    #[test]
    fn search_empty_results_returns_none() {
        assert!(
            pick_search_match("[]", "周杰倫", "回到過去", 299.0)
                .unwrap()
                .is_none()
        );
    }

    #[test]
    fn search_rejects_malformed_json() {
        assert!(pick_search_match("<html>not json</html>", "a", "t", 0.0).is_err());
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

    /// Repro of the duration-mismatch miss: a 299s local rip of a track whose
    /// LRCLIB editions run 231–306s — `/api/get` 404s (±2s tolerance), only
    /// the search fallback finds it. Run manually with
    /// `cargo test --lib lyrics_online -- --ignored`.
    #[test]
    #[ignore = "requires network"]
    fn fetch_falls_back_to_search_on_duration_mismatch() {
        let got = fetch("周杰倫", "回到過去", "八度空間", 299.0).unwrap();
        assert!(matches!(got, Some(FetchedLyrics::Synced(_))));
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
