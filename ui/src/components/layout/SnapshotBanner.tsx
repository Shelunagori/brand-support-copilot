import { motion } from 'framer-motion';
import { Archive } from 'lucide-react';
import { dateTime } from '../../lib/format';
import { useServerPhase } from '../../lib/serverStatus';
import { useSnapshotInfo } from '../../lib/snapshot';

/** Slim notice on the read-only screens while they render from the saved snapshot. */
export function SnapshotBanner() {
  const phase = useServerPhase();
  const snap = useSnapshotInfo();
  if (phase !== 'waking' || !snap?.generated_at) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      role="status"
      className="mb-5 flex items-center gap-2.5 rounded-xl border border-warn/25 bg-warn/[0.06] px-3 py-2 text-[13px] text-ink-muted"
      title={snap.source ? `Snapshot source: ${snap.source}` : undefined}
    >
      <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
        <span className="absolute inset-0 animate-ping rounded-full bg-warn/60" />
        <span className="relative h-2 w-2 rounded-full bg-warn" />
      </span>
      <Archive className="h-3.5 w-3.5 shrink-0 text-warn" aria-hidden />
      <p className="min-w-0">
        <span className="font-medium text-ink">Live server waking up</span>
        <span className="text-ink-subtle"> · </span>
        showing saved snapshot from <span className="num whitespace-nowrap text-ink">{dateTime(snap.generated_at)}</span>
      </p>
    </motion.div>
  );
}
