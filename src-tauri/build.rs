use std::fs;
use std::path::Path;

fn main() {
  load_env_local();
  tauri_build::build()
}

fn load_env_local() {
  let env_path = Path::new("../.env.local");
  println!("cargo:rerun-if-changed=../.env.local");

  let Ok(content) = fs::read_to_string(env_path) else {
    return;
  };

  for line in content.lines() {
    if let Some((key, value)) = parse_env_line(line) {
      if key == "AETHER_ENCRYPTION_KEY" {
        println!("cargo:rustc-env=AETHER_ENCRYPTION_KEY={value}");
      }
    }
  }
}

fn parse_env_line(line: &str) -> Option<(String, String)> {
  let trimmed = line.trim();
  if trimmed.is_empty() || trimmed.starts_with('#') {
    return None;
  }

  let mut parts = trimmed.splitn(2, '=');
  let key = parts.next()?.trim();
  let value = parts.next().unwrap_or("").trim();
  if key.is_empty() || value.is_empty() {
    return None;
  }

  let value = value.trim_matches('"').trim_matches('\'');
  if value.is_empty() {
    return None;
  }

  Some((key.to_string(), value.to_string()))
}
