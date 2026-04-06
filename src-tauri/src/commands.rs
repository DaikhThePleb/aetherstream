use base64::{engine::general_purpose, Engine as _};
use aes::Aes256;
use cbc::cipher::{block_padding::Pkcs7, BlockDecryptMut, BlockEncryptMut, KeyIvInit};
use cbc::{Decryptor, Encryptor};
use rand::RngCore;
use reqwest::Client;
use rodio::cpal::traits::{DeviceTrait, HostTrait};
use rodio::{Decoder, OutputStream, OutputStreamHandle, Sink};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::env;
use std::fs;
use std::io::Cursor;
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{mpsc, Arc, Mutex, OnceLock};
use std::sync::mpsc::{Receiver, RecvTimeoutError, Sender};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, FilePath};
use tiny_http::{Header, Request, Response, Server, StatusCode};
use url::{form_urlencoded, Url};

const TWITCH_VALIDATE_URL: &str = "https://id.twitch.tv/oauth2/validate";
const TWITCH_AUTH_URL: &str = "https://id.twitch.tv/oauth2/authorize";
const TWITCH_OAUTH_PORT: u16 = 1420;
const OBS_OVERLAY_HTML: &str = include_str!("../../obs-overlay.html");
const TWITCH_SCOPES: [&str; 6] = [
    "chat:read",
    "chat:edit",
    "channel:moderate",
    "whispers:read",
    "channel:read:redemptions",
    "channel:manage:redemptions",
];

fn env_or_compile_time(key: &str, compile: Option<&'static str>) -> Option<String> {
    env::var(key)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .or_else(|| {
            compile
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
        })
}

fn read_key_from_env_file(path: &Path, key: &str) -> Option<String> {
    let content = fs::read_to_string(path).ok()?;

    for raw_line in content.lines() {
        let mut line = raw_line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        if let Some(stripped) = line.strip_prefix("export ") {
            line = stripped.trim_start();
        }

        let mut parts = line.splitn(2, '=');
        let current_key = parts.next()?.trim();
        let raw_value = parts.next().unwrap_or_default().trim();

        if current_key != key {
            continue;
        }

        let mut value = if raw_value.starts_with('"') || raw_value.starts_with('\'') {
            raw_value.to_string()
        } else {
            raw_value
                .splitn(2, '#')
                .next()
                .unwrap_or_default()
                .trim()
                .to_string()
        };

        if value.len() >= 2 {
            let first = value.chars().next().unwrap_or_default();
            let last = value.chars().last().unwrap_or_default();
            if (first == '"' && last == '"') || (first == '\'' && last == '\'') {
                value = value[1..value.len() - 1].to_string();
            }
        }

        let value = value.trim().to_string();
        if !value.is_empty() {
            return Some(value);
        }
    }

    None
}

fn push_env_file_candidates_from_dir(paths: &mut Vec<PathBuf>, dir: &Path) {
    let mut current = Some(dir);

    // Walk up a few levels so tauri-dev and packaged runs can still find repo-level env files.
    for _ in 0..8 {
        let Some(folder) = current else {
            break;
        };

        paths.push(folder.join(".env.local"));
        paths.push(folder.join(".env"));
        current = folder.parent();
    }
}

fn env_file_candidates() -> Vec<PathBuf> {
    let mut paths = Vec::new();

    if let Ok(cwd) = env::current_dir() {
        push_env_file_candidates_from_dir(&mut paths, &cwd);
    }

    if let Ok(exe_path) = env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            push_env_file_candidates_from_dir(&mut paths, exe_dir);
        }
    }

    if let Ok(app_data) = env::var("APPDATA") {
        let app_data_path = PathBuf::from(app_data);
        for app_name in ["aetherstream", "AetherStream"] {
            paths.push(app_data_path.join(app_name).join(".env.local"));
            paths.push(app_data_path.join(app_name).join(".env"));
        }
    }

    paths
}

fn env_file_value(key: &str) -> Option<String> {
    let mut seen = HashSet::new();

    for path in env_file_candidates() {
        let fingerprint = path.to_string_lossy().to_string();
        if !seen.insert(fingerprint) {
            continue;
        }

        if let Some(value) = read_key_from_env_file(&path, key) {
            return Some(value);
        }
    }

    None
}

fn github_auth_token() -> Option<String> {
    env_or_compile_time("AETHER_GITHUB_TOKEN", option_env!("AETHER_GITHUB_TOKEN"))
        .or_else(|| env_or_compile_time("VITE_GITHUB_TOKEN", option_env!("VITE_GITHUB_TOKEN")))
        .or_else(|| env_file_value("AETHER_GITHUB_TOKEN"))
        .or_else(|| env_file_value("VITE_GITHUB_TOKEN"))
}

fn resolve_request_github_token(request_token: Option<String>) -> Option<String> {
    request_token
        .map(|token| token.trim().to_string())
        .filter(|token| !token.is_empty())
        .or_else(github_auth_token)
}

fn key_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("encryption.key"))
}

fn read_persisted_encryption_key(app: &AppHandle) -> Result<Option<String>, String> {
    let path = key_file_path(app)?;
    if !path.exists() {
        return Ok(None);
    }

    let value = fs::read_to_string(path)
        .map_err(|e| format!("read encryption key error: {e}"))?
        .trim()
        .to_string();

    if value.is_empty() {
        Ok(None)
    } else {
        Ok(Some(value))
    }
}

fn persist_encryption_key(app: &AppHandle, key: &str) -> Result<(), String> {
    let path = key_file_path(app)?;
    fs::write(path, key).map_err(|e| format!("write encryption key error: {e}"))
}

fn generate_encryption_key() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

fn get_encryption_key(app: &AppHandle) -> Result<String, String> {
    if let Some(env_key) = env_or_compile_time("AETHER_ENCRYPTION_KEY", option_env!("AETHER_ENCRYPTION_KEY")) {
        let _ = persist_encryption_key(app, &env_key);
        return Ok(env_key);
    }

    if let Some(saved_key) = read_persisted_encryption_key(app)? {
        return Ok(saved_key);
    }

    let generated_key = generate_encryption_key();
    persist_encryption_key(app, &generated_key)?;
    Ok(generated_key)
}

fn dialog_path_to_pathbuf(file_path: FilePath) -> Result<PathBuf, String> {
    match file_path {
        FilePath::Path(path) => Ok(path),
        FilePath::Url(url) => url
            .to_file_path()
            .map_err(|_| "dialog_path_invalid".to_string()),
    }
}

#[derive(Deserialize)]
struct TwitchValidateResponse {
    client_id: String,
    login: String,
    user_id: String,
}

struct TwitchAuthData {
    client_id: String,
    username: String,
    user_id: String,
    clean_token: String,
}

#[derive(Clone)]
struct OverlayEvent {
    id: u64,
    event_type: String,
    payload: Value,
}

struct OverlayRuntimeState {
    enabled: bool,
    scale: u32,
    config: Value,
    events: Vec<OverlayEvent>,
    next_event_id: u64,
    token: String,
}

impl Default for OverlayRuntimeState {
    fn default() -> Self {
        Self {
            enabled: false,
            scale: 100,
            config: json!({}),
            events: Vec::new(),
            next_event_id: 0,
            token: String::new(),
        }
    }
}

impl OverlayRuntimeState {
    fn new(token: String) -> Self {
        Self {
            token,
            ..Self::default()
        }
    }
}

struct OverlayServerHandle {
    port: u16,
    state: Arc<Mutex<OverlayRuntimeState>>,
}

static OVERLAY_SERVER: OnceLock<OverlayServerHandle> = OnceLock::new();

struct NativeTtsPlayer {
    stream: Option<OutputStream>,
    handle: Option<OutputStreamHandle>,
    sink: Option<Sink>,
    device_name: String,
}

impl Default for NativeTtsPlayer {
    fn default() -> Self {
        Self {
            stream: None,
            handle: None,
            sink: None,
            device_name: "default".to_string(),
        }
    }
}

enum AudioCommand {
    Play {
        bytes: Vec<u8>,
        volume: f32,
        device_name: String,
        done: Sender<Result<(), String>>,
    },
    Pause,
    Resume,
    Stop,
    Clear,
}

struct NativeTtsController {
    sender: Sender<AudioCommand>,
}

static TTS_PLAYER: OnceLock<NativeTtsController> = OnceLock::new();

fn default_config() -> Value {
    json!({
        "azure_key": "",
        "azure_region": "westeurope",
        "voice_name": "en-US-JennyNeural",
        "language_filter": "en-US",
        "volume": 50,
        "audio_device": "default",
        "read_emotes": false,
        "twitch_username": "",
        "twitch_user_id": "",
        "twitch_oauth": "",
        "language_filter": "en-US",
        "blacklist": [],
        "word_blacklist": [],
        "user_voices": {},
        "reward_rules": {},
        "reward_rules_by_user": {},
        "presets": [],
        "active_preset_id": "",
        "hotkeys": {
            "toggle_pause": "Ctrl+Shift+P",
            "skip": "Ctrl+Shift+S",
            "clear": "Ctrl+Shift+C",
            "test_tts": "Ctrl+Shift+T"
        },
        "onboarding_complete": false,
        "app_lang": "en",
        "theme": "default",
        "accent_primary": "#00f2ff",
        "accent_secondary": "#a800ff",
        "performance_mode": true,
        "global_style": "general",
        "global_speed": "1.0",
        "global_pitch": "1.0",
        "permissionLevel": "everyone",
        "nameStyle": "always",
        "filter_links": false,
        "trim_repetition": false,
        "max_repetition": 4,
        "obs_server_enabled": false,
        "overlay_token": "",
        "overlay_show_chat": false,
        "overlay_show_status": true,
        "overlay_show_tts_status": true,
        "overlay_show_twitch_status": true,
        "overlay_resolution": "1080p",
        "overlay_layout": {
            "chat": { "x": 6, "y": 70, "scale": 1.0 },
            "status_tts": { "x": 80, "y": 6, "scale": 1.0 },
            "status_twitch": { "x": 80, "y": 12, "scale": 1.0 }
        },
        "overlay_scale": 100,
        "vts_enabled": false,
        "vts_port": 8001,
        "vts_auth_token": ""
    })
}

fn merge_json(target: &mut Value, source: &Value) {
    match (target, source) {
        (Value::Object(target_map), Value::Object(source_map)) => {
            for (key, source_value) in source_map {
                if let Some(target_value) = target_map.get_mut(key) {
                    merge_json(target_value, source_value);
                } else {
                    target_map.insert(key.clone(), source_value.clone());
                }
            }
        }
        (target_slot, source_slot) => {
            *target_slot = source_slot.clone();
        }
    }
}

fn derive_key(app: &AppHandle) -> Result<[u8; 32], String> {
    let key_text = get_encryption_key(app)?;
    let mut bytes = key_text.as_bytes().to_vec();
    while bytes.len() < 32 {
        bytes.push(b' ');
    }
    bytes.truncate(32);

    let mut key = [0u8; 32];
    key.copy_from_slice(&bytes);
    Ok(key)
}

fn encrypt_config(plain: &str, app: &AppHandle) -> Result<String, String> {
    let key = derive_key(app)?;
    let mut iv = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut iv);

    let mut buffer = plain.as_bytes().to_vec();
    let msg_len = buffer.len();
    buffer.resize(msg_len + 16, 0u8);

    let encrypted_slice = Encryptor::<Aes256>::new_from_slices(&key, &iv)
        .map_err(|e| format!("cipher init error: {e}"))?
        .encrypt_padded_mut::<Pkcs7>(&mut buffer, msg_len)
        .map_err(|e| format!("encryption error: {e}"))?;

    Ok(format!("{}:{}", hex::encode(iv), hex::encode(encrypted_slice)))
}

fn decrypt_config(cipher_text: &str, app: &AppHandle) -> Option<String> {
    let mut parts = cipher_text.split(':');
    let iv_hex = parts.next()?;
    let encrypted_hex = parts.next()?;

    if parts.next().is_some() {
        return None;
    }

    let iv = hex::decode(iv_hex).ok()?;
    if iv.len() != 16 {
        return None;
    }

    let mut encrypted = hex::decode(encrypted_hex).ok()?;
    let key = match derive_key(app) {
        Ok(key) => key,
        Err(error) => {
            eprintln!("decrypt_config: {error}");
            return None;
        }
    };

    let decrypted_slice = Decryptor::<Aes256>::new_from_slices(&key, &iv)
        .ok()?
        .decrypt_padded_mut::<Pkcs7>(&mut encrypted)
        .ok()?;

    String::from_utf8(decrypted_slice.to_vec()).ok()
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data dir error: {e}"))?;

    fs::create_dir_all(&dir).map_err(|e| format!("create app data dir error: {e}"))?;
    Ok(dir)
}

fn updater_download_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base_dir = app
        .path()
        .download_dir()
        .or_else(|_| app.path().temp_dir())
        .map_err(|error| format!("update dir resolve error: {error}"))?;

    let dir = base_dir.join("AetherStreamUpdater");
    fs::create_dir_all(&dir).map_err(|error| format!("update dir create error: {error}"))?;
    Ok(dir)
}

fn sanitize_installer_file_name(raw: &str) -> String {
    let sanitized: String = raw
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric() || *ch == '.' || *ch == '-' || *ch == '_')
        .collect();

    sanitized.trim().to_string()
}

fn is_supported_installer_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.ends_with(".exe") || lower.ends_with(".msi")
}

fn is_allowed_installer_host(parsed: &Url) -> bool {
    let Some(host) = parsed.host_str() else {
        return false;
    };

    matches!(
        host.to_ascii_lowercase().as_str(),
        "api.github.com"
            | "github.com"
            | "objects.githubusercontent.com"
            | "github-releases.githubusercontent.com"
            | "release-assets.githubusercontent.com"
    )
}

fn pick_installer_asset_from_release(assets: &[Value]) -> Option<(String, String)> {
    let mut installer_assets: Vec<(String, String)> = assets
        .iter()
        .filter_map(|asset| {
            let name = asset
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .trim()
                .to_string();

            if name.is_empty() {
                return None;
            }

            let lower_name = name.to_ascii_lowercase();
            if !is_supported_installer_name(&name)
                || lower_name.ends_with(".sig")
                || lower_name.ends_with(".sha256")
                || lower_name.ends_with(".blockmap")
            {
                return None;
            }

            let api_url = asset
                .get("url")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .trim()
                .to_string();
            let browser_url = asset
                .get("browser_download_url")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .trim()
                .to_string();
            let selected_url = if !api_url.is_empty() { api_url } else { browser_url };

            if selected_url.is_empty() {
                return None;
            }

            Some((name, selected_url))
        })
        .collect();

    if installer_assets.is_empty() {
        return None;
    }

    installer_assets.sort_by(|left, right| {
        let left_exe = left.0.to_ascii_lowercase().ends_with(".exe");
        let right_exe = right.0.to_ascii_lowercase().ends_with(".exe");
        right_exe.cmp(&left_exe)
    });

    installer_assets.into_iter().next()
}

fn config_candidates(app: &AppHandle) -> Result<Vec<PathBuf>, String> {
    let dir = app_data_dir(app)?;
    Ok(vec![
        dir.join("config.dat"),
        dir.join("config.json"),
        dir.join("config"),
    ])
}

fn legacy_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(app_data) = env::var("APPDATA") {
        let app_data_path = PathBuf::from(app_data);
        for app_name in ["aetherstream", "AetherStream"] {
            for file_name in ["config.dat", "config.json", "config"] {
                candidates.push(app_data_path.join(app_name).join(file_name));
            }
        }
    }

    candidates
}

fn read_file_if_exists(path: &Path) -> Option<String> {
    if !path.exists() {
        return None;
    }

    fs::read_to_string(path).ok()
}

fn parse_config_content(content: &str, app: &AppHandle) -> Option<Value> {
    if let Some(decrypted) = decrypt_config(content, app) {
        return serde_json::from_str::<Value>(&decrypted).ok();
    }

    serde_json::from_str::<Value>(content).ok()
}

fn save_config_file(app: &AppHandle, config: &Value) -> Result<(), String> {
    let config_path = app_data_dir(app)?.join("config.dat");
    let plain = serde_json::to_string(config).map_err(|e| format!("serialize config error: {e}"))?;
    let encrypted = encrypt_config(&plain, app)?;

    fs::write(config_path, encrypted).map_err(|e| format!("write config error: {e}"))
}

fn load_raw_config(app: &AppHandle) -> Result<Option<Value>, String> {
    for candidate in config_candidates(app)? {
        if let Some(content) = read_file_if_exists(&candidate) {
            if let Some(parsed) = parse_config_content(&content, app) {
                return Ok(Some(parsed));
            }
        }
    }

    for candidate in legacy_candidates() {
        if let Some(content) = read_file_if_exists(&candidate) {
            if let Some(parsed) = parse_config_content(&content, app) {
                let _ = save_config_file(app, &parsed);
                return Ok(Some(parsed));
            }
        }
    }

    Ok(None)
}

fn ensure_overlay_token(config: &mut Value) -> (String, bool) {
    let existing = string_field(config, "overlay_token", "");
    if !existing.trim().is_empty() {
        return (existing, false);
    }

    let token = generate_oauth_state();
    config["overlay_token"] = Value::String(token.clone());
    (token, true)
}

fn resolve_overlay_token(app: &AppHandle) -> String {
    load_config(app)
        .ok()
        .map(|config| string_field(&config, "overlay_token", ""))
        .unwrap_or_default()
}

fn load_config(app: &AppHandle) -> Result<Value, String> {
    let mut config = default_config();

    if let Some(saved) = load_raw_config(app)? {
        merge_json(&mut config, &saved);
    }

    let (_token, created) = ensure_overlay_token(&mut config);
    if created {
        if let Err(error) = save_config_file(app, &config) {
            eprintln!("overlay token save failed: {error}");
        }
    }

    Ok(config)
}

pub(crate) struct StartupWindowState {
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub maximized: bool,
}

fn parse_window_dimension(config: &Value, key: &str) -> Option<u32> {
    config
        .get(key)
        .and_then(Value::as_u64)
        .and_then(|value| u32::try_from(value).ok())
}

pub(crate) fn load_startup_window_state(app: &AppHandle) -> StartupWindowState {
    let config = load_config(app).unwrap_or_else(|_| default_config());
    let state_initialized = config
        .get("window_state_initialized")
        .and_then(Value::as_bool)
        .unwrap_or(false);

    if !state_initialized {
        return StartupWindowState {
            width: None,
            height: None,
            maximized: false,
        };
    }

    StartupWindowState {
        width: parse_window_dimension(&config, "window_width"),
        height: parse_window_dimension(&config, "window_height"),
        maximized: config
            .get("window_maximized")
            .and_then(Value::as_bool)
            .unwrap_or(false),
    }
}

pub(crate) fn persist_main_window_state(app: &AppHandle) -> Result<(), String> {
    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };

    let maximized = window
        .is_maximized()
        .map_err(|error| format!("window_is_maximized_error: {error}"))?;
    let inner_size = window
        .inner_size()
        .map_err(|error| format!("window_inner_size_error: {error}"))?;

    let mut config = load_config(app).unwrap_or_else(|_| default_config());
    config["window_maximized"] = Value::Bool(maximized);
    config["window_state_initialized"] = Value::Bool(true);

    if !maximized {
        config["window_width"] = Value::from(inner_size.width);
        config["window_height"] = Value::from(inner_size.height);
    } else {
        if config.get("window_width").and_then(Value::as_u64).is_none() {
            config["window_width"] = Value::from(inner_size.width);
        }
        if config.get("window_height").and_then(Value::as_u64).is_none() {
            config["window_height"] = Value::from(inner_size.height);
        }
    }

    save_config_file(app, &config)
}

fn string_field(value: &Value, key: &str, default: &str) -> String {
    value
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or(default)
        .to_string()
}

fn u64_field(value: &Value, key: &str, default: u64) -> u64 {
    value.get(key).and_then(Value::as_u64).unwrap_or(default)
}

fn get_tts_player() -> &'static NativeTtsController {
    TTS_PLAYER.get_or_init(start_tts_worker)
}

fn start_tts_worker() -> NativeTtsController {
    let (sender, receiver) = mpsc::channel();

    thread::Builder::new()
        .name("native-tts-player".to_string())
        .spawn(move || run_tts_worker(receiver))
        .expect("failed to spawn native tts worker");

    NativeTtsController { sender }
}

fn run_tts_worker(receiver: Receiver<AudioCommand>) {
    let mut player = NativeTtsPlayer::default();
    let mut pending_play: Option<AudioCommand> = None;

    loop {
        let command = match pending_play.take() {
            Some(command) => command,
            None => match receiver.recv() {
                Ok(command) => command,
                Err(_) => break,
            },
        };

        match command {
            AudioCommand::Play {
                bytes,
                volume,
                device_name,
                done,
            } => {
                let result = play_bytes_with_commands(
                    &mut player,
                    bytes,
                    volume,
                    &device_name,
                    &receiver,
                    &mut pending_play,
                );
                let _ = done.send(result);
            }
            AudioCommand::Pause => {
                if let Some(sink) = player.sink.as_ref() {
                    sink.pause();
                }
            }
            AudioCommand::Resume => {
                if let Some(sink) = player.sink.as_ref() {
                    sink.play();
                }
            }
            AudioCommand::Stop | AudioCommand::Clear => {
                if let Some(sink) = player.sink.take() {
                    sink.stop();
                }
            }
        }
    }
}

fn normalize_device_name(device_name: &str) -> String {
    let trimmed = device_name.trim();
    if trimmed.is_empty() {
        "default".to_string()
    } else {
        trimmed.to_string()
    }
}

#[tauri::command]
pub fn list_audio_output_devices() -> Vec<String> {
        let host = rodio::cpal::default_host();
        let mut seen = HashSet::new();
        let mut devices = Vec::new();

        if let Ok(outputs) = host.output_devices() {
                for device in outputs {
                        if let Ok(name) = device.name() {
                                let trimmed = name.trim();
                                if trimmed.is_empty() {
                                        continue;
                                }
                                if seen.insert(trimmed.to_string()) {
                                        devices.push(trimmed.to_string());
                                }
                        }
                }
        }

        devices
}

fn resolve_output_device(device_name: &str) -> Option<rodio::cpal::Device> {
    let host = rodio::cpal::default_host();
    let normalized = device_name.trim().to_lowercase();

    if normalized.is_empty() || normalized == "default" {
        return host.default_output_device();
    }

    let mut contains_match = None;

    if let Ok(devices) = host.output_devices() {
        for device in devices {
            if let Ok(name) = device.name() {
                let name_lower = name.to_lowercase();
                if name_lower == normalized {
                    return Some(device);
                }
                if contains_match.is_none() && name_lower.contains(&normalized) {
                    contains_match = Some(device);
                }
            }
        }
    }

    contains_match.or_else(|| host.default_output_device())
}

fn ensure_output_stream(player: &mut NativeTtsPlayer, device_name: &str) -> Result<(), String> {
    let normalized = normalize_device_name(device_name);
    if player.stream.is_some() && player.device_name == normalized {
        return Ok(());
    }

    let device = resolve_output_device(&normalized).ok_or_else(|| "audio_output_not_found".to_string())?;
    let (stream, handle) = OutputStream::try_from_device(&device)
        .map_err(|e| format!("audio_output_init_failed: {e}"))?;

    player.stream = Some(stream);
    player.handle = Some(handle);
    player.sink = None;
    player.device_name = normalized;
    Ok(())
}

fn play_bytes_with_commands(
    player: &mut NativeTtsPlayer,
    bytes: Vec<u8>,
    volume: f32,
    device_name: &str,
    receiver: &Receiver<AudioCommand>,
    pending_play: &mut Option<AudioCommand>,
) -> Result<(), String> {
    ensure_output_stream(player, device_name)?;

    if let Some(existing) = player.sink.take() {
        existing.stop();
    }

    let handle = player
        .handle
        .as_ref()
        .ok_or_else(|| "audio_output_missing".to_string())?;

    let sink = Sink::try_new(handle).map_err(|e| format!("audio_sink_failed: {e}"))?;
    let cursor = Cursor::new(bytes);
    let decoder = Decoder::new(cursor).map_err(|e| format!("audio_decode_failed: {e}"))?;

    sink.set_volume(volume.max(0.0).min(1.0));
    sink.append(decoder);
    sink.play();

    player.sink = Some(sink);

    loop {
        let should_break = player
            .sink
            .as_ref()
            .map(|sink| sink.empty())
            .unwrap_or(true);

        if should_break {
            break;
        }

        match receiver.recv_timeout(Duration::from_millis(20)) {
            Ok(AudioCommand::Pause) => {
                if let Some(sink) = player.sink.as_ref() {
                    sink.pause();
                }
            }
            Ok(AudioCommand::Resume) => {
                if let Some(sink) = player.sink.as_ref() {
                    sink.play();
                }
            }
            Ok(AudioCommand::Stop) | Ok(AudioCommand::Clear) => {
                if let Some(sink) = player.sink.take() {
                    sink.stop();
                }
                break;
            }
            Ok(next_play @ AudioCommand::Play { .. }) => {
                if let Some(sink) = player.sink.take() {
                    sink.stop();
                }
                *pending_play = Some(next_play);
                break;
            }
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => {
                return Err("tts_player_disconnected".to_string());
            }
        }
    }

    Ok(())
}

fn parse_volume_value(raw: Option<&Value>, fallback: u64) -> f32 {
    let mut value = raw
        .and_then(|entry| entry.as_f64().or_else(|| entry.as_str().and_then(|val| val.parse::<f64>().ok())))
        .unwrap_or(fallback as f64);

    if !value.is_finite() {
        value = fallback as f64;
    }

    let clamped = value.max(0.0).min(100.0);
    (clamped / 100.0) as f32
}

fn play_audio_bytes(bytes: Vec<u8>, volume: f32, device_name: &str) -> Result<(), String> {
    let controller = get_tts_player();
    let (done_sender, done_receiver) = mpsc::channel();

    controller
        .sender
        .send(AudioCommand::Play {
            bytes,
            volume,
            device_name: device_name.to_string(),
            done: done_sender,
        })
        .map_err(|_| "tts_player_send_failed".to_string())?;

    done_receiver
        .recv()
        .unwrap_or_else(|_| Err("tts_player_disconnected".to_string()))
}

fn clean_oauth_token(token: &str) -> String {
    token
        .trim()
        .trim_start_matches("oauth:")
        .trim_start_matches("OAuth ")
        .trim_start_matches("Bearer ")
        .to_string()
}

fn escape_ssml_text(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn normalize_prosody_value(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return "+0%".to_string();
    }

    if trimmed.contains('%') || trimmed.contains("st") {
        return trimmed.to_string();
    }

    if trimmed
        .chars()
        .any(|c| c.is_ascii_alphabetic() && c != 'e' && c != 'E')
    {
        return trimmed.to_string();
    }

    if let Ok(value) = trimmed.parse::<f32>() {
        let pct = ((value - 1.0) * 100.0).round() as i32;
        if pct >= 0 {
            format!("+{pct}%")
        } else {
            format!("{pct}%")
        }
    } else {
        "+0%".to_string()
    }
}

fn build_ssml(text: &str, voice: &str, style: &str, rate: &str, pitch: &str) -> String {
    let escaped_text = escape_ssml_text(text);
    let rate_value = normalize_prosody_value(rate);
    let pitch_value = normalize_prosody_value(pitch);
    let lang_code = voice.split('-').take(2).collect::<Vec<_>>().join("-");

    let prosody = format!(
        "<prosody rate=\"{rate_value}\" pitch=\"{pitch_value}\">{escaped_text}</prosody>"
    );

    let body = if style.trim().is_empty() || style.eq_ignore_ascii_case("general") {
        prosody
    } else {
        format!("<mstts:express-as style=\"{style}\">{prosody}</mstts:express-as>")
    };

    format!(
        "<?xml version='1.0' encoding='UTF-8'?>\n<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='http://www.w3.org/2001/mstts' xml:lang='{lang_code}'>\n  <voice name='{voice}'>{body}</voice>\n</speak>"
    )
}

fn truncate_error_text(raw: &str, limit: usize) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return "empty_response".to_string();
    }

    let normalized = trimmed.replace(['\r', '\n'], " ");
    let mut output = normalized.chars().take(limit).collect::<String>();
    if normalized.chars().count() > limit {
        output.push_str("...");
    }
    output
}

async fn request_azure_tts(ssml: &str, azure_key: &str, azure_region: &str) -> Result<Vec<u8>, String> {
    let url = format!(
        "https://{azure_region}.tts.speech.microsoft.com/cognitiveservices/v1"
    );

    let client = http_client()?;
    let response = client
        .post(url)
        .header("Ocp-Apim-Subscription-Key", azure_key)
        .header("Content-Type", "application/ssml+xml")
        .header("X-Microsoft-OutputFormat", "audio-24khz-48kbitrate-mono-mp3")
        .header("User-Agent", "AetherStream")
        .body(ssml.to_string())
        .send()
        .await
        .map_err(|e| format!("tts_request_failed: {e}"))?;

    let status = response.status();
    let body_bytes = response.bytes().await.unwrap_or_default();

    if status.is_success() {
        if body_bytes.is_empty() {
            return Err("tts_audio_decode_failed".to_string());
        }
        return Ok(body_bytes.to_vec());
    }

    let body_text = String::from_utf8_lossy(&body_bytes);
    let details = truncate_error_text(&body_text, 300);
    Err(format!("tts_http_{}: {details}", status.as_u16()))
}

fn generate_oauth_state() -> String {
    let mut bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut bytes);
    hex::encode(bytes)
}

fn respond_html(request: Request, status_code: u16, body: &str) {
    let mut response =
        Response::from_string(body.to_string()).with_status_code(StatusCode(status_code));

    if let Ok(header) = Header::from_bytes(
        &b"Content-Type"[..],
        &b"text/html; charset=utf-8"[..],
    ) {
        response = response.with_header(header);
    }

    let _ = request.respond(response);
}

fn respond_json(request: Request, status_code: u16, payload: Value) {
    let body = serde_json::to_string(&payload)
        .unwrap_or_else(|_| "{\"success\":false,\"error\":\"json_serialize_failed\"}".to_string());

    let mut response = Response::from_string(body).with_status_code(StatusCode(status_code));

    if let Ok(header) = Header::from_bytes(
        &b"Content-Type"[..],
        &b"application/json; charset=utf-8"[..],
    ) {
        response = response.with_header(header);
    }

    let _ = request.respond(response);
}

fn push_overlay_event_locked(state: &mut OverlayRuntimeState, event_type: &str, payload: Value) -> u64 {
    state.next_event_id = state.next_event_id.saturating_add(1);

    state.events.push(OverlayEvent {
        id: state.next_event_id,
        event_type: event_type.to_string(),
        payload,
    });

    const MAX_OVERLAY_EVENTS: usize = 300;
    if state.events.len() > MAX_OVERLAY_EVENTS {
        let overflow = state.events.len() - MAX_OVERLAY_EVENTS;
        state.events.drain(0..overflow);
    }

    state.next_event_id
}

fn overlay_token_matches(query: &str, overlay_state: &OverlayRuntimeState) -> bool {
    let expected = overlay_state.token.trim();
    if expected.is_empty() {
        return true;
    }

    query_param(query, "token")
        .map(|token| token == expected)
        .unwrap_or(false)
}

fn handle_overlay_http_request(request: Request, overlay_state: &Arc<Mutex<OverlayRuntimeState>>) {
    let request_url = request.url().to_string();
    let (path, query) = request_url
        .split_once('?')
        .map_or((request_url.as_str(), ""), |(path, query)| (path, query));

    if path == "/" || path == "/index.html" {
        respond_html(request, 200, OBS_OVERLAY_HTML);
        return;
    }

    if path == "/health" {
        respond_json(request, 200, json!({ "success": true }));
        return;
    }

    if path == "/favicon.ico" {
        let _ = request.respond(Response::empty(StatusCode(204)));
        return;
    }

    if path == "/state" {
        let snapshot = match overlay_state.lock() {
            Ok(snapshot) => snapshot,
            Err(_) => {
                respond_json(request, 500, json!({ "success": false, "error": "overlay_state_lock_failed" }));
                return;
            }
        };

        if !overlay_token_matches(query, &snapshot) {
            respond_json(request, 403, json!({ "success": false, "error": "overlay_token_invalid" }));
            return;
        }

        respond_json(
            request,
            200,
            json!({
                "success": true,
                "enabled": snapshot.enabled,
                "scale": snapshot.scale,
                "config": snapshot.config,
                "latest_event_id": snapshot.next_event_id,
            }),
        );
        return;
    }

    if path == "/events" {
        let since = query_param(query, "since")
            .and_then(|raw| raw.parse::<u64>().ok())
            .unwrap_or(0);

        let snapshot = match overlay_state.lock() {
            Ok(snapshot) => snapshot,
            Err(_) => {
                respond_json(request, 500, json!({ "success": false, "error": "overlay_state_lock_failed" }));
                return;
            }
        };

        if !overlay_token_matches(query, &snapshot) {
            respond_json(request, 403, json!({ "success": false, "error": "overlay_token_invalid" }));
            return;
        }

        let events = snapshot
            .events
            .iter()
            .filter(|event| event.id > since)
            .map(|event| {
                json!({
                    "id": event.id,
                    "type": event.event_type,
                    "payload": event.payload,
                })
            })
            .collect::<Vec<Value>>();

        respond_json(
            request,
            200,
            json!({
                "success": true,
                "events": events,
                "latest_event_id": snapshot.next_event_id,
                "enabled": snapshot.enabled,
                "scale": snapshot.scale,
            }),
        );
        return;
    }

    respond_json(request, 404, json!({ "success": false, "error": "overlay_route_not_found" }));
}

fn ensure_overlay_server_runtime(port: u16, token: String) -> Result<&'static OverlayServerHandle, String> {
    if let Some(handle) = OVERLAY_SERVER.get() {
        if !token.trim().is_empty() {
            if let Ok(mut state) = handle.state.lock() {
                state.token = token;
            }
        }
        return Ok(handle);
    }

    let state = Arc::new(Mutex::new(OverlayRuntimeState::new(token)));
    let state_for_thread = Arc::clone(&state);
    let server = Server::http(("127.0.0.1", port))
        .map_err(|error| format!("overlay_server_start_failed: {error}"))?;

    std::thread::spawn(move || {
        for request in server.incoming_requests() {
            handle_overlay_http_request(request, &state_for_thread);
        }
    });

    let _ = OVERLAY_SERVER.set(OverlayServerHandle { port, state });

    OVERLAY_SERVER
        .get()
        .ok_or_else(|| "overlay_server_init_failed".to_string())
}

fn query_param(query: &str, key: &str) -> Option<String> {
    form_urlencoded::parse(query.as_bytes())
        .find(|(k, _)| k == key)
        .map(|(_, v)| v.into_owned())
}

fn build_twitch_auth_url(port: u16, state: &str, client_id: &str) -> Result<String, String> {
    let redirect_uri = format!("http://localhost:{port}");
    let scopes = TWITCH_SCOPES.join(" ");
    let trimmed_client_id = client_id.trim();

    if trimmed_client_id.is_empty() {
        return Err("err_twitch_client_id_missing".to_string());
    }

    let mut url =
        reqwest::Url::parse(TWITCH_AUTH_URL).map_err(|e| format!("OAuth URL error: {e}"))?;

    url.query_pairs_mut()
        .append_pair("client_id", trimmed_client_id)
        .append_pair("redirect_uri", &redirect_uri)
        .append_pair("response_type", "token")
        .append_pair("scope", &scopes)
        .append_pair("state", state)
        .append_pair("force_verify", "true");

    Ok(url.to_string())
}

fn oauth_status_page(title: &str, message: &str, status: &str) -> String {
    let status_label = match status {
        "success" => "Sikeres",
        "pending" => "Folyamatban",
        _ => "Hiba",
    };

    format!(
        r#"<!doctype html>
<html lang="hu">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AetherStream - Twitch</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        :root {{
            --bg-dark: #0f0f0f;
            --bg-panel: #121212;
            --bg-card: #181818;
            --bg-input: #222222;
            --border-color: #282828;
            --accent-primary: #00b4ff;
            --accent-secondary: #8000ff;
            --brand-gradient: linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%);
            --text-main: #e0e0e0;
            --text-muted: #949ba4;
        }}
        * {{ box-sizing: border-box; }}
        body {{
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--bg-dark);
            color: var(--text-main);
            font-family: 'Inter', sans-serif;
        }}
        .page {{
            width: min(560px, 92vw);
            padding: 24px;
        }}
        .card {{
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            padding: 28px;
            box-shadow: 0 18px 48px rgba(0, 0, 0, 0.35);
        }}
        .brand {{
            display: flex;
            align-items: center;
            gap: 12px;
            font-weight: 700;
            letter-spacing: -0.02em;
        }}
        .brand-mark {{
            width: 28px;
            height: 28px;
            border-radius: 10px;
            background: var(--brand-gradient);
            box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
        }}
        .brand-name {{
            font-size: 18px;
        }}
        .brand-name span {{
            background: var(--brand-gradient);
            -webkit-background-clip: text;
            color: transparent;
        }}
        .status-pill {{
            margin-top: 16px;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            font-size: 11px;
            letter-spacing: 0.18em;
            text-transform: uppercase;
            font-weight: 700;
            padding: 6px 12px;
            border-radius: 999px;
            border: 1px solid var(--border-color);
            background: var(--bg-input);
            color: var(--text-muted);
        }}
        .status-pill.success {{ color: #34d399; border-color: rgba(52, 211, 153, 0.45); }}
        .status-pill.error {{ color: #f87171; border-color: rgba(248, 113, 113, 0.45); }}
        .status-pill.pending {{ color: #60a5fa; border-color: rgba(96, 165, 250, 0.45); }}
        h1 {{
            font-size: 22px;
            margin: 16px 0 8px;
            letter-spacing: -0.02em;
        }}
        p {{
            margin: 0;
            color: var(--text-muted);
            line-height: 1.5;
        }}
        .hint {{
            margin-top: 12px;
            font-size: 12px;
            color: var(--text-muted);
        }}
    </style>
</head>
<body>
    <div class="page">
        <div class="card">
            <div class="brand">
                <div class="brand-mark"></div>
                <div class="brand-name">Aether<span>Stream</span></div>
            </div>
            <div class="status-pill {status}">{status_label}</div>
            <h1>{title}</h1>
            <p>{message}</p>
            <p class="hint">Bez&aacute;rhatod ezt az ablakot.</p>
        </div>
    </div>
</body>
</html>"#,
        status = status,
        status_label = status_label,
        title = title,
        message = message
    )
}

fn oauth_callback_page() -> String {
    let title = "Bejelentkez&eacute;s folyamatban...";
    let message = "Egy pillanat, &aacute;tir&aacute;ny&iacute;tunk a tokenhez.";
    format!(
        r#"<!doctype html>
<html lang="hu">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AetherStream - Twitch</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        :root {{
            --bg-dark: #0f0f0f;
            --bg-panel: #121212;
            --bg-card: #181818;
            --bg-input: #222222;
            --border-color: #282828;
            --accent-primary: #00b4ff;
            --accent-secondary: #8000ff;
            --brand-gradient: linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%);
            --text-main: #e0e0e0;
            --text-muted: #949ba4;
        }}
        * {{ box-sizing: border-box; }}
        body {{
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--bg-dark);
            color: var(--text-main);
            font-family: 'Inter', sans-serif;
        }}
        .page {{
            width: min(560px, 92vw);
            padding: 24px;
        }}
        .card {{
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            padding: 28px;
            box-shadow: 0 18px 48px rgba(0, 0, 0, 0.35);
        }}
        .brand {{
            display: flex;
            align-items: center;
            gap: 12px;
            font-weight: 700;
            letter-spacing: -0.02em;
        }}
        .brand-mark {{
            width: 28px;
            height: 28px;
            border-radius: 10px;
            background: var(--brand-gradient);
            box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
        }}
        .brand-name {{
            font-size: 18px;
        }}
        .brand-name span {{
            background: var(--brand-gradient);
            -webkit-background-clip: text;
            color: transparent;
        }}
        .status-pill {{
            margin-top: 16px;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            font-size: 11px;
            letter-spacing: 0.18em;
            text-transform: uppercase;
            font-weight: 700;
            padding: 6px 12px;
            border-radius: 999px;
            border: 1px solid var(--border-color);
            background: var(--bg-input);
            color: var(--text-muted);
        }}
        .status-pill.success {{ color: #34d399; border-color: rgba(52, 211, 153, 0.45); }}
        .status-pill.error {{ color: #f87171; border-color: rgba(248, 113, 113, 0.45); }}
        .status-pill.pending {{ color: #60a5fa; border-color: rgba(96, 165, 250, 0.45); }}
        h1 {{
            font-size: 22px;
            margin: 16px 0 8px;
            letter-spacing: -0.02em;
        }}
        p {{
            margin: 0;
            color: var(--text-muted);
            line-height: 1.5;
        }}
        .hint {{
            margin-top: 12px;
            font-size: 12px;
            color: var(--text-muted);
        }}
    </style>
</head>
<body>
    <div class="page">
        <div class="card">
            <div class="brand">
                <div class="brand-mark"></div>
                <div class="brand-name">Aether<span>Stream</span></div>
            </div>
            <div class="status-pill pending" id="status-pill">Folyamatban</div>
            <h1 id="status-title">{title}</h1>
            <p id="status-message">{message}</p>
            <p class="hint">Bez&aacute;rhatod ezt az ablakot, miut&aacute;n befejez&#337;d&ouml;tt.</p>
        </div>
    </div>
    <script>
        const statusPill = document.getElementById('status-pill');
        const titleEl = document.getElementById('status-title');
        const messageEl = document.getElementById('status-message');

        const setStatus = (state, title, message) => {{
            statusPill.className = 'status-pill ' + state;
            statusPill.textContent = state === 'error' ? 'Hiba' : 'Folyamatban';
            titleEl.innerHTML = title;
            messageEl.innerHTML = message;
        }};

        const hashParams = new URLSearchParams(window.location.hash.slice(1));
        const searchParams = new URLSearchParams(window.location.search.slice(1));

        if (!hashParams.get('access_token') && searchParams.get('access_token')) {{
            hashParams.set('access_token', searchParams.get('access_token'));
        }}
        if (!hashParams.get('state') && searchParams.get('state')) {{
            hashParams.set('state', searchParams.get('state'));
        }}

        if (hashParams.get('access_token')) {{
            window.location.replace('/token?' + hashParams.toString());
        }} else {{
            setStatus('error', 'Sikertelen bejelentkez&eacute;s', 'Nem kaptunk tokent a Twitcht&#337;l. Pr&oacute;b&aacute;ld &uacute;jra az alkalmaz&aacute;sb&oacute;l.');
        }}
    </script>
</body>
</html>"#,
        title = title,
        message = message
    )
}

fn receive_twitch_token(port: u16, expected_state: String, timeout: Duration) -> Result<String, String> {
    let server = Server::http(("127.0.0.1", port))
        .map_err(|e| format!("OAuth callback server failed to start: {e}"))?;

    let started_at = Instant::now();

    while started_at.elapsed() < timeout {
        let remaining = timeout.saturating_sub(started_at.elapsed());
        let wait_time = remaining.min(Duration::from_millis(400));

        let request = match server.recv_timeout(wait_time) {
            Ok(Some(request)) => request,
            Ok(None) => continue,
            Err(error) => return Err(format!("OAuth callback server error: {error}")),
        };

        let request_url = request.url().to_string();
        let (path, query) = request_url
            .split_once('?')
            .map_or((request_url.as_str(), ""), |(path, query)| (path, query));

        if path == "/" || path == "/callback" {
            if !query.is_empty() {
                if let Some(error_code) = query_param(query, "error") {
                    let err_text = query_param(query, "error_description")
                        .unwrap_or_else(|| "Twitch denied authorization.".to_string());
                    let escaped = err_text.replace('<', "&lt;").replace('>', "&gt;");
                    let message = format!("A Twitch visszautas&iacute;totta a bejelentkez&eacute;st. {escaped}");
                    let body = oauth_status_page("Sikertelen bejelentkez&eacute;s", &message, "error");
                    respond_html(request, 400, &body);
                    return Err(format!("twitch_oauth_{error_code}"));
                }

                let returned_state = query_param(query, "state").unwrap_or_default();
                if returned_state != expected_state {
                    let body = oauth_status_page(
                        "Sikertelen bejelentkez&eacute;s",
                        "&Eacute;rv&eacute;nytelen &aacute;llapot &eacute;rkezett. Pr&oacute;b&aacute;ld &uacute;jra az alkalmaz&aacute;sb&oacute;l.",
                        "error",
                    );
                    respond_html(request, 401, &body);
                    return Err("oauth_state_mismatch".to_string());
                }

                let access_token = query_param(query, "access_token").unwrap_or_default();
                if !access_token.is_empty() {
                                        let body = oauth_status_page(
                                                "Sikeres bejelentkez&eacute;s",
                                                "A Twitch bejelentkez&eacute;s siker&uuml;lt. Visszat&eacute;rhetsz az alkalmaz&aacute;shoz.",
                                                "success",
                                        );
                                        respond_html(request, 200, &body);
                    return Ok(format!("oauth:{access_token}"));
                }
            }

                        let callback_page = oauth_callback_page();
                        respond_html(request, 200, &callback_page);
            continue;
        }

        if path == "/token" {
            let token_query = query.to_string();

            if let Some(error_code) = query_param(&token_query, "error") {
                let err_text = query_param(&token_query, "error_description")
                    .unwrap_or_else(|| "Twitch denied authorization.".to_string());
                let escaped = err_text.replace('<', "&lt;").replace('>', "&gt;");
                let message = format!("A Twitch visszautas&iacute;totta a bejelentkez&eacute;st. {escaped}");
                let body = oauth_status_page("Sikertelen bejelentkez&eacute;s", &message, "error");
                respond_html(request, 400, &body);
                return Err(format!("twitch_oauth_{error_code}"));
            }

            let returned_state = query_param(&token_query, "state").unwrap_or_default();
            if returned_state != expected_state {
                let body = oauth_status_page(
                    "Sikertelen bejelentkez&eacute;s",
                    "&Eacute;rv&eacute;nytelen &aacute;llapot &eacute;rkezett. Pr&oacute;b&aacute;ld &uacute;jra az alkalmaz&aacute;sb&oacute;l.",
                    "error",
                );
                respond_html(request, 401, &body);
                return Err("oauth_state_mismatch".to_string());
            }

            let access_token = query_param(&token_query, "access_token").unwrap_or_default();
            if access_token.is_empty() {
                let body = oauth_status_page(
                    "Sikertelen bejelentkez&eacute;s",
                    "Nem &eacute;rkezett token a Twitcht&#245;l. Pr&oacute;b&aacute;ld &uacute;jra az alkalmaz&aacute;sb&oacute;l.",
                    "error",
                );
                respond_html(request, 400, &body);
                return Err("oauth_token_missing".to_string());
            }

            let body = oauth_status_page(
                "Sikeres bejelentkez&eacute;s",
                "A Twitch bejelentkez&eacute;s siker&uuml;lt. Visszat&eacute;rhetsz az alkalmaz&aacute;shoz.",
                "success",
            );
            respond_html(request, 200, &body);
            return Ok(format!("oauth:{access_token}"));
        }

        if path == "/favicon.ico" {
            let response = Response::empty(StatusCode(204));
            let _ = request.respond(response);
            continue;
        }

        respond_html(request, 404, "<h2>Not found</h2>");
    }

    Err("oauth_timeout".to_string())
}

fn http_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("http client build error: {e}"))
}

async fn get_twitch_auth_data(token: &str) -> Result<TwitchAuthData, String> {
    let clean_token = clean_oauth_token(token);
    if clean_token.is_empty() {
        return Err("err_twitch_invalid".to_string());
    }

    let client = http_client()?;
    let response = client
        .get(TWITCH_VALIDATE_URL)
        .header("Authorization", format!("OAuth {clean_token}"))
        .send()
        .await
        .map_err(|_| "err_twitch_invalid".to_string())?;

    if !response.status().is_success() {
        return Err("err_twitch_invalid".to_string());
    }

    let payload = response
        .json::<TwitchValidateResponse>()
        .await
        .map_err(|_| "err_twitch_invalid".to_string())?;

    Ok(TwitchAuthData {
        client_id: payload.client_id,
        username: payload.login,
        user_id: payload.user_id,
        clean_token,
    })
}

async fn validate_azure_key(azure_key: &str, azure_region: &str) -> Result<(), String> {
    if azure_key.trim().is_empty() || azure_region.trim().is_empty() {
        return Err("err_missing_data".to_string());
    }

    let url = format!(
        "https://{azure_region}.tts.speech.microsoft.com/cognitiveservices/v1"
    );

    let ssml = "<speak version='1.0' xml:lang='en-US'><voice name='en-US-JennyNeural'>Test</voice></speak>";

    let client = http_client()?;
    let response = client
        .post(url)
        .header("Ocp-Apim-Subscription-Key", azure_key)
        .header("Content-Type", "application/ssml+xml")
        .header("X-Microsoft-OutputFormat", "raw-16khz-16bit-mono-pcm")
        .header("User-Agent", "AetherStream")
        .body(ssml)
        .send()
        .await
        .map_err(|_| "err_azure_invalid".to_string())?;

    if response.status().is_success() {
        Ok(())
    } else {
        Err("err_azure_invalid".to_string())
    }
}

#[tauri::command]
pub async fn ensure_overlay_server(app: AppHandle) -> Value {
    let token = resolve_overlay_token(&app);
    match ensure_overlay_server_runtime(8080, token.clone()) {
        Ok(handle) => {
            let state = handle
                .state
                .lock()
                .map_err(|_| "overlay_state_lock_failed".to_string());

            match state {
                Ok(snapshot) => json!({
                    "success": true,
                    "port": handle.port,
                    "enabled": snapshot.enabled,
                    "scale": snapshot.scale,
                    "token": token,
                }),
                Err(error) => json!({ "success": false, "error": error }),
            }
        }
        Err(error) => json!({ "success": false, "error": error }),
    }
}

#[tauri::command]
pub async fn overlay_set_enabled(app: AppHandle, enabled: bool) -> Value {
    let token = resolve_overlay_token(&app);
    let handle = match ensure_overlay_server_runtime(8080, token) {
        Ok(handle) => handle,
        Err(error) => return json!({ "success": false, "error": error }),
    };

    let mut state = match handle.state.lock() {
        Ok(state) => state,
        Err(_) => return json!({ "success": false, "error": "overlay_state_lock_failed" }),
    };

    state.enabled = enabled;

    if !state.enabled {
        state.events.clear();
    }

    json!({
        "success": true,
        "enabled": state.enabled,
    })
}

#[tauri::command]
pub async fn overlay_update_scale(app: AppHandle, scale: u64) -> Value {
    let token = resolve_overlay_token(&app);
    let handle = match ensure_overlay_server_runtime(8080, token) {
        Ok(handle) => handle,
        Err(error) => return json!({ "success": false, "error": error }),
    };

    let mut state = match handle.state.lock() {
        Ok(state) => state,
        Err(_) => return json!({ "success": false, "error": "overlay_state_lock_failed" }),
    };

    let safe_scale = scale.clamp(50, 200) as u32;
    state.scale = safe_scale;
    if state.enabled {
        push_overlay_event_locked(&mut state, "SCALE_UPDATE", json!({ "scale": safe_scale }));
    }

    json!({
        "success": true,
        "scale": safe_scale,
    })
}

#[tauri::command]
pub async fn overlay_update_config(app: AppHandle, config_patch: Value) -> Value {
    if !config_patch.is_object() {
        return json!({ "success": false, "error": "overlay_config_object_required" });
    }

    let token = resolve_overlay_token(&app);
    let handle = match ensure_overlay_server_runtime(8080, token) {
        Ok(handle) => handle,
        Err(error) => return json!({ "success": false, "error": error }),
    };

    let mut state = match handle.state.lock() {
        Ok(state) => state,
        Err(_) => return json!({ "success": false, "error": "overlay_state_lock_failed" }),
    };

    if !state.config.is_object() {
        state.config = json!({});
    }

    merge_json(&mut state.config, &config_patch);
    if state.enabled {
        push_overlay_event_locked(&mut state, "CONFIG_UPDATE", config_patch);
    }

    json!({
        "success": true,
        "config": state.config,
    })
}

#[tauri::command]
pub async fn overlay_push_event(app: AppHandle, event_payload: Value) -> Value {
    if !event_payload.is_object() {
        return json!({ "success": false, "error": "overlay_payload_object_required" });
    }

    let token = resolve_overlay_token(&app);
    let handle = match ensure_overlay_server_runtime(8080, token) {
        Ok(handle) => handle,
        Err(error) => return json!({ "success": false, "error": error }),
    };

    let mut state = match handle.state.lock() {
        Ok(state) => state,
        Err(_) => return json!({ "success": false, "error": "overlay_state_lock_failed" }),
    };

    if !state.enabled {
        return json!({ "success": true, "skipped": true });
    }

    let mut payload = event_payload;
    if let Some(payload_map) = payload.as_object_mut() {
        payload_map
            .entry("overlayScale".to_string())
            .or_insert(json!(state.scale));

        if let Some(config_map) = state.config.as_object() {
            for (key, value) in config_map {
                payload_map.entry(key.clone()).or_insert(value.clone());
            }
        }
    }

    let event_id = push_overlay_event_locked(&mut state, "TTS_START", payload);

    json!({
        "success": true,
        "event_id": event_id,
    })
}

async fn twitch_helix_request(
    method: reqwest::Method,
    url: String,
    auth: &TwitchAuthData,
    body: Option<Value>,
) -> Result<Value, String> {
    let client = http_client()?;
    let mut request = client
        .request(method, url)
        .header("Client-Id", &auth.client_id)
        .header("Authorization", format!("Bearer {}", &auth.clean_token));

    if let Some(payload) = body {
        request = request.json(&payload);
    }

    let response = request
        .send()
        .await
        .map_err(|e| format!("Twitch request error: {e}"))?;

    let status = response.status();
    let body_json = response
        .json::<Value>()
        .await
        .unwrap_or_else(|_| json!({}));

    if status.is_success() {
        Ok(body_json)
    } else {
        Err(format!("Twitch API error {}", status.as_u16()))
    }
}

#[tauri::command]
pub async fn get_config(app: AppHandle) -> Value {
    load_config(&app).unwrap_or_else(|_| default_config())
}

#[tauri::command]
pub async fn save_config(app: AppHandle, new_config: Value) -> Value {
    let mut current = load_config(&app).unwrap_or_else(|_| default_config());
    let previous = current.clone();

    if let Some(reward_rules) = new_config.get("reward_rules") {
        current["reward_rules"] = reward_rules.clone();
    }

    if let Some(reward_rules_by_user) = new_config.get("reward_rules_by_user") {
        current["reward_rules_by_user"] = reward_rules_by_user.clone();
    }

    if let Some(presets) = new_config.get("presets") {
        current["presets"] = presets.clone();
    }

    if let Some(user_voices) = new_config.get("user_voices") {
        current["user_voices"] = user_voices.clone();
    }

    merge_json(&mut current, &new_config);

    let new_azure_key = string_field(&current, "azure_key", "");
    let new_azure_region = string_field(&current, "azure_region", "westeurope");
    let old_azure_key = string_field(&previous, "azure_key", "");
    let old_azure_region = string_field(&previous, "azure_region", "westeurope");

    if !new_azure_key.trim().is_empty()
        && (new_azure_key != old_azure_key || new_azure_region != old_azure_region)
        && validate_azure_key(&new_azure_key, &new_azure_region)
            .await
            .is_err()
    {
        return json!({
            "success": false,
            "source": "azure",
            "error": "err_azure_invalid"
        });
    }

    let new_twitch_token = string_field(&current, "twitch_oauth", "");
    let old_twitch_token = string_field(&previous, "twitch_oauth", "");

    if new_twitch_token.trim().is_empty() {
        current["twitch_username"] = Value::String(String::new());
        current["twitch_user_id"] = Value::String(String::new());
    } else if new_twitch_token != old_twitch_token {
        match get_twitch_auth_data(&new_twitch_token).await {
            Ok(auth) => {
                current["twitch_username"] = Value::String(auth.username);
                current["twitch_user_id"] = Value::String(auth.user_id);
            }
            Err(error) => {
                return json!({
                    "success": false,
                    "source": "twitch",
                    "error": error
                });
            }
        }
    }

    match save_config_file(&app, &current) {
        Ok(_) => json!({ "success": true }),
        Err(error) => json!({ "success": false, "error": error }),
    }
}

#[tauri::command]
pub async fn get_app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
pub async fn get_latest_github_release(owner: String, repo: String, token: Option<String>) -> Value {
    let owner = owner.trim().to_string();
    let repo = repo.trim().to_string();

    if owner.is_empty() || repo.is_empty() {
        return json!({
            "success": false,
            "error": "update_repo_missing"
        });
    }

    let endpoint = format!("https://api.github.com/repos/{owner}/{repo}/releases/latest");

    let client = match Client::builder().timeout(Duration::from_secs(20)).build() {
        Ok(client) => client,
        Err(error) => {
            return json!({
                "success": false,
                "error": format!("update_http_client_error: {error}")
            });
        }
    };

    let mut request = client
        .get(endpoint)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .header("User-Agent", "AetherStream-Updater");

    let github_token = resolve_request_github_token(token);

    if let Some(token) = github_token.as_deref() {
        request = request.bearer_auth(token);
    }

    let response = match request.send().await {
        Ok(response) => response,
        Err(error) => {
            return json!({
                "success": false,
                "error": format!("update_http_request_failed: {error}")
            });
        }
    };

    let release = if response.status().as_u16() == 404 {
        // `releases/latest` ignores draft and prerelease entries; if only prereleases exist,
        // GitHub can return 404. Fallback to listing releases and pick the first non-draft item.
        let fallback_endpoint = format!("https://api.github.com/repos/{owner}/{repo}/releases?per_page=20");
        let mut fallback_request = client
            .get(fallback_endpoint)
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .header("User-Agent", "AetherStream-Updater");

        if let Some(token) = github_token.as_deref() {
            fallback_request = fallback_request.bearer_auth(token);
        }

        let fallback_response = match fallback_request.send().await {
            Ok(response) => response,
            Err(error) => {
                return json!({
                    "success": false,
                    "error": format!("update_http_request_failed: {error}")
                });
            }
        };

        if fallback_response.status().as_u16() == 404 {
            return json!({
                "success": false,
                "error": "update_repo_not_found_or_private"
            });
        }

        if fallback_response.status().as_u16() == 403 {
            let rate_remaining = fallback_response
                .headers()
                .get("x-ratelimit-remaining")
                .and_then(|value| value.to_str().ok())
                .unwrap_or_default()
                .trim()
                .to_string();

            if rate_remaining == "0" {
                return json!({
                    "success": false,
                    "error": "update_rate_limited"
                });
            }

            return json!({
                "success": false,
                "error": "update_access_denied"
            });
        }

        if !fallback_response.status().is_success() {
            return json!({
                "success": false,
                "error": format!("update_http_{}", fallback_response.status().as_u16())
            });
        }

        let releases = match fallback_response.json::<Value>().await {
            Ok(payload) => payload,
            Err(error) => {
                return json!({
                    "success": false,
                    "error": format!("update_payload_invalid: {error}")
                });
            }
        };

        let Some(release) = releases
            .as_array()
            .and_then(|items| {
                items
                    .iter()
                    .find(|item| !item.get("draft").and_then(Value::as_bool).unwrap_or(false))
            })
            .cloned()
        else {
            return json!({
                "success": false,
                "error": "update_check_failed"
            });
        };

        release
    } else {
        if response.status().as_u16() == 403 {
            let rate_remaining = response
                .headers()
                .get("x-ratelimit-remaining")
                .and_then(|value| value.to_str().ok())
                .unwrap_or_default()
                .trim()
                .to_string();

            if rate_remaining == "0" {
                return json!({
                    "success": false,
                    "error": "update_rate_limited"
                });
            }

            return json!({
                "success": false,
                "error": "update_access_denied"
            });
        }

        if !response.status().is_success() {
            return json!({
                "success": false,
                "error": format!("update_http_{}", response.status().as_u16())
            });
        }

        match response.json::<Value>().await {
            Ok(payload) => payload,
            Err(error) => {
                return json!({
                    "success": false,
                    "error": format!("update_payload_invalid: {error}")
                });
            }
        }
    };

    let tag = release
        .get("tag_name")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string();

    if tag.is_empty() {
        return json!({
            "success": false,
            "error": "update_latest_version_missing"
        });
    }

    let latest_version = tag.trim_start_matches(['v', 'V']).to_string();
    let release_url = release
        .get("html_url")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string();
    let changelog = release
        .get("body")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string();

    let assets = release
        .get("assets")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let installer = pick_installer_asset_from_release(&assets);
    let (installer_name, installer_url) = installer.unwrap_or_else(|| (String::new(), String::new()));

    json!({
        "success": true,
        "tag": tag,
        "latest_version": latest_version,
        "release_url": release_url,
        "changelog": changelog,
        "installer_name": installer_name,
        "installer_url": installer_url,
    })
}

#[tauri::command]
pub async fn open_external_url(url: String) -> Value {
    let safe_url = url.trim().to_string();
    if safe_url.is_empty() {
        return json!({
            "success": false,
            "error": "external_url_missing"
        });
    }

    let parsed = match Url::parse(&safe_url) {
        Ok(parsed) => parsed,
        Err(_) => {
            return json!({
                "success": false,
                "error": "external_url_invalid"
            });
        }
    };

    let scheme = parsed.scheme();
    if scheme != "http" && scheme != "https" {
        return json!({
            "success": false,
            "error": "external_url_invalid_scheme"
        });
    }

    match webbrowser::open(parsed.as_str()) {
        Ok(_) => json!({ "success": true }),
        Err(error) => json!({
            "success": false,
            "error": format!("external_url_open_failed: {error}")
        }),
    }
}

#[tauri::command]
pub async fn download_and_run_installer(app: AppHandle, url: String, file_name: String, token: Option<String>) -> Value {
    let safe_url = url.trim().to_string();
    if safe_url.is_empty() {
        return json!({
            "success": false,
            "error": "installer_url_missing"
        });
    }

    let parsed = match Url::parse(&safe_url) {
        Ok(parsed) => parsed,
        Err(_) => {
            return json!({
                "success": false,
                "error": "installer_url_invalid"
            });
        }
    };

    let scheme = parsed.scheme();
    if scheme != "https" {
        return json!({
            "success": false,
            "error": "installer_url_invalid_scheme"
        });
    }

    if !is_allowed_installer_host(&parsed) {
        return json!({
            "success": false,
            "error": "installer_url_untrusted_host"
        });
    }

    let fallback_name = parsed
        .path_segments()
        .and_then(|mut segments| segments.next_back())
        .unwrap_or("AetherStream-setup.exe");

    let requested_name = if file_name.trim().is_empty() {
        fallback_name.to_string()
    } else {
        file_name.trim().to_string()
    };

    let installer_name = sanitize_installer_file_name(&requested_name);
    if installer_name.is_empty() || !is_supported_installer_name(&installer_name) {
        return json!({
            "success": false,
            "error": "installer_file_invalid"
        });
    }

    let download_dir = match updater_download_dir(&app) {
        Ok(dir) => dir,
        Err(error) => {
            return json!({
                "success": false,
                "error": error
            });
        }
    };

    let installer_path = download_dir.join(installer_name.clone());

    let client = match Client::builder().timeout(Duration::from_secs(900)).build() {
        Ok(client) => client,
        Err(error) => {
            return json!({
                "success": false,
                "error": format!("installer_http_client_error: {error}")
            });
        }
    };

    let is_github_api_asset = parsed
        .domain()
        .map(|domain| domain.eq_ignore_ascii_case("api.github.com"))
        .unwrap_or(false)
        && parsed.path().contains("/releases/assets/");

    let github_token = resolve_request_github_token(token);

    let mut request = client.get(parsed.as_str());
    if is_github_api_asset {
        request = request
            .header("Accept", "application/octet-stream")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .header("User-Agent", "AetherStream-Updater");

        if let Some(token) = github_token.as_deref() {
            request = request.bearer_auth(token);
        }
    }

    let response = match request.send().await {
        Ok(response) => response,
        Err(error) => {
            return json!({
                "success": false,
                "error": format!("installer_download_failed: {error}")
            });
        }
    };

    if !response.status().is_success() {
        return json!({
            "success": false,
            "error": format!("installer_http_{}", response.status().as_u16())
        });
    }

    let installer_bytes = match response.bytes().await {
        Ok(bytes) => bytes,
        Err(error) => {
            return json!({
                "success": false,
                "error": format!("installer_read_failed: {error}")
            });
        }
    };

    if let Err(error) = fs::write(&installer_path, &installer_bytes) {
        return json!({
            "success": false,
            "error": format!("installer_write_failed: {error}")
        });
    }

    let installer_path_string = installer_path.to_string_lossy().to_string();
    let launch_result = if installer_name.to_ascii_lowercase().ends_with(".msi") {
        Command::new("msiexec")
            .args(["/i", installer_path_string.as_str()])
            .spawn()
    } else {
        Command::new(&installer_path).spawn()
    };

    if let Err(error) = launch_result {
        return json!({
            "success": false,
            "error": format!("installer_launch_failed: {error}")
        });
    }

    if let Err(error) = persist_main_window_state(&app) {
        eprintln!("[download_and_run_installer] persist_main_window_state failed: {error}");
    }

    app.exit(0);

    json!({
        "success": true,
        "path": installer_path_string,
    })
}

#[tauri::command]
pub async fn exit_application(app: AppHandle) -> Value {
    if let Err(error) = persist_main_window_state(&app) {
        eprintln!("[exit_application] persist_main_window_state failed: {error}");
    }

    let windows = app.webview_windows();

    if windows.is_empty() {
        app.exit(0);
        return json!({ "success": true });
    }

    for (label, window) in windows {
        if let Err(error) = window.close() {
            app.exit(0);
            return json!({
                "success": false,
                "error": format!("{}: {}", label, error)
            });
        }
    }

    json!({ "success": true })
}

#[tauri::command]
pub async fn update_tray_lang(_labels: Value) -> bool {
    true
}

#[tauri::command]
pub async fn factory_reset(app: AppHandle) -> Value {
    let mut removed_any = false;

    if let Ok(candidates) = config_candidates(&app) {
        for candidate in candidates {
            if candidate.exists() {
                if fs::remove_file(&candidate).is_ok() {
                    removed_any = true;
                }
            }
        }
    }

    for candidate in legacy_candidates() {
        if candidate.exists() {
            if fs::remove_file(&candidate).is_ok() {
                removed_any = true;
            }
        }
    }

    if removed_any {
        let app_handle = app.clone();
        tauri::async_runtime::spawn(async move {
            let _ = app_handle.restart();
        });
    }

    json!({
        "success": true,
        "removed": removed_any
    })
}

#[tauri::command]
pub async fn export_preset_file(app: AppHandle, default_name: String, contents: String) -> Value {
    let mut dialog = app.dialog().file();
    let clean_name = default_name.trim();
    if !clean_name.is_empty() {
        dialog = dialog.set_file_name(clean_name);
    }

    let (tx, rx) = mpsc::channel();
    dialog.save_file(move |file_path| {
        let _ = tx.send(file_path);
    });

    let file_path = match tauri::async_runtime::spawn_blocking(move || rx.recv().ok().flatten()).await {
        Ok(file_path) => file_path,
        Err(error) => {
            return json!({
                "success": false,
                "error": format!("dialog_task_failed: {error}"),
            })
        }
    };
    let Some(file_path) = file_path else {
        return json!({ "success": false, "canceled": true });
    };

    let path = match dialog_path_to_pathbuf(file_path) {
        Ok(path) => path,
        Err(error) => return json!({ "success": false, "error": error }),
    };

    match fs::write(&path, contents) {
        Ok(_) => json!({ "success": true }),
        Err(error) => json!({ "success": false, "error": error.to_string() }),
    }
}

#[tauri::command]
pub async fn import_preset_file(app: AppHandle) -> Value {
    let (tx, rx) = mpsc::channel();
    app.dialog().file().pick_file(move |file_path| {
        let _ = tx.send(file_path);
    });

    let file_path = match tauri::async_runtime::spawn_blocking(move || rx.recv().ok().flatten()).await {
        Ok(file_path) => file_path,
        Err(error) => {
            return json!({
                "success": false,
                "error": format!("dialog_task_failed: {error}"),
            })
        }
    };
    let Some(file_path) = file_path else {
        return json!({ "success": false, "canceled": true });
    };

    let path = match dialog_path_to_pathbuf(file_path) {
        Ok(path) => path,
        Err(error) => return json!({ "success": false, "error": error }),
    };

    match fs::read_to_string(&path) {
        Ok(contents) => json!({ "success": true, "contents": contents }),
        Err(error) => json!({ "success": false, "error": error.to_string() }),
    }
}

#[tauri::command]
pub async fn fetch_azure_voices(app: AppHandle) -> Value {
    let config = load_config(&app).unwrap_or_else(|_| default_config());
    let azure_key = string_field(&config, "azure_key", "");
    let azure_region = string_field(&config, "azure_region", "");

    if azure_key.trim().is_empty() || azure_region.trim().is_empty() {
        return json!([]);
    }

    fetch_azure_voices_with_credentials(&azure_key, &azure_region).await
}

async fn fetch_azure_voices_with_credentials(azure_key: &str, azure_region: &str) -> Value {
    if azure_key.trim().is_empty() || azure_region.trim().is_empty() {
        return json!([]);
    }

    let url = format!(
        "https://{azure_region}.tts.speech.microsoft.com/cognitiveservices/voices/list"
    );

    let client = match http_client() {
        Ok(client) => client,
        Err(_) => return json!([]),
    };

    let response = match client
        .get(url)
        .header("Ocp-Apim-Subscription-Key", azure_key)
        .send()
        .await
    {
        Ok(response) => response,
        Err(_) => return json!([]),
    };

    if !response.status().is_success() {
        return json!([]);
    }

    response.json::<Value>().await.unwrap_or_else(|_| json!([]))
}

#[tauri::command]
pub async fn validate_azure_and_fetch_voices(azure_key: String, azure_region: String) -> Value {
    let clean_key = azure_key.trim();
    let clean_region = azure_region.trim();

    if validate_azure_key(clean_key, clean_region).await.is_err() {
        return json!({
            "success": false,
            "voices": [],
            "error": "err_azure_invalid"
        });
    }

    let voices = fetch_azure_voices_with_credentials(clean_key, clean_region).await;
    let has_voices = voices
        .as_array()
        .map(|entries| !entries.is_empty())
        .unwrap_or(false);

    if !has_voices {
        return json!({
            "success": false,
            "voices": [],
            "error": "azure_voice_list_empty"
        });
    }

    json!({
        "success": true,
        "voices": voices
    })
}

#[tauri::command]
pub async fn test_tts(app: AppHandle, data: Value) -> Value {
    let result = synthesize_tts(app, data).await;

    if result
        .get("success")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        json!({ "success": true })
    } else {
        result
    }
}

#[tauri::command]
pub async fn synthesize_tts(app: AppHandle, data: Value) -> Value {
    let config = load_config(&app).unwrap_or_else(|_| default_config());
    let azure_key = string_field(&config, "azure_key", "");
    let azure_region = string_field(&config, "azure_region", "");

    if azure_key.trim().is_empty() || azure_region.trim().is_empty() {
        return json!({ "success": false, "error": "err_azure_invalid" });
    }

    let text = data
        .get("text")
        .and_then(Value::as_str)
        .unwrap_or("This is a test message.");

    if text.trim().is_empty() {
        return json!({ "success": false, "error": "tts_text_missing" });
    }

    let voice = data
        .get("voice")
        .and_then(Value::as_str)
        .unwrap_or_else(|| {
            config
                .get("voice_name")
                .and_then(Value::as_str)
                .unwrap_or("en-US-JennyNeural")
        });

    let style = data
        .get("style")
        .and_then(Value::as_str)
        .unwrap_or_else(|| {
            config
                .get("global_style")
                .and_then(Value::as_str)
                .unwrap_or("general")
        });

    let rate = data
        .get("rate")
        .or_else(|| data.get("speed"))
        .and_then(Value::as_str)
        .unwrap_or_else(|| {
            config
                .get("global_speed")
                .and_then(Value::as_str)
                .unwrap_or("1.0")
        });

    let pitch = data
        .get("pitch")
        .and_then(Value::as_str)
        .unwrap_or_else(|| {
            config
                .get("global_pitch")
                .and_then(Value::as_str)
                .unwrap_or("1.0")
        });

    let ssml = build_ssml(text, voice, style, rate, pitch);

    let mut response = request_azure_tts(&ssml, &azure_key, &azure_region).await;

    if response.is_err() && !style.trim().is_empty() && !style.eq_ignore_ascii_case("general") {
        let fallback_ssml = build_ssml(text, voice, "general", rate, pitch);
        response = request_azure_tts(&fallback_ssml, &azure_key, &azure_region).await;
    }

    match response {
        Ok(bytes) => {
            let encoded = general_purpose::STANDARD.encode(bytes.as_slice());
            json!({
                "success": true,
                "audio_base64": encoded,
                "format": "mp3"
            })
        }
        Err(error) => {
            let context = format!(
                "voice={voice}; style={style}; rate={rate}; pitch={pitch}; region={azure_region}; text_len={}",
                text.chars().count()
            );
            json!({ "success": false, "error": format!("{error} | {context}") })
        }
    }
}

#[tauri::command]
pub async fn play_tts(app: AppHandle, data: Value) -> Value {
    let config = load_config(&app).unwrap_or_else(|_| default_config());
    let azure_key = string_field(&config, "azure_key", "");
    let azure_region = string_field(&config, "azure_region", "");

    if azure_key.trim().is_empty() || azure_region.trim().is_empty() {
        return json!({ "success": false, "error": "err_azure_invalid" });
    }

    let text = data
        .get("text")
        .and_then(Value::as_str)
        .unwrap_or("This is a test message.");

    if text.trim().is_empty() {
        return json!({ "success": false, "error": "tts_text_missing" });
    }

    let voice = data
        .get("voice")
        .and_then(Value::as_str)
        .unwrap_or_else(|| {
            config
                .get("voice_name")
                .and_then(Value::as_str)
                .unwrap_or("en-US-JennyNeural")
        });

    let style = data
        .get("style")
        .and_then(Value::as_str)
        .unwrap_or_else(|| {
            config
                .get("global_style")
                .and_then(Value::as_str)
                .unwrap_or("general")
        });

    let rate = data
        .get("rate")
        .or_else(|| data.get("speed"))
        .and_then(Value::as_str)
        .unwrap_or_else(|| {
            config
                .get("global_speed")
                .and_then(Value::as_str)
                .unwrap_or("1.0")
        });

    let pitch = data
        .get("pitch")
        .and_then(Value::as_str)
        .unwrap_or_else(|| {
            config
                .get("global_pitch")
                .and_then(Value::as_str)
                .unwrap_or("1.0")
        });

    let volume = parse_volume_value(data.get("volume"), u64_field(&config, "volume", 50));
    let audio_device = data
        .get("audio_device")
        .and_then(Value::as_str)
        .map(|value| value.to_string())
        .unwrap_or_else(|| string_field(&config, "audio_device", "default"));

    let ssml = build_ssml(text, voice, style, rate, pitch);

    let mut response = request_azure_tts(&ssml, &azure_key, &azure_region).await;

    if response.is_err() && !style.trim().is_empty() && !style.eq_ignore_ascii_case("general") {
        let fallback_ssml = build_ssml(text, voice, "general", rate, pitch);
        response = request_azure_tts(&fallback_ssml, &azure_key, &azure_region).await;
    }

    match response {
        Ok(bytes) => {
            let playback_device = audio_device.clone();
            let playback_result = tauri::async_runtime::spawn_blocking(move || {
                play_audio_bytes(bytes, volume, &playback_device)
            })
            .await;

            match playback_result {
                Ok(Ok(())) => json!({ "success": true }),
                Ok(Err(error)) => json!({ "success": false, "error": error }),
                Err(error) => json!({ "success": false, "error": format!("tts_playback_task_failed: {error}") }),
            }
        }
        Err(error) => {
            let context = format!(
                "voice={voice}; style={style}; rate={rate}; pitch={pitch}; region={azure_region}; text_len={}",
                text.chars().count()
            );
            json!({ "success": false, "error": format!("{error} | {context}") })
        }
    }
}

#[tauri::command]
pub fn tts_pause() -> bool {
    get_tts_player().sender.send(AudioCommand::Pause).is_ok()
}

#[tauri::command]
pub fn tts_resume() -> bool {
    get_tts_player().sender.send(AudioCommand::Resume).is_ok()
}

#[tauri::command]
pub fn tts_skip() -> bool {
    get_tts_player().sender.send(AudioCommand::Stop).is_ok()
}

#[tauri::command]
pub fn tts_clear() -> bool {
    get_tts_player().sender.send(AudioCommand::Clear).is_ok()
}

#[tauri::command]
pub async fn twitch_login(client_id: String) -> Value {
    let client_id = client_id.trim().to_string();
    if client_id.is_empty() {
        return json!({ "success": false, "error": "err_twitch_client_id_missing" });
    }
    let listener = match TcpListener::bind(("127.0.0.1", TWITCH_OAUTH_PORT)) {
        Ok(listener) => listener,
        Err(error) => {
            return json!({
                "success": false,
                "error": format!("oauth_bind_failed: {error}")
            });
        }
    };

    let port = TWITCH_OAUTH_PORT;
    drop(listener);

    let oauth_state = generate_oauth_state();
    let auth_url = match build_twitch_auth_url(port, &oauth_state, &client_id) {
        Ok(url) => url,
        Err(error) => return json!({ "success": false, "error": error }),
    };

    let token_future = tauri::async_runtime::spawn_blocking({
        let expected_state = oauth_state.clone();
        move || receive_twitch_token(port, expected_state, Duration::from_secs(300))
    });

    if let Err(error) = webbrowser::open(&auth_url) {
        return json!({
            "success": false,
            "error": format!("oauth_browser_open_failed: {error}")
        });
    }

    let token = match token_future.await {
        Ok(Ok(token)) => token,
        Ok(Err(error)) => return json!({ "success": false, "error": error }),
        Err(error) => {
            return json!({
                "success": false,
                "error": format!("oauth_task_failed: {error}")
            });
        }
    };

    match get_twitch_auth_data(&token).await {
        Ok(auth) => json!({
            "success": true,
            "token": token,
            "username": auth.username,
            "client_id": auth.client_id,
            "user_id": auth.user_id
        }),
        Err(error) => json!({
            "success": false,
            "error": error
        }),
    }
}

#[tauri::command]
pub async fn validate_twitch_token(token: String) -> Value {
    match get_twitch_auth_data(&token).await {
        Ok(auth) => json!({
            "success": true,
            "username": auth.username,
            "client_id": auth.client_id,
            "user_id": auth.user_id
        }),
        Err(error) => json!({
            "success": false,
            "error": error
        }),
    }
}

#[tauri::command]
pub async fn fetch_twitch_rewards(app: AppHandle) -> Value {
    let config = load_config(&app).unwrap_or_else(|_| default_config());
    let token = string_field(&config, "twitch_oauth", "");

    if token.trim().is_empty() {
        return json!({ "success": false, "error": "No OAuth token" });
    }

    let auth = match get_twitch_auth_data(&token).await {
        Ok(auth) => auth,
        Err(error) => return json!({ "success": false, "error": error }),
    };

    let url = format!(
        "https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id={}",
        auth.user_id
    );

    match twitch_helix_request(reqwest::Method::GET, url, &auth, None).await {
        Ok(payload) => {
            let rewards = payload
                .get("data")
                .cloned()
                .unwrap_or_else(|| json!([]));
            json!({ "success": true, "rewards": rewards })
        }
        Err(error) => json!({ "success": false, "error": error }),
    }
}

#[tauri::command]
pub async fn fetch_twitch_reward_redemptions(app: AppHandle, reward_ids: Vec<String>) -> Value {
    let config = load_config(&app).unwrap_or_else(|_| default_config());
    let token = string_field(&config, "twitch_oauth", "");

    if token.trim().is_empty() {
        return json!({ "success": false, "error": "No OAuth token", "redemptions": [] });
    }

    let auth = match get_twitch_auth_data(&token).await {
        Ok(auth) => auth,
        Err(error) => return json!({ "success": false, "error": error, "redemptions": [] }),
    };

    let filtered_reward_ids: Vec<String> = reward_ids
        .into_iter()
        .map(|reward_id| reward_id.trim().to_string())
        .filter(|reward_id| !reward_id.is_empty() && !reward_id.starts_with("local-"))
        .collect();

    if filtered_reward_ids.is_empty() {
        return json!({ "success": true, "redemptions": [] });
    }

    let mut redemptions: Vec<Value> = Vec::new();
    let mut errors: Vec<String> = Vec::new();

    for reward_id in filtered_reward_ids {
        let url = format!(
            "https://api.twitch.tv/helix/channel_points/custom_rewards/redemptions?broadcaster_id={}&reward_id={}&status=UNFULFILLED&first=20",
            auth.user_id,
            reward_id
        );

        match twitch_helix_request(reqwest::Method::GET, url, &auth, None).await {
            Ok(payload) => {
                if let Some(items) = payload.get("data").and_then(Value::as_array) {
                    for item in items {
                        let mut normalized = item.clone();
                        if let Some(map) = normalized.as_object_mut() {
                            map.entry("reward_id".to_string())
                                .or_insert_with(|| Value::String(reward_id.clone()));
                        }
                        redemptions.push(normalized);
                    }
                }
            }
            Err(error) => errors.push(format!("{}: {}", reward_id, error)),
        }
    }

    if redemptions.is_empty() && !errors.is_empty() {
        return json!({
            "success": false,
            "error": errors.join("; "),
            "redemptions": []
        });
    }

    json!({
        "success": true,
        "redemptions": redemptions,
    })
}

#[tauri::command]
pub async fn complete_twitch_redemption(app: AppHandle, reward_id: String, redemption_id: String) -> Value {
    let config = load_config(&app).unwrap_or_else(|_| default_config());
    let token = string_field(&config, "twitch_oauth", "");

    if token.trim().is_empty() {
        return json!({ "success": false, "error": "Auth failed" });
    }

    let auth = match get_twitch_auth_data(&token).await {
        Ok(auth) => auth,
        Err(error) => return json!({ "success": false, "error": error }),
    };

    let clean_reward_id = reward_id.trim();
    let clean_redemption_id = redemption_id.trim();

    if clean_reward_id.is_empty() || clean_redemption_id.is_empty() {
        return json!({ "success": false, "error": "rewardId and redemptionId are required" });
    }

    let url = format!(
        "https://api.twitch.tv/helix/channel_points/custom_rewards/redemptions?broadcaster_id={}&reward_id={}&id={}",
        auth.user_id,
        clean_reward_id,
        clean_redemption_id
    );

    let body = json!({ "status": "FULFILLED" });
    match twitch_helix_request(reqwest::Method::PATCH, url, &auth, Some(body)).await {
        Ok(_) => json!({ "success": true }),
        Err(error) => json!({ "success": false, "error": error }),
    }
}

#[tauri::command]
pub async fn create_twitch_reward(app: AppHandle, reward_data: Value) -> Value {
    let config = load_config(&app).unwrap_or_else(|_| default_config());
    let token = string_field(&config, "twitch_oauth", "");

    if token.trim().is_empty() {
        return json!({ "success": false, "error": "Twitch bejelentkezes szukseges!" });
    }

    let auth = match get_twitch_auth_data(&token).await {
        Ok(auth) => auth,
        Err(error) => return json!({ "success": false, "error": error }),
    };

    let title = reward_data
        .get("title")
        .or_else(|| reward_data.get("rewardName"))
        .and_then(Value::as_str)
        .unwrap_or("Aether TTS")
        .to_string();

    let cost = u64_field(&reward_data, "cost", 100);
    let prompt = reward_data
        .get("prompt")
        .and_then(Value::as_str)
        .unwrap_or("AetherStream TTS")
        .to_string();

    let use_fix_text = reward_data
        .get("useFixText")
        .or_else(|| reward_data.get("use_fix_text"))
        .and_then(Value::as_bool)
        .unwrap_or(false);

    let requires_input = reward_data
        .get("is_user_input_required")
        .and_then(Value::as_bool)
        .unwrap_or(!use_fix_text);

    let body = json!({
        "title": title,
        "cost": cost,
        "prompt": prompt,
        "is_user_input_required": requires_input,
        "background_color": "#8000ff",
        "should_redemptions_skip_request_queue": false
    });

    let url = format!(
        "https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id={}",
        auth.user_id
    );

    match twitch_helix_request(reqwest::Method::POST, url, &auth, Some(body)).await {
        Ok(payload) => {
            let reward = payload
                .get("data")
                .and_then(Value::as_array)
                .and_then(|array| array.first())
                .cloned()
                .unwrap_or_else(|| json!({}));

            json!({ "success": true, "reward": reward })
        }
        Err(error) => json!({ "success": false, "error": error }),
    }
}

#[tauri::command]
pub async fn update_twitch_reward(app: AppHandle, reward_data: Value) -> Value {
    let config = load_config(&app).unwrap_or_else(|_| default_config());
    let token = string_field(&config, "twitch_oauth", "");

    if token.trim().is_empty() {
        return json!({ "success": false, "error": "Auth failed" });
    }

    let auth = match get_twitch_auth_data(&token).await {
        Ok(auth) => auth,
        Err(error) => return json!({ "success": false, "error": error }),
    };

    let reward_id = reward_data
        .get("rewardId")
        .or_else(|| reward_data.get("reward_id"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    if reward_id.is_empty() {
        return json!({ "success": false, "error": "rewardId is required" });
    }

    let title = reward_data
        .get("title")
        .or_else(|| reward_data.get("rewardName"))
        .and_then(Value::as_str)
        .unwrap_or("Aether TTS")
        .to_string();

    let cost = u64_field(&reward_data, "cost", 100);
    let prompt = reward_data
        .get("prompt")
        .and_then(Value::as_str)
        .unwrap_or("AetherStream TTS")
        .to_string();

    let use_fix_text = reward_data
        .get("useFixText")
        .or_else(|| reward_data.get("use_fix_text"))
        .and_then(Value::as_bool)
        .unwrap_or(false);

    let requires_input = reward_data
        .get("is_user_input_required")
        .and_then(Value::as_bool)
        .unwrap_or(!use_fix_text);

    let body = json!({
        "title": title,
        "cost": cost,
        "prompt": prompt,
        "is_user_input_required": requires_input
    });

    let url = format!(
        "https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id={}&id={}",
        auth.user_id, reward_id
    );

    match twitch_helix_request(reqwest::Method::PATCH, url, &auth, Some(body)).await {
        Ok(_) => json!({ "success": true }),
        Err(error) => json!({ "success": false, "error": error }),
    }
}

#[tauri::command]
pub async fn delete_twitch_reward(app: AppHandle, reward_id: String) -> Value {
    let config = load_config(&app).unwrap_or_else(|_| default_config());
    let token = string_field(&config, "twitch_oauth", "");

    if token.trim().is_empty() {
        return json!({ "success": false, "error": "Auth failed" });
    }

    let auth = match get_twitch_auth_data(&token).await {
        Ok(auth) => auth,
        Err(error) => return json!({ "success": false, "error": error }),
    };

    if reward_id.trim().is_empty() {
        return json!({ "success": false, "error": "rewardId is required" });
    }

    let url = format!(
        "https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id={}&id={}",
        auth.user_id,
        reward_id.trim()
    );

    match twitch_helix_request(reqwest::Method::DELETE, url, &auth, None).await {
        Ok(_) => json!({ "success": true }),
        Err(error) => json!({ "success": false, "error": error }),
    }
}
