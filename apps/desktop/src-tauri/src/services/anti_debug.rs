#[cfg(target_os = "windows")]
pub fn spawn() {
    std::thread::spawn(|| {
        use windows_sys::Win32::System::Diagnostics::Debug::{IsDebuggerPresent, CheckRemoteDebuggerPresent};
        use windows_sys::Win32::System::Threading::GetCurrentProcess;
        
        loop {
            unsafe {
                if IsDebuggerPresent() != 0 {
                    tracing::error!("FATAL: Kernel Debugger detected via PEB.");
                    std::process::exit(1);
                }

                let mut is_remote_present = 0;
                let proc = GetCurrentProcess();
                if CheckRemoteDebuggerPresent(proc, &mut is_remote_present) != 0 {
                    if is_remote_present != 0 {
                        tracing::error!("FATAL: Remote Debugger detected via CheckRemoteDebuggerPresent.");
                        std::process::exit(1);
                    }
                }
            }
            std::thread::sleep(std::time::Duration::from_secs(3));
        }
    });
}

#[cfg(not(target_os = "windows"))]
pub fn spawn() {
}