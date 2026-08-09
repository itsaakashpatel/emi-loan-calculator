import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { Label } from './primitives';

export interface TileSpec {
  /** Route to push, e.g. `/loan/quick`. */
  href: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Kept to two short lines, as in the app being cloned. */
  label: string;
  /** Announced to VoiceOver in place of the bare label. */
  hint?: string;
}

/** Columns per row. Three matches the app being cloned and keeps labels readable at 402pt. */
const COLUMNS = 3;

/**
 * Grid of white tiles — the app's primary navigation. Rows are built explicitly rather than relying
 * on flex-wrap so a trailing partial row keeps the same tile width instead of stretching to fill.
 */
export function TileGrid({ tiles }: { tiles: readonly TileSpec[] }) {
  const { spacing } = useTheme();
  const rows: TileSpec[][] = [];
  for (let i = 0; i < tiles.length; i += COLUMNS) rows.push(tiles.slice(i, i + COLUMNS));

  return (
    <View style={{ gap: spacing.md }}>
      {rows.map((row, index) => (
        <View key={index} style={[styles.row, { gap: spacing.md }]}>
          {row.map((tile) => (
            <Tile key={tile.href} tile={tile} />
          ))}
          {/* Keep the last row's tiles at their natural width. */}
          {row.length < COLUMNS
            ? Array.from({ length: COLUMNS - row.length }, (_, i) => (
                <View key={`filler-${i}`} style={styles.tile} />
              ))
            : null}
        </View>
      ))}
    </View>
  );
}

function Tile({ tile }: { tile: TileSpec }) {
  const router = useRouter();
  const { colors, radius, spacing } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tile.hint ?? tile.label.replace(/\n/g, ' ')}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push(tile.href as never);
      }}
      style={({ pressed }) => [
        styles.tile,
        {
          backgroundColor: colors.surface,
          borderRadius: radius.xl,
          paddingVertical: spacing.lg,
          paddingHorizontal: spacing.sm,
          opacity: pressed ? 0.72 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
        styles.shadow,
      ]}
    >
      {/* Fixed icon box so every tile's glyph gets the same breathing room. */}
      <View style={styles.iconBox}>
        <Ionicons name={tile.icon} size={30} color={colors.accent} />
      </View>
      <Label size="caption" weight="medium" align="center" numberOfLines={2} style={styles.label}>
        {tile.label}
      </Label>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  tile: {
    flex: 1,
    minHeight: 122,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBox: { height: 46, width: 46, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  label: { lineHeight: 17 },
  shadow: {
    shadowColor: '#1B3A50',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
});
