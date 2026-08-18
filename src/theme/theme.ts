/**
 * One token set, two skins.
 *
 * Every colour the console uses is named for its JOB (surface, border, danger) rather
 * than its value, so light and dark are the same layout with a different table — and a
 * component can never be "the dark one". The brand navy and orange are constant across
 * both; only the greys move.
 */

export type ThemeName = 'light' | 'dark';

export type Theme = {
  name: ThemeName;
  /** Page background, behind everything. */
  bg: string;
  /** Cards, tables, the sidebar. */
  surface: string;
  /** Raised things on top of a surface — inputs, hovered rows. */
  surfaceMuted: string;
  surfaceHover: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  brand: string;
  brandText: string;
  brandSoft: string;
  accent: string;
  accentSoft: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  info: string;
  /**
   * The categorical palette for charts, in fixed order and never cycled.
   *
   * Separate from the status colours above, and that separation is a rule rather than tidiness.
   * The Overview chart used to paint its three series with `success`, `brand` and `info` — and
   * in dark mode `brand` is #5B8BD0 while `info` is #60A5FA, two blues nobody can tell apart.
   * Half the chart was unreadable and the legend swore it was fine.
   *
   * Both columns are chosen, not derived: the dark row is the same five hues re-stepped for the
   * dark surface rather than an automatic lightening. Validated in both modes against the real
   * surfaces — worst adjacent CVD deltaE 9.1 light / 8.4 dark, worst normal-vision 22.9 / 19.8.
   * Re-run the check before changing any of them.
   */
  series: readonly string[];
  infoSoft: string;
  shadow: string;
  /** The sidebar is navy in both themes — it is the one constant that says "Vacancy". */
  railBg: string;
  railText: string;
  railMuted: string;
  railActive: string;
};

const NAVY = '#2A4E82';
const NAVY_DEEP = '#21406C';
const ORANGE = '#FF6B2C';

export const light: Theme = {
  name: 'light',
  bg: '#F1F5F9',
  surface: '#FFFFFF',
  surfaceMuted: '#F8FAFC',
  surfaceHover: '#F1F5F9',
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',
  text: '#0F172A',
  textMuted: '#475569',
  textSubtle: '#94A3B8',
  brand: NAVY,
  brandText: '#FFFFFF',
  brandSoft: 'rgba(42,78,130,.08)',
  accent: ORANGE,
  accentSoft: 'rgba(255,107,44,.10)',
  success: '#15803D',
  successSoft: 'rgba(21,128,61,.10)',
  warning: '#B45309',
  warningSoft: 'rgba(180,83,9,.10)',
  danger: '#B91C1C',
  dangerSoft: 'rgba(185,28,28,.09)',
  info: '#1D4ED8',
  infoSoft: 'rgba(29,78,216,.09)',
  series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#4a3aa7'],
  shadow: '0 1px 2px rgba(15,23,42,.06), 0 8px 24px rgba(15,23,42,.06)',
  railBg: NAVY_DEEP,
  railText: '#FFFFFF',
  railMuted: 'rgba(255,255,255,.62)',
  railActive: 'rgba(255,255,255,.13)',
};

export const dark: Theme = {
  name: 'dark',
  bg: '#0B1220',
  surface: '#111C2E',
  surfaceMuted: '#16233A',
  surfaceHover: '#1B2B45',
  border: '#22334F',
  borderStrong: '#2E4467',
  text: '#E9EFF7',
  textMuted: '#9FB2CB',
  textSubtle: '#6B819E',
  brand: '#5B8BD0',
  brandText: '#06101F',
  brandSoft: 'rgba(91,139,208,.14)',
  accent: ORANGE,
  accentSoft: 'rgba(255,107,44,.14)',
  // Lifted for contrast against the dark surface — the light values fail WCAG here.
  success: '#4ADE80',
  successSoft: 'rgba(74,222,128,.12)',
  warning: '#FBBF24',
  warningSoft: 'rgba(251,191,36,.12)',
  danger: '#F87171',
  dangerSoft: 'rgba(248,113,113,.12)',
  info: '#60A5FA',
  infoSoft: 'rgba(96,165,250,.12)',
  series: ['#3987e5', '#d95926', '#199e70', '#c98500', '#9085e9'],
  shadow: '0 1px 2px rgba(0,0,0,.4), 0 10px 30px rgba(0,0,0,.35)',
  railBg: '#0A1526',
  railText: '#FFFFFF',
  railMuted: 'rgba(255,255,255,.58)',
  railActive: 'rgba(255,255,255,.10)',
};

export const themes: Record<ThemeName, Theme> = { light, dark };

export const font =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
export const mono = "'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";
