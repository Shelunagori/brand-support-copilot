import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Shell } from './components/layout/Shell';
import { WakeScreen } from './components/layout/WakeScreen';
import { useServerPhase } from './lib/serverStatus';
import { NAV } from './lib/nav';
import { ThemeProvider } from './lib/theme';
import { ToastProvider } from './lib/toast';
import { ChatPage } from './pages/ChatPage';
import { ComparePage } from './pages/ComparePage';
import { EvalPage } from './pages/EvalPage';
import { FeedbackPage } from './pages/FeedbackPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PipelinePage } from './pages/PipelinePage';

function Page({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, y: -6, filter: 'blur(2px)' }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** Routes that need the live API (chat); they show the wake-up screen while it sleeps. */
const LIVE_ROUTES = ['/', '/chat', '/compare'];

export function App() {
  const location = useLocation();
  const phase = useServerPhase();
  const waking = phase === 'waking' && LIVE_ROUTES.includes(location.pathname);

  useEffect(() => {
    const item = NAV.find((n) => n.to === location.pathname);
    document.title = waking
      ? 'Waking server · Urbane Threads Copilot'
      : item
        ? `${item.label} · Urbane Threads Copilot`
        : 'Urbane Threads Copilot';
    window.scrollTo({ top: 0 });
  }, [location.pathname, waking]);

  return (
    <MotionConfig reducedMotion="user">
      <ThemeProvider>
        <ToastProvider>
          {/*
            Cross-fade: the wake screen is a fixed overlay, so the app mounts underneath right away
            and the overlay fades out on top (no blank gap, nothing waits on the exit animation).
            Opacity only: a transform here would break the Shell's fixed/sticky children.
          */}
          <AnimatePresence initial={false}>
            {waking ? (
              <motion.div
                key="wake"
                className="fixed inset-0 z-[90] overflow-y-auto"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35 }}
              >
                <WakeScreen />
              </motion.div>
            ) : (
              <motion.div key="app" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                <Shell>
                  <AnimatePresence mode="wait" initial={false}>
                    <Routes location={location} key={location.pathname}>
                      <Route path="/" element={<Navigate to="/compare" replace />} />
                <Route path="/chat" element={<Page><ChatPage /></Page>} />
                      <Route path="/compare" element={<Page><ComparePage /></Page>} />
                      <Route path="/pipeline" element={<Page><PipelinePage /></Page>} />
                      <Route path="/eval" element={<Page><EvalPage /></Page>} />
                      <Route path="/feedback" element={<Page><FeedbackPage /></Page>} />
                      <Route path="*" element={<Page><NotFoundPage /></Page>} />
                    </Routes>
                  </AnimatePresence>
                </Shell>
              </motion.div>
            )}
          </AnimatePresence>
        </ToastProvider>
      </ThemeProvider>
    </MotionConfig>
  );
}
