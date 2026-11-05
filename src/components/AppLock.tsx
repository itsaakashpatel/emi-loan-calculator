import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, StyleSheet, View } from 'react-native';

import { canLock, unlock } from '../app-lock';
import { useSettingsStore } from '../store/settings';
import { useTheme } from '../theme/ThemeProvider';
import { GradientBackdrop } from './Screen';
import { Button, IconGlyph, Label } from './primitives';

/**
 * Covers the app until Face ID or the passcode succeeds, when the lock is on. It locks on launch and
 * each time the app goes to the background, so the app switcher does not show loan figures either.
 *
 * If the phone has no Face ID, Touch ID or passcode, the lock cannot work and does not cover the
 * app: a lock with no key would shut the user out of their own data.
 */
export function AppLockGate({ children }: { children: ReactNode }) {
  const enabled = useSettingsStore((s) => s.appLock);
  const [locked, setLocked] = useState(enabled);
  const prompting = useRef(false);

  const tryUnlock = useCallback(async () => {
    if (prompting.current) return;
    prompting.current = true;
    try {
      if (!(await canLock())) {
        setLocked(false);
        return;
      }
      if (await unlock('Unlock EMI Calculator')) setLocked(false);
    } finally {
      prompting.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) setLocked(false);
  }, [enabled]);

  useEffect(() => {
    if (locked && enabled) void tryUnlock();
  }, [locked, enabled, tryUnlock]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      // The Face ID sheet makes the app `inactive`, so only a real trip to the background locks it.
      if (state === 'background' && useSettingsStore.getState().appLock) setLocked(true);
    });
    return () => subscription.remove();
  }, []);

  return (
    <View style={styles.flex}>
      {children}
      {locked && enabled ? <LockScreen onUnlock={() => void tryUnlock()} /> : null}
    </View>
  );
}

function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: colors.bg }]}>
      <GradientBackdrop />
      <IconGlyph name="lock-closed" size={44} color={colors.accent} />
      <Label size="title" weight="bold" align="center" style={{ marginTop: spacing.lg }}>
        EMI Calculator is locked
      </Label>
      <Label size="caption" tone="muted" align="center" style={{ marginTop: spacing.xs, marginBottom: spacing.xl }}>
        Use Face ID or your passcode to see your loans.
      </Label>
      <Button label="Unlock" icon="scan-outline" fullWidth={false} onPress={onUnlock} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 32 },
});
