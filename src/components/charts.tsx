import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, G, Line, Rect, Text as SvgText } from 'react-native-svg';

import { formatCompact } from '../lib/format/money';
import { useCurrency } from '../store/settings';
import { useTheme } from '../theme/ThemeProvider';
import { Label } from './primitives';

/* ------------------------------------------------------------------ *
 * Pure layout maths. Kept free of React so it can be unit tested and
 * so the SVG components stay declarative. See __tests__/charts.test.ts.
 * ------------------------------------------------------------------ */

/** Average glyph width as a fraction of the font size, for the system UI font at small sizes. */
export const GLYPH_WIDTH_RATIO = 0.58;

/** Fallback width when a caller neither passes nor lets us measure a width. */
export const DEFAULT_CHART_WIDTH = 300;

/** Below this there is no room for anything; clamps degenerate layouts instead of going negative. */
export const MIN_CHART_WIDTH = 120;

/** Room for one line of axis text above the top gridline so its label is not clipped. */
export const CHART_TOP_PAD = 10;

/** Strip below the plot that holds the x-axis labels. */
export const CHART_X_LABEL_HEIGHT = 18;

/** Cheap text measurement — react-native-svg gives us no synchronous metrics. */
export function estimateTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * GLYPH_WIDTH_RATIO;
}

/**
 * Width reserved on the left for y-axis labels, sized from the widest label rather than hardcoded
 * (a "₹23.2 L" tick needs noticeably more room than "$40 K").
 */
export function axisGutter(labels: readonly string[], fontSize: number, pad = 8): number {
  if (labels.length === 0) return 0;
  const widest = labels.reduce((max, label) => Math.max(max, estimateTextWidth(label, fontSize)), 0);
  return Math.ceil(widest + pad);
}

export interface BarLayout {
  /** Left gutter, echoed back so callers only need one object. */
  gutter: number;
  barWidth: number;
  gap: number;
  /** Distance between the left edges of consecutive bars. */
  pitch: number;
  /** Total intrinsic width, guaranteed `<= width`. */
  chartWidth: number;
}

export interface BarLayoutInput {
  /** Available width, in points. */
  width: number;
  count: number;
  gutter: number;
  maxBarWidth?: number;
  minBarWidth?: number;
  preferredGap?: number;
}

/**
 * Fits `count` bars into `width`. Bars get their preferred size while there is room; past that the
 * gap shrinks first and the bar width only afterwards, down to `minBarWidth`. The result never
 * exceeds `width`, so a 21-year schedule can no longer run past the edge of its card.
 */
export function computeBarLayout({
  width,
  count,
  gutter,
  maxBarWidth = 28,
  minBarWidth = 3,
  preferredGap = 6,
}: BarLayoutInput): BarLayout {
  const safeWidth = Math.max(MIN_CHART_WIDTH, width);
  const plotWidth = Math.max(0, safeWidth - gutter);
  if (count <= 0 || plotWidth <= 0) {
    return { gutter, barWidth: 0, gap: 0, pitch: 0, chartWidth: Math.min(safeWidth, gutter) };
  }

  const naturalPitch = plotWidth / count;
  let barWidth: number;
  let gap: number;

  if (naturalPitch >= maxBarWidth + preferredGap) {
    // Plenty of room: keep bars readable and leave the surplus unused rather than stretching them.
    barWidth = maxBarWidth;
    gap = preferredGap;
  } else {
    gap = Math.min(preferredGap, naturalPitch * 0.2);
    barWidth = naturalPitch - gap;
    if (barWidth < minBarWidth) {
      // Give up the gap entirely before letting bars become invisible.
      barWidth = Math.min(minBarWidth, naturalPitch);
      gap = Math.max(0, naturalPitch - barWidth);
    }
  }

  const pitch = barWidth + gap;
  const chartWidth = Math.min(safeWidth, gutter + count * pitch);
  return { gutter, barWidth, gap, pitch, chartWidth };
}

/** How many bars to step between drawn x-axis labels so neighbours never touch. */
export function labelStride(count: number, pitch: number, labelWidth: number, minSpacing = 4): number {
  if (count <= 1 || pitch <= 0) return 1;
  return Math.max(1, Math.ceil((labelWidth + minSpacing) / pitch));
}

/**
 * Indices to label, stepping by `stride` but always keeping the first and last bar. The last
 * regular step is dropped when it would crowd the final label.
 */
export function thinLabelIndices(count: number, stride: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [0];
  const step = Math.max(1, Math.floor(stride));
  const last = count - 1;
  const indices: number[] = [];
  for (let i = 0; i <= last; i += step) indices.push(i);

  const tail = indices[indices.length - 1]!;
  if (tail !== last) {
    if (last - tail < step && indices.length > 1) indices.pop();
    indices.push(last);
  }
  return indices;
}

/**
 * Drops any label that would still touch its neighbour after `xLabelPlacement` has clamped the
 * edge ones inward.
 *
 * `labelStride` only reasons about the even bar pitch, so it cannot see that clamping the final
 * label pulls it back towards its neighbour — which is how a 21-year schedule ended up drawing
 * "2044" over "2046". This walks the real placements and resolves what is left.
 *
 * The last label is the one worth keeping (it carries the end of the range), so a collision at the
 * tail drops the label before it instead.
 */
export function dropCollidingLabels(
  candidates: readonly { index: number; x: number; anchor: TextAnchor }[],
  labelWidth: number,
  minSpacing = 4,
): number[] {
  if (candidates.length <= 1) return candidates.map((candidate) => candidate.index);

  const left = (c: { x: number; anchor: TextAnchor }) =>
    c.anchor === 'start' ? c.x : c.anchor === 'end' ? c.x - labelWidth : c.x - labelWidth / 2;
  const right = (c: { x: number; anchor: TextAnchor }) => left(c) + labelWidth;

  const kept = [candidates[0]!];
  for (let i = 1; i < candidates.length; i += 1) {
    const candidate = candidates[i]!;
    const previous = kept[kept.length - 1]!;
    if (left(candidate) >= right(previous) + minSpacing) {
      kept.push(candidate);
      continue;
    }
    // Only the final label outranks what precedes it, and never the very first one.
    if (i === candidates.length - 1 && kept.length > 1) {
      kept.pop();
      kept.push(candidate);
    }
  }
  return kept.map((candidate) => candidate.index);
}

export type TextAnchor = 'start' | 'middle' | 'end';

/** Clamps an x-axis label so edge labels stay inside the SVG instead of being sliced off. */
export function xLabelPlacement(
  centerX: number,
  labelWidth: number,
  chartWidth: number,
): { x: number; anchor: TextAnchor } {
  const half = labelWidth / 2;
  if (centerX - half < 0) return { x: 0, anchor: 'start' };
  if (centerX + half > chartWidth) return { x: chartWidth, anchor: 'end' };
  return { x: centerX, anchor: 'middle' };
}

/**
 * Angle of the middle of a slice spanning `[startFraction, endFraction]` of the circle, in radians,
 * measured from the positive x-axis with 12 o'clock at `-π/2` (matching the donut's -90° rotation).
 */
export function sliceMidAngle(startFraction: number, endFraction: number): number {
  return 2 * Math.PI * ((startFraction + endFraction) / 2) - Math.PI / 2;
}

export interface SliceLabel {
  index: number;
  fraction: number;
  text: string;
  x: number;
  y: number;
}

/**
 * Positions a percentage label at the middle of each slice's stroke band. Slices thinner than
 * `minFraction` are skipped — the text would spill over its neighbours.
 *
 * Returns `[]` when the ring simply cannot hold the text. On-ring labels only work on a large
 * donut: at a 3-o'clock slice midpoint the label straddles the ring, so it needs roughly its own
 * width of room inside the SVG, and it must be no taller than the stroke is thick. A compact donut
 * beside a column of text fails both tests, and drawing anyway clips "52.0%" down to "2.0".
 */
export function donutSliceLabels(
  values: readonly number[],
  size: number,
  thickness: number,
  minFraction = 0.08,
  fontSize = 11,
): SliceLabel[] {
  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (total <= 0) return [];

  // A slice centred at 3 o'clock puts its label at x = size - thickness/2, so half the text hangs
  // past the edge unless thickness/2 >= half the text width. The band, not the diameter, is the
  // binding constraint: the widest label is "100%".
  const widestLabel = estimateTextWidth('100%', fontSize);
  if (thickness < widestLabel || size < thickness * 3) return [];

  const center = size / 2;
  // Centre of the stroke band: the stroke straddles the circle radius, so that radius is the middle.
  const midRadius = (size - thickness) / 2;

  const labels: SliceLabel[] = [];
  let cursor = 0;
  values.forEach((value, index) => {
    const fraction = Math.max(0, value) / total;
    const start = cursor;
    cursor += fraction;
    if (fraction < minFraction) return;
    const angle = sliceMidAngle(start, cursor);
    const x = center + midRadius * Math.cos(angle);
    const half = estimateTextWidth(`${Math.round(fraction * 100)}%`, fontSize) / 2;
    labels.push({
      index,
      fraction,
      // Whole percents: a decimal place buys nothing here and costs the width that clips it.
      text: `${Math.round(fraction * 100)}%`,
      // Keep the text inside the SVG even when the slice midpoint sits at 3 or 9 o'clock.
      x: Math.min(Math.max(x, half), size - half),
      y: center + midRadius * Math.sin(angle),
    });
  });
  return labels;
}

/* ------------------------------------------------------------------ *
 * Components
 * ------------------------------------------------------------------ */

export interface Slice {
  label: string;
  value: number;
  color: string;
}

/**
 * Donut built from stroked arcs on a single circle: each slice is a dash of the right length,
 * rotated into place. Avoids any path maths and any charting dependency.
 */
export function DonutChart({
  slices,
  size = 148,
  thickness = 20,
  centerLabel,
  centerValue,
  showPercentages = false,
  percentageColor,
}: {
  slices: Slice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
  /** Prints each slice's share on the slice itself, skipping slices too thin to hold the text. */
  showPercentages?: boolean;
  /** Overrides the on-slice text colour. Defaults to the theme's on-accent ink. */
  percentageColor?: string;
}) {
  const { colors, fontSize } = useTheme();
  const total = slices.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  let offset = 0;
  const arcs = slices.map((slice) => {
    const fraction = total > 0 ? Math.max(0, slice.value) / total : 0;
    const length = fraction * circumference;
    const arc = { ...slice, length, offset };
    offset += length;
    return arc;
  });

  const sliceLabelSize = fontSize.micro;
  const sliceLabels = showPercentages
    ? donutSliceLabels(
        slices.map((slice) => slice.value),
        size,
        thickness,
      )
    : [];

  return (
    <View style={[styles.donutWrap, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        {/* -90deg puts the first slice at 12 o'clock. */}
        <G rotation={-90} origin={`${center}, ${center}`}>
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={colors.track}
            strokeWidth={thickness}
            fill="none"
          />
          {arcs.map((arc) => (
            <Circle
              key={arc.label}
              cx={center}
              cy={center}
              r={radius}
              stroke={arc.color}
              strokeWidth={thickness}
              strokeDasharray={`${arc.length} ${circumference - arc.length}`}
              strokeDashoffset={-arc.offset}
              strokeLinecap="butt"
              fill="none"
            />
          ))}
        </G>
        {/* Drawn outside the rotated group: sliceMidAngle already accounts for the -90deg start. */}
        {sliceLabels.map((label) => (
          <SvgText
            key={`pct-${label.index}`}
            x={label.x}
            y={label.y}
            dy={sliceLabelSize * 0.35}
            fill={percentageColor ?? colors.onAccent}
            fontSize={sliceLabelSize}
            fontWeight="700"
            textAnchor="middle"
          >
            {label.text}
          </SvgText>
        ))}
      </Svg>
      {centerValue ? (
        <View style={styles.donutCenter} pointerEvents="none">
          {centerLabel ? (
            <Label size="micro" tone="faint">
              {centerLabel}
            </Label>
          ) : null}
          <Label size="subhead" weight="bold" tabular>
            {centerValue}
          </Label>
        </View>
      ) : null}
    </View>
  );
}

/** Circular progress arc, used for "x of y installments paid". */
export function ProgressRing({
  pct,
  size = 44,
  thickness = 5,
  color,
}: {
  pct: number;
  size?: number;
  thickness?: number;
  color?: string;
}) {
  const { colors } = useTheme();
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, pct));
  const filled = (clamped / 100) * circumference;
  const center = size / 2;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <G rotation={-90} origin={`${center}, ${center}`}>
          <Circle cx={center} cy={center} r={radius} stroke={colors.track} strokeWidth={thickness} fill="none" />
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={color ?? colors.accent}
            strokeWidth={thickness}
            strokeDasharray={`${filled} ${circumference - filled}`}
            strokeLinecap="round"
            fill="none"
          />
        </G>
      </Svg>
      <View style={[styles.ringCenter, { width: size, height: size }]} pointerEvents="none">
        <Label size="micro" weight="bold" tabular>
          {/* Rounding 1-of-240 to "0" reads as broken, so show that some progress exists. */}
          {clamped > 0 && clamped < 1 ? '<1' : Math.round(clamped)}
        </Label>
      </View>
    </View>
  );
}

export interface StackedBar {
  label: string;
  segments: Array<{ value: number; color: string }>;
}

/**
 * Stacked bars with a value axis, used for yearly principal/interest outflow. Everything is sized
 * from `width` so the chart always fits its card: the y-axis gutter comes from the widest tick
 * label, bar width and gap come from the remaining space, and x labels are thinned to fit.
 */
export function StackedBarChart({
  bars,
  width,
  height = 160,
  showAxis = true,
}: {
  bars: StackedBar[];
  /** Container width in points. When omitted the chart measures itself via onLayout. */
  width?: number;
  height?: number;
  showAxis?: boolean;
}) {
  const { colors, fontSize } = useTheme();
  const currency = useCurrency();
  const [measuredWidth, setMeasuredWidth] = useState(0);

  const onLayout =
    width == null
      ? (event: LayoutChangeEvent) => {
          const next = Math.floor(event.nativeEvent.layout.width);
          setMeasuredWidth((prev) => (Math.abs(prev - next) > 0.5 ? next : prev));
        }
      : undefined;

  const outerWidth = Math.max(
    MIN_CHART_WIDTH,
    Math.floor(width ?? (measuredWidth > 0 ? measuredWidth : DEFAULT_CHART_WIDTH)),
  );
  const labelFontSize = fontSize.micro - 1;

  const totals = bars.map((bar) => bar.segments.reduce((sum, s) => sum + Math.max(0, s.value), 0));
  const max = Math.max(1, ...totals);

  const gridFractions = [0, 0.5, 1];
  const axisLabels = gridFractions.map((fraction) => formatCompact(max * fraction, { currency }));
  const gutter = showAxis ? axisGutter(axisLabels, labelFontSize) : 0;

  const layout = computeBarLayout({ width: outerWidth, count: bars.length, gutter });
  const chartWidth = layout.chartWidth;

  const plotTop = CHART_TOP_PAD;
  const plotBottom = Math.max(plotTop + 1, height - CHART_X_LABEL_HEIGHT);
  const plotHeight = plotBottom - plotTop;

  const xLabelWidth = bars.reduce((widest, bar) => Math.max(widest, estimateTextWidth(bar.label, labelFontSize)), 0);
  const candidateLabels = thinLabelIndices(
    bars.length,
    labelStride(bars.length, layout.pitch, xLabelWidth),
  ).map((index) => ({
    index,
    ...xLabelPlacement(gutter + index * layout.pitch + layout.barWidth / 2, xLabelWidth, chartWidth),
  }));
  const shownLabels = new Set(dropCollidingLabels(candidateLabels, xLabelWidth));

  return (
    <View style={styles.chartFill} onLayout={onLayout}>
      <Svg width={chartWidth} height={height}>
        {showAxis
          ? gridFractions.map((fraction, index) => {
              const y = plotBottom - fraction * plotHeight;
              return (
                <G key={fraction}>
                  <Line x1={gutter} y1={y} x2={chartWidth} y2={y} stroke={colors.border} strokeWidth={1} />
                  <SvgText
                    x={gutter - 6}
                    y={y + 3}
                    fill={colors.textFaint}
                    fontSize={labelFontSize}
                    textAnchor="end"
                  >
                    {axisLabels[index]}
                  </SvgText>
                </G>
              );
            })
          : null}

        {bars.map((bar, index) => {
          const x = gutter + index * layout.pitch;
          let y = plotBottom;
          const placement = xLabelPlacement(x + layout.barWidth / 2, xLabelWidth, chartWidth);
          return (
            <G key={`${bar.label}-${index}`}>
              {bar.segments.map((segment, segIndex) => {
                const segHeight = (Math.max(0, segment.value) / max) * plotHeight;
                y -= segHeight;
                return (
                  <Rect
                    key={segIndex}
                    x={x}
                    y={y}
                    width={layout.barWidth}
                    height={Math.max(0, segHeight)}
                    fill={segment.color}
                    rx={segIndex === bar.segments.length - 1 ? 2 : 0}
                  />
                );
              })}
              {shownLabels.has(index) ? (
                <SvgText
                  x={placement.x}
                  y={height - 4}
                  fill={colors.textFaint}
                  fontSize={labelFontSize}
                  textAnchor={placement.anchor}
                >
                  {bar.label}
                </SvgText>
              ) : null}
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

/** Legend shared by the donut and bar charts. */
export function ChartLegend({ items }: { items: Array<{ label: string; color: string; value?: string }> }) {
  const { spacing } = useTheme();
  return (
    <View style={[styles.legend, { gap: spacing.md }]}>
      {items.map((item) => (
        <View key={item.label} style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: item.color }]} />
          <Label size="micro" tone="muted">
            {item.label}
          </Label>
          {item.value ? (
            <Label size="micro" weight="semibold" tabular>
              {item.value}
            </Label>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  donutWrap: { alignItems: 'center', justifyContent: 'center' },
  donutCenter: { position: 'absolute', alignItems: 'center' },
  ringCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  chartFill: { width: '100%' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 2 },
});
