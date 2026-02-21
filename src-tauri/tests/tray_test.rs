use lyra_music_lib::tray;

/// Compile-time test: verify that the tray module is accessible
/// and create_tray has the expected signature.
#[test]
fn tray_module_is_accessible() {
    // Verify the function exists and has the correct type signature
    let _: fn(&tauri::App) -> Result<(), Box<dyn std::error::Error>> = tray::create_tray;
}
