import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'

// Browser preview compatibility layer:
// If running in a regular web browser (outside native Tauri webview),
// safely mock Tauri IPC so the UI functions cleanly without errors.
if (typeof window !== 'undefined' && !(window as any).__TAURI_INTERNALS__) {
  (window as any).__TAURI_INTERNALS__ = {
    invoke: async (cmd: string, args?: any) => {
      console.log(`[Browser Mock Tauri IPC] ${cmd}`, args);
      switch (cmd) {
        case 'get_hardware_id':
        case 'get_machine_hwid': {
          let devId = localStorage.getItem('send2me_dev_hwid');
          if (!devId) {
            devId = 'dev-node-' + Math.random().toString(36).substring(2, 10);
            localStorage.setItem('send2me_dev_hwid', devId);
          }
          return devId;
        }
        case 'get_app_info':
          return { name: 'Send2Me', version: '0.1.8', os: 'Windows', arch: 'x64' };
        case 'get_settings_cached':
        case 'get_settings':
          return {
            auto_accept: false,
            download_dir: 'Downloads',
            device_name: 'Send2Me-Local-Dev',
            port: 8080,
            notifications_enabled: true
          };
        case 'get_my_device_info':
          return {
            id: 'dev-node-001',
            name: 'Send2Me Local PC',
            os: 'Windows 11',
            ip: '127.0.0.1'
          };
        case 'get_security_state':
          return {
            status: 'active',
            last_online: Date.now()
          };
        case 'get_app_info':
          return {
            version: '0.1.8'
          };
        case 'get_trusted_devices':
        case 'get_bonded_devices':
        case 'get_peers':
        case 'get_active_transfers':
        case 'get_transfers':
        case 'get_transfer_history':
        case 'get_history':
          return [];
        case 'get_hardware_snapshot':
          return {
            severity: 'nominal',
            cpuPercent: 14,
            memoryPercent: 32,
            hint: '',
            sustainedMs: 0
          };
        case 'check_firewall_permission':
        case 'request_firewall_permission':
          return true;
        case 'activate_background_daemon':
          return true;
        default:
          return [];
      }
    },
    transformCallback: () => () => {},
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

