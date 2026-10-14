/** Line icons for the rail. Stroke paths on a 24-grid, one per screen. */
const PATHS = {
  home: 'M3 11l9-7 9 7 M5 10v10h14V10 M10 20v-6h4v6',
  map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z M9 4v14 M15 6v14',
  inbox: 'M3 13h5l2 3h4l2-3h5 M4 5h16v14H4z',
  people: 'M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M2 20a6 6 0 0 1 12 0 M14 17a5 5 0 0 1 8 3',
  calendar: 'M4 6h16v14H4z M4 10h16 M8 3v4 M16 3v4',
  facility: 'M4 21V7l8-4 8 4v14 M9 21v-6h6v6 M12 9v3 M10.5 10.5h3',
  team: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0',
  chart: 'M4 20h16 M7 16V9 M12 16V5 M17 16v-7',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  logout: 'M10 17l5-5-5-5 M15 12H3 M21 3v18',
  menu: 'M4 7h16 M4 12h16 M4 17h16',
  pin: 'M12 22s7-7 7-12a7 7 0 0 0-14 0c0 5 7 12 7 12z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7l1-8z',
  download: 'M12 4v12 M7 11l5 5 5-5 M4 20h16',
  refresh: 'M20 12a8 8 0 1 1-2.3-5.7 M20 4v5h-5',
  plus: 'M12 5v14 M5 12h14',
  check: 'M5 12l4 4L19 7',
  x: 'M6 6l12 12 M18 6L6 18',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M20 20l-4-4',
  truck: 'M2 7h11v9H2z M13 10h4l3 3v3h-7z M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  alert: 'M12 3l10 18H2L12 3z M12 10v4 M12 17.5v.5',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2',
  mail: 'M3 6h18v12H3z M3 7l9 6 9-6',
  building: 'M4 21h16 M6 21V4h12v17 M9 8h2 M13 8h2 M9 12h2 M13 12h2 M10 21v-4h4v4',
  sitemap: 'M9 3h6v5H9z M3 16h6v5H3z M15 16h6v5h-6z M12 8v4 M6 16v-4h12v4',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z M9 12l2 2 4-4',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M3 12h18 M12 3a14 14 0 0 1 0 18 M12 3a14 14 0 0 0 0 18',
  edit: 'M4 20h4l10-10-4-4L4 16v4z M13 7l4 4',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v6 M14 11v6',
  chevronLeft: 'M15 5l-7 7 7 7',
  chevronRight: 'M9 5l7 7-7 7',
  chevronDown: 'M5 9l7 7 7-7',
  dot: 'M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
  layers: 'M12 3l9 5-9 5-9-5 9-5z M3 13l9 5 9-5 M3 17l9 5 9-5',
  keyboard: 'M3 6h18v12H3z M7 10h1 M11 10h1 M15 10h1 M7 14h10',
  sparkle: 'M12 3v4 M12 17v4 M3 12h4 M17 12h4 M6 6l2.5 2.5 M15.5 15.5L18 18 M6 18l2.5-2.5 M15.5 8.5L18 6',
  briefcase: 'M3 8h18v12H3z M8 8V5h8v3 M3 13h18',
  compass: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M15 9l-2 5-5 2 2-5 5-2z',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16, color = 'currentColor', width = 1.8 }: { name: IconName; size?: number; color?: string; width?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ display: 'block', flexShrink: 0 }}>
      <path d={PATHS[name]} stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
