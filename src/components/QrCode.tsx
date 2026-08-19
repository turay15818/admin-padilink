import { qrMatrix, qrSvgPath } from '../lib/qr';

/**
 * A QR code as one SVG element.
 *
 * The same encoder the public site uses, on purpose: the console showing a code that differs
 * from the one on the website would be worse than showing none at all, because it would be
 * believed.
 */
export function QrCode({ value, size = 160, dark = '#0F172A', light = '#FFFFFF', title }: {
  value: string;
  size?: number;
  dark?: string;
  light?: string;
  title?: string;
}) {
  let path: string;
  let extent: number;

  try {
    const drawn = qrSvgPath(qrMatrix(value));
    path = drawn.path;
    extent = drawn.extent;
  } catch {
    return null;
  }

  return (
    <svg
      aria-label={title ?? 'QR code'}
      height={size}
      role="img"
      shapeRendering="crispEdges"
      viewBox={`0 0 ${extent} ${extent}`}
      width={size}
      xmlns="http://www.w3.org/2000/svg">
      <rect fill={light} height={extent} width={extent} x="0" y="0" />
      <path d={path} fill={dark} />
    </svg>
  );
}
