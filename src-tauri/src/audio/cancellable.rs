use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use rodio::source::SeekError;
use rodio::{ChannelCount, Sample, SampleRate, Source};

/// A source that ends immediately once its flag is set.
///
/// rodio's `Player` can only skip from the front of its queue, so a track
/// appended for gapless playback cannot be removed again. Wrapping the queued
/// track lets the player cancel it instead: a cancelled source yields no
/// samples, so the queue steps over it the moment it is reached.
pub struct Cancellable<S> {
    inner: S,
    cancelled: Arc<AtomicBool>,
}

impl<S> Cancellable<S> {
    pub fn new(inner: S) -> (Self, Arc<AtomicBool>) {
        let cancelled = Arc::new(AtomicBool::new(false));
        let source = Self {
            inner,
            cancelled: Arc::<AtomicBool>::clone(&cancelled),
        };
        (source, cancelled)
    }

    fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::Relaxed)
    }
}

impl<S: Source<Item = Sample>> Iterator for Cancellable<S> {
    type Item = Sample;

    #[inline]
    fn next(&mut self) -> Option<Sample> {
        if self.is_cancelled() {
            return None;
        }
        self.inner.next()
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        if self.is_cancelled() {
            (0, Some(0))
        } else {
            self.inner.size_hint()
        }
    }
}

impl<S: Source<Item = Sample>> Source for Cancellable<S> {
    fn current_span_len(&self) -> Option<usize> {
        if self.is_cancelled() {
            Some(0)
        } else {
            self.inner.current_span_len()
        }
    }

    fn channels(&self) -> ChannelCount {
        self.inner.channels()
    }

    fn sample_rate(&self) -> SampleRate {
        self.inner.sample_rate()
    }

    fn total_duration(&self) -> Option<Duration> {
        self.inner.total_duration()
    }

    fn try_seek(&mut self, pos: Duration) -> Result<(), SeekError> {
        self.inner.try_seek(pos)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rodio::buffer::SamplesBuffer;
    use std::num::NonZero;

    fn buffer() -> SamplesBuffer {
        let one = NonZero::new(1).expect("non-zero");
        let rate = NonZero::new(44100).expect("non-zero");
        SamplesBuffer::new(one, rate, vec![0.1, 0.2, 0.3, 0.4])
    }

    #[test]
    fn passes_samples_through_until_cancelled() {
        let (mut source, cancelled) = Cancellable::new(buffer());
        assert_eq!(source.next(), Some(0.1));
        assert_eq!(source.next(), Some(0.2));

        cancelled.store(true, Ordering::Relaxed);
        assert_eq!(source.next(), None);
        assert!(source.is_exhausted());
        assert_eq!(source.size_hint(), (0, Some(0)));
    }

    #[test]
    fn cancelled_before_first_sample_yields_nothing() {
        let (mut source, cancelled) = Cancellable::new(buffer());
        cancelled.store(true, Ordering::Relaxed);
        assert_eq!(source.next(), None);
    }

    #[test]
    fn reports_inner_format() {
        let (source, _cancelled) = Cancellable::new(buffer());
        assert_eq!(source.channels().get(), 1);
        assert_eq!(source.sample_rate().get(), 44100);
        assert!(!source.is_exhausted());
    }
}
