mod commands;
mod db;

use db::DbState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let app_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to resolve app data directory");
            std::fs::create_dir_all(&app_dir)?;
            let db_state = DbState::new(&app_dir)?;
            app.manage(db_state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_backlinks,
            commands::get_outgoing_links,
            commands::read_local_dir,
            commands::read_local_file,
            commands::write_local_file,
            commands::create_local_file,
            commands::create_local_dir,
            commands::rename_local_entry,
            commands::delete_local_entry
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
