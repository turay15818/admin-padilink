import { useTheme } from '../../theme/ThemeProvider';

/**
 * The chart palette, taken from the validated instance rather than picked by eye.
 *
 * Both modes were run through the palette validator before anything was drawn:
 *
 *   light  #2a78d6 / #eb6834 / #1baf7a  — lightness, chroma, CVD ΔE 9.2, normal-vision ΔE 27.6
 *   dark   #3987e5 / #d95926 / #199e70  — same checks, CVD ΔE 9.4, normal-vision ΔE 26.5
 *
 * The light aqua sits just under 3:1 against the light surface, which the validator flags as
 * needing relief. The relief is real and deliberate: every series on this page is direct-
 * labelled and every chart has a table of the same numbers underneath, so nothing on the
 * screen depends on telling two colours apart.
 *
 * Status colours are a separate reserved scale. They are never used for a series, and never
 * appear without a word next to them — a red dot alone is not information for the roughly one
 * man in twelve who cannot reliably see it as red.
 */
export function useChart() {
  const { name } = useTheme();
  const dark = name === 'dark';

  return {
    dark,
    /** Slot 1. Identity: the primary series on any chart. */
    slot1: dark ? '#3987e5' : '#2a78d6',
    /** Slot 2. Identity: the second measure, on its own chart with its own axis. */
    slot2: dark ? '#d95926' : '#eb6834',
    /** Slot 3. Identity: the third. */
    slot3: dark ? '#199e70' : '#1baf7a',
    /** Reserved status scale. Meaning, not identity. Always shipped with a label. */
    good: '#0ca30c',
    warning: '#fab219',
    serious: '#ec835a',
    critical: '#d03b3b',
  };
}

/** 0 healthy, 1 degraded, 2 down — the only three states anything on this page has. */
export function stateColor(state: number, chart: ReturnType<typeof useChart>): string {
  return state >= 2 ? chart.critical : state === 1 ? chart.warning : chart.good;
}

export function stateWord(state: number): string {
  return state >= 2 ? 'Down' : state === 1 ? 'Degraded' : 'Healthy';
}

/** A word for every state, because colour alone is not information. */
export function stateIcon(state: number): string {
  return state >= 2 ? '✕' : state === 1 ? '!' : '✓';
}

export function ms(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`;
}

export function duration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

export function bytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
