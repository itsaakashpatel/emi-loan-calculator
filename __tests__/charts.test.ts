import {
  CHART_TOP_PAD,
  DEFAULT_CHART_WIDTH,
  MIN_CHART_WIDTH,
  axisGutter,
  computeBarLayout,
  donutSliceLabels,
  estimateTextWidth,
  labelStride,
  sliceMidAngle,
  thinLabelIndices,
  xLabelPlacement,
} from '../src/components/charts';

describe('estimateTextWidth', () => {
  it('scales with both length and font size', () => {
    expect(estimateTextWidth('', 10)).toBe(0);
    expect(estimateTextWidth('₹23.2 L', 10)).toBeCloseTo(7 * 10 * 0.58, 6);
    expect(estimateTextWidth('₹23.2 L', 20)).toBeCloseTo(2 * estimateTextWidth('₹23.2 L', 10), 6);
  });
});

describe('axisGutter', () => {
  it('grows with the widest label', () => {
    const short = axisGutter(['₹0', '₹5 K', '₹9 K'], 10);
    const long = axisGutter(['₹0', '₹11.6 L', '₹23.2 L'], 10);
    const longer = axisGutter(['₹0', '₹1,23,45,678', '₹2,46,91,356'], 10);
    expect(long).toBeGreaterThan(short);
    expect(longer).toBeGreaterThan(long);
  });

  it('leaves room for the widest label plus padding', () => {
    const labels = ['₹0', '₹11.6 L', '₹23.2 L'];
    const gutter = axisGutter(labels, 10);
    // The widest label is drawn right-aligned at gutter - 6, so its left edge must stay past x=0.
    expect(gutter - 6 - estimateTextWidth('₹23.2 L', 10)).toBeGreaterThan(0);
  });

  it('is wider than the old hardcoded 46pt for lakh-scale rupee labels', () => {
    expect(axisGutter(['₹0', '₹11.6 L', '₹23.2 L'], 10)).toBeGreaterThan(46);
  });

  it('collapses to zero without labels', () => {
    expect(axisGutter([], 10)).toBe(0);
  });
});

describe('computeBarLayout', () => {
  it('never returns a chart wider than the space it was given', () => {
    for (const width of [MIN_CHART_WIDTH, 200, 300, 338, 402, 700]) {
      for (const count of [1, 2, 3, 5, 9, 16, 21, 30, 60, 121, 400]) {
        const layout = computeBarLayout({ width, count, gutter: 58 });
        expect(layout.chartWidth).toBeLessThanOrEqual(width);
        // The right edge of the last bar must also stay inside the chart.
        const lastBarRight = layout.gutter + (count - 1) * layout.pitch + layout.barWidth;
        expect(lastBarRight).toBeLessThanOrEqual(layout.chartWidth + 1e-9);
      }
    }
  });

  it('fits the real regression case: 21 yearly bars in a 338pt card', () => {
    const gutter = axisGutter(['₹0', '₹11.6 L', '₹23.2 L'], 10);
    const layout = computeBarLayout({ width: 338, count: 21, gutter });
    expect(layout.chartWidth).toBeLessThanOrEqual(338);
    expect(layout.barWidth).toBeGreaterThanOrEqual(3);
  });

  it('keeps bars at their preferred size when there is room to spare', () => {
    const layout = computeBarLayout({ width: 338, count: 4, gutter: 50 });
    expect(layout.barWidth).toBe(28);
    expect(layout.gap).toBe(6);
    expect(layout.chartWidth).toBe(50 + 4 * 34);
  });

  it('shrinks the gap before the bar width', () => {
    const roomy = computeBarLayout({ width: 300, count: 10, gutter: 50 });
    const tight = computeBarLayout({ width: 300, count: 20, gutter: 50 });
    expect(tight.gap).toBeLessThan(roomy.gap);
    expect(tight.barWidth).toBeLessThan(roomy.barWidth);
    expect(tight.gap).toBeLessThan(tight.barWidth);
  });

  it('holds a ~3pt minimum bar width for long schedules', () => {
    const layout = computeBarLayout({ width: 338, count: 60, gutter: 58 });
    expect(layout.barWidth).toBeGreaterThanOrEqual(3);
    expect(layout.gap).toBeGreaterThanOrEqual(0);
    expect(layout.chartWidth).toBeLessThanOrEqual(338);
  });

  it('degrades safely on empty input', () => {
    const layout = computeBarLayout({ width: DEFAULT_CHART_WIDTH, count: 0, gutter: 40 });
    expect(layout.barWidth).toBe(0);
    expect(layout.chartWidth).toBe(40);
  });

  it('clamps absurdly small widths instead of going negative', () => {
    const layout = computeBarLayout({ width: 10, count: 5, gutter: 40 });
    expect(layout.barWidth).toBeGreaterThan(0);
    expect(layout.chartWidth).toBeGreaterThan(0);
    expect(layout.chartWidth).toBeLessThanOrEqual(MIN_CHART_WIDTH);
  });
});

describe('labelStride', () => {
  it('draws every bar when labels comfortably fit', () => {
    expect(labelStride(6, 34, estimateTextWidth('2026', 10))).toBe(1);
  });

  it('skips more labels as bars get thinner', () => {
    const pitch5 = labelStride(21, 5, estimateTextWidth('2026', 10));
    const pitch12 = labelStride(21, 12, estimateTextWidth('2026', 10));
    expect(pitch5).toBeGreaterThan(pitch12);
    expect(pitch12).toBeGreaterThanOrEqual(2);
  });

  it('skips more for longer labels at the same pitch', () => {
    expect(labelStride(21, 12, estimateTextWidth('Jan 2026', 10))).toBeGreaterThan(
      labelStride(21, 12, estimateTextWidth('26', 10)),
    );
  });

  it('is always at least 1, even for degenerate pitches', () => {
    expect(labelStride(21, 0, 40)).toBe(1);
    expect(labelStride(1, 34, 40)).toBe(1);
  });
});

describe('thinLabelIndices', () => {
  it('always keeps the first and last bar', () => {
    for (let count = 1; count <= 40; count++) {
      for (const stride of [1, 2, 3, 4, 7, 11, 50]) {
        const indices = thinLabelIndices(count, stride);
        expect(indices[0]).toBe(0);
        expect(indices[indices.length - 1]).toBe(count - 1);
      }
    }
  });

  it('returns strictly increasing, in-range, unique indices', () => {
    for (let count = 1; count <= 40; count++) {
      for (const stride of [1, 3, 5, 8]) {
        const indices = thinLabelIndices(count, stride);
        expect(new Set(indices).size).toBe(indices.length);
        for (let i = 1; i < indices.length; i++) {
          expect(indices[i]!).toBeGreaterThan(indices[i - 1]!);
          expect(indices[i]!).toBeLessThan(count);
        }
      }
    }
  });

  it('steps by the stride', () => {
    expect(thinLabelIndices(9, 1)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(thinLabelIndices(9, 2)).toEqual([0, 2, 4, 6, 8]);
    expect(thinLabelIndices(21, 4)).toEqual([0, 4, 8, 12, 16, 20]);
  });

  it('drops a crowded penultimate label rather than overlapping the last', () => {
    // 0,4,8 then 9 would sit one bar from 8, so 8 is dropped.
    expect(thinLabelIndices(10, 4)).toEqual([0, 4, 9]);
  });

  it('handles empty and single-bar charts', () => {
    expect(thinLabelIndices(0, 3)).toEqual([]);
    expect(thinLabelIndices(1, 3)).toEqual([0]);
  });
});

describe('xLabelPlacement', () => {
  const labelWidth = estimateTextWidth('2026', 10);

  it('centres interior labels', () => {
    expect(xLabelPlacement(150, labelWidth, 300)).toEqual({ x: 150, anchor: 'middle' });
  });

  it('left-aligns a label that would spill past x=0', () => {
    expect(xLabelPlacement(2, labelWidth, 300)).toEqual({ x: 0, anchor: 'start' });
  });

  it('right-aligns a label that would spill past the chart edge', () => {
    expect(xLabelPlacement(299, labelWidth, 300)).toEqual({ x: 300, anchor: 'end' });
  });
});

describe('sliceMidAngle', () => {
  it('puts the middle of a full-circle slice at 6 o’clock', () => {
    expect(sliceMidAngle(0, 1)).toBeCloseTo(Math.PI / 2, 10);
  });

  it('walks clockwise from 12 o’clock', () => {
    expect(sliceMidAngle(0, 0)).toBeCloseTo(-Math.PI / 2, 10); // top
    expect(sliceMidAngle(0, 0.5)).toBeCloseTo(0, 10); // 3 o'clock
    expect(sliceMidAngle(0.5, 1)).toBeCloseTo(Math.PI, 10); // 9 o'clock
    expect(sliceMidAngle(0.25, 0.25)).toBeCloseTo(0, 10);
  });
});

describe('donutSliceLabels', () => {
  // A band wide enough to hold "100%" — the geometry the on-ring labels require.
  const size = 240;
  const thickness = 40;
  const center = size / 2;
  const midRadius = (size - thickness) / 2;

  it('prints whole percents', () => {
    // A decimal place buys nothing at this size and costs the width that clips the label.
    const labels = donutSliceLabels([553, 447], size, thickness);
    expect(labels.map((l) => l.text)).toEqual(['55%', '45%']);
  });

  it('refuses to label a ring whose band is thinner than the text', () => {
    // A "100%" label is ~26pt wide at fontSize 11, and it straddles the band.
    // The compact donut on the calculator screen: text on the band would be sliced apart.
    expect(donutSliceLabels([52, 48], 116, 17)).toEqual([]);
    expect(donutSliceLabels([52, 48], 200, 8)).toEqual([]);
    // A wide band, as on the donut the original app draws nearly full-width: labels fit.
    expect(donutSliceLabels([52, 48], 240, 40)).toHaveLength(2);
  });

  it('places labels on the stroke band, not the centre or the rim', () => {
    const [first, second] = donutSliceLabels([50, 50], size, thickness);
    // A 0-50% slice is centred at 3 o'clock, the 50-100% slice at 9 o'clock.
    expect(first!.x).toBeCloseTo(center + midRadius, 6);
    expect(first!.y).toBeCloseTo(center, 6);
    expect(second!.x).toBeCloseTo(center - midRadius, 6);
    expect(second!.y).toBeCloseTo(center, 6);
  });

  it('keeps every label inside the svg box', () => {
    for (const values of [[1, 1, 1], [70, 20, 10], [40, 35, 25]]) {
      for (const label of donutSliceLabels(values, size, thickness)) {
        expect(label.x).toBeGreaterThan(0);
        expect(label.x).toBeLessThan(size);
        expect(label.y).toBeGreaterThan(0);
        expect(label.y).toBeLessThan(size);
      }
    }
  });

  it('skips slices too thin to hold the text', () => {
    const labels = donutSliceLabels([95, 5], size, thickness);
    expect(labels).toHaveLength(1);
    expect(labels[0]!.index).toBe(0);
    expect(labels[0]!.text).toBe('95%');
  });

  it('keeps the original slice index so colours stay aligned', () => {
    const labels = donutSliceLabels([2, 49, 49], size, thickness);
    expect(labels.map((l) => l.index)).toEqual([1, 2]);
  });

  it('returns nothing when there is no data', () => {
    expect(donutSliceLabels([], size, thickness)).toEqual([]);
    expect(donutSliceLabels([0, 0], size, thickness)).toEqual([]);
  });
});

describe('chart vertical padding', () => {
  it('reserves room above the top gridline for its label', () => {
    // The top tick sits at y = CHART_TOP_PAD with its baseline 3pt lower; a ~10pt glyph must clear 0.
    expect(CHART_TOP_PAD + 3 - 10).toBeGreaterThanOrEqual(0);
  });
});
