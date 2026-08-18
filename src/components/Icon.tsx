/**
 * The console's icon set.
 *
 * Stroked paths on a 24-grid, drawn here rather than borrowed from an emoji font. Emoji
 * render as somebody else's artwork at somebody else's weight — they change between
 * macOS, Windows and Android, they ignore the theme, and they cannot be made to sit on
 * the same optical baseline as text. These inherit `currentColor` and stay crisp at any
 * size, which is what makes a rail and a sign-in screen look like one product.
 *
 * Multi-stroke glyphs are written as one string with ` M` separating subpaths, so adding
 * an icon is a one-line change.
 */

// Not exported: callers ask for an icon by name, and keeping the map private means this
// file exports a component and a type only — which is what React Fast Refresh wants.
const ICONS = {
  // navigation
  overview: 'M4 4h7v7H4V4Z M13 4h7v4.5h-7V4Z M13 10.5h7V20h-7v-9.5Z M4 13h7v7H4v-7Z',
  people: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z M2.5 20v-1c0-2.5 2.9-4 6.5-4s6.5 1.5 6.5 4v1 M17 5.2a3.2 3.2 0 0 1 0 6.1 M18.4 14.6c2 .6 3.1 1.8 3.1 3.4v1',
  // A line going up and out of the frame, with the arrowhead. Not a bar chart: every other
  // dashboard icon in existence is a bar chart, and this screen is about a direction.
  insights: 'M3 20V4 M3 20h18 M6.5 15.5l4-4.5 3.5 3L20 7 M16.5 7H20v3.5',
  // A magnifier with nothing in it — the screen is about the searches that came back empty.
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z M16.2 16.2 21 21',
  // Four-pointed star. Not a robot and not a brain: this screen is mostly arithmetic that
  // happens to have a sentence on top, and the icon should not oversell it.
  spark: 'M12 3.2 13.7 9l5.8 1.7-5.8 1.7L12 18.2l-1.7-5.8L4.5 10.7 10.3 9 12 3.2Z M18.5 3v3 M17 4.5h3',
  services: 'M3 8h18v12H3V8Z M9 8V6a3 3 0 0 1 6 0v2 M3 13h18',
  audit: 'M12 3 4 6.5v5c0 4.4 3.2 8.2 8 9.5 4.8-1.3 8-5.1 8-9.5v-5L12 3Z M12 8v4 M12 15.5v.5',
  advert: 'M3 9h4l7-4.5v15L7 15H3V9Z M18 9.5a4 4 0 0 1 0 5',
  account: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M4 20.5v-.8c0-3 3.6-4.7 8-4.7s8 1.7 8 4.7v.8',
  // A calendar with a tick: a booking is a date somebody agreed to.
  booking: 'M4 6h16v14H4V6Z M4 10h16 M8 3v3 M16 3v3 M9 14.5l2 2 4-4',
  // A flag on a pole — what somebody raises when something is wrong.
  flag: 'M6 21V4 M6 4.5h11l-2.2 3.6L17 12H6',
  // A page with lines: the thing that was posted.
  content: 'M6 3h8l4 4v14H6V3Z M14 3v4h4 M9 12h6 M9 16h4',
  // A shield with a person inside: the admin team is people plus what they are trusted with.
  shield: 'M12 3 4.5 6v5.5c0 4.2 3.1 7.9 7.5 9.2 4.4-1.3 7.5-5 7.5-9.2V6L12 3Z M12 11.4a2.1 2.1 0 1 0 0-4.2 2.1 2.1 0 0 0 0 4.2Z M8.4 16.6c0-1.6 1.6-2.5 3.6-2.5s3.6.9 3.6 2.5',

  // sign-in
  certificate: 'M12 3 4 6.5v5c0 4.4 3.2 8.2 8 9.5 4.8-1.3 8-5.1 8-9.5v-5L12 3Z M9 12l2 2 4-4',
  agreement: 'M7 3h7l5 5v13H7V3Z M14 3v5h5 M10 13h7 M10 17h5',
  training: 'M12 4 2 9l10 5 10-5-10-5Z M6 11.5V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-4.5',
  lock: 'M6 10V8a6 6 0 1 1 12 0v2 M5 10h14v10H5V10Z',
  mail: 'M3 6h18v12H3V6Z M3 7l9 6 9-6',
  eye: 'M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  eyeOff: 'M4 4l16 16 M10 5.9A9.6 9.6 0 0 1 12 5.5c6.4 0 10 6.5 10 6.5a17 17 0 0 1-3.6 4.3 M6.4 7.6A17 17 0 0 0 2 12s3.6 6.5 10 6.5a9.9 9.9 0 0 0 3.4-.6',
  at: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z M15.5 12v1.8a2.7 2.7 0 0 0 5.4 0V12a8.9 8.9 0 1 0-3.6 7.2',
  warn: 'M12 4 2.5 20.5h19L12 4Z M12 10v4 M12 17.2v.3',
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 18, color = 'currentColor', width = 1.7 }: {
  name: IconName; size?: number; color?: string; width?: number;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"
      style={{ display: 'block', flexShrink: 0 }}>
      {ICONS[name].split(' M').map((segment, index) => (
        <path key={index} d={index === 0 ? segment : `M${segment}`} stroke={color}
          strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}
