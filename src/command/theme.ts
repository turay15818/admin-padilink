/**
 * The command centre's one skin.
 *
 * An operations room is dark on purpose: the screens are on all night, the wall is the
 * map, and what matters has to read from across the room. One theme, chosen rather than
 * inherited — there is no light variant and no toggle, so every colour here is explicit
 * and every component paints from these tokens.
 *
 * The hue bias is blue-black. The one accent is a cold cyan that means "live"; the brand
 * orange is kept for the primary action so Vacancy is still recognisably Vacancy. The
 * severity colours are reserved for severity and never reused as a series colour.
 */
export const T = {
  bg: '#070B12',
  surface: '#0D1420',
  surface2: '#121B2A',
  surface3: '#182335',
  line: '#1C2738',
  line2: '#2A3A52',
  text: '#E6EDF5',
  muted: '#8A9BB3',
  subtle: '#5A6B84',
  /** Live, selected, focused. Spent sparingly. */
  accent: '#22D3EE',
  accentSoft: 'rgba(34,211,238,.12)',
  /** The primary action. Vacancy's orange, unchanged. */
  brand: '#FF6B2C',
  brandSoft: 'rgba(255,107,44,.14)',
  good: '#2DD4A0',
  goodSoft: 'rgba(45,212,160,.12)',
  warn: '#FFB020',
  warnSoft: 'rgba(255,176,32,.12)',
  bad: '#FF4D5E',
  badSoft: 'rgba(255,77,94,.12)',
  info: '#38BDF8',
  infoSoft: 'rgba(56,189,248,.12)',
  /** P1 · P2 · P3 · P4 · information. Severity is a scale; these are its steps. */
  severity: ['#FF4D5E', '#FFB020', '#38BDF8', '#8A9BB3', '#5A6B84'] as const,
  /** Categorical, fixed order, never cycled. Validated against #0D1420. */
  series: ['#38bdf8', '#f97316', '#2dd4a0', '#facc15', '#a78bfa', '#f472b6'] as const,
  font: "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  mono: "'IBM Plex Mono', 'SF Mono', Menlo, Consolas, monospace",
  radius: 10,
} as const;

export const severityTone = (severity: number) => T.severity[Math.min(Math.max(severity, 1), 5) - 1];

/** Everything global. Injected once by the app root. */
export const GLOBAL_CSS = `
  html, body, #root { height: 100%; }
  body { margin: 0; background: ${T.bg}; color: ${T.text}; font-family: ${T.font}; font-size: 13px; line-height: 1.45; -webkit-font-smoothing: antialiased; }
  * { box-sizing: border-box; }
  a { color: ${T.accent}; }
  ::selection { background: ${T.accentSoft}; }
  *:focus-visible { outline: 2px solid ${T.accent}; outline-offset: 2px; }
  button { font-family: inherit; }
  input, select, textarea { font-family: inherit; color-scheme: dark; }
  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: ${T.line2}; border-radius: 6px; border: 2px solid ${T.bg}; }
  .cc-num { font-family: ${T.mono}; font-variant-numeric: tabular-nums; }
  .cc-row:hover { background: ${T.surface2}; }
  .cc-row[data-active="1"] { background: ${T.accentSoft}; }
  .cc-nav:hover { background: ${T.surface2}; color: ${T.text}; }
  .cc-nav[data-active="1"] { background: ${T.accentSoft}; color: ${T.text}; }
  .cc-nav[data-active="1"] .cc-nav-bar { opacity: 1; }
  .cc-picker:focus { outline: none; }
  .cc-picker option { background: #121B2A; color: #E6EDF5; }
  .cc-rail[data-narrow="1"] .cc-nav:hover { background: #121B2A; }
  .cc-btn:hover:not(:disabled) { filter: brightness(1.12); }
  .cc-btn:active:not(:disabled) { transform: translateY(1px); }
  .cc-pulse { animation: cc-pulse 1.6s ease-in-out infinite; }
  @keyframes cc-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
  .cc-blink { animation: cc-blink 1.1s steps(2, start) infinite; }
  @keyframes cc-blink { to { visibility: hidden; } }
  .cc-in { animation: cc-in .18s ease-out; }
  @keyframes cc-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
  .cc-drawer { animation: cc-drawer .2s ease-out; }
  @keyframes cc-drawer { from { transform: translateX(24px); opacity: 0; } to { transform: none; opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { .cc-pulse, .cc-blink, .cc-in, .cc-drawer { animation: none; } }
  .maplibregl-ctrl-group { background: ${T.surface2} !important; border: 1px solid ${T.line2} !important; box-shadow: none !important; }
  .maplibregl-ctrl-group button + button { border-top: 1px solid ${T.line} !important; }
  .maplibregl-ctrl button .maplibregl-ctrl-icon { filter: invert(.85); }
  .maplibregl-popup-content { background: ${T.surface2} !important; color: ${T.text} !important; border: 1px solid ${T.line2}; border-radius: 8px !important; padding: 8px 10px !important; font-family: ${T.font}; box-shadow: 0 8px 24px rgba(0,0,0,.5) !important; }
  .maplibregl-popup-anchor-bottom .maplibregl-popup-tip { border-top-color: ${T.surface2} !important; }
  .maplibregl-popup-anchor-top .maplibregl-popup-tip { border-bottom-color: ${T.surface2} !important; }
  .maplibregl-popup-anchor-left .maplibregl-popup-tip { border-right-color: ${T.surface2} !important; }
  .maplibregl-popup-anchor-right .maplibregl-popup-tip { border-left-color: ${T.surface2} !important; }
  .maplibregl-ctrl-attrib { background: rgba(7,11,18,.7) !important; color: ${T.subtle} !important; font-size: 10px !important; }
  .maplibregl-ctrl-attrib a { color: ${T.muted} !important; }
  @media (max-width: 900px) {
    .cc-rail { display: none !important; }
    .cc-rail-open { display: flex !important; position: fixed; inset: 0 auto 0 0; z-index: 50; box-shadow: 0 0 0 100vw rgba(0,0,0,.5); }
    .cc-burger { display: inline-flex !important; }
    .cc-grid-2, .cc-grid-3, .cc-grid-4 { grid-template-columns: 1fr !important; }
    .cc-drawer { width: 100vw !important; }
  }
`;
