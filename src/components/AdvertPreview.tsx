/**
 * What the advert will actually look like — not an impression of it.
 *
 * Each renderer here is a deliberate port of the real surface: the mobile promo slide, the
 * mobile hero card, the full-screen popup, and the web rail card. Sizes, radii, type scale
 * and colour roles are copied from those components rather than invented, so an advert that
 * looks right here looks right on the phone. Where the real surface has a shape the console
 * cannot reproduce exactly (a native video player, an OS status bar) it is drawn rather
 * than faked with a screenshot, and the difference is admitted in the frame around it.
 *
 * The previous preview was one generic card for all four slots, which is why an advert
 * could look finished here and wrong in the app.
 */
import { useState } from 'react';
import { useTheme } from '../theme/ThemeProvider';

const ORANGE = '#FF6B2C';

/** The mobile theme's roles, as the app actually resolves them. */
const MOBILE = {
  primary: '#2A4E82',
  primarySoft: 'rgba(42,78,130,.12)',
  secondary: '#64748B',
  secondarySoft: 'rgba(100,116,139,.14)',
  verified: '#15803D',
  verifiedSoft: 'rgba(21,128,61,.13)',
  card: '#FFFFFF',
  surfaceMuted: '#F1F5F9',
  border: '#E2E8F0',
  text: '#0F172A',
  textMuted: '#64748B',
  primaryText: '#FFFFFF',
};

export type PreviewAdvert = {
  kicker?: string | null;
  title: string;
  body?: string | null;
  meta?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  ctaLabel?: string | null;
  tone: number;
};

export type PreviewSurface = 'promo' | 'hero' | 'popup' | 'web';

export const SURFACES: { value: PreviewSurface; label: string; placement: string }[] = [
  { value: 'promo', label: 'Promo rail', placement: 'MobilePromoRail' },
  { value: 'hero', label: 'Hero', placement: 'MobileHero' },
  { value: 'popup', label: 'Popup', placement: 'MobilePopup' },
  { value: 'web', label: 'Web card', placement: 'WebDiscover' },
];

/** Tone → the accent the real surface uses. Mirrors the apps' own mapping exactly. */
function accentFor(tone: number) {
  return tone === 2 ? MOBILE.secondary : tone === 3 ? MOBILE.verified : MOBILE.primary;
}
function softFor(tone: number) {
  return tone === 2 ? MOBILE.secondarySoft : tone === 3 ? MOBILE.verifiedSoft : MOBILE.primarySoft;
}

export function AdvertPreview({ advert, surface }: { advert: PreviewAdvert; surface: PreviewSurface }) {
  if (surface === 'promo') return <PromoSlide advert={advert} />;
  if (surface === 'hero') return <HeroCard advert={advert} />;
  if (surface === 'popup') return <PopupCard advert={advert} />;
  return <WebCard advert={advert} />;
}

/* ---------- mobile promo rail — a port of PromoSlide in DiscoverPage ---------- */

function PromoSlide({ advert }: { advert: PreviewAdvert }) {
  const accent = accentFor(advert.tone);
  const soft = softFor(advert.tone);

  return (
    <Phone label="Promo rail · Discover">
      <div style={{
        width: 250, minHeight: 132, position: 'relative', overflow: 'hidden',
        background: MOBILE.card, border: `1px solid ${MOBILE.border}`, borderRadius: 18,
        padding: 14, boxSizing: 'border-box',
        boxShadow: '0 2px 10px rgba(15,23,42,.08)',
      }}>
        {/* the three decorative plates the real slide draws behind its text */}
        <div style={{ position: 'absolute', right: -26, top: -26, width: 92, height: 92, borderRadius: '50%', background: soft }} />
        <div style={{ position: 'absolute', right: 12, bottom: 12, width: 58, height: 58, borderRadius: 14, background: MOBILE.surfaceMuted, border: `1px solid ${MOBILE.border}` }} />
        <div style={{ position: 'absolute', left: -4, bottom: 26, width: 22, height: 4, borderRadius: 2, background: accent }} />

        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
            <span style={{
              fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4, padding: '3px 8px',
              borderRadius: 999, background: soft, color: accent,
            }}>
              {advert.kicker || 'Vacancy'}
            </span>
            {advert.meta ? (
              <span style={{ fontSize: 11, fontWeight: 800, color: accent }}>{advert.meta}</span>
            ) : null}
          </div>
          <div style={{
            fontSize: 14.5, fontWeight: 800, color: MOBILE.text, lineHeight: 1.22, maxWidth: 160,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {advert.title || 'Your headline'}
          </div>
          {advert.body ? (
            <div style={{
              fontSize: 11.5, color: MOBILE.textMuted, marginTop: 5, maxWidth: 150, lineHeight: 1.4,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>
              {advert.body}
            </div>
          ) : null}
        </div>

        <Thumb advert={advert} size={54} style={{ position: 'absolute', right: 12, bottom: 12, borderRadius: 14 }} />
        <div style={{
          position: 'absolute', right: 12, top: 12, width: 22, height: 22, borderRadius: '50%',
          background: accent, color: MOBILE.primaryText, display: 'grid', placeItems: 'center',
          fontSize: 12, fontWeight: 900,
        }}>›</div>
      </div>
    </Phone>
  );
}

/* ---------- mobile hero — a port of the HeroCarousel slide ---------- */

function HeroCard({ advert }: { advert: PreviewAdvert }) {
  const accent = accentFor(advert.tone);
  const soft = softFor(advert.tone);

  return (
    <Phone label="Hero carousel · Discover">
      <div style={{
        width: 268, minHeight: 176, position: 'relative', overflow: 'hidden',
        background: MOBILE.card, border: `1px solid ${MOBILE.border}`, borderRadius: 22,
        padding: 18, boxSizing: 'border-box', boxShadow: '0 3px 14px rgba(15,23,42,.09)',
      }}>
        <div style={{ position: 'absolute', left: -36, top: -36, width: 128, height: 128, borderRadius: '50%', background: soft }} />
        <div style={{ position: 'absolute', right: -18, top: 22, width: 74, height: 74, borderRadius: '50%', border: `2px solid ${accent}`, opacity: 0.4 }} />
        <div style={{ position: 'absolute', right: 18, bottom: 52, width: 46, height: 30, borderRadius: 8, background: MOBILE.surfaceMuted, border: `1px solid ${MOBILE.border}` }} />

        <div style={{ position: 'relative' }}>
          {advert.kicker ? (
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.1, color: accent, marginBottom: 7 }}>
              {advert.kicker.toUpperCase()}
            </div>
          ) : null}
          <div style={{ fontSize: 19, fontWeight: 800, color: MOBILE.text, lineHeight: 1.16, letterSpacing: -0.4 }}>
            {advert.title || 'Your headline'}
          </div>
          {advert.body ? (
            <div style={{ fontSize: 12.5, color: MOBILE.textMuted, marginTop: 8, lineHeight: 1.5 }}>{advert.body}</div>
          ) : null}
          {advert.ctaLabel ? (
            <div style={{
              display: 'inline-block', marginTop: 14, padding: '9px 15px', borderRadius: 999,
              background: MOBILE.primary, color: MOBILE.primaryText, fontSize: 12.5, fontWeight: 800,
            }}>
              {advert.ctaLabel} →
            </div>
          ) : null}
        </div>

        {/* the dot indicators the real carousel always shows */}
        <div style={{ position: 'absolute', bottom: 12, left: 18, display: 'flex', gap: 5 }}>
          {[0, 1, 2].map(dot => (
            <span key={dot} style={{
              width: dot === 0 ? 14 : 5, height: 5, borderRadius: 3,
              background: dot === 0 ? accent : MOBILE.border,
            }} />
          ))}
        </div>
      </div>
    </Phone>
  );
}

/* ---------- the popup — full screen, and the one that interrupts ---------- */

function PopupCard({ advert }: { advert: PreviewAdvert }) {
  const accent = accentFor(advert.tone);
  const hasVideo = Boolean(advert.videoUrl);

  return (
    <Phone label="Full-screen popup" dark>
      <div style={{
        width: 268, height: 400, borderRadius: 24, overflow: 'hidden', position: 'relative',
        background: MOBILE.card, boxShadow: '0 12px 34px rgba(2,6,23,.35)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* media fills the top half, exactly as the real popup does */}
        <div style={{
          height: 196, background: MOBILE.surfaceMuted, position: 'relative',
          display: 'grid', placeItems: 'center', overflow: 'hidden',
        }}>
          {advert.imageUrl ? (
            <img src={advert.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ fontSize: 12, color: MOBILE.textMuted }}>
              {hasVideo ? 'Video' : 'No media yet'}
            </span>
          )}
          {hasVideo ? (
            <span style={{
              position: 'absolute', width: 46, height: 46, borderRadius: '50%',
              background: 'rgba(15,23,42,.62)', color: '#FFFFFF',
              display: 'grid', placeItems: 'center', fontSize: 16, paddingLeft: 3,
            }}>▶</span>
          ) : null}
          <span style={{
            position: 'absolute', top: 12, right: 12, width: 26, height: 26, borderRadius: '50%',
            background: 'rgba(15,23,42,.55)', color: '#FFFFFF', display: 'grid', placeItems: 'center',
            fontSize: 13, fontWeight: 700,
          }}>×</span>
        </div>

        <div style={{ padding: 18, flex: 1, display: 'flex', flexDirection: 'column' }}>
          {advert.kicker ? (
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.2, color: ORANGE, marginBottom: 7 }}>
              {advert.kicker.toUpperCase()}
            </div>
          ) : null}
          <div style={{ fontSize: 20, fontWeight: 800, color: MOBILE.text, lineHeight: 1.18, letterSpacing: -0.4 }}>
            {advert.title || 'Your headline'}
          </div>
          {advert.body ? (
            <div style={{ fontSize: 13, color: MOBILE.textMuted, marginTop: 8, lineHeight: 1.55 }}>{advert.body}</div>
          ) : null}

          <div style={{ marginTop: 'auto', paddingTop: 14 }}>
            <div style={{
              height: 44, borderRadius: 12, background: accent, color: MOBILE.primaryText,
              display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 800,
            }}>
              {advert.ctaLabel || 'Open'}
            </div>
            <div style={{ textAlign: 'center', fontSize: 12, color: MOBILE.textMuted, marginTop: 10 }}>
              Not now
            </div>
          </div>
        </div>
      </div>
    </Phone>
  );
}

/* ---------- the web card — a port of AdvertRail's card ---------- */

function WebCard({ advert }: { advert: PreviewAdvert }) {
  const { t } = useTheme();
  const skins: Record<number, { bg: string; text: string; soft: string }> = {
    1: { bg: 'linear-gradient(135deg,#2A4E82,#1B3557)', text: '#FFFFFF', soft: 'rgba(255,255,255,.72)' },
    2: { bg: 'linear-gradient(135deg,#F1F5F9,#E2E8F0)', text: '#0F172A', soft: '#475569' },
    3: { bg: 'linear-gradient(135deg,#15803D,#0F5F2E)', text: '#FFFFFF', soft: 'rgba(255,255,255,.75)' },
    4: { bg: 'linear-gradient(135deg,#0B1220,#1E293B)', text: '#FFFFFF', soft: 'rgba(255,255,255,.66)' },
  };
  const skin = skins[advert.tone] ?? skins[1];

  return (
    <Frame label="Web · Discover rail">
      <div style={{
        width: 268, minHeight: 146, borderRadius: 16, padding: 20, boxSizing: 'border-box',
        background: skin.bg, color: skin.text, position: 'relative', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        boxShadow: '0 1px 2px rgba(15,23,42,.06)',
      }}>
        {advert.imageUrl ? (
          <div style={{
            position: 'absolute', inset: 0, backgroundImage: `url(${advert.imageUrl})`,
            backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.22,
          }} />
        ) : null}
        <div style={{ position: 'relative' }}>
          {advert.kicker ? (
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1.3, color: ORANGE, marginBottom: 6 }}>
              {advert.kicker.toUpperCase()}
            </div>
          ) : null}
          <div style={{ fontSize: 19, fontWeight: 800, lineHeight: 1.22, letterSpacing: -0.3 }}>
            {advert.title || 'Your headline'}
          </div>
          {advert.body ? (
            <div style={{ fontSize: 13, color: skin.soft, marginTop: 6, lineHeight: 1.5 }}>{advert.body}</div>
          ) : null}
        </div>
        {advert.ctaLabel || advert.meta ? (
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 14 }}>
            {advert.ctaLabel ? (
              <span style={{ fontSize: 12.5, fontWeight: 800, padding: '7px 14px', borderRadius: 999, background: ORANGE, color: '#FFFFFF' }}>
                {advert.ctaLabel} →
              </span>
            ) : <span />}
            {advert.meta ? <span style={{ fontSize: 12, color: skin.soft }}>{advert.meta}</span> : null}
          </div>
        ) : null}
      </div>
      <div style={{ fontSize: 11, color: t.textSubtle, marginTop: 8, textAlign: 'center' }}>
        Also used on the landing page, at a smaller size.
      </div>
    </Frame>
  );
}

/* ---------- chrome ---------- */

/** A phone bezel, so the mobile previews are read at the size they will actually be. */
function Phone({ children, label, dark = false }: { children: React.ReactNode; label: string; dark?: boolean }) {
  const { t } = useTheme();
  return (
    <div>
      <div style={{
        background: dark ? '#0A1729' : '#F8FAFC',
        border: `1px solid ${dark ? '#1E293B' : MOBILE.border}`,
        borderRadius: 26, padding: '30px 16px 20px', position: 'relative',
        display: 'grid', placeItems: 'center',
      }}>
        {/* the notch, purely so the eye reads this as a phone and judges the size right */}
        <span style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          width: 56, height: 5, borderRadius: 3, background: dark ? '#1E293B' : MOBILE.border,
        }} />
        {children}
      </div>
      <div style={{ fontSize: 11, color: t.textSubtle, marginTop: 8, textAlign: 'center' }}>{label}</div>
    </div>
  );
}

function Frame({ children, label }: { children: React.ReactNode; label: string }) {
  const { t } = useTheme();
  return (
    <div>
      <div style={{
        background: t.surfaceMuted, border: `1px solid ${t.border}`, borderRadius: 18,
        padding: 20, display: 'grid', placeItems: 'center',
      }}>
        {children}
      </div>
      <div style={{ fontSize: 11, color: t.textSubtle, marginTop: 8, textAlign: 'center' }}>{label}</div>
    </div>
  );
}

/** The small square of artwork the promo slide carries on its right. */
function Thumb({ advert, size, style }: { advert: PreviewAdvert; size: number; style?: React.CSSProperties }) {
  const [failed, setFailed] = useState(false);
  const base: React.CSSProperties = {
    width: size, height: size, overflow: 'hidden',
    background: MOBILE.surfaceMuted, border: `1px solid ${MOBILE.border}`,
    display: 'grid', placeItems: 'center', ...style,
  };

  if (advert.imageUrl && !failed) {
    return (
      <div style={base}>
        <img
          src={advert.imageUrl}
          alt=""
          onError={() => setFailed(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>
    );
  }

  return (
    <div style={base}>
      <span style={{ fontSize: 15, color: MOBILE.textMuted }}>{advert.videoUrl ? '▶' : '▦'}</span>
    </div>
  );
}
