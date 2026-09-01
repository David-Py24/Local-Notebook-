mod commands;
mod db;
mod parsers;

use db::DbState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
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
            commands::add_source,
            commands::get_sources,
            commands::get_source,
            commands::get_source_content,
            commands::update_source,
            commands::delete_source,
            commands::copy_source_to_note,
            commands::add_note,
            commands::get_notes,
            commands::get_note,
            commands::update_note,
            commands::pin_note,
            commands::delete_note,
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
