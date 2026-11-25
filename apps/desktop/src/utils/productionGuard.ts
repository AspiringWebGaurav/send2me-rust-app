/**
 * Production UI Lockdown Guard for Send2Me
 *
 * Requirements:
 * 1. Strictly blocks UI reload and hard refresh in production:
 *    - Ctrl + Shift + R / Cmd + Shift + R
 *    - Ctrl + F5 / Shift + F5 / Ctrl + Shift + F5 / Alt + F5 / F5
 *    - Ctrl + R / Cmd + R
 *    - BrowserRefresh / Refresh (multimedia keyboard keys)
 * 2. Strictly blocks browser devtools & source inspection in production:
 *    - F12
 *    - Ctrl + Shift + I / Ctrl + Shift + J / Ctrl + Shift + C
 *    - Ctrl + U (view-source)
 * 3. Strictly blocks browser auxiliary actions in production:
 *    - Ctrl + P (print)
 *    - Ctrl + S (save web page)
 *    - F3, Ctrl + F, Ctrl + G (browser search dialogs)
 *    - F7 (caret browsing)
 *    - Alt + LeftArrow / Alt + RightArrow (browser history navigation)
 * 4. Context Menu Protection in production:
 *    - Completely prevents native browser context menu (which exposes "Reload", "Back", "Inspect")
 *    - PRESERVES standard text editing context menu inside input, textarea, and contenteditable elements.
 */

export function isProductionEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  if (import.meta.env.PROD) return true;
  if (import.meta.env.DEV) return false;
  return import.meta.env.MODE === 'production';
}

export function isBlockedKey(e: KeyboardEvent): boolean {
  const key = (e.key || '').toLowerCase();
  const code = e.code || '';
  const isCtrlOrMeta = (e.ctrlKey || e.metaKey) && !e.altKey;

  // 1. Any F5 key press (F5, Ctrl+F5, Shift+F5, Ctrl+Shift+F5, Alt+F5)
  if (key === 'f5' || code === 'F5' || e.keyCode === 116 || e.which === 116) {
    return true;
  }

  // 2. Refresh multimedia keys
  if (key === 'browserrefresh' || key === 'refresh') {
    return true;
  }

  // 3. Ctrl+R / Ctrl+Shift+R / Cmd+R / Cmd+Shift+R
  if (isCtrlOrMeta && (key === 'r' || code === 'KeyR' || e.keyCode === 82 || e.which === 82)) {
    return true;
  }

  // 4. DevTools (F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C)
  if (key === 'f12' || code === 'F12' || e.keyCode === 123 || e.which === 123) {
    return true;
  }
  if (isCtrlOrMeta && e.shiftKey && (key === 'i' || key === 'j' || key === 'c' || code === 'KeyI' || code === 'KeyJ' || code === 'KeyC')) {
    return true;
  }

  // 5. Browser Print/Save/ViewSource (Ctrl+P, Ctrl+S, Ctrl+U)
  if (isCtrlOrMeta && (key === 'p' || key === 's' || key === 'u' || code === 'KeyP' || code === 'KeyS' || code === 'KeyU')) {
    return true;
  }

  // 6. Caret browsing / search / history navigation
  if (key === 'f7' || key === 'f3' || (isCtrlOrMeta && (key === 'f' || key === 'g'))) {
    return true;
  }
  if (e.altKey && (key === 'arrowleft' || key === 'arrowright' || code === 'ArrowLeft' || code === 'ArrowRight')) {
    return true;
  }

  return false;
}

export function isEditableElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toUpperCase();
  if (tag === 'INPUT') {
    const inputType = (target as HTMLInputElement).type?.toLowerCase();
    const nonTextTypes = ['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color', 'file', 'image'];
    return !nonTextTypes.includes(inputType);
  }
  if (tag === 'TEXTAREA') return true;
  if (target.isContentEditable) return true;
  if (typeof target.closest === 'function' && target.closest('[contenteditable="true"], .ProseMirror')) {
    return true;
  }
  return false;
}

export function installProductionLockdown(): () => void {
  if (typeof window === 'undefined') return () => {};

  if ((window as any).__SEND2ME_PRODUCTION_LOCKDOWN_INITIALIZED__) {
    return () => {};
  }
  (window as any).__SEND2ME_PRODUCTION_LOCKDOWN_INITIALIZED__ = true;

  const handleKey = (e: KeyboardEvent) => {
    if (!isProductionEnvironment()) return;

    if (isBlockedKey(e)) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
  };

  const handleContextMenu = (e: MouseEvent) => {
    if (!isProductionEnvironment()) return;

    if (!isEditableElement(e.target)) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
  };

  window.addEventListener('keydown', handleKey, { capture: true, passive: false });
  window.addEventListener('keyup', handleKey, { capture: true, passive: false });
  document.addEventListener('keydown', handleKey, { capture: true, passive: false });
  document.addEventListener('keyup', handleKey, { capture: true, passive: false });

  window.addEventListener('contextmenu', handleContextMenu, { capture: true, passive: false });
  document.addEventListener('contextmenu', handleContextMenu, { capture: true, passive: false });

  return () => {
    window.removeEventListener('keydown', handleKey, { capture: true });
    window.removeEventListener('keyup', handleKey, { capture: true });
    document.removeEventListener('keydown', handleKey, { capture: true });
    document.removeEventListener('keyup', handleKey, { capture: true });
    window.removeEventListener('contextmenu', handleContextMenu, { capture: true });
    document.removeEventListener('contextmenu', handleContextMenu, { capture: true });
    delete (window as any).__SEND2ME_PRODUCTION_LOCKDOWN_INITIALIZED__;
  };
}
