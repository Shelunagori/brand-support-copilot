import { ChartColumn, GitCompareArrows, MessagesSquare, Repeat2, Workflow } from 'lucide-react';

export const NAV = [
  { to: '/chat', label: 'Support Chat', short: 'Chat', icon: MessagesSquare },
  { to: '/compare', label: 'Base vs Aligned', short: 'Compare', icon: GitCompareArrows },
  { to: '/pipeline', label: 'Alignment Pipeline', short: 'Pipeline', icon: Workflow },
  { to: '/eval', label: 'Eval Dashboard', short: 'Eval', icon: ChartColumn },
  { to: '/feedback', label: 'Feedback Loop', short: 'Feedback', icon: Repeat2 },
] as const;
