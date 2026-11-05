import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, StyleSheet, View } from 'react-native';

import { canLock, unlockWithOutcome } from '../app-lock';
import { useSettingsStore } from '../store/settings';
import { useTheme } from '../theme/ThemeProvider';
import { GradientBackdrop } from './Screen';
import { Button, IconGlyph, Label } from './primitives';

/** Wait before the first prompt, so the app is fully in front when iOS draws the Face ID sheet. */
const PROMPT_DELAY_MS = 350;
const MAX_TRIES = 4;

/**
 * Covers the app until Face ID or the passcode succeeds, when the lock is on. It locks on launch and
 * each time the app goes to the background, so the app switcher does not show loan figures either.
 * Face ID starts by itself on launch and on return to the app; the Unlock button is only the way
 * back after the user cancels. Face ID falls back to the passcode.
 *
 * If the phone has no Face ID, Touch ID or passcode, the lock cannot work and does not cover the
 * app: a lock with no key would shut the user out of their own data.
 */
export function AppLockGate({ children }: { children: ReactNode }) {
  const enabled = useSettingsStore((s) => s.appLock);
  const [locked, setLocked] = useState(enabled);
  const lockedRef = useRef(locked);
  const prompting = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  lockedRef.current = locked;

  const tryUnlock = useCallback(async () => {
    if (prompting.current) return;
    prompting.current = true;
    try {
      if (!(await canLock())) {
        setLocked(false);
        return;
      }
      for (let attempt = 0; attempt < MAX_TRIES; attempt += 1) {
        // The prompt only works while the app is in front. If the user left, the next return asks again.
        if (AppState.currentState !== 'active') return;
        const outcome = await unlockWithOutcome('Unlock EMI Calculator');
        if (outcome.success) {
          setLocked(false);
          return;
        }
        if (!outcome.retry) return;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } finally {
      prompting.current = false;
    }
  }, []);

  const promptSoon = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (lockedRef.current) void tryUnlock();
    }, PROMPT_DELAY_MS);
  }, [tryUnlock]);

  useEffect(() => {
    if (!enabled) setLocked(false);
  }, [enabled]);

  // Launch, and the moment the lock turns on while the app is open.
  useEffect(() => {
    if (locked && enabled && AppState.currentState === 'active') promptSoon();
  }, [locked, enabled, promptSoon]);

  useEffect(() => {
    let wentToBackground = false;
    const subscription = AppState.addEventListener('change', (state) => {
      // The Face ID sheet makes the app `inactive`, so only a real trip to the background locks it.
      if (state === 'background' && useSettingsStore.getState().appLock) {
        wentToBackground = true;
        setLocked(true);
      }
      // Back in front after a trip to the background: ask at once. A cancelled prompt only
      // bounces through `inactive`, so it never lands here and never loops.
      if (state === 'active' && wentToBackground) {
        wentToBackground = false;
        if (useSettingsStore.getState().appLock) promptSoon();
      }
    });
    return () => {
      subscription.remove();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [promptSoon]);

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
      <Button label="Unlock" icon="scan-outline" fullWidth={false} onPress={onUnlock} style={styles.unlock} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 32 },
  // `fullWidth={false}` pins a button to the left edge; centre it under the text.
  unlock: { alignSelf: 'center', paddingHorizontal: 40 },
});
