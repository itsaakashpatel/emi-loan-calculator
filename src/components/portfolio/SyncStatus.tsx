import { View } from 'react-native';

import { usePortfolioStore } from '../../store/portfolio';
import { useTheme } from '../../theme/ThemeProvider';
import { Label } from '../primitives';

/** "just now", "12 minutes ago", "3 hours ago", "5 days ago". */
function relativeTime(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (!Number.isFinite(seconds) || seconds < 60) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * One line under the summary saying how current the figures are.
 *
 * Whether the numbers are today's matters as much as the numbers, so the two
 * states that mean "these are not live" — showing cached data, and a refresh
 * that failed — say so plainly rather than leaving a stale figure looking
 * fresh.
 */
export function SyncStatus() {
  const { spacing } = useTheme();
  const syncing = usePortfolioStore((s) => s.syncing);
  const offline = usePortfolioStore((s) => s.offline);
  const error = usePortfolioStore((s) => s.error);
  const lastSyncedAt = usePortfolioStore((s) => s.lastSyncedAt);

  const line = syncing
    ? 'Refreshing…'
    : offline
      ? 'Offline — showing saved figures'
      : error
        ? error
        : lastSyncedAt
          ? `Updated ${relativeTime(lastSyncedAt)}`
          : 'Pull down to refresh';

  return (
    <View style={{ paddingHorizontal: spacing.xs, paddingBottom: spacing.md }}>
      <Label size="micro" tone={error && !offline ? 'negative' : 'faint'}>
        {line}
      </Label>
    </View>
  );
}
