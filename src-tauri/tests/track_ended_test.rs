use lyra_music_lib::models::player_state::PlayerState;

#[test]
fn player_state_serializes_track_ended() {
    let state = PlayerState {
        is_playing: false,
        current_track_id: Some(1),
        position_secs: 0.0,
        duration_secs: 240.0,
        volume: 0.5,
        track_ended: true,
        gapless_queued: false,
        gapless_transitioned: false,
        completion_seq: 0,
        last_completed_track_id: None,
    };
    let json = serde_json::to_string(&state).unwrap();
    assert!(json.contains("\"track_ended\":true"));
}

#[test]
fn player_state_serializes_gapless_queued() {
    let state = PlayerState {
        is_playing: true,
        current_track_id: Some(1),
        position_secs: 30.0,
        duration_secs: 240.0,
        volume: 0.5,
        track_ended: false,
        gapless_queued: true,
        gapless_transitioned: false,
        completion_seq: 0,
        last_completed_track_id: None,
    };
    let json = serde_json::to_string(&state).unwrap();
    assert!(json.contains("\"gapless_queued\":true"));
}

#[test]
fn player_state_serializes_completion_fields() {
    let state = PlayerState {
        is_playing: true,
        current_track_id: Some(2),
        position_secs: 0.5,
        duration_secs: 240.0,
        volume: 0.5,
        track_ended: false,
        gapless_queued: false,
        gapless_transitioned: true,
        completion_seq: 7,
        last_completed_track_id: Some(1),
    };
    let json = serde_json::to_string(&state).unwrap();
    assert!(json.contains("\"completion_seq\":7"));
    assert!(json.contains("\"last_completed_track_id\":1"));
}

#[test]
fn player_state_deserializes_new_fields() {
    let json = r#"{"is_playing":true,"current_track_id":1,"position_secs":30.0,"duration_secs":240.0,"volume":0.5,"track_ended":false,"gapless_queued":true,"gapless_transitioned":false,"completion_seq":3,"last_completed_track_id":2}"#;
    let state: PlayerState = serde_json::from_str(json).unwrap();
    assert!(!state.track_ended);
    assert!(state.gapless_queued);
    assert_eq!(state.completion_seq, 3);
    assert_eq!(state.last_completed_track_id, Some(2));
}
