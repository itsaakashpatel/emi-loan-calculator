import type Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { IconChip, Label } from './primitives';

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
 * Grid of white tiles — the app's primary navigation.
 *
 * Tile width is measured from the container rather than left to flex. Flex distributes a partial
 * row unevenly (a trailing row of two rendered 5pt wider per tile than the full rows above it),
 * so every tile is given the same explicit width instead.
 */
export function TileGrid({ tiles }: { tiles: readonly TileSpec[] }) {
  const { spacing } = useTheme();
  const [gridWidth, setGridWidth] = useState(0);

  const gap = spacing.md;
  const tileWidth = gridWidth > 0 ? (gridWidth - gap * (COLUMNS - 1)) / COLUMNS : undefined;

  const rows: TileSpec[][] = [];
  for (let i = 0; i < tiles.length; i += COLUMNS) rows.push(tiles.slice(i, i + COLUMNS));

  const onLayout = (event: LayoutChangeEvent) => setGridWidth(event.nativeEvent.layout.width);

  return (
    <View style={{ gap }} onLayout={onLayout}>
      {rows.map((row, index) => (
        <View key={index} style={[styles.row, { gap }]}>
          {row.map((tile) => (
            <Tile key={tile.href} tile={tile} width={tileWidth} />
          ))}
        </View>
      ))}
    </View>
  );
}

function Tile({ tile, width }: { tile: TileSpec; width: number | undefined }) {
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
        // Before the first layout pass there is no measurement, so fall back to an even split.
        width === undefined ? styles.tileFallback : { width },
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
      <IconChip icon={tile.icon} size="lg" style={styles.iconBox} />
      <Label size="caption" weight="medium" align="center" numberOfLines={2} style={styles.label}>
        {tile.label}
      </Label>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  tile: {
    minHeight: 122,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileFallback: { flexGrow: 1, flexShrink: 1, flexBasis: 0 },
  iconBox: { marginBottom: 10 },
  label: { lineHeight: 17 },
  shadow: {
    shadowColor: '#1B3A50',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
});
