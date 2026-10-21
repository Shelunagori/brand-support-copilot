import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { Shell } from './components/layout/Shell';
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

export function App() {
  const location = useLocation();

  useEffect(() => {
    const item = NAV.find((n) => n.to === location.pathname);
    document.title = item ? `${item.label} · Urbane Threads Copilot` : 'Urbane Threads Copilot';
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <MotionConfig reducedMotion="user">
      <ThemeProvider>
        <ToastProvider>
          <Shell>
            <AnimatePresence mode="wait" initial={false}>
              <Routes location={location} key={location.pathname}>
                <Route path="/" element={<Page><ChatPage /></Page>} />
                <Route path="/compare" element={<Page><ComparePage /></Page>} />
                <Route path="/pipeline" element={<Page><PipelinePage /></Page>} />
                <Route path="/eval" element={<Page><EvalPage /></Page>} />
                <Route path="/feedback" element={<Page><FeedbackPage /></Page>} />
                <Route path="*" element={<Page><NotFoundPage /></Page>} />
              </Routes>
            </AnimatePresence>
          </Shell>
        </ToastProvider>
      </ThemeProvider>
    </MotionConfig>
  );
}
