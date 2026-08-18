/**
 * The stage door. What stands on the app's FIRST slide — the Discover Spotlight — is
 * decided here: a provider, a quick job, an event or a listing, found by live search,
 * dressed with the administrator's own headline, tagline and badge, scheduled, ordered.
 *
 * The phone preview on the right is drawn with the same layout rules as the app's
 * slide, so what is saved is what riders of the app will actually see. The server
 * resolves everything live at read time — if a target dies later, its row shows
 * "(this target was removed)" here and the app quietly skips it.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi, type SpotlightRow, type SpotlightTarget, type SpotlightUpsert } from '../api/admin';
import { config } from '../api/client';
import { useTheme } from '../theme/ThemeProvider';
import { Select, type Option } from '../components/Select';
import { Button, Card, EmptyState, ErrorNote, Field, Input, Loading, PageHeader, Pill, fmtDateTime } from '../components/ui';

const KINDS = [
  { key: 'provider', label: 'Provider', emoji: '👤', badge: 'SPOTLIGHT' },
  { key: 'job', label: 'Quick job', emoji: '💼', badge: 'HIRING NOW' },
  { key: 'event', label: 'Event', emoji: '🎉', badge: 'EVENT' },
  { key: 'listing', label: 'Listing', emoji: '🛍️', badge: 'FEATURED' },
];

const abs = (u: string | null | undefined) => (!u ? null : u.startsWith('http') ? u : `${config.apiBaseUrl}${u}`);
const toLocal = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16) : '');
const toIso = (local: string) => (local ? new Date(local).toISOString() : null);

type Draft = {
  id: string | null;
  kind: string;
  targetId: string;
  headline: string;
  tagline: string;
  badge: string;
  sortOrder: string;
  startsAt: string;
  endsAt: string;
  enabled: boolean;
};

const EMPTY: Draft = { id: null, kind: 'provider', targetId: '', headline: '', tagline: '', badge: '', sortOrder: '0', startsAt: '', endsAt: '', enabled: true };

export function Spotlight() {
  const { t } = useTheme();
  const [rows, setRows] = useState<SpotlightRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [picked, setPicked] = useState<SpotlightTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const [armDelete, setArmDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try { setRows(await adminApi.spotlights()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load the spotlights.'); setRows([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const set = (patch: Partial<Draft>) => setDraft((prev) => (prev ? { ...prev, ...patch } : prev));

  const startNew = () => { setPicked(null); setDraft({ ...EMPTY, sortOrder: String((rows?.length ?? 0)) }); };

  const startEdit = (row: SpotlightRow) => {
    setPicked({ id: row.targetId, title: row.targetTitle, subtitle: row.targetSubtitle, imageUrl: row.targetImageUrl });
    setDraft({
      id: row.id, kind: row.kind, targetId: row.targetId,
      headline: row.headline ?? '', tagline: row.tagline ?? '', badge: row.badge ?? '',
      sortOrder: String(row.sortOrder), startsAt: toLocal(row.startsAt), endsAt: toLocal(row.endsAt),
      enabled: row.enabled,
    });
  };

  const loadTargets = useMemo(() => {
    const kind = draft?.kind ?? 'provider';
    return async (search: string): Promise<Option[]> => {
      const hits = await adminApi.spotlightSearch(kind, search);
      return hits.map((hit) => ({ value: hit.id, label: hit.title, detail: hit.subtitle ?? undefined }));
    };
  }, [draft?.kind]);

  // The Select hands back only the id; keep the full hit so the preview has a face.
  const rememberPick = async (targetId: string) => {
    set({ targetId });
    try {
      const hits = await adminApi.spotlightSearch(draft?.kind ?? 'provider', '');
      const hit = hits.find((h) => h.id === targetId);
      if (hit) { setPicked(hit); return; }
    } catch { /* the preview falls back to words */ }
    setPicked((prev) => (prev?.id === targetId ? prev : { id: targetId, title: 'Selected', subtitle: null, imageUrl: null }));
  };

  const save = async () => {
    if (!draft || !draft.targetId) { setError('Pick what stands on the stage first.'); return; }
    setBusy(true);
    setError(null);
    const body: SpotlightUpsert = {
      kind: draft.kind, targetId: draft.targetId,
      headline: draft.headline.trim() || null, tagline: draft.tagline.trim() || null, badge: draft.badge.trim() || null,
      sortOrder: Number(draft.sortOrder) || 0,
      startsAt: toIso(draft.startsAt), endsAt: toIso(draft.endsAt),
      enabled: draft.enabled,
    };
    try {
      if (draft.id) { await adminApi.spotlightUpdate(draft.id, body); }
      else { await adminApi.spotlightCreate(body); }
      setDraft(null); setPicked(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the spotlight.');
    } finally { setBusy(false); }
  };

  const remove = async (spotlightId: string) => {
    if (armDelete !== spotlightId) { setArmDelete(spotlightId); return; }
    setArmDelete(null);
    try { await adminApi.spotlightDelete(spotlightId); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not remove it.'); }
  };

  const kindMeta = (key: string) => KINDS.find((k) => k.key === key) ?? KINDS[0];

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="Discover Spotlight"
        subtitle="What stands on the app's first slide. Resolved live — names, photos, ratings and prices are always today's. With nothing configured, the app promotes the best featured provider by itself."
        action={<Button tone="primary" onClick={startNew}>New spotlight</Button>}
      />
      {error ? <ErrorNote message={error} /> : null}

      <div style={{ display: 'grid', gridTemplateColumns: draft ? 'minmax(320px, 1fr) minmax(360px, 420px)' : '1fr', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows === null ? <Loading label="Opening the stage…" /> : rows.length === 0 ? (
            <EmptyState icon="🎬" title="The stage runs itself right now" message="No spotlight is configured, so the app is promoting its best featured provider automatically. Configure one to take the wheel." />
          ) : rows.map((row) => {
            const meta = kindMeta(row.kind);
            const image = abs(row.targetImageUrl);
            return (
              <Card key={row.id} pad={14}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 52, height: 52, borderRadius: 26, overflow: 'hidden', background: t.surfaceMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0, border: `2px solid ${row.liveNow ? '#FF6B2C' : t.border}` }}>
                    {image ? <img src={image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : meta.emoji}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 800, color: t.text, fontSize: 14.5 }}>{row.headline || row.targetTitle}</span>
                      <Pill tone="info">{meta.label}</Pill>
                      {row.liveNow ? <Pill tone="success">LIVE on the stage</Pill> : row.enabled ? <Pill tone="warning">scheduled / waiting</Pill> : <Pill tone="neutral">off</Pill>}
                    </div>
                    <div style={{ color: t.textMuted, fontSize: 12.5, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.headline ? `${row.targetTitle} · ` : ''}{row.targetSubtitle ?? ''}
                    </div>
                    <div style={{ color: t.textSubtle, fontSize: 11.5, marginTop: 2 }}>
                      order {row.sortOrder}
                      {row.startsAt ? ` · from ${fmtDateTime(row.startsAt)}` : ''}
                      {row.endsAt ? ` · until ${fmtDateTime(row.endsAt)}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <Button size="sm" onClick={() => startEdit(row)}>Edit</Button>
                    <Button size="sm" tone={armDelete === row.id ? 'danger' : 'subtle'} onClick={() => void remove(row.id)}>{armDelete === row.id ? 'Sure?' : 'Remove'}</Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {draft ? (
          <Card pad={18}>
            <div style={{ fontWeight: 800, color: t.text, fontSize: 15, marginBottom: 12 }}>{draft.id ? 'Edit the spotlight' : 'Put something on the stage'}</div>

            <Field label="What kind of thing stands there?">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {KINDS.map((k) => (
                  <button
                    key={k.key}
                    onClick={() => { set({ kind: k.key, targetId: '' }); setPicked(null); }}
                    style={{
                      cursor: 'pointer', borderRadius: 999, padding: '7px 13px', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit',
                      border: `1.5px solid ${draft.kind === k.key ? '#FF6B2C' : t.border}`,
                      background: draft.kind === k.key ? 'rgba(255,107,44,0.12)' : 'transparent', color: t.text,
                    }}>
                    {k.emoji} {k.label}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Who or what, exactly" hint="Live search — type a name or title.">
              <Select key={draft.kind} value={draft.targetId || null} load={loadTargets} onChange={(value) => void rememberPick(value)} placeholder={`Find a ${kindMeta(draft.kind).label.toLowerCase()}…`} />
            </Field>

            <Field label="Headline (optional)" hint="Your words over the card. Left empty, the target's own name leads.">
              <Input value={draft.headline} onChange={(value) => set({ headline: value })} placeholder="e.g. Provider of the week" />
            </Field>
            <Field label="Tagline (optional)">
              <Input value={draft.tagline} onChange={(value) => set({ tagline: value })} placeholder="One small line under the headline" />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Badge (optional)" hint={`Default: ${kindMeta(draft.kind).badge}`}>
                <Input value={draft.badge} onChange={(value) => set({ badge: value })} placeholder={kindMeta(draft.kind).badge} />
              </Field>
              <Field label="Order" hint="Lower shows first.">
                <Input type="number" value={draft.sortOrder} onChange={(value) => set({ sortOrder: value })} />
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="From (optional)">
                <Input type="datetime-local" value={draft.startsAt} onChange={(value) => set({ startsAt: value })} />
              </Field>
              <Field label="Until (optional)">
                <Input type="datetime-local" value={draft.endsAt} onChange={(value) => set({ endsAt: value })} />
              </Field>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, cursor: 'pointer' }}>
              <input type="checkbox" checked={draft.enabled} onChange={(event) => set({ enabled: event.target.checked })} />
              <span style={{ color: t.text, fontSize: 13, fontWeight: 600 }}>On the stage (subject to the schedule above)</span>
            </label>

            {/* The phone preview — the same layout rules as the app's slide. */}
            <div style={{ fontSize: 12, fontWeight: 700, color: t.textMuted, marginBottom: 6 }}>How the phone draws it</div>
            <div style={{ borderRadius: 22, border: '1.5px solid #FF6B2C', background: '#0e1526', padding: 16, marginBottom: 14, position: 'relative', overflow: 'hidden', minHeight: 150 }}>
              <div style={{ position: 'absolute', top: -54, right: -54, width: 170, height: 170, borderRadius: 85, background: 'rgba(255,107,44,0.14)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
                <span style={{ background: 'rgba(255,107,44,0.16)', color: '#FF8A50', borderRadius: 999, padding: '3px 10px', fontSize: 10, fontWeight: 900, letterSpacing: 1.2 }}>
                  ✨ {(draft.badge.trim() || kindMeta(draft.kind).badge).toUpperCase()}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginTop: 12, position: 'relative' }}>
                <div style={{ width: 74, height: 74, borderRadius: 37, border: '2.5px solid #FF6B2C', padding: 3, flexShrink: 0 }}>
                  <div style={{ width: '100%', height: '100%', borderRadius: 34, overflow: 'hidden', background: '#1c2740', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>
                    {abs(picked?.imageUrl) ? <img src={abs(picked?.imageUrl) ?? undefined} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : kindMeta(draft.kind).emoji}
                  </div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: '#f4f7ff', fontSize: 16.5, fontWeight: 900, lineHeight: 1.25 }}>
                    {draft.headline.trim() || picked?.title || 'Pick a target…'}
                  </div>
                  <div style={{ color: '#FF8A50', fontSize: 12, fontWeight: 800, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {draft.headline.trim() ? (picked?.title ?? '') : (draft.tagline.trim() || picked?.subtitle || '')}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <span style={{ background: '#FF6B2C', color: '#1a0c04', borderRadius: 999, padding: '5px 12px', fontSize: 11, fontWeight: 800 }}>
                      {draft.kind === 'provider' ? 'View full profile' : draft.kind === 'job' ? 'See the job' : draft.kind === 'event' ? 'See the event' : 'See the listing'} →
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Button onClick={() => { setDraft(null); setPicked(null); }}>Cancel</Button>
              <Button tone="primary" onClick={() => void save()} disabled={busy || !draft.targetId}>{busy ? 'Saving…' : draft.id ? 'Save changes' : 'Put it on the stage'}</Button>
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
