import { AnimatePresence, motion } from 'framer-motion';
import { useNotificationStore } from '../../stores/useNotificationStore';
import { CheckCircle, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

export function ToastContainer() {
  const notifications = useNotificationStore(s => s.notifications);
  const removeNotification = useNotificationStore(s => s.removeNotification);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      <AnimatePresence initial={false}>
        {notifications.map((notif) => (
          <motion.div
            key={notif.id}
            layout
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="glass-panel pointer-events-auto flex items-start gap-3 p-4 rounded-xl shadow-[var(--shadow-e3)]"
          >
            {notif.type === 'success' && <CheckCircle className="w-4 h-4 text-success shrink-0 mt-0.5" />}
            {notif.type === 'error' && <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />}
            {notif.type === 'warning' && <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />}
            {notif.type === 'info' && <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />}

            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm leading-snug">{notif.title}</p>
              {notif.message && <p className="text-xs text-muted-foreground mt-0.5 break-words leading-relaxed">{notif.message}</p>}
            </div>

            <button
              onClick={() => removeNotification(notif.id)}
              aria-label="Dismiss notification"
              className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
