
use tauri::State;
use crate::AppState;
use transfer::history::HistoryRecord;


#[tauri::command]
pub async fn get_transfer_history(state: State<'_, AppState>) -> Result<Vec<HistoryRecord>, String> {
    let manager = state.history_manager.read().await;
    Ok(manager.records.clone())
}

#[tauri::command]
pub async fn clear_history(state: State<'_, AppState>) -> Result<(), String> {
    let mut manager = state.history_manager.write().await;
    manager.clear();
    Ok(())
}

