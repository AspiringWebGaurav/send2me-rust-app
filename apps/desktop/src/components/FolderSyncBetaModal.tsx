import { useState, useEffect } from "react";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";
import { HardDrive, CheckCircle2 } from "lucide-react";
import { Progress } from "./ui/Progress";
import { useSettingsStore } from "../stores/useSettingsStore";

type Step = 'eula' | 'installing' | 'completed';
import { invoke } from '@tauri-apps/api/core';

export function FolderSyncBetaModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [step, setStep] = useState<Step>('eula');
  const [agreed, setAgreed] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [isFetching, setIsFetching] = useState(true);

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setStep('eula');
      setAgreed(false);
      setProgress(0);
      setStatusText("");
      setIsFetching(true);
      const timer = setTimeout(() => setIsFetching(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleInstall = () => {
    setStep('installing');
    
    // Fake installation sequence
    const sequence = [
      { p: 5, t: "Initializing setup...", delay: 400 },
      { p: 15, t: "Extracting folder-sync engine components...", delay: 800 },
      { p: 35, t: "Registering background daemon...", delay: 600 },
      { p: 50, t: "Applying registry configurations...", delay: 700 },
      { p: 75, t: "Optimizing network topology for APTE...", delay: 1000 },
      { p: 90, t: "Finalizing installation...", delay: 600 },
      { p: 100, t: "Done.", delay: 400 },
    ];

    let currentDelay = 0;
    sequence.forEach(({ p, t, delay }, index) => {
      currentDelay += delay;
      setTimeout(() => {
        setProgress(p);
        setStatusText(t);
        if (index === sequence.length - 1) {
          setTimeout(async () => {
            try {
              await invoke('activate_background_daemon');
            } catch (e) {
              console.error("Failed to activate background daemon:", e);
            }
            setStep('completed');
            useSettingsStore.getState().updateSettings({ folderSyncInstalled: true });
          }, 600);
        }
      }, currentDelay);
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={step === 'installing' ? () => {} : onClose} className="!max-w-none !w-screen !h-screen !rounded-none flex flex-col md:p-16 p-8">
      {isFetching ? (
        <div className="flex flex-col items-center justify-center flex-1 h-full min-h-[400px] space-y-5">
          <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
          <p className="text-muted-foreground animate-pulse text-sm font-medium tracking-wide">Fetching security agreement from server...</p>
        </div>
      ) : (
        <div className="flex flex-col text-left space-y-4 h-full">
        
        {/* Header - Installer Style */}
        <div className="flex items-center gap-4 pb-4 border-b border-border/40 shrink-0">
          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20 shadow-inner">
            <HardDrive className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              {step === 'eula' && "Folder Sync (Beta) Setup"}
              {step === 'installing' && "Installing..."}
              {step === 'completed' && "Installation Complete"}
            </h2>
            <p className="text-muted-foreground text-sm mt-0.5">
              {step === 'eula' && "Please read the following license agreement carefully."}
              {step === 'installing' && "Please wait while Setup installs Folder Sync on your computer."}
              {step === 'completed' && "Setup has finished installing the module."}
            </p>
          </div>
        </div>

        {/* EULA Step */}
        {step === 'eula' && (
          <div className="flex flex-col flex-1 min-h-0 pt-2 space-y-4">
            <div className="flex-1 bg-background border border-border/80 rounded-md p-6 text-sm text-muted-foreground overflow-y-auto whitespace-pre-wrap font-mono leading-relaxed select-text shadow-inner">
{`END USER LICENSE AGREEMENT & BETA WAIVER

IMPORTANT-READ CAREFULLY: This End-User License Agreement ("EULA") is a legal agreement between you and the developer (Gaurav) for the Folder Sync software component. By clicking "I accept", you are bound by these strict terms.

1. BETA SOFTWARE NOTIFICATION
This feature is in active BETA development. It is highly experimental and provided "AS IS". There is no dedicated QA team. You are acting as a voluntary tester.

2. EXTREME RISK OF DATA LOSS & STRICT 1-TO-1 SYNC
This software actively monitors and modifies files on your local filesystem to maintain a STRICT 1-TO-1 MIRROR between devices. 
- If a file is deleted on one device, it will be PERMANENTLY DELETED on all bonded devices. 
- There is NO ".sync_trash" and NO recycle bin recovery. Deletions are absolute, instant, and irreversible.
- Bugs, crashes, or network interruptions could result in unintended file deletion, irreversible file corruption, or catastrophic data loss.

3. TOTAL WAIVER OF LIABILITY
By using this beta feature, you expressly assume ALL risks. You agree to ALWAYS back up your data to an offline location before establishing a sync relationship. Under NO circumstances shall the developer (Gaurav) be held liable for any damages, lost data, system failure, or loss of profits arising out of the use or inability to use this feature. ALL liability rests entirely on the user and the user's device.

4. USER RESPONSIBILITY
You acknowledge that you are solely responsible for ensuring the compatibility of this software with your operating system and network setup. Any damage to your device or data resulting from the download or use of this software is your sole responsibility.

5. PRIVACY POLICY & DATA USAGE
Folder Sync transfers data peer-to-peer using encrypted tunnels. No data is stored on external servers. However, during beta, diagnostic crash logs and network state information may be saved locally on your device for debugging purposes.

6. NO WARRANTY
The software is provided "AS IS", without warranty of any kind, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose, and non-infringement.

By clicking "I accept", you acknowledge that you have read this agreement, fully understand the extreme risks, and unconditionally agree to be bound by its terms.`}
            </div>

            <div className="shrink-0 pt-2">
              <label className="flex items-start gap-3 cursor-pointer group mt-2">
                <div className="relative flex items-center mt-0.5">
                  <input 
                    type="checkbox" 
                    className="peer sr-only"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                  />
                  <div className="w-5 h-5 border-2 border-muted-foreground rounded bg-background peer-checked:bg-primary peer-checked:border-primary transition-colors flex items-center justify-center group-hover:border-primary/70">
                    {agreed && <CheckCircle2 className="w-4 h-4 text-primary-foreground absolute" strokeWidth={4} />}
                  </div>
                </div>
                <span className="text-base font-medium select-none group-hover:text-foreground transition-colors">
                  I accept all risks and terms in the License Agreement
                </span>
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-border/40 shrink-0">
              <Button variant="ghost" onClick={onClose} size="lg" className="px-8 text-base">Cancel</Button>
              <Button onClick={handleInstall} disabled={!agreed} size="lg" className="px-8 font-semibold shadow-md text-base">Install</Button>
            </div>
          </div>
        )}

        {/* Installing Step */}
        {step === 'installing' && (
          <div className="flex flex-col flex-1 justify-center space-y-6 pt-6 pb-2 min-h-[300px]">
            <div className="space-y-4 max-w-2xl mx-auto w-full">
              <div className="flex items-center justify-between text-sm font-medium text-foreground">
                <span className="truncate pr-4">{statusText || "Preparing..."}</span>
                <span className="tabular-nums shrink-0 text-primary">{progress}%</span>
              </div>
              <Progress value={progress} className="h-3 w-full" />
            </div>
            
            <div className="flex-1" />
            
            <div className="flex justify-end gap-3 pt-6 border-t border-border/40 shrink-0">
              <Button variant="ghost" disabled size="lg" className="px-8 opacity-50 text-base">Cancel</Button>
              <Button disabled size="lg" className="px-8 opacity-50 text-base">Install</Button>
            </div>
          </div>
        )}

        {/* Completed Step */}
        {step === 'completed' && (
          <div className="flex flex-col flex-1 pt-4 pb-2 min-h-[300px]">
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6">
              <div className="w-24 h-24 rounded-full bg-success/15 flex items-center justify-center animate-[scale-check_0.4s_cubic-bezier(0.175,0.885,0.32,1.275)_forwards]">
                <CheckCircle2 className="w-12 h-12 text-success" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-foreground">Setup Successful</h3>
                <p className="text-base text-muted-foreground max-w-md mx-auto leading-relaxed">
                  The Folder Sync module has been installed and configured. It is now ready for beta testing.
                </p>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 pt-6 border-t border-border/40 shrink-0">
              <Button onClick={onClose} size="lg" className="px-10 font-bold shadow-md text-base" variant="default">Finish</Button>
            </div>
          </div>
        )}
      </div>
      )}
    </Modal>
  );
}
