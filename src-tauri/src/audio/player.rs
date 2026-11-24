use std::fs::File;
use std::io::BufReader;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use rodio::{Decoder, DeviceSinkBuilder, MixerDeviceSink, Player, Source};

use crate::audio::cancellable::Cancellable;
use crate::error::AppError;

pub type SharedPlayer = Arc<Mutex<AudioPlayer>>;

pub struct AudioPlayer {
    stream: MixerDeviceSink,
    sink: Option<Player>,
    current_file_path: Option<String>,
    volume: f32,
    duration_secs: f64,
    current_track_id: Option<i64>,
    track_loaded: bool,
    next_file_path: Option<String>,
    next_track_id: Option<i64>,
    next_duration_secs: f64,
    /// Cancels the queued next track's source; set while `gapless_queued`.
    next_cancel: Option<Arc<AtomicBool>>,
    /// A cancelled source still sits in the sink behind the current track.
    /// When the queue reaches it, rodio resets the sink position to that
    /// source's (zero) before it ends, which would defeat the position guard
    /// in `has_track_ended`.
    cancelled_pending: bool,
    gapless_queued: bool,
    cumulative_duration: f64,
    completion_seq: u64,
    last_completed_track_id: Option<i64>,
}

impl AudioPlayer {
    pub fn new() -> Result<Self, AppError> {
        let builder = DeviceSinkBuilder::from_default_device()
            .map_err(|e| AppError::Audio(e.to_string()))?
            .with_buffer_size(rodio::cpal::BufferSize::Fixed(4096));
        let stream = builder
            .open_sink_or_fallback()
            .map_err(|e| AppError::Audio(e.to_string()))?;
        Ok(Self {
            stream,
            sink: None,
            current_file_path: None,
            volume: 0.5,
            duration_secs: 0.0,
            current_track_id: None,
            track_loaded: false,
            next_file_path: None,
            next_track_id: None,
            next_duration_secs: 0.0,
            next_cancel: None,
            cancelled_pending: false,
            gapless_queued: false,
            cumulative_duration: 0.0,
            completion_seq: 0,
            last_completed_track_id: None,
        })
    }

    pub fn load_and_play(&mut self, path: &str, fallback_duration: f64) -> Result<(), AppError> {
        self.cumulative_duration = 0.0;
        self.forget_queued_next();

        // Stop existing sink if any
        if let Some(ref sink) = self.sink {
            sink.stop();
        }

        // Open file once, read duration, then append the same decoder
        let decoder = match Self::open_decoder(path) {
            Ok(d) => d,
            Err(e) => {
                // A failed load must leave no stale playback state: keeping the
                // previous sink (empty, position at end-of-track) would re-arm
                // has_track_ended() on every poll and cascade auto-advance.
                self.stop();
                self.duration_secs = 0.0;
                return Err(e);
            }
        };
        self.duration_secs = decoder
            .total_duration()
            .map_or(fallback_duration, |d: std::time::Duration| d.as_secs_f64());

        let sink = Player::connect_new(self.stream.mixer());
        sink.set_volume(self.volume * self.volume);
        sink.append(decoder);

        self.sink = Some(sink);
        self.current_file_path = Some(path.to_string());
        self.track_loaded = true;

        Ok(())
    }

    /// Open via `TryFrom<File>` rather than `Decoder::new`: it passes the
    /// file's byte length to symphonia and marks the stream seekable. Without
    /// that, backward seeks fail (forcing the reload fallback in `try_seek`,
    /// which drops the queued gapless track), headerless MP3s report no
    /// duration, and m4a files with `moov` after `mdat` fail to open at all.
    fn open_decoder(path: &str) -> Result<Decoder<BufReader<File>>, AppError> {
        let file = File::open(path).map_err(|e| AppError::Audio(format!("{path}: {e}")))?;
        Decoder::try_from(file).map_err(|e| AppError::Audio(format!("{path}: {e}")))
    }

    pub fn play(&self) {
        if let Some(ref sink) = self.sink {
            sink.play();
        }
    }

    pub fn pause(&self) {
        if let Some(ref sink) = self.sink {
            sink.pause();
        }
    }

    pub fn stop(&mut self) {
        if let Some(ref sink) = self.sink {
            sink.stop();
        }
        self.sink = None;
        self.current_file_path = None;
        self.current_track_id = None;
        self.track_loaded = false;
        // Clear pending gapless state: with the sink gone, a stale
        // gapless_queued would make check_gapless_transition() fire a
        // phantom transition to the old next track.
        self.forget_queued_next();
    }

    pub fn set_volume(&mut self, vol: f32) {
        self.volume = vol.clamp(0.0, 1.0);
        // Apply quadratic curve: human hearing is logarithmic,
        // so squaring the linear slider value gives a more natural feel.
        // UI 0.5 -> actual amplitude 0.25, UI 1.0 -> actual 1.0
        let amplitude = self.volume * self.volume;
        if let Some(ref sink) = self.sink {
            sink.set_volume(amplitude);
        }
    }

    pub fn try_seek(&mut self, secs: f64) -> Result<(), AppError> {
        let target = std::time::Duration::from_secs_f64(secs);

        // Try native seek first
        if let Some(ref sink) = self.sink
            && sink.try_seek(target).is_ok()
        {
            return Ok(());
        }

        // Fallback: reload file and seek forward. Kept as a safety net for
        // sources whose native seek still fails.
        let path = self
            .current_file_path
            .clone()
            .ok_or_else(|| AppError::Audio("no file loaded".to_string()))?;

        if let Some(ref sink) = self.sink {
            sink.stop();
        }

        let sink = Player::connect_new(self.stream.mixer());
        let decoder = Self::open_decoder(&path)?;

        sink.set_volume(self.volume * self.volume);
        sink.append(decoder);
        // Seek forward to target position after reload. The new sink and the
        // cleared gapless state must be installed even when this seek fails —
        // bailing out earlier would leave a stopped sink with gapless_queued
        // still set, arming a phantom transition on the next poll.
        let seek_result = sink.try_seek(target);

        self.sink = Some(sink);
        self.forget_queued_next();
        seek_result.map_err(|e| AppError::Audio(format!("{path}: seek after reload failed: {e}")))
    }

    pub fn get_pos(&self) -> f64 {
        let raw = self
            .sink
            .as_ref()
            .map_or(0.0, |s| s.get_pos().as_secs_f64());
        (raw - self.cumulative_duration).max(0.0)
    }

    pub fn is_playing(&self) -> bool {
        self.sink
            .as_ref()
            .is_some_and(|s| !s.is_paused() && !s.empty())
    }

    pub fn get_duration(&self) -> f64 {
        self.duration_secs
    }

    pub fn set_current_track_id(&mut self, id: Option<i64>) {
        self.current_track_id = id;
    }

    pub fn get_current_track_id(&self) -> Option<i64> {
        self.current_track_id
    }

    pub fn get_volume(&self) -> f32 {
        self.volume
    }

    pub fn has_track_ended(&self) -> bool {
        if !self.track_loaded || self.gapless_queued {
            return false;
        }
        let empty = self.sink.as_ref().is_some_and(Player::empty);
        if !empty {
            return false;
        }
        // The position belongs to the cancelled source by now, not to the
        // track that just finished — see `cancelled_pending`.
        if self.cancelled_pending {
            return true;
        }
        // Position guard: only consider ended when playback position is near the end,
        // to prevent false positives from ALSA underrun causing sink.empty()
        let pos = self.get_pos();
        self.duration_secs <= 0.0 || pos >= self.duration_secs - 1.0
    }

    pub fn acknowledge_track_ended(&mut self) {
        self.track_loaded = false;
        // A natural end is a completion. has_track_ended() already requires
        // track_loaded (only set by a successful load), so a track whose
        // file failed to load can never be credited here.
        self.record_completion();
    }

    /// Record that the current track played to completion. The play count
    /// is credited from this sequence in the polling thread — detection and
    /// crediting stay in one thread under one lock, so exactly-once needs no
    /// cross-IPC guards. Level-triggered: unlike the one-shot ended/
    /// transitioned flags, the fields persist in every later state snapshot.
    fn record_completion(&mut self) {
        if let Some(id) = self.current_track_id {
            self.completion_seq += 1;
            self.last_completed_track_id = Some(id);
        }
    }

    pub fn completion_seq(&self) -> u64 {
        self.completion_seq
    }

    pub fn last_completed_track_id(&self) -> Option<i64> {
        self.last_completed_track_id
    }

    /// Queue `path` to play right after the current track. Queueing again
    /// replaces the previously queued track, so the caller can re-queue
    /// whenever the upcoming track changes (track removed, shuffle toggled).
    pub fn queue_next(
        &mut self,
        path: &str,
        next_id: i64,
        fallback_duration: f64,
    ) -> Result<(), AppError> {
        if self.sink.is_none() {
            return Err(AppError::Audio("no active sink".to_string()));
        }
        // Nothing to follow once the current track has ended: appending to
        // the drained sink would start playing at once.
        if !self.track_loaded {
            return Ok(());
        }
        if self.gapless_queued {
            let same_track =
                self.next_track_id == Some(next_id) && self.next_file_path.as_deref() == Some(path);
            // Once the queued track has started it is the current track in
            // all but bookkeeping; the polling thread reports that
            // transition and the caller queues again from there.
            if same_track || self.queued_next_started() {
                return Ok(());
            }
            self.clear_queued_next();
        }
        let sink = self
            .sink
            .as_ref()
            .ok_or(AppError::Audio("no active sink".to_string()))?;

        // Open file once, read duration, then append the same decoder for gapless
        let decoder = Self::open_decoder(path)?;
        let next_dur = decoder
            .total_duration()
            .map_or(fallback_duration, |d| d.as_secs_f64());
        let (source, cancel) = Cancellable::new(decoder);
        sink.append(source);

        self.next_file_path = Some(path.to_string());
        self.next_track_id = Some(next_id);
        self.next_duration_secs = next_dur;
        self.next_cancel = Some(cancel);
        self.gapless_queued = true;
        Ok(())
    }

    /// Un-queue the next track so playback ends with the current one. A
    /// queued track that has already started is left alone — see
    /// `queue_next`.
    pub fn clear_queued_next(&mut self) {
        if !self.gapless_queued || self.queued_next_started() {
            return;
        }
        if let Some(cancel) = &self.next_cancel {
            cancel.store(true, Ordering::Relaxed);
        }
        self.forget_queued_next();
        self.cancelled_pending = true;
    }

    /// Drop the queued-next bookkeeping without touching the sink. Every
    /// caller other than `clear_queued_next` replaces or drops the sink, so
    /// no cancelled source is left behind.
    fn forget_queued_next(&mut self) {
        self.cancelled_pending = false;
        self.gapless_queued = false;
        self.next_file_path = None;
        self.next_track_id = None;
        self.next_duration_secs = 0.0;
        self.next_cancel = None;
    }

    /// Whether the sink has already moved on to the queued track. Cancelled
    /// sources still count towards `len` until the queue reaches them, where
    /// they end at once — so this stays accurate after replacements.
    fn queued_next_started(&self) -> bool {
        self.sink.as_ref().map_or(0, rodio::Player::len) <= 1
    }

    pub fn transition_to_queued_next(&mut self) {
        if !self.gapless_queued {
            return;
        }
        // The outgoing track finished playing — record its completion
        // before current_track_id is swapped to the queued next.
        self.record_completion();
        self.cumulative_duration = 0.0;
        self.current_file_path = self.next_file_path.take();
        self.current_track_id = self.next_track_id.take();
        self.duration_secs = self.next_duration_secs;
        self.next_duration_secs = 0.0;
        self.next_cancel = None;
        // Any cancelled sources sat ahead of the queued track and are gone.
        self.cancelled_pending = false;
        self.gapless_queued = false;
    }

    pub fn check_gapless_transition(&mut self) -> bool {
        if !self.gapless_queued {
            return false;
        }
        if self.queued_next_started() {
            self.transition_to_queued_next();
            return true;
        }
        false
    }

    pub fn is_gapless_queued(&self) -> bool {
        self.gapless_queued
    }
}
