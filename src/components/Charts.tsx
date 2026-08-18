/**
 * The marks the console draws with.
 *
 * Hand-written SVG rather than a charting library, for the same reason the icons are hand-drawn
 * paths: a library brings its own type scale, its own colour opinions and 200KB, and then still
 * has to be argued out of every default. These are four shapes and about as many rules.
 *
 * The rules, once, so no chart below has to restate them:
 *
 *  - Series colour comes from `t.series`, in fixed order, never cycled. Status colours mean
 *    good/bad and are never used to tell two series apart.
 *  - Two pixels of surface between adjacent fills, so a stack reads as segments rather than a
 *    smear, and so touching bars of the same hue stay countable.
 *  - Every mark has a hover with the exact number on it. A chart nobody can interrogate is a
 *    picture, and people stop trusting pictures.
 *  - Identity is never colour alone: a legend is always present for two or more series, and the
 *    stacked chart carries a "show the numbers" table for anybody who cannot use the colours at
 *    all — two of the five light-mode hues sit under 3:1 against white, which obliges exactly
 *    that relief rather than a shrug.
 *  - Axes and grid recede. The data is the only thing at full strength.
 */
import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useTheme } from '../theme/ThemeProvider';

/* ---------------- sparkline ---------------- */

/**
 * A number's direction, at the size of a word.
 *
 * No axis, no labels, no grid — it is punctuation for a figure sitting beside it, and anything
 * more turns a glance into a reading.
 */
export function Sparkline({ values, colour, width = 90, height = 26, fill = true }: {
  values: number[];
  colour?: string;
  width?: number;
  height?: number;
  fill?: boolean;
}) {
  const { t } = useTheme();
  const stroke = colour ?? t.series[0];

  const path = useMemo(() => {
    if (values.length < 2) return null;
    const top = Math.max(...values, 1);
    const step = width / (values.length - 1);
    // One pixel of padding top and bottom so a peak at the maximum is not clipped by the
    // viewBox — the commonest way a sparkline quietly lies about its own shape.
    const y = (value: number) => height - 1 - (value / top) * (height - 2);
    const line = values.map((value, index) => `${index === 0 ? 'M' : 'L'}${(index * step).toFixed(1)},${y(value).toFixed(1)}`).join(' ');
    return { line, area: `${line} L${width},${height} L0,${height} Z` };
  }, [values, width, height]);

  if (!path) return <div style={{ width, height }} />;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" style={{ display: 'block' }}>
      {fill ? <path d={path.area} fill={stroke} opacity={0.13} /> : null}
      <path d={path.line} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* ---------------- stacked bars ---------------- */

export type Series = { key: string; label: string; values: number[] };

/**
 * A month of activity, several measures at once.
 *
 * Stacked rather than grouped because the question is "how busy was that day" first and "doing
 * what" second; grouped bars answer the second well and the first not at all. The daily total
 * is what the eye reads, and the hover gives the breakdown to anybody who wants it.
 */
export function StackedBars({ labels, series, height = 190, footnote }: {
  labels: string[];
  series: Series[];
  height?: number;
  footnote?: string;
}) {
  const { t } = useTheme();
  const [hover, setHover] = useState<number | null>(null);
  const [numbers, setNumbers] = useState(false);

  const totals = labels.map((_, index) => series.reduce((sum, row) => sum + (row.values[index] ?? 0), 0));
  const top = Math.max(...totals, 1);
  const empty = totals.every(total => total === 0);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height, position: 'relative' }}>
        {/* A quiet line at the top of the scale, so a tall day has something to be tall against. */}
        <div style={{
          position: 'absolute', left: 0, right: 0, top: 0, borderTop: `1px dashed ${t.border}`,
          fontSize: 10, color: t.textSubtle, paddingLeft: 2,
        }}>
          {top}
        </div>

        {labels.map((label, index) => {
          const on = hover === index;
          return (
            <div
              key={label}
              onMouseEnter={() => setHover(index)}
              onMouseLeave={() => setHover(null)}
              data-day={label}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                height: '100%', minWidth: 0, cursor: 'default',
                // The hit target is the full column height, not the bar — a one-pixel day on a
                // quiet platform is otherwise impossible to hover.
                background: on ? t.surfaceHover : 'transparent',
                borderRadius: 4,
              }}
            >
              {[...series].reverse().map((row, reversed) => {
                const value = row.values[index] ?? 0;
                if (value === 0) return null;
                const slot = series.length - 1 - reversed;
                const isTop = series.slice(slot + 1).every(later => (later.values[index] ?? 0) === 0);
                return (
                  <div
                    key={row.key}
                    title={`${label} · ${value} ${row.label}`}
                    style={{
                      height: `${(value / top) * 100}%`,
                      background: t.series[slot % t.series.length],
                      // 4px rounding on the data end only, and 2px of surface between segments
                      // so a stack reads as parts rather than one smeared column.
                      borderRadius: isTop ? '4px 4px 0 0' : 0,
                      marginBottom: slot === 0 ? 0 : 2,
                      minHeight: 3,
                      opacity: hover === null || on ? 1 : 0.45,
                      transition: 'opacity .12s ease',
                    }}
                  />
                );
              })}
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        <span style={{ fontSize: 10.5, color: t.textSubtle }}>{labels[0]}</span>
        <span style={{ fontSize: 10.5, color: t.textSubtle }}>
          {hover === null ? '' : `${labels[hover]} · ${totals[hover]} in total`}
        </span>
        <span style={{ fontSize: 10.5, color: t.textSubtle }}>{labels[labels.length - 1]}</span>
      </div>

      {empty ? (
        <div style={{ fontSize: 12, color: t.textSubtle, marginTop: 10, lineHeight: 1.6 }}>
          Nothing happened in this window. The chart is empty because the platform was, not
          because anything is broken.
        </div>
      ) : null}

      <Legend series={series} onToggleNumbers={() => setNumbers(value => !value)} showing={numbers} />

      {/* The relief the palette check obliges: two of the five light-mode hues fall under 3:1
          against white, so anybody who cannot separate them by colour gets the figures. */}
      {numbers ? (
        <div style={{ overflowX: 'auto', marginTop: 10 }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 11.5, width: '100%' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '4px 8px', color: t.textSubtle }}>Day</th>
                {series.map(row => (
                  <th key={row.key} style={{ textAlign: 'right', padding: '4px 8px', color: t.textSubtle }}>
                    {row.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {labels.map((label, index) => totals[index] === 0 ? null : (
                <tr key={label}>
                  <td style={{ padding: '3px 8px', color: t.textMuted, whiteSpace: 'nowrap' }}>{label}</td>
                  {series.map(row => (
                    <td key={row.key} style={{ padding: '3px 8px', color: t.text, textAlign: 'right' }}>
                      {row.values[index] ?? 0}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {footnote ? (
        <div style={{ fontSize: 11, color: t.textSubtle, marginTop: 8, lineHeight: 1.55 }}>{footnote}</div>
      ) : null}
    </div>
  );
}

function Legend({ series, onToggleNumbers, showing }: {
  series: Series[]; onToggleNumbers: () => void; showing: boolean;
}) {
  const { t } = useTheme();
  return (
    <div data-legend style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
      {series.map((row, index) => (
        <span key={row.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {/* data-swatch so a check can read the rendered colours back and prove no two series
              share one. That is not a hypothetical: the screen this replaced drew two of its
              three series in near-identical blues, and no amount of reading the code showed it. */}
          <span data-swatch={row.key} style={{
            width: 9, height: 9, borderRadius: 3, flexShrink: 0,
            background: t.series[index % t.series.length],
          }} />
          {/* Label in text ink, never the series colour — the swatch beside it carries identity. */}
          <span style={{ fontSize: 11.5, color: t.textMuted }}>{row.label}</span>
        </span>
      ))}
      <button
        type="button"
        onClick={onToggleNumbers}
        style={{
          marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer',
          fontSize: 11.5, color: t.textSubtle, textDecoration: 'underline', padding: 0,
        }}
      >
        {showing ? 'hide the numbers' : 'show the numbers'}
      </button>
    </div>
  );
}

/* ---------------- horizontal bars ---------------- */

export type BarRow = { label: string; value: number; secondary?: number; note?: string; tone?: string };

/**
 * Ranked things, and optionally the other side of them.
 *
 * Horizontal because the labels are words — a service name rotated forty-five degrees under a
 * vertical bar is a label nobody reads. When `secondary` is set the two bars sit one above the
 * other on the same scale, which is the only honest way to draw supply against demand: two
 * scales would let any city be made to look balanced.
 */
export function Bars({ rows, primaryLabel, secondaryLabel, height = 9 }: {
  rows: BarRow[];
  primaryLabel: string;
  secondaryLabel?: string;
  height?: number;
}) {
  const { t } = useTheme();
  const top = Math.max(...rows.flatMap(row => [row.value, row.secondary ?? 0]), 1);

  return (
    <div>
      {secondaryLabel ? (
        <div data-legend style={{ display: 'flex', gap: 14, marginBottom: 10 }}>
          <Key colour={t.series[0]} label={primaryLabel} />
          <Key colour={t.series[2]} label={secondaryLabel} />
        </div>
      ) : null}

      {rows.map(row => (
        <div key={row.label} data-bar={row.label} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
            <span style={{ fontSize: 12.5, color: t.text, fontWeight: 600 }}>{row.label}</span>
            <span style={{ fontSize: 11.5, color: row.tone ?? t.textSubtle }}>
              {row.note ?? `${row.value}`}
            </span>
          </div>

          <div
            title={`${row.label}: ${row.value} ${primaryLabel}`}
            style={{ height, borderRadius: 4, background: t.surfaceMuted, overflow: 'hidden' }}
          >
            <div style={{
              width: `${Math.max(2, (row.value / top) * 100)}%`, height: '100%',
              background: t.series[0], borderRadius: 4,
            }} />
          </div>

          {row.secondary !== undefined ? (
            <div
              title={`${row.label}: ${row.secondary} ${secondaryLabel ?? ''}`}
              style={{ height, borderRadius: 4, background: t.surfaceMuted, overflow: 'hidden', marginTop: 2 }}
            >
              <div style={{
                width: `${Math.max(2, (row.secondary / top) * 100)}%`, height: '100%',
                background: t.series[2], borderRadius: 4,
              }} />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function Key({ colour, label }: { colour: string; label: string }) {
  const { t } = useTheme();
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span data-swatch={label} style={{ width: 9, height: 9, borderRadius: 3, background: colour }} />
      <span style={{ fontSize: 11.5, color: t.textMuted }}>{label}</span>
    </span>
  );
}

/* ---------------- one row, split by kind ---------------- */

export type SplitPart = { key: string; label: string; value: number };

/**
 * One quantity, broken into the parts it is made of, on a single line.
 *
 * For the case where a table column would otherwise print a number that is secretly a sum.
 * "6 jobs unanswered" and "2 searched + 3 jobs + 1 booking" are different facts, and the
 * second one is the one that tells you which lever to pull.
 *
 * Widths are shares of THIS row, not of the largest row, because the question each row answers
 * is "what was this made of" — comparison between rows is what the count beside it is for.
 * A common scale here would squash every small row to nothing and say less, not more.
 */
export function SplitBar({ parts, height = 8, width = 150 }: {
  parts: SplitPart[]; height?: number; width?: number;
}) {
  const { t } = useTheme();
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  if (total <= 0) {
    return <span style={{ fontSize: 11.5, color: t.textSubtle }}>—</span>;
  }

  return (
    <span
      data-split={total}
      title={parts.filter(part => part.value > 0).map(part => `${part.value} ${part.label}`).join(' · ')}
      style={{
        display: 'inline-flex', width, height, borderRadius: 4, overflow: 'hidden',
        background: t.surfaceMuted, gap: 2,
      }}
    >
      {parts.map((part, index) => part.value === 0 ? null : (
        <span
          key={part.key}
          data-part={part.key}
          style={{
            flex: part.value, minWidth: 3,
            background: t.series[index % t.series.length],
          }}
        />
      ))}
    </span>
  );
}

/* ---------------- the funnel ---------------- */

/**
 * What happens to a thing after somebody asks for it.
 *
 * Drawn as nested widths rather than a trapezoid: a real funnel shape makes the eye compare
 * areas, and people are bad at areas. Widths are a length comparison, which people are good at.
 */
export function Funnel({ steps }: { steps: { label: string; value: number; note?: string }[] }) {
  const { t } = useTheme();
  const top = Math.max(steps[0]?.value ?? 0, 1);

  return (
    <div>
      {steps.map((step, index) => {
        const share = Math.round((step.value / top) * 100);
        return (
          <div key={step.label} data-funnel={step.label} style={{ marginBottom: 11 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
              <span style={{ fontSize: 12.5, color: t.text, fontWeight: 600 }}>{step.label}</span>
              <span style={{ fontSize: 12, color: t.textMuted }}>
                <strong style={{ color: t.text }}>{step.value.toLocaleString()}</strong>
                {index === 0 ? '' : ` · ${share}%`}
              </span>
            </div>
            <div style={{ height: 10, borderRadius: 5, background: t.surfaceMuted, overflow: 'hidden' }}>
              <div style={{
                width: `${Math.max(2, share)}%`, height: '100%', borderRadius: 5,
                background: t.series[index % t.series.length],
              }} />
            </div>
            {step.note ? (
              <div style={{ fontSize: 11, color: t.textSubtle, marginTop: 3 }}>{step.note}</div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- the dial ---------------- */

/**
 * One score, with the parts that made it right underneath.
 *
 * The arc exists to be glanced at; it is never the only thing on the card, because a score on
 * its own is a number people watch go up and down without ever knowing what to do about it.
 */
export function Dial({ score, band, size = 132 }: { score: number; band: string; size?: number }) {
  const { t } = useTheme();
  const stroke = 11;
  const radius = (size - stroke) / 2;
  const circumference = Math.PI * radius;   // half turn only
  const filled = (Math.min(100, Math.max(0, score)) / 100) * circumference;
  const colour = score >= 75 ? t.success : score >= 50 ? t.series[0] : score >= 30 ? t.warning : t.danger;

  return (
    <div data-dial={score} style={{ position: 'relative', width: size, height: size / 2 + 24 }}>
      <svg width={size} height={size / 2 + 4} viewBox={`0 0 ${size} ${size / 2 + 4}`} aria-hidden="true">
        <path
          d={`M ${stroke / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - stroke / 2} ${size / 2}`}
          fill="none" stroke={t.surfaceMuted} strokeWidth={stroke} strokeLinecap="round"
        />
        <path
          d={`M ${stroke / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - stroke / 2} ${size / 2}`}
          fill="none" stroke={colour} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, top: 14, display: 'grid', placeItems: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 30, fontWeight: 800, color: t.text, lineHeight: 1 }}>{score}</div>
          {/* The word, not just the number — "coping" is actionable in a way that 54 is not. */}
          <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 3 }}>{band}</div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- a stat with a direction ---------------- */

export function Stat({ label, value, trend, note, tone, style }: {
  label: string;
  value: string | number;
  trend?: number[];
  note?: string;
  tone?: string;
  style?: CSSProperties;
}) {
  const { t } = useTheme();
  return (
    <div style={{
      border: `1px solid ${t.border}`, borderRadius: 12, padding: '13px 15px',
      background: t.surface, ...style,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 25, fontWeight: 800, color: tone ?? t.text, lineHeight: 1.1 }}>
            {typeof value === 'number' ? value.toLocaleString() : value}
          </div>
          <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 5 }}>{label}</div>
        </div>
        {trend && trend.length > 1 ? <Sparkline values={trend} colour={tone ?? t.series[0]} /> : null}
      </div>
      {note ? (
        <div style={{ fontSize: 11, color: t.textMuted, marginTop: 7, lineHeight: 1.5 }}>{note}</div>
      ) : null}
    </div>
  );
}
