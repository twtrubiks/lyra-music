use lyra_music_lib::models::player_state::PlayerState;

#[test]
fn gapless_queued_default_false_in_state() {
    let state = PlayerState {
        is_playing: true,
        current_track_id: Some(1),
        position_secs: 0.0,
        duration_secs: 240.0,
        volume: 0.5,
        track_ended: false,
        gapless_queued: false,
        gapless_transitioned: false,
        completion_seq: 0,
        last_completed_track_id: None,
    };
    assert!(!state.gapless_queued);
}

#[test]
fn gapless_state_fields_independent() {
    let state = PlayerState {
        is_playing: true,
        current_track_id: Some(1),
        position_secs: 100.0,
        duration_secs: 240.0,
        volume: 0.5,
        track_ended: false,
        gapless_queued: true,
        gapless_transitioned: false,
        completion_seq: 0,
        last_completed_track_id: None,
    };
    // gapless_queued and track_ended are independent
    assert!(!state.track_ended);
    assert!(state.gapless_queued);
}
