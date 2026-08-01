use tauri::{AppHandle, Emitter};
use serde::Serialize;

#[allow(dead_code)]
pub fn emit_event<T: Serialize + Clone>(app: &AppHandle, event_name: &str, payload: T) {
    if let Err(e) = app.emit(event_name, payload) {
        tracing::error!("Failed to emit event {}: {}", event_name, e);
    }
}

