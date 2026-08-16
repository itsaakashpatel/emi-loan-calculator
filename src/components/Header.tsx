import type Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { IconGlyph, Label } from './primitives';

/**
 * The round, frosted buttons that sit on the gradient in the corners of every screen. Fixed 44pt
 * so the glyph always has the same margin inside it, and it clears the 44pt touch-target minimum.
 */
export function CircleButton({
  icon,
  onPress,
  label,
  href,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  label: string;
  href?: string;
}) {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={onPress ?? (href ? () => router.push(href as never) : undefined)}
      style={({ pressed }) => [
        styles.circle,
        { backgroundColor: colors.headerButton, opacity: pressed ? 0.6 : 1 },
        styles.shadow,
      ]}
    >
      <IconGlyph name={icon} size={21} color={colors.text} />
    </Pressable>
  );
}

/**
 * Back chevron in a circle, top-left, as the cloned app uses on every detail screen.
 *
 * Falls back to the tab bar when there is nothing to pop — a screen opened cold or by deep link
 * would otherwise have a dead button that logs "GO_BACK was not handled".
 */
export function BackButton() {
  const router = useRouter();
  return (
    <CircleButton
      icon="chevron-back"
      label="Go back"
      onPress={() => {
        if (router.canGoBack()) router.back();
        else router.replace('/');
      }}
    />
  );
}

/**
 * Puts a circular action in a stack screen's top-right corner, mirroring the back button opposite
 * it. Use it for the screen's one primary action — exporting a PDF, say — so it stays reachable
 * without scrolling to the end of a long table.
 *
 * `onPress` is held in a ref, so an inline arrow at the call site does not re-register the button
 * on every render. Pass `enabled: false` to hide the button on a screen that has nothing to act on
 * — the hook still runs, so it stays above any early return.
 */
export function useHeaderAction({
  icon,
  label,
  onPress,
  enabled = true,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  /** Announced to VoiceOver. Required — the button shows no text. */
  label: string;
  onPress: () => void;
  enabled?: boolean;
}) {
  const navigation = useNavigation();
  const handler = useRef(onPress);
  handler.current = onPress;

  useEffect(() => {
    navigation.setOptions({
      headerRight: enabled
        ? () => <CircleButton icon={icon} label={label} onPress={() => handler.current()} />
        : undefined,
    });
  }, [navigation, icon, label, enabled]);
}

/**
 * Large left-aligned screen title with an optional circular action on the right — the header the
 * cloned app uses on its tab roots.
 */
export function LargeTitleHeader({
  title,
  action,
}: {
  title: string;
  action?: { icon: keyof typeof Ionicons.glyphMap; label: string; href?: string; onPress?: () => void };
}) {
  const { spacing } = useTheme();
  return (
    <View style={[styles.header, { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg }]}>
      <Label size="display" weight="bold" style={styles.title} numberOfLines={1}>
        {title}
      </Label>
      {action ? (
        <CircleButton
          icon={action.icon}
          label={action.label}
          {...(action.href ? { href: action.href } : null)}
          {...(action.onPress ? { onPress: action.onPress } : null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { flexShrink: 1 },
  shadow: {
    shadowColor: '#1B3A50',
    shadowOpacity: 0.09,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 2 },
  },
});
