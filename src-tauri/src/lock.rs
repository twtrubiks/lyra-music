use std::sync::{Mutex, MutexGuard};

/// Locking that survives a poisoned mutex.
///
/// A mutex is poisoned when a thread panics while holding it, and from then
/// on `lock()` fails for everyone: one panic in a command would leave the
/// player or the database unusable until the app is restarted. The data
/// behind the app's locks stays usable after such a panic — a `rusqlite`
/// transaction rolls back when it is dropped during unwinding, and the
/// player's state is rebuilt by the next load — so the lock is taken anyway.
pub trait LockRecover<T> {
    /// Lock the mutex, recovering it if it is poisoned. The poison flag is
    /// cleared, so a recovery is logged once per panic, not on every lock.
    fn lock_recover(&self) -> MutexGuard<'_, T>;
}

impl<T> LockRecover<T> for Mutex<T> {
    fn lock_recover(&self) -> MutexGuard<'_, T> {
        self.lock().unwrap_or_else(|poisoned| {
            self.clear_poison();
            log::error!(
                "a thread panicked while holding a {} lock; recovered the lock and continuing",
                std::any::type_name::<T>()
            );
            poisoned.into_inner()
        })
    }
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used)]

    use std::sync::{Arc, Mutex};

    use super::*;

    fn poisoned(value: i32) -> Arc<Mutex<i32>> {
        let mutex = Arc::new(Mutex::new(value));
        let clone = Arc::clone(&mutex);
        let _ = std::thread::spawn(move || {
            let _guard = clone.lock().unwrap();
            panic!("poison the lock");
        })
        .join();
        assert!(mutex.is_poisoned());
        mutex
    }

    #[test]
    fn lock_recover_locks_a_healthy_mutex() {
        let mutex = Mutex::new(1);
        *mutex.lock_recover() += 1;
        assert_eq!(*mutex.lock_recover(), 2);
    }

    /// A thread that panicked while holding the lock must not take the lock
    /// down with it: the next caller gets the value and goes on.
    #[test]
    fn lock_recover_hands_out_a_poisoned_mutex() {
        let mutex = poisoned(7);
        assert_eq!(*mutex.lock_recover(), 7);
    }

    /// The poison flag is cleared, so the recovery is reported once and not
    /// on every later lock (the polling thread locks four times a second).
    #[test]
    fn lock_recover_clears_the_poison() {
        let mutex = poisoned(7);
        drop(mutex.lock_recover());
        assert!(!mutex.is_poisoned());
        assert!(mutex.lock().is_ok());
    }
}
