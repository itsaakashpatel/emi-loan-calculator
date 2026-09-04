import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { portfolioConfigured } from '../../lib/config';
import { useAuthStore } from '../../store/auth';
import { useTheme } from '../../theme/ThemeProvider';
import { Button, EmptyState, Label } from '../primitives';

/**
 * Wraps the Portfolio tab. Only this tab needs an account — every other tab
 * works offline with no sign-in, and that must stay true.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { colors, spacing } = useTheme();
  const hydrated = useAuthStore((s) => s.hydrated);
  const user = useAuthStore((s) => s.user);
  const signingIn = useAuthStore((s) => s.signingIn);
  const error = useAuthStore((s) => s.error);
  const signIn = useAuthStore((s) => s.signIn);

  // A build with no API URL or client ID cannot sign anyone in, so say that
  // rather than offer a button that fails.
  if (!portfolioConfigured) {
    return (
      <EmptyState
        icon="cloud-offline-outline"
        title="Portfolio is unavailable"
        message="This build has no portfolio service configured."
      />
    );
  }

  if (!hydrated) {
    return (
      <View style={{ paddingVertical: spacing.xxxl }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!user) {
    return (
      <EmptyState
        icon="briefcase-outline"
        title="Track your family portfolio"
        message="Sign in to keep mutual fund and stock holdings for everyone in the family, valued daily and synced across your devices."
        action={
          <View style={{ gap: spacing.sm, alignItems: 'center' }}>
            <Button
              label={signingIn ? 'Signing in…' : 'Sign in with Google'}
              icon="logo-google"
              disabled={signingIn}
              fullWidth={false}
              onPress={() => void signIn()}
            />
            {error ? (
              <Label size="caption" tone="negative" align="center">
                {error}
              </Label>
            ) : null}
          </View>
        }
      />
    );
  }

  return <>{children}</>;
}
