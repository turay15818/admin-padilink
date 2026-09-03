/**
 * An image the API only serves to somebody with the right permission.
 *
 * A plain <img src> carries no Authorization header, so an evidence URL behind the reviewer
 * permission comes back 401 and the queue shows a broken picture — a review queue you
 * cannot review. This fetches with the session's bearer token and shows the bytes through
 * an object URL, which is revoked when the picture leaves the screen; nothing is cached,
 * matching the no-store the server sends.
 */
import { useEffect, useState } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import { loadSession } from '../api/client';

export function EvidenceImage({ url, label, width = 148, height = 108 }: { url: string | null | undefined; label: string; width?: number; height?: number }) {
  const { t } = useTheme();
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    setSrc(null);
    setFailed(false);
    if (!url) return;
    const token = loadSession()?.accessToken;
    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : undefined, cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        if (!alive) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => { if (alive) setFailed(true); });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  const frame = { width, height, borderRadius: 10, border: `1px ${url && !failed ? 'solid' : 'dashed'} ${t.border}`, display: 'grid', placeItems: 'center', color: t.textMuted, fontSize: 12, overflow: 'hidden' } as const;

  return (
    <div style={{ textAlign: 'center' }}>
      {src ? (
        <a href={src} target="_blank" rel="noreferrer">
          <img src={src} alt={label} style={{ width, height, objectFit: 'cover', borderRadius: 10, border: `1px solid ${t.border}`, display: 'block' }} />
        </a>
      ) : (
        <div style={frame}>{!url ? 'Not given' : failed ? 'Could not open' : 'Opening…'}</div>
      )}
      <div style={{ fontSize: 11.5, color: t.textMuted, marginTop: 4 }}>{label}</div>
    </div>
  );
}
