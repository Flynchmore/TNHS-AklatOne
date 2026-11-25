use tauri::{webview::DownloadEvent, Manager, WebviewWindowBuilder};

/// Secrets live in the operating system's credential store, not in the WebView's localStorage files.
const SERVICE: &str = "AklatOne";

/// Only AklatOne's own keys (letters, digits, - and _), so the page cannot reach other entries of the store.
fn entry(key: &str) -> Result<keyring::Entry, String> {
  let ok = key.starts_with("aklatone_") && key.len() <= 100 && key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
  if !ok {
    return Err("invalid secret key".into());
  }
  keyring::Entry::new(SERVICE, key).map_err(|e| e.to_string())
}

/// Links the app may open in the computer's browser (School Newspaper Facebook pages).
fn allowed_external(url: &tauri::Url) -> bool {
  url.scheme() == "https" && matches!(url.host_str(), Some("www.facebook.com") | Some("facebook.com") | Some("m.facebook.com"))
}

/// The app's own pages (built app or the development server).
fn app_page(url: &tauri::Url) -> bool {
  url.scheme() == "tauri" || matches!(url.host_str(), Some("tauri.localhost") | Some("localhost") | Some("127.0.0.1"))
}

fn open_in_browser(url: &str) {
  #[cfg(target_os = "windows")]
  let _ = std::process::Command::new("cmd").args(["/C", "start", "", url]).spawn();
  #[cfg(target_os = "macos")]
  let _ = std::process::Command::new("open").arg(url).spawn();
  #[cfg(all(unix, not(target_os = "macos")))]
  let _ = std::process::Command::new("xdg-open").arg(url).spawn();
}

#[tauri::command]
fn secret_get(key: String) -> Result<Option<String>, String> {
  match entry(&key)?.get_password() {
    Ok(v) => Ok(Some(v)),
    Err(keyring::Error::NoEntry) => Ok(None),
    Err(e) => Err(e.to_string()),
  }
}

#[tauri::command]
fn secret_set(key: String, value: String) -> Result<(), String> {
  entry(&key)?.set_password(&value).map_err(|e| e.to_string())
}

#[tauri::command]
fn secret_delete(key: String) -> Result<(), String> {
  match entry(&key)?.delete_credential() {
    Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
    Err(e) => Err(e.to_string()),
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![secret_get, secret_set, secret_delete])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      // The main window is built here (tauri.conf.json has "create": false) so downloads such as database
      // backups and Excel exports are saved to the user's Downloads folder instead of being dropped by the webview.
      let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|w| w.label == "main")
        .cloned()
        .expect("main window config");
      let downloads = app.path().download_dir().ok();
      WebviewWindowBuilder::from_config(app.handle(), &config)?
        // The window never leaves AklatOne: allowed links open in the computer's browser, other sites are blocked.
        .on_navigation(|url| {
          if app_page(url) {
            return true;
          }
          if allowed_external(url) {
            open_in_browser(url.as_str());
          }
          false
        })
        .on_download(move |_webview, event| {
          if let DownloadEvent::Requested { destination, .. } = event {
            if let (Some(dir), Some(name)) = (downloads.as_ref(), destination.file_name()) {
              *destination = dir.join(name);
            }
          }
          true
        })
        .build()?;
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn only_the_newspaper_pages_open_outside() {
    let u = |s: &str| tauri::Url::parse(s).unwrap();
    assert!(allowed_external(&u("https://www.facebook.com/TagumpayNHSTheVictor")));
    assert!(!allowed_external(&u("http://www.facebook.com/x")));
    assert!(!allowed_external(&u("https://evil.example/facebook.com")));
    assert!(app_page(&u("tauri://localhost/catalog")));
    assert!(app_page(&u("http://localhost:5173/")));
    assert!(!app_page(&u("https://www.facebook.com/")));
  }

  #[test]
  fn refuses_keys_outside_aklatone() {
    assert!(secret_get("other_app_token".into()).is_err());
    assert!(secret_set("aklatone_../x".into(), "v".into()).is_err());
  }

  /// Uses the real credential store of the computer running the tests (skipped when there is none).
  #[test]
  fn round_trip_in_the_os_store() {
    let key = format!("aklatone_test_{}", std::process::id());
    if secret_set(key.clone(), "secret-value".into()).is_err() {
      eprintln!("no credential store here; skipped");
      return;
    }
    assert_eq!(secret_get(key.clone()).unwrap().as_deref(), Some("secret-value"));
    secret_delete(key.clone()).unwrap();
    assert_eq!(secret_get(key).unwrap(), None);
  }
}
