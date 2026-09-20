mod chunks;
mod commands;
mod db;
mod drive;
mod embeddings;
mod git;
mod mcp;
mod mcp_bridge;
mod pdf_export;

use db::DbState;
use mcp::McpState;
use mcp_bridge::McpBridgeState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
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
            app.manage(drive::DriveState::default());
            app.manage(McpState::default());
            app.manage(McpBridgeState::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_backlinks,
            commands::get_outgoing_links,
            commands::reindex_vault,
            commands::read_local_dir,
            commands::read_local_file,
            commands::write_local_file,
            commands::create_local_file,
            commands::create_local_dir,
            commands::rename_local_entry,
            commands::delete_local_entry,
            commands::search_vault,
            // Memory-RAG (AGENT_MEMORY_RAG_PLAN.md, M1)
            commands::get_unembedded_chunks,
            commands::store_chunk_embeddings,
            // Memory-RAG (M2): hybrid retrieval + durable memory
            commands::search_rag,
            commands::add_memory,
            commands::recall_memory,
            commands::get_context_bundle,
            // phase 2b: markdown -> PDF artifact export
            commands::export_markdown_to_pdf,
            // OpenCode Agent process management
            commands::check_opencode_installed,
            commands::spawn_opencode_server,
            commands::kill_opencode_server,
            // Google Drive backup (BACKUP-0): OAuth sign-in/account/sign-out
            drive::google_account,
            drive::google_sign_in,
            drive::google_sign_out,
            // MCP connectors (MCP_CONNECTORS_PLAN.md): tool listing, calls, health, teardown
            mcp::list_connector_tools,
            mcp::call_connector_tool,
            mcp::test_connector,
            mcp::stop_connector,
            // MCP bridge: workspace tools -> OpenCode
            mcp_bridge::start_mcp_bridge,
            mcp_bridge::stop_mcp_bridge,
            // Git work-tree status + file diff (Work-Tree panel)
            git::git_status,
            git::git_diff_file,
            // AI debug log (opt-in "Verbose AI Tool Logging" setting)
            commands::append_ai_debug_log,
            commands::get_ai_debug_log_path,
            // Agent Orchestration Layer (AGENTIC_ORCHESTRATION_PLAN.md, Phase 1-3)
            commands::create_agent_session,
            commands::list_agent_sessions,
            commands::get_agent_session,
            commands::patch_agent_session,
            commands::fork_agent_session,
            commands::archive_agent_session,
            commands::delete_agent_session,
            commands::start_agent_run,
            commands::record_run_turn,
            commands::create_scheduled_task,
            commands::list_scheduled_tasks,
            commands::patch_scheduled_task,
            commands::delete_scheduled_task,
            commands::check_due_tasks,
            commands::log_task_run
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit = event {
            commands::cleanup_opencode_on_exit(app_handle);
        }
    });
}

