use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use encoding_rs::{GBK, UTF_16BE, UTF_16LE};
use notify::event::ModifyKind;
use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

const MARKDOWN_EXTS: [&str; 4] = ["md", "markdown", "mdx", "txt"];
const IMAGE_EXTS: [&str; 8] = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif"];

#[derive(Default)]
pub struct WatcherState {
    watcher: Mutex<Option<RecommendedWatcher>>,
}

#[derive(Serialize)]
pub struct FilePayload {
    path: String,
    name: String,
    content: String,
    encoding: String,
    mtime: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeNode {
    name: String,
    path: String,
    is_dir: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    children: Option<Vec<TreeNode>>,
}

#[derive(Serialize, Clone)]
struct FsChangeEvent {
    path: String,
    kind: &'static str,
}

fn mtime_ms(path: &Path) -> i64 {
    fs::metadata(path)
        .ok()
        .and_then(|meta| meta.modified().ok())
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

fn decode_text(bytes: &[u8]) -> (String, String) {
    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        return (String::from_utf8_lossy(&bytes[3..]).into_owned(), "utf-8".into());
    }
    if bytes.starts_with(&[0xFF, 0xFE]) {
        let (text, _, _) = UTF_16LE.decode(&bytes[2..]);
        return (text.into_owned(), "utf-16le".into());
    }
    if bytes.starts_with(&[0xFE, 0xFF]) {
        let (text, _, _) = UTF_16BE.decode(&bytes[2..]);
        return (text.into_owned(), "utf-16be".into());
    }
    if let Ok(text) = std::str::from_utf8(bytes) {
        return (text.to_string(), "utf-8".into());
    }
    let (text, _, _) = GBK.decode(bytes);
    (text.into_owned(), "gbk".into())
}

fn encode_text(content: &str, encoding: &str) -> Result<Vec<u8>, String> {
    match encoding {
        "utf-16le" | "utf-16" => {
            let mut bytes = UTF_16LE.encode(content).0.into_owned();
            let mut result = vec![0xFF, 0xFE];
            result.append(&mut bytes);
            Ok(result)
        }
        "utf-16be" => {
            let mut bytes = UTF_16BE.encode(content).0.into_owned();
            let mut result = vec![0xFE, 0xFF];
            result.append(&mut bytes);
            Ok(result)
        }
        "gbk" => {
            let (bytes, _, had_errors) = GBK.encode(content);
            if had_errors {
                Err("当前文件是 GBK 编码，内容包含无法写回 GBK 的字符".into())
            } else {
                Ok(bytes.into_owned())
            }
        }
        _ => Ok(content.as_bytes().to_vec()),
    }
}

fn file_payload(path: &Path, content: String, encoding: String) -> FilePayload {
    FilePayload {
        path: path.to_string_lossy().into_owned(),
        name: path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_default(),
        content,
        encoding,
        mtime: mtime_ms(path),
    }
}

fn read_sync(path: String) -> Result<FilePayload, String> {
    let file_path = PathBuf::from(&path);
    if !file_path.is_file() {
        return Err("文件不存在或不是普通文件".into());
    }
    let bytes = fs::read(&file_path).map_err(|error| format!("读取文件失败：{error}"))?;
    let (content, encoding) = decode_text(&bytes);
    Ok(file_payload(&file_path, content, encoding))
}

fn write_sync(path: String, content: String, encoding: Option<String>) -> Result<FilePayload, String> {
    let file_path = PathBuf::from(&path);
    let parent = file_path
        .parent()
        .ok_or_else(|| "无效的文件路径".to_string())?;
    fs::create_dir_all(parent).map_err(|error| format!("创建目录失败：{error}"))?;

    let encoding = encoding.unwrap_or_else(|| "utf-8".to_string());
    let bytes = encode_text(&content, &encoding)?;
    let mut temp = tempfile::NamedTempFile::new_in(parent)
        .map_err(|error| format!("创建临时文件失败：{error}"))?;

    if let Ok(metadata) = fs::metadata(&file_path) {
        let _ = fs::set_permissions(temp.path(), metadata.permissions());
    }

    temp.write_all(&bytes)
        .map_err(|error| format!("写入临时文件失败：{error}"))?;
    temp.flush()
        .map_err(|error| format!("刷新临时文件失败：{error}"))?;
    let _ = temp.as_file().sync_all();

    if let Err(error) = temp.persist(&file_path) {
        if file_path.exists() {
            let _ = fs::remove_file(&file_path);
        }
        error
            .file
            .persist(&file_path)
            .map_err(|persist_error| format!("替换文件失败：{}", persist_error.error))?;
    }

    Ok(file_payload(&file_path, content, encoding))
}

#[tauri::command]
pub async fn read_text_file(path: String) -> Result<FilePayload, String> {
    tauri::async_runtime::spawn_blocking(move || read_sync(path))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn write_text_file(
    path: String,
    content: String,
    encoding: Option<String>,
) -> Result<FilePayload, String> {
    tauri::async_runtime::spawn_blocking(move || write_sync(path, content, encoding))
        .await
        .map_err(|error| error.to_string())?
}

fn hidden_name(name: &str) -> bool {
    let lower = name.to_lowercase();
    name.starts_with('.')
        || lower == "node_modules"
        || lower == "thumbs.db"
        || lower == "desktop.ini"
}

fn markdown_file(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| MARKDOWN_EXTS.iter().any(|candidate| ext.eq_ignore_ascii_case(candidate)))
        .unwrap_or(false)
}

fn collect_tree(dir: &Path, depth: usize, count: &mut usize) -> Vec<TreeNode> {
    if depth > 10 || *count > 6000 {
        return Vec::new();
    }

    let mut directories = Vec::new();
    let mut files = Vec::new();
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if hidden_name(&name) {
            continue;
        }
        let path = entry.path();
        if path.is_dir() {
            *count += 1;
            let children = collect_tree(&path, depth + 1, count);
            directories.push(TreeNode {
                name,
                path: path.to_string_lossy().into_owned(),
                is_dir: true,
                children: Some(children),
            });
        } else if markdown_file(&path) {
            *count += 1;
            files.push(TreeNode {
                name,
                path: path.to_string_lossy().into_owned(),
                is_dir: false,
                children: None,
            });
        }
    }

    directories.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    directories.extend(files);
    directories
}

#[tauri::command]
pub async fn list_dir_tree(root: String) -> Result<Vec<TreeNode>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = PathBuf::from(&root);
        if !path.is_dir() {
            return Err("工作区目录不存在".to_string());
        }
        let mut count = 0usize;
        Ok(collect_tree(&path, 0, &mut count))
    })
    .await
    .map_err(|error| error.to_string())?
}

fn event_kind(kind: &EventKind) -> Option<&'static str> {
    match kind {
        EventKind::Create(_) => Some("create"),
        EventKind::Remove(_) => Some("remove"),
        EventKind::Modify(ModifyKind::Name(_)) => Some("rename"),
        EventKind::Modify(_) => Some("modify"),
        _ => None,
    }
}

#[tauri::command]
pub fn watch_paths(
    app: AppHandle,
    state: State<'_, WatcherState>,
    paths: Vec<String>,
) -> Result<(), String> {
    let mut guard = state
        .watcher
        .lock()
        .map_err(|_| "文件监视器状态异常".to_string())?;
    *guard = None;

    if paths.is_empty() {
        return Ok(());
    }

    let app_handle = app.clone();
    let mut watcher = RecommendedWatcher::new(
        move |result: notify::Result<Event>| {
            let Ok(event) = result else {
                return;
            };
            let Some(kind) = event_kind(&event.kind) else {
                return;
            };
            for path in event.paths {
                let _ = app_handle.emit(
                    "fs://changed",
                    FsChangeEvent {
                        path: path.to_string_lossy().into_owned(),
                        kind,
                    },
                );
            }
        },
        Config::default(),
    )
    .map_err(|error| format!("创建文件监视器失败：{error}"))?;

    for raw in paths {
        let path = PathBuf::from(raw);
        if !path.exists() {
            continue;
        }
        if path.is_dir() {
            let _ = watcher.watch(&path, RecursiveMode::Recursive);
        } else if let Some(parent) = path.parent() {
            let _ = watcher.watch(parent, RecursiveMode::NonRecursive);
        }
    }

    *guard = Some(watcher);
    Ok(())
}

#[tauri::command]
pub fn unwatch_all(state: State<'_, WatcherState>) -> Result<(), String> {
    let mut guard = state
        .watcher
        .lock()
        .map_err(|_| "文件监视器状态异常".to_string())?;
    *guard = None;
    Ok(())
}

fn image_extension(file_name: &str) -> String {
    let extension = Path::new(file_name)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("png")
        .to_lowercase();
    if IMAGE_EXTS.contains(&extension.as_str()) {
        extension
    } else {
        "png".to_string()
    }
}

#[tauri::command]
pub async fn save_image_asset(
    doc_path: Option<String>,
    file_name: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    let doc_path = doc_path.ok_or_else(|| "请先保存文档，再插入图片".to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        let document = PathBuf::from(&doc_path);
        let parent = document
            .parent()
            .ok_or_else(|| "文档路径无效".to_string())?;
        let assets = parent.join("assets");
        fs::create_dir_all(&assets).map_err(|error| format!("创建 assets 目录失败：{error}"))?;

        let extension = image_extension(&file_name);
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis())
            .unwrap_or(0);
        let name = format!("image-{stamp}.{extension}");
        fs::write(assets.join(&name), bytes).map_err(|error| format!("保存图片失败：{error}"))?;
        Ok(format!("assets/{name}"))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn rename_path(old_path: String, new_path: String) -> Result<(), String> {
    let source = PathBuf::from(&old_path);
    let target = PathBuf::from(&new_path);
    if !source.exists() {
        return Err("原文件不存在".into());
    }
    if target.exists() {
        return Err("目标文件已存在".into());
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("创建目录失败：{error}"))?;
    }
    fs::rename(&source, &target).map_err(|error| format!("重命名失败：{error}"))
}

#[tauri::command]
pub fn open_external(url: String) -> Result<(), String> {
    if !(url.starts_with("http://") || url.starts_with("https://") || url.starts_with("mailto:")) {
        return Err("不支持的外部链接".to_string());
    }
    open::that(&url).map_err(|error| format!("打开链接失败：{error}"))
}

#[tauri::command]
pub fn initial_file() -> Option<String> {
    for argument in std::env::args().skip(1) {
        if argument.starts_with('-') {
            continue;
        }
        let path = PathBuf::from(argument);
        if path.is_file() {
            return Some(path.to_string_lossy().into_owned());
        }
    }
    None
}
