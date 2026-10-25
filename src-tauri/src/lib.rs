mod commands;

use commands::{
    initial_file, list_dir_tree, open_external, read_text_file, rename_path, save_image_asset,
    unwatch_all, watch_paths, write_text_file, WatcherState,
};
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(WatcherState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(path) = argv
                .iter()
                .skip(1)
                .map(std::path::PathBuf::from)
                .find(|path| path.is_file())
            {
                let _ = app.emit("mdot:open-file", path.to_string_lossy().into_owned());
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            // The frontend reveals the window after its first paint. If the webview
            // fails before that, show it anyway so the user can see the error state.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(5));
                if let Some(window) = handle.get_webview_window("main") {
                    let _ = window.show();
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_text_file,
            write_text_file,
            list_dir_tree,
            watch_paths,
            unwatch_all,
            save_image_asset,
            open_external,
            rename_path,
            initial_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running mdot");
}
