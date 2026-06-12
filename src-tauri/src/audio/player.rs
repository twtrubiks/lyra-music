use std::fs::File;
use std::io::BufReader;
use std::sync::{Arc, Mutex};

use rodio::{Decoder, DeviceSinkBuilder, MixerDeviceSink, Player, Source};

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
    gapless_queued: bool,
    cumulative_duration: f64,
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
            gapless_queued: false,
            cumulative_duration: 0.0,
        })
    }

    pub fn load_and_play(&mut self, path: &str, fallback_duration: f64) -> Result<(), AppError> {
        self.cumulative_duration = 0.0;
        self.gapless_queued = false;
        self.next_file_path = None;
        self.next_track_id = None;
        self.next_duration_secs = 0.0;

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

    fn open_decoder(path: &str) -> Result<Decoder<BufReader<File>>, AppError> {
        let file = File::open(path).map_err(|e| AppError::Audio(format!("{path}: {e}")))?;
        Decoder::new(BufReader::new(file)).map_err(|e| AppError::Audio(format!("{path}: {e}")))
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
        self.gapless_queued = false;
        self.next_file_path = None;
        self.next_track_id = None;
        self.next_duration_secs = 0.0;
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
        if let Some(ref sink) = self.sink {
            if sink.try_seek(target).is_ok() {
                return Ok(());
            }
        }

        // Fallback: reload file and seek forward (workaround for MP3 backward seek)
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
        self.gapless_queued = false;
        self.next_file_path = None;
        self.next_track_id = None;
        self.next_duration_secs = 0.0;
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
        // Position guard: only consider ended when playback position is near the end,
        // to prevent false positives from ALSA underrun causing sink.empty()
        let pos = self.get_pos();
        self.duration_secs <= 0.0 || pos >= self.duration_secs - 1.0
    }

    pub fn acknowledge_track_ended(&mut self) {
        self.track_loaded = false;
    }

    pub fn queue_next(
        &mut self,
        path: &str,
        next_id: i64,
        fallback_duration: f64,
    ) -> Result<(), AppError> {
        if self.gapless_queued {
            return Ok(());
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
        sink.append(decoder);

        self.next_file_path = Some(path.to_string());
        self.next_track_id = Some(next_id);
        self.next_duration_secs = next_dur;
        self.gapless_queued = true;
        Ok(())
    }

    pub fn transition_to_queued_next(&mut self) {
        if !self.gapless_queued {
            return;
        }
        self.cumulative_duration = 0.0;
        self.current_file_path = self.next_file_path.take();
        self.current_track_id = self.next_track_id.take();
        self.duration_secs = self.next_duration_secs;
        self.next_duration_secs = 0.0;
        self.gapless_queued = false;
    }

    pub fn check_gapless_transition(&mut self) -> bool {
        if !self.gapless_queued {
            return false;
        }
        let len = self.sink.as_ref().map_or(0, rodio::Player::len);
        if len <= 1 {
            self.transition_to_queued_next();
            return true;
        }
        false
    }

    pub fn is_gapless_queued(&self) -> bool {
        self.gapless_queued
    }
}
