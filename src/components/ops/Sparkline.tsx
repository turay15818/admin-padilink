import { useTheme } from '../../theme/ThemeProvider';

/**
 * One measure over time, on its own scale.
 *
 * Deliberately single-series. Two measures of different magnitude on one plot need two y-axes,
 * and a dual-axis chart invents a correlation that is not in the data — it is the commonest
 * way a dashboard misleads the person reading it. Requests, latency and CPU therefore get
 * three separate charts rather than one clever one.
 *
 * The last value is printed next to the line, so the number is readable without a tooltip and
 * without telling colours apart.
 */
export function Sparkline({
  points, color, label, format, height = 46,
}: {
  points: number[];
  color: string;
  label: string;
  format: (value: number) => string;
  height?: number;
}) {
  const { t } = useTheme();

  if (points.length < 2) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', color: t.textSubtle, fontSize: 12 }}>
        Not enough history yet.
      </div>
    );
  }

  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = Math.max(max - min, 1);
  const width = 100;
  const step = width / (points.length - 1);

  const line = points
    .map((value, index) => `${(index * step).toFixed(2)},${(height - ((value - min) / span) * (height - 6) - 3).toFixed(2)}`)
    .join(' ');

  const last = points[points.length - 1];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
        <span style={{ fontSize: 11, color: t.textMuted, fontWeight: 700, letterSpacing: 0.4 }}>{label}</span>
        {/* Direct label. The value is legible whether or not the line's colour reads. */}
        <span style={{ fontSize: 13, color: t.text, fontWeight: 800 }}>{format(last)}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10.5, color: t.textSubtle }}>peak {format(max)}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height }} role="img" aria-label={`${label}, currently ${format(last)}, peak ${format(max)}`}>
        <polyline points={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
