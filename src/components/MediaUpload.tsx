/**
 * Drop an image or a video on it.
 *
 * The file goes straight to the API's own storage and the URL comes back — no pasting
 * links, no wondering whether the host will still be up in three months. Size and type are
 * checked here before the upload starts, because telling someone their 300MB video is too
 * big only once it has finished uploading is its own kind of rude; the server checks again,
 * since a browser is not a security boundary.
 */
import { useRef, useState } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import { Button, Spinner } from './ui';
import { adminApi } from '../api/admin';

const MAX_IMAGE = 8 * 1024 * 1024;
const MAX_VIDEO = 40 * 1024 * 1024;

export function MediaUpload({ imageUrl, videoUrl, onChange, disabled }: {
  imageUrl: string | null | undefined;
  videoUrl: string | null | undefined;
  onChange: (patch: { imageUrl?: string | null; videoUrl?: string | null }) => void;
  disabled?: boolean;
}) {
  const { t } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const complain = (file: File): string | null => {
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    if (!isImage && !isVideo) return 'Adverts take an image or a video — that file is neither.';
    if (isImage && file.size > MAX_IMAGE) return `Images have to be under ${MAX_IMAGE / 1024 / 1024}MB.`;
    if (isVideo && file.size > MAX_VIDEO) {
      return `Videos have to be under ${MAX_VIDEO / 1024 / 1024}MB — this plays on a phone, over mobile data.`;
    }
    return null;
  };

  const send = (file: File | undefined) => {
    if (!file || busy) return;
    const complaint = complain(file);
    if (complaint) { setError(complaint); return; }

    setBusy(true);
    setError(null);
    adminApi.uploadAdvertMedia(file)
      .then(result => {
        // A video keeps whatever poster is already set; an image replaces the poster and
        // clears the video, because an advert shows one thing, not both.
        onChange(result.mediaType === 'video'
          ? { videoUrl: result.url }
          : { imageUrl: result.url, videoUrl: null });
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'That upload did not work.'))
      .finally(() => setBusy(false));
  };

  const has = Boolean(imageUrl || videoUrl);

  return (
    <div>
      <div
        onDragOver={event => { event.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={event => {
          event.preventDefault();
          setOver(false);
          send(event.dataTransfer.files?.[0]);
        }}
        onClick={() => !disabled && !busy && inputRef.current?.click()}
        style={{
          border: `1.5px dashed ${over ? t.brand : t.borderStrong}`,
          background: over ? t.brandSoft : t.surfaceMuted,
          borderRadius: 12, padding: has ? 12 : '22px 16px', cursor: disabled ? 'default' : 'pointer',
          transition: 'border-color .15s ease, background .15s ease',
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          disabled={disabled || busy}
          onChange={event => { send(event.target.files?.[0]); event.target.value = ''; }}
          style={{ display: 'none' }}
        />

        {busy ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', color: t.textMuted, fontSize: 13 }}>
            <Spinner size={15} /> Uploading…
          </div>
        ) : has ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Preview imageUrl={imageUrl} videoUrl={videoUrl} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>
                {videoUrl ? 'Video' : 'Image'}
              </div>
              <div style={{ fontSize: 11.5, color: t.textSubtle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {(videoUrl ?? imageUrl ?? '').split('/').pop()}
              </div>
              {videoUrl && !imageUrl ? (
                <div style={{ fontSize: 11.5, color: t.warning, marginTop: 3 }}>
                  Add an image too — it is the poster shown before the video plays.
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', color: t.textMuted }}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>⇪</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>Drop an image or video here</div>
            <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 3 }}>
              or click to choose · images to 8MB, video to 40MB
            </div>
          </div>
        )}
      </div>

      {has && !busy ? (
        <div style={{ display: 'flex', gap: 7, marginTop: 8, flexWrap: 'wrap' }}>
          <Button size="sm" tone="subtle" disabled={disabled} onClick={() => inputRef.current?.click()}>
            Replace
          </Button>
          {videoUrl ? (
            <Button size="sm" tone="subtle" disabled={disabled} onClick={() => onChange({ videoUrl: null })}>
              Remove video
            </Button>
          ) : null}
          {imageUrl ? (
            <Button size="sm" tone="subtle" disabled={disabled} onClick={() => onChange({ imageUrl: null })}>
              Remove image
            </Button>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div style={{ fontSize: 12, color: t.danger, marginTop: 8, lineHeight: 1.5 }}>{error}</div>
      ) : null}
    </div>
  );
}

/**
 * The same drop zone, for one image and nothing else.
 *
 * Separate from MediaUpload rather than a flag on it, because the two differ in what they
 * upload to as well as what they accept: an announcement's picture goes through the
 * announcement endpoint, which audits it as an announcement action. Sharing the component
 * would have meant sharing that audit line with adverts, and the trail would read wrong.
 */
export function ImageUpload({ imageUrl, onChange, disabled, maxBytes = 4 * 1024 * 1024, hint }: {
  imageUrl: string | null | undefined;
  onChange: (url: string | null) => void;
  disabled?: boolean;
  maxBytes?: number;
  hint?: string;
}) {
  const { t } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const send = (file: File | undefined) => {
    if (!file || busy) return;
    if (!file.type.startsWith('image/')) {
      setError('That is not an image.');
      return;
    }
    if (file.size > maxBytes) {
      setError(`Pictures have to be under ${Math.round(maxBytes / 1024 / 1024)}MB — this loads on a phone right after it buzzes.`);
      return;
    }

    setBusy(true);
    setError(null);
    adminApi.uploadBroadcastImage(file)
      .then(result => onChange(result.url))
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'That upload did not work.'))
      .finally(() => setBusy(false));
  };

  return (
    <div>
      <div
        onDragOver={event => { event.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={event => {
          event.preventDefault();
          setOver(false);
          send(event.dataTransfer.files?.[0]);
        }}
        onClick={() => !disabled && !busy && inputRef.current?.click()}
        style={{
          border: `1.5px dashed ${over ? t.brand : t.borderStrong}`,
          background: over ? t.brandSoft : t.surfaceMuted,
          borderRadius: 12, padding: imageUrl ? 12 : '18px 16px', cursor: disabled ? 'default' : 'pointer',
          transition: 'border-color .15s ease, background .15s ease',
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          disabled={disabled || busy}
          onChange={event => { send(event.target.files?.[0]); event.target.value = ''; }}
          style={{ display: 'none' }}
        />

        {busy ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', color: t.textMuted, fontSize: 13 }}>
            <Spinner size={15} /> Uploading…
          </div>
        ) : imageUrl ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Preview imageUrl={imageUrl} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>Picture attached</div>
              <div style={{ fontSize: 11.5, color: t.textSubtle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {imageUrl.split('/').pop()}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', color: t.textMuted }}>
            <div style={{ fontSize: 20, marginBottom: 5 }}>⇪</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>Drop a picture here</div>
            <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 3 }}>
              {hint ?? `or click to choose · up to ${Math.round(maxBytes / 1024 / 1024)}MB`}
            </div>
          </div>
        )}
      </div>

      {imageUrl && !busy ? (
        <div style={{ display: 'flex', gap: 7, marginTop: 8 }}>
          <Button size="sm" tone="subtle" disabled={disabled} onClick={() => inputRef.current?.click()}>
            Replace
          </Button>
          <Button size="sm" tone="subtle" disabled={disabled} onClick={() => onChange(null)}>
            Remove picture
          </Button>
        </div>
      ) : null}

      {error ? (
        <div style={{ fontSize: 12, color: t.danger, marginTop: 8, lineHeight: 1.5 }}>{error}</div>
      ) : null}
    </div>
  );
}

function Preview({ imageUrl, videoUrl }: { imageUrl?: string | null; videoUrl?: string | null }) {
  const { t } = useTheme();
  const [failed, setFailed] = useState(false);
  const box: React.CSSProperties = {
    width: 62, height: 62, borderRadius: 10, flexShrink: 0, overflow: 'hidden',
    background: t.surface, border: `1px solid ${t.border}`, display: 'grid', placeItems: 'center',
  };

  if (imageUrl && !failed) {
    return (
      <div style={box}>
        <img src={imageUrl} alt="" onError={() => setFailed(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    );
  }
  return <div style={box}><span style={{ fontSize: 18, color: t.textSubtle }}>{videoUrl ? '▶' : '▦'}</span></div>;
}
