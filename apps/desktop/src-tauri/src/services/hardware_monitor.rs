// Hardware / lag monitoring service.
//
// Runs a single background task for the lifetime of the app that samples CPU
// and memory pressure at a fixed cadence, classifies the load into a severity
// level, and emits a `hardware-lag` event to the frontend whenever the state
// changes (edge-triggered) OR periodically while sustained (heartbeat).
//
// Design notes:
// - We never crash the app if sysinfo fails to refresh — every failure path is
//   logged and swallowed. The monitor is best-effort telemetry, not a critical
//   subsystem.
// - We rate-limit emissions so a flapping CPU can't spam the frontend. The
//   frontend still gets a heartbeat every N seconds while degraded so the UI
//   can show sustained pressure.
// - Frontend receives a JSON payload with severity, CPU%, memory%, and a
//   human-readable hint — not the empty `()` payload the old code emitted.

use serde::Serialize;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tokio::sync::Notify;

/// Severity buckets shared with the frontend.
///
/// Kept as a small enum so the UI can switch on it directly. `Nominal` is the
/// "everything's fine" state — we still emit it (once) when transitioning back
/// from a degraded state so the UI can clear its warning.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum LagSeverity {
    Nominal,
    Warning,
    Critical,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LagEvent {
    pub severity: LagSeverity,
    pub cpu_percent: f32,
    pub memory_percent: f32,
    /// Short human-readable summary, ready to show in a toast/status bar.
    pub hint: String,
    /// Milliseconds the current severity has been sustained.
    pub sustained_ms: u64,
}

/// Sampling cadence. Fast enough to feel responsive, slow enough to avoid
/// measurable CPU cost from sysinfo itself.
const SAMPLE_INTERVAL: Duration = Duration::from_millis(1500);

/// Heartbeat cadence while a non-nominal state is sustained — keeps the UI
/// alive without spamming.
const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(15);

/// Debounce: require this many consecutive samples above threshold before
/// escalating severity. Prevents single-spike false positives.
const ESCALATE_DEBOUNCE: u8 = 2;

/// Debounce for de-escalation. Longer than escalate so we don't flip back too
/// eagerly the moment a spike passes.
const RECOVER_DEBOUNCE: u8 = 4;

fn classify(cpu: f32, mem: f32) -> LagSeverity {
    // Critical: sustained high CPU pressure OR near-full memory.
    if cpu >= 92.0 || mem >= 95.0 {
        return LagSeverity::Critical;
    }
    // Warning: heavy but not pathological.
    if cpu >= 78.0 || mem >= 85.0 {
        return LagSeverity::Warning;
    }
    LagSeverity::Nominal
}

fn hint_for(sev: LagSeverity, cpu: f32, mem: f32) -> String {
    match sev {
        LagSeverity::Critical => format!(
            "System is under severe load (CPU {:.0}%, RAM {:.0}%). Consider lowering Engine Power to Balanced.",
            cpu, mem
        ),
        LagSeverity::Warning => format!(
            "System is warming up (CPU {:.0}%, RAM {:.0}%). Transfers may slow.",
            cpu, mem
        ),
        LagSeverity::Nominal => "System load has recovered.".to_string(),
    }
}

/// Spawns the background monitor. The returned `Arc<Notify>` can be signalled
/// to shut it down cleanly; if the app never signals it, the task exits when
/// the tokio runtime is dropped.
pub fn spawn(app: AppHandle) -> Arc<Notify> {
    let shutdown = Arc::new(Notify::new());
    let shutdown_task = shutdown.clone();

    tauri::async_runtime::spawn(async move {
        // Build sysinfo once; refreshing is cheaper than reconstructing.
        let mut sys = sysinfo::System::new();
        // First call after construction is always 0.0 on some platforms; prime
        // the CPU counters and discard the reading.
        sys.refresh_cpu_usage();
        sys.refresh_memory();
        tokio::time::sleep(Duration::from_millis(500)).await;

        let mut current_severity = LagSeverity::Nominal;
        let mut escalate_count: u8 = 0;
        let mut recover_count: u8 = 0;
        let mut state_entered_at = Instant::now();
        let mut last_heartbeat = Instant::now();

        loop {
            tokio::select! {
                _ = shutdown_task.notified() => {
                    tracing::info!("hardware_monitor: shutdown signal received, exiting");
                    break;
                }
                _ = tokio::time::sleep(SAMPLE_INTERVAL) => {}
            }

            // Refresh in a `catch_unwind`-free way: sysinfo is pure-Rust and
            // won't panic on refresh, but we still guard against unexpected
            // states by clamping the values.
            sys.refresh_cpu_usage();
            sys.refresh_memory();

            let cpu = sys.global_cpu_usage().clamp(0.0, 100.0);
            let total_mem = sys.total_memory();
            let used_mem = sys.used_memory();
            let mem = if total_mem > 0 {
                ((used_mem as f64 / total_mem as f64) * 100.0) as f32
            } else {
                0.0
            }
            .clamp(0.0, 100.0);

            let observed = classify(cpu, mem);

            // Debounce transitions so we don't fire on single-sample spikes.
            let next_severity = if observed == current_severity {
                escalate_count = 0;
                recover_count = 0;
                current_severity
            } else if severity_rank(observed) > severity_rank(current_severity) {
                escalate_count = escalate_count.saturating_add(1);
                recover_count = 0;
                if escalate_count >= ESCALATE_DEBOUNCE {
                    observed
                } else {
                    current_severity
                }
            } else {
                recover_count = recover_count.saturating_add(1);
                escalate_count = 0;
                if recover_count >= RECOVER_DEBOUNCE {
                    observed
                } else {
                    current_severity
                }
            };

            let transitioned = next_severity != current_severity;
            if transitioned {
                current_severity = next_severity;
                state_entered_at = Instant::now();
                escalate_count = 0;
                recover_count = 0;
            }

            // Emit on: (a) severity transition, or (b) heartbeat while
            // non-nominal. Never emit repeat nominal heartbeats — the UI
            // already knows we're fine.
            let now = Instant::now();
            let should_emit_heartbeat = current_severity != LagSeverity::Nominal
                && now.duration_since(last_heartbeat) >= HEARTBEAT_INTERVAL;

            if transitioned || should_emit_heartbeat {
                let event = LagEvent {
                    severity: current_severity,
                    cpu_percent: round1(cpu),
                    memory_percent: round1(mem),
                    hint: hint_for(current_severity, cpu, mem),
                    sustained_ms: now.duration_since(state_entered_at).as_millis() as u64,
                };
                if let Err(e) = app.emit("hardware-lag", &event) {
                    tracing::warn!("hardware_monitor: emit failed: {}", e);
                }
                last_heartbeat = now;
            }
        }
    });

    shutdown
}

fn severity_rank(s: LagSeverity) -> u8 {
    match s {
        LagSeverity::Nominal => 0,
        LagSeverity::Warning => 1,
        LagSeverity::Critical => 2,
    }
}

fn round1(v: f32) -> f32 {
    (v * 10.0).round() / 10.0
}

/// Tauri command: return a one-shot snapshot of current load. Used by the UI
/// on mount so the status bar populates immediately without waiting for the
/// first event.
#[tauri::command]
pub async fn get_hardware_snapshot() -> Result<LagEvent, String> {
    let mut sys = sysinfo::System::new();
    sys.refresh_cpu_usage();
    sys.refresh_memory();
    // Prime and re-sample so CPU usage is non-zero.
    tokio::time::sleep(Duration::from_millis(250)).await;
    sys.refresh_cpu_usage();

    let cpu = sys.global_cpu_usage().clamp(0.0, 100.0);
    let total_mem = sys.total_memory();
    let used_mem = sys.used_memory();
    let mem = if total_mem > 0 {
        ((used_mem as f64 / total_mem as f64) * 100.0) as f32
    } else {
        0.0
    }
    .clamp(0.0, 100.0);

    let sev = classify(cpu, mem);
    Ok(LagEvent {
        severity: sev,
        cpu_percent: round1(cpu),
        memory_percent: round1(mem),
        hint: hint_for(sev, cpu, mem),
        sustained_ms: 0,
    })
}

