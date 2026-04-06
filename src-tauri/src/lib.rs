#![recursion_limit = "256"]

mod commands;

use tauri::{Manager, PhysicalPosition, PhysicalSize, Position, Size};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![
      commands::get_config,
      commands::save_config,
      commands::get_app_version,
      commands::get_latest_github_release,
      commands::open_external_url,
      commands::download_and_run_installer,
      commands::exit_application,
      commands::update_tray_lang,
      commands::factory_reset,
      commands::fetch_azure_voices,
      commands::validate_azure_and_fetch_voices,
      commands::test_tts,
      commands::synthesize_tts,
      commands::play_tts,
      commands::list_audio_output_devices,
      commands::tts_pause,
      commands::tts_resume,
      commands::tts_skip,
      commands::tts_clear,
      commands::twitch_login,
      commands::validate_twitch_token,
      commands::fetch_twitch_rewards,
      commands::fetch_twitch_reward_redemptions,
      commands::create_twitch_reward,
      commands::update_twitch_reward,
      commands::delete_twitch_reward,
      commands::complete_twitch_redemption,
      commands::export_preset_file,
      commands::import_preset_file,
      commands::ensure_overlay_server,
      commands::overlay_set_enabled,
      commands::overlay_update_scale,
      commands::overlay_update_config,
      commands::overlay_push_event
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .level_for("symphonia_bundle_mp3", log::LevelFilter::Off)
            .build(),
        )?;
      }

      if let Some(window) = app.get_webview_window("main") {
        let startup_window_state = commands::load_startup_window_state(&app.handle());
        let monitor = window
          .current_monitor()
          .ok()
          .flatten()
          .or_else(|| window.primary_monitor().ok().flatten());

        if let Some(monitor) = monitor {
          let size = monitor.size();
          let min_width = 1024u32;
          let min_height = 720u32;
          let fallback_width = ((size.width as f64) * 0.75).round() as u32;
          let fallback_height = ((size.height as f64) * 0.75).round() as u32;

          let mut width = startup_window_state.width.unwrap_or(fallback_width);
          let mut height = startup_window_state.height.unwrap_or(fallback_height);

          width = width.max(min_width).min(size.width);
          height = height.max(min_height).min(size.height);

          let _ = window.set_size(Size::Physical(PhysicalSize::new(width, height)));

          if startup_window_state.maximized {
            let _ = window.maximize();
          } else {
            let pos_x = ((size.width - width) / 2) as i32;
            let pos_y = ((size.height - height) / 2) as i32;
            let _ = window.set_position(Position::Physical(PhysicalPosition::new(pos_x, pos_y)));
          }
        } else {
          let min_width = 1024u32;
          let min_height = 720u32;
          let mut width = startup_window_state.width.unwrap_or(1200);
          let mut height = startup_window_state.height.unwrap_or(900);

          width = width.max(min_width);
          height = height.max(min_height);

          let _ = window.set_size(Size::Physical(PhysicalSize::new(width, height)));
          if startup_window_state.maximized {
            let _ = window.maximize();
          } else {
            let _ = window.center();
          }
        }

        let _ = window.show();
        let _ = window.set_focus();
      }

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
