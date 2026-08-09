import { StyleSheet, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import { Label } from './primitives';

/**
 * Reusable, theme-aware table that always fits the screen width.
 *
 * Unlike a hand-rolled table dropped inside a horizontal `ScrollView`, columns here share the
 * available width via flex, so nothing gets clipped and nothing needs a scroll affordance the app
 * never draws. Callers are expected to keep the currency unit in the column header (e.g.
 * `INVESTED (₹)`) and pass already-formatted, unsymboled numbers as cell strings — this component
 * only lays strings out, it does not format them.
 */
export interface DataTableColumn {
  key: string;
  label: string;
  align?: 'left' | 'right';
  /** Relative width share. Defaults to 1.3 for the first column, 1 for the rest. */
  flex?: number;
}

interface DataTableProps {
  columns: DataTableColumn[];
  rows: string[][];
  caption?: string;
}

export function DataTable({ columns, rows, caption }: DataTableProps) {
  const { colors, spacing } = useTheme();

  const flexFor = (column: DataTableColumn | undefined, index: number) =>
    column?.flex ?? (index === 0 ? 1.3 : 1);
  const alignFor = (column: DataTableColumn | undefined, index: number) =>
    column?.align ?? (index === 0 ? 'left' : 'right');

  return (
    <View>
      <View
        style={[
          styles.row,
          {
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.border,
            paddingHorizontal: spacing.sm,
            paddingBottom: spacing.sm,
          },
        ]}
      >
        {columns.map((column, index) => (
          <Label
            key={column.key}
            size="micro"
            tone="faint"
            weight="semibold"
            align={alignFor(column, index)}
            numberOfLines={1}
            style={{ flex: flexFor(column, index) }}
          >
            {column.label.toUpperCase()}
          </Label>
        ))}
      </View>

      {rows.map((row, rowIndex) => (
        <View
          key={rowIndex}
          style={[
            styles.row,
            {
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: colors.border,
              backgroundColor: rowIndex % 2 === 1 ? colors.surfaceAlt : 'transparent',
              paddingHorizontal: spacing.sm,
              paddingVertical: spacing.sm,
            },
          ]}
        >
          {row.map((cell, cellIndex) => {
            const column = columns[cellIndex];
            return (
              <Label
                key={cellIndex}
                size="caption"
                tone={cellIndex === 0 ? 'default' : 'muted'}
                align={alignFor(column, cellIndex)}
                tabular={cellIndex !== 0}
                numberOfLines={1}
                style={{ flex: flexFor(column, cellIndex) }}
              >
                {cell}
              </Label>
            );
          })}
        </View>
      ))}

      {caption ? (
        <Label size="micro" tone="faint" style={{ marginTop: spacing.sm, paddingHorizontal: spacing.sm }}>
          {caption}
        </Label>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});
