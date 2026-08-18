/**
 * Adverts: what the platform puts in front of people, and where.
 *
 * The editor shows a live preview beside the form, because the only useful question while
 * writing an advert is "what will this actually look like?" — and the answer should not
 * require saving, switching to a phone, and pulling to refresh.
 *
 * Everything here is placed by an administrator. Nothing is bought: there is no self-serve
 * path and no money moves, so the counters exist to tell you whether a slot is working,
 * not to bill anyone for it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import {
  Button, Card, EmptyState, ErrorNote, Field, Input, Loading, Modal, PageHeader, Pill,
  Spinner, Textarea, Toasts, useToasts,
} from '../components/ui';
import { MultiSelect, Select, type Option } from '../components/Select';
import { Pagination } from '../components/Pagination';
import { MediaUpload } from '../components/MediaUpload';
import { AdvertPreview, SURFACES, type PreviewSurface } from '../components/AdvertPreview';
import {
  adminApi, AdvertTargetType, AUDIENCES, PLACEMENTS,
  type Advert, type AdvertPage, type AdvertWrite,
} from '../api/admin';

const ORANGE = '#FF6B2C';

const STATUS_OPTIONS = [
  { value: '', label: 'Every advert' },
  { value: 'live', label: 'Running now' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'ended', label: 'Finished' },
  { value: 'off', label: 'Switched off' },
];

const SORT_OPTIONS = [
  { value: '-priority', label: 'Priority (highest first)' },
  { value: '-created', label: 'Newest first' },
  { value: '-impressions', label: 'Most seen' },
  { value: '-clicks', label: 'Most tapped' },
  { value: 'title', label: 'Title (A–Z)' },
];

const TONE_OPTIONS = [
  { value: '1', label: 'Primary', detail: 'Navy — the house style' },
  { value: '2', label: 'Secondary', detail: 'Soft grey, for quieter notices' },
  { value: '3', label: 'Verified', detail: 'Green — trust and confirmation' },
  { value: '4', label: 'Dark', detail: 'High contrast, for big moments' },
];

const TARGET_OPTIONS: Option[] = [
  { value: String(AdvertTargetType.None), label: 'Nothing — just a notice', detail: 'Not tappable' },
  { value: String(AdvertTargetType.Screen), label: 'An app screen', detail: 'Discover, Jobs, Learn…' },
  { value: String(AdvertTargetType.Provider), label: 'A provider', detail: 'Opens their profile' },
  { value: String(AdvertTargetType.Skill), label: 'A service', detail: 'Opens that service' },
  { value: String(AdvertTargetType.Category), label: 'A category', detail: 'Opens that category' },
  { value: String(AdvertTargetType.TrainingClass), label: 'A class', detail: 'Opens the class' },
  { value: String(AdvertTargetType.JobPost), label: 'A job', detail: 'Opens the job post' },
  { value: String(AdvertTargetType.ExternalUrl), label: 'A web link', detail: 'Leaves the app' },
];

/** What the API calls each target type when searching for candidates. */
const TARGET_SEARCH_KEY: Record<number, string> = {
  [AdvertTargetType.Provider]: 'provider',
  [AdvertTargetType.Skill]: 'skill',
  [AdvertTargetType.Category]: 'category',
  [AdvertTargetType.TrainingClass]: 'class',
  [AdvertTargetType.JobPost]: 'job',
};

type Draft = AdvertWrite & { id?: string };

const BLANK: Draft = {
  title: '', kicker: '', body: '', meta: '', imageUrl: '', videoUrl: '', ctaLabel: '',
  tone: 1, targetType: AdvertTargetType.None,
  targetEntityId: null, targetRoute: null, targetUrl: null, targetCity: null,
  placements: ['MobilePromoRail'], audience: [],
  startsAt: null, endsAt: null, priority: 0, active: true,
};

export function Adverts() {
  const { t } = useTheme();
  const { toasts, push } = useToasts();

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [placement, setPlacement] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('-priority');
  const [pageIndex, setPageIndex] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [page, setPage] = useState<AdvertPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [removing, setRemoving] = useState<Advert | null>(null);
  const [removeReason, setRemoveReason] = useState('');
  const [sending, setSending] = useState<Advert | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => { setDebounced(search.trim()); setPageIndex(1); }, 260);
    return () => window.clearTimeout(timer);
  }, [search]);

  const seq = useRef(0);
  const load = useCallback(() => {
    const mine = ++seq.current;
    setLoading(true);
    adminApi.adverts({
      search: debounced || undefined, placement: placement || undefined,
      status: status || undefined, sort, pageIndex, pageSize,
    })
      .then(result => { if (mine === seq.current) { setPage(result); setError(null); } })
      .catch((caught: unknown) => {
        if (mine === seq.current) setError(caught instanceof Error ? caught.message : 'Could not load the adverts.');
      })
      .finally(() => { if (mine === seq.current) setLoading(false); });
  }, [debounced, placement, status, sort, pageIndex, pageSize]);
  useEffect(load, [load]);

  const run = (work: Promise<unknown>, done: string) => {
    setBusy(true);
    work
      .then(() => { push(done); load(); setDraft(null); setRemoving(null); setRemoveReason(''); })
      .catch((caught: unknown) => push(caught instanceof Error ? caught.message : 'That did not work.', 'error'))
      .finally(() => setBusy(false));
  };

  const edit = (advert: Advert) => setDraft({
    id: advert.id,
    title: advert.title, kicker: advert.kicker ?? '', body: advert.body ?? '',
    meta: advert.meta ?? '', imageUrl: advert.imageUrl ?? '', videoUrl: advert.videoUrl ?? '',
    ctaLabel: advert.ctaLabel ?? '',
    tone: advert.tone, targetType: advert.targetType,
    targetEntityId: advert.targetEntityId, targetRoute: advert.targetRoute, targetUrl: advert.targetUrl,
    targetCity: advert.targetCity,
    placements: advert.placementNames,
    audience: advert.audienceNames.filter(name => name !== 'Everyone'),
    startsAt: advert.startsAt, endsAt: advert.endsAt,
    priority: advert.priority, active: advert.active,
  });

  return (
    <>
      <PageHeader
        title="Adverts"
        subtitle="What people see when they open the app. Placed here — never bought, and never automatic."
        action={<Button tone="primary" onClick={() => setDraft({ ...BLANK })}>＋ New advert</Button>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 11, marginBottom: 15 }}>
        <Tally label="Running now" value={page?.liveCount ?? null} tone="success" onClick={() => { setStatus('live'); setPageIndex(1); }} />
        <Tally label="Scheduled" value={page?.scheduledCount ?? null} tone="info" onClick={() => { setStatus('scheduled'); setPageIndex(1); }} />
        <Tally label="Finished" value={page?.endedCount ?? null} onClick={() => { setStatus('ended'); setPageIndex(1); }} />
        <Tally label="All adverts" value={page?.totalCount ?? null} onClick={() => { setStatus(''); setPageIndex(1); }} />
      </div>

      <Card pad={0}>
        <div style={{
          display: 'flex', gap: 9, padding: '13px 14px', flexWrap: 'wrap', alignItems: 'center',
          borderBottom: `1px solid ${t.border}`,
        }}>
          <div style={{ flex: 1, minWidth: 210, position: 'relative' }}>
            <Input value={search} onChange={setSearch} placeholder="Search adverts…" />
            {loading ? (
              <span style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)' }}><Spinner size={14} /></span>
            ) : null}
          </div>
          <Select
            width={205}
            value={placement}
            onChange={value => { setPlacement(value); setPageIndex(1); }}
            clearable
            clearLabel="Every placement"
            placeholder="Every placement"
            options={PLACEMENTS}
          />
          <Select width={165} value={status} onChange={value => { setStatus(value); setPageIndex(1); }} options={STATUS_OPTIONS} />
          <Select width={196} align="right" value={sort} onChange={setSort} options={SORT_OPTIONS} />
        </div>

        <div style={{ padding: '4px 14px 14px' }}>
          {error ? <div style={{ padding: 14 }}><ErrorNote message={error} /></div>
            : !page ? <Loading />
            : page.items.length === 0 ? (
              <EmptyState
                icon="◈"
                title="No adverts yet"
                message="Place the first one and it appears on the app's home screen within seconds."
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 10 }}>
                {page.items.map(advert => (
                  <Row
                    key={advert.id}
                    advert={advert}
                    busy={busy}
                    onEdit={() => edit(advert)}
                    onToggle={() => run(
                      adminApi.setAdvertActive(advert.id, !advert.active),
                      advert.active ? 'Switched off.' : 'Running.')}
                    onRemove={() => { setRemoving(advert); setRemoveReason(''); }}
                    onSend={() => setSending(advert)}
                  />
                ))}
              </div>
            )}

          {page && page.items.length > 0 ? (
            <Pagination
              pageIndex={page.pageIndex} pageSize={page.pageSize} totalCount={page.totalCount}
              onPage={setPageIndex} onPageSize={size => { setPageSize(size); setPageIndex(1); }}
              noun="advert"
            />
          ) : null}
        </div>
      </Card>

      {draft ? (
        <Editor
          draft={draft}
          setDraft={setDraft}
          busy={busy}
          onClose={() => setDraft(null)}
          onSave={() => {
            const body: AdvertWrite = {
              ...draft,
              kicker: draft.kicker?.trim() || null,
              body: draft.body?.trim() || null,
              meta: draft.meta?.trim() || null,
              imageUrl: draft.imageUrl?.trim() || null,
              videoUrl: draft.videoUrl?.trim() || null,
              ctaLabel: draft.ctaLabel?.trim() || null,
              title: draft.title.trim(),
            };
            run(draft.id ? adminApi.updateAdvert(draft.id, body) : adminApi.createAdvert(body),
              draft.id ? 'Advert updated.' : 'Advert placed.');
          }}
        />
      ) : null}

      {sending ? (
        <Modal title={`Send “${sending.title}” to phones?`} onClose={() => setSending(null)}>
          <p style={{ color: t.textMuted, fontSize: 13.5, lineHeight: 1.6, margin: '0 0 12px' }}>
            This fires a real notification to{' '}
            <strong style={{ color: t.text }}>
              {sending.audienceNames[0] === 'Everyone' ? 'everyone with the app installed' : sending.audienceNames.join(', ')}
            </strong>
            , and the advert opens full-screen when they next open it.
          </p>
          <div style={{
            padding: '11px 13px', background: t.warningSoft, border: `1px solid ${t.warning}`,
            borderRadius: 11, color: t.warning, fontSize: 12.5, lineHeight: 1.6, marginBottom: 14,
          }}>
            Each person sees it once and never again — so there is no undo, and sending twice
            reaches nobody new.
            {sending.pushCount > 0
              ? ` It has already gone to ${sending.pushCount.toLocaleString()}; only people who have not seen it will get anything.`
              : ''}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button tone="subtle" onClick={() => setSending(null)}>Cancel</Button>
            <Button
              tone="primary"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                adminApi.pushAdvert(sending.id)
                  .then(result => { push(result.message); setSending(null); load(); })
                  .catch((caught: unknown) => push(caught instanceof Error ? caught.message : 'The send did not work.', 'error'))
                  .finally(() => setBusy(false));
              }}
            >
              {busy ? 'Sending…' : 'Send now'}
            </Button>
          </div>
        </Modal>
      ) : null}

      {removing ? (
        <Modal title={`Remove “${removing.title}”?`} onClose={() => setRemoving(null)}>
          <p style={{ color: t.textMuted, fontSize: 13.5, lineHeight: 1.6, margin: '0 0 14px' }}>
            It stops showing immediately. Its {removing.impressionCount.toLocaleString()} view
            {removing.impressionCount === 1 ? '' : 's'} and {removing.clickCount.toLocaleString()} tap
            {removing.clickCount === 1 ? '' : 's'} are kept, so you can still answer “how did that one do?” later.
          </p>
          <Field label="Reason" hint="Recorded on the audit trail beside your name.">
            <Input value={removeReason} onChange={setRemoveReason} placeholder="e.g. Campaign finished" autoFocus />
          </Field>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button tone="subtle" onClick={() => setRemoving(null)}>Cancel</Button>
            <Button
              tone="danger"
              disabled={busy}
              onClick={() => run(adminApi.removeAdvert(removing.id, removeReason.trim() || 'Removed from the console.'), 'Advert removed.')}
            >
              {busy ? 'Removing…' : 'Remove'}
            </Button>
          </div>
        </Modal>
      ) : null}

      <Toasts toasts={toasts} />
    </>
  );
}

/* ---------- one advert in the list ---------- */

function Row({ advert, busy, onEdit, onToggle, onRemove, onSend }: {
  advert: Advert; busy: boolean;
  onEdit: () => void; onToggle: () => void; onRemove: () => void; onSend: () => void;
}) {
  const { t } = useTheme();
  return (
    <div style={{
      display: 'flex', gap: 13, alignItems: 'center', flexWrap: 'wrap',
      border: `1px solid ${advert.live ? t.border : t.border}`, borderRadius: 13, padding: 13,
      background: advert.live ? t.surface : t.surfaceMuted,
      borderLeft: `3px solid ${advert.live ? t.success : advert.active ? t.info : t.borderStrong}`,
    }}>
      <SlidePreview advert={advert} width={168} compact />

      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
          <span style={{ fontSize: 14.5, fontWeight: 800, color: t.text }}>{advert.title}</span>
          <Pill tone={advert.live ? 'success' : advert.active ? 'info' : 'neutral'}>{advert.statusLabel}</Pill>
          {advert.priority !== 0 ? <Pill tone="accent">Priority {advert.priority}</Pill> : null}
        </div>

        <div style={{ fontSize: 12.5, color: t.textMuted, marginBottom: 6 }}>
          {advert.placementNames.map(prettyPlacement).join(' · ')}
          {advert.audienceNames[0] !== 'Everyone' ? ` — ${advert.audienceNames.join(', ')} only` : ''}
        </div>

        <div style={{ fontSize: 12, color: t.textSubtle }}>
          {advert.targetTypeName}
          {advert.targetLabel ? <> → <strong style={{ color: t.textMuted }}>{advert.targetLabel}</strong></> : null}
        </div>
      </div>

      <div style={{ textAlign: 'right', minWidth: 110 }}>
        <div style={{ fontSize: 12.5, color: t.textMuted }}>
          <strong style={{ color: t.text }}>{advert.impressionCount.toLocaleString()}</strong> seen
        </div>
        <div style={{ fontSize: 12.5, color: t.textMuted }}>
          <strong style={{ color: t.text }}>{advert.clickCount.toLocaleString()}</strong> tapped
        </div>
        <div style={{ fontSize: 11.5, color: advert.clickRate >= 2 ? t.success : t.textSubtle, marginTop: 2 }}>
          {advert.impressionCount === 0 ? 'Not shown yet' : `${advert.clickRate}% tap rate`}
        </div>
        {advert.canPush && advert.pushCount > 0 ? (
          <div style={{ fontSize: 11.5, color: t.textMuted, marginTop: 5, paddingTop: 5, borderTop: `1px solid ${t.border}` }}>
            Pushed to {advert.pushCount.toLocaleString()} · seen by {advert.seenCount.toLocaleString()}
          </div>
        ) : null}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {advert.canPush ? (
          <Button
            size="sm"
            tone="primary"
            disabled={busy || !advert.live}
            title={advert.live ? 'Send this to phones now' : 'It has to be running before you can send it'}
            onClick={onSend}
          >
            ⇱ Send
          </Button>
        ) : null}
        <Button size="sm" tone="subtle" onClick={onEdit}>Edit</Button>
        <Button size="sm" tone={advert.active ? 'subtle' : 'primary'} disabled={busy} onClick={onToggle}>
          {advert.active ? 'Switch off' : 'Switch on'}
        </Button>
        <Button size="sm" tone="danger" disabled={busy} onClick={onRemove}>Remove</Button>
      </div>
    </div>
  );
}

/* ---------- the editor ---------- */

function Editor({ draft, setDraft, busy, onClose, onSave }: {
  draft: Draft; setDraft: (draft: Draft) => void; busy: boolean; onClose: () => void; onSave: () => void;
}) {
  const { t } = useTheme();
  const [screens, setScreens] = useState<Option[]>([]);
  const [surface, setSurface] = useState<PreviewSurface>('promo');

  // Falls back to the first surface this advert actually runs on, so unticking a placement
  // never leaves the preview showing a slot the advert is no longer in.
  const available = SURFACES.filter(item => draft.placements.includes(item.placement)
    || (item.value === 'web' && draft.placements.includes('WebLanding')));
  const visibleSurface = available.some(item => item.value === surface)
    ? surface
    : (available[0]?.value ?? 'promo');

  useEffect(() => {
    adminApi.advertScreens()
      .then(list => setScreens(list.map(screen => ({ value: screen.key, label: screen.label }))))
      .catch(() => setScreens([]));
  }, []);

  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });

  // Changing the target type clears whatever the last one pointed at, so an advert can
  // never keep a stale provider id from a previous choice.
  const setTargetType = (value: string) => set({
    targetType: Number(value), targetEntityId: null, targetRoute: null, targetUrl: null,
  });

  const searchKey = TARGET_SEARCH_KEY[draft.targetType];
  const loadTargets = useCallback(async (term: string) => {
    if (!searchKey) return [];
    const results = await adminApi.advertTargets(searchKey, term);
    return results.map(option => ({ value: option.id, label: option.label, detail: option.detail ?? undefined }));
  }, [searchKey]);

  const ready = draft.title.trim().length >= 3
    && draft.placements.length > 0
    && (draft.targetType !== AdvertTargetType.Screen || Boolean(draft.targetRoute))
    && (draft.targetType !== AdvertTargetType.ExternalUrl || /^https?:\/\/.+/i.test(draft.targetUrl ?? ''))
    && (!searchKey || Boolean(draft.targetEntityId));

  return (
    <Modal title={draft.id ? 'Edit advert' : 'New advert'} onClose={onClose} width={860}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,300px)', gap: 18 }}>
        {/* ---- the form ---- */}
        <div>
          <SectionLabel>What it says</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Kicker (optional)" hint="Small label above the headline.">
              <Input value={draft.kicker ?? ''} onChange={value => set({ kicker: value })} placeholder="THIS WEEK" />
            </Field>
            <Field label="Detail (optional)" hint="Right-hand note — a price, a date.">
              <Input value={draft.meta ?? ''} onChange={value => set({ meta: value })} placeholder="From Le 200" />
            </Field>
          </div>
          <Field label="Headline">
            <Input value={draft.title} onChange={value => set({ title: value })} autoFocus placeholder="Hire a verified plumber today" />
          </Field>
          <Field label="Body (optional)">
            <Textarea value={draft.body ?? ''} onChange={value => set({ body: value })} rows={2} placeholder="Every provider here has been checked." />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Button words (optional)">
              <Input value={draft.ctaLabel ?? ''} onChange={value => set({ ctaLabel: value })} placeholder="Find one" />
            </Field>
            <Field label="Look">
              <Select value={String(draft.tone)} onChange={value => set({ tone: Number(value) })} options={TONE_OPTIONS} />
            </Field>
          </div>
          <Field label="Picture or video" hint="Uploaded to Vacancy's own storage — no external link to go stale.">
            <MediaUpload
              imageUrl={draft.imageUrl}
              videoUrl={draft.videoUrl}
              onChange={patch => set(patch)}
              disabled={busy}
            />
          </Field>

          <SectionLabel>What happens when it is tapped</SectionLabel>
          <Field label="Opens">
            <Select value={String(draft.targetType)} onChange={setTargetType} options={TARGET_OPTIONS} />
          </Field>

          {draft.targetType === AdvertTargetType.Screen ? (
            <Field label="Which screen">
              <Select
                value={draft.targetRoute ?? ''}
                onChange={value => set({ targetRoute: value })}
                placeholder="Choose a screen"
                options={screens}
              />
            </Field>
          ) : null}

          {draft.targetType === AdvertTargetType.ExternalUrl ? (
            <Field label="Web address" hint="Opens outside the app, so make sure it is somewhere you trust.">
              <Input value={draft.targetUrl ?? ''} onChange={value => set({ targetUrl: value })} placeholder="https://example.com/offer" />
            </Field>
          ) : null}

          {searchKey ? (
            <Field label="Which one" hint="Start typing — the list comes from the API, not from this page.">
              {/* `?? null` because the field is optional on the write shape — it is
                  string | null | undefined, and Select takes string | null. */}
              <Select
                value={draft.targetEntityId ?? null}
                onChange={value => set({ targetEntityId: value })}
                load={loadTargets}
                placeholder="Search…"
              />
            </Field>
          ) : null}

          <SectionLabel>Where and when it runs</SectionLabel>
          <Field label="Places">
            <MultiSelect
              values={draft.placements}
              onChange={values => set({ placements: values })}
              options={PLACEMENTS}
              placeholder="Choose at least one"
              summary={values => values.length === PLACEMENTS.length ? 'Everywhere' : `${values.length} places`}
            />
          </Field>
          <Field label="Who sees it" hint="Leave empty and everyone does.">
            <MultiSelect
              values={draft.audience}
              onChange={values => set({ audience: values })}
              options={AUDIENCES}
              placeholder="Everyone"
              summary={values => values.length === 1 ? `${values[0]} only` : `${values.length} groups`}
            />
          </Field>
          <Field label="City (optional)" hint="Only people the platform can place in that city see or receive it — blank reaches everywhere">
            <Input value={draft.targetCity ?? ''} onChange={value => set({ targetCity: value || null })} placeholder="e.g. Freetown" />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 90px', gap: 10 }}>
            <Field label="Starts" hint="Empty = now">
              <DateInput value={draft.startsAt} onChange={value => set({ startsAt: value })} />
            </Field>
            <Field label="Ends" hint="Empty = until switched off">
              <DateInput value={draft.endsAt} onChange={value => set({ endsAt: value })} />
            </Field>
            <Field label="Priority" hint="Higher first">
              <Input
                type="number"
                value={String(draft.priority)}
                onChange={value => set({ priority: Number(value) || 0 })}
              />
            </Field>
          </div>

          <label style={{ display: 'flex', gap: 9, alignItems: 'center', cursor: 'pointer', marginTop: 4 }}>
            <input
              type="checkbox"
              checked={draft.active}
              onChange={event => set({ active: event.target.checked })}
              style={{ accentColor: t.brand, width: 15, height: 15 }}
            />
            <span style={{ fontSize: 13, fontWeight: 700, color: t.text }}>Switched on</span>
            <span style={{ fontSize: 11.5, color: t.textSubtle }}>An advert only shows if this is on and it is inside its dates.</span>
          </label>
        </div>

        {/* ---- what it will look like, on each surface it actually runs on ---- */}
        <div>
          <SectionLabel>Preview</SectionLabel>

          {/* Only the surfaces this advert is actually placed on — previewing a slot you
              have not chosen is a picture of something that will never happen. */}
          <div style={{ display: 'flex', gap: 5, marginBottom: 11, flexWrap: 'wrap' }}>
            {SURFACES.filter(item => draft.placements.includes(item.placement)
                || (item.value === 'web' && draft.placements.includes('WebLanding'))).map(item => (
              <button
                key={item.value}
                type="button"
                onClick={() => setSurface(item.value)}
                style={{
                  padding: '5px 11px', borderRadius: 999, fontFamily: 'inherit', fontSize: 12,
                  fontWeight: 700, cursor: 'pointer',
                  border: `1px solid ${surface === item.value ? t.brand : t.border}`,
                  background: surface === item.value ? t.brandSoft : t.surface,
                  color: surface === item.value ? t.brand : t.textMuted,
                }}
              >
                {item.label}
              </button>
            ))}
          </div>

          {draft.placements.length === 0 ? (
            <div style={{
              padding: '26px 16px', textAlign: 'center', borderRadius: 14,
              border: `1px dashed ${t.borderStrong}`, color: t.textSubtle, fontSize: 12.5, lineHeight: 1.6,
            }}>
              Choose where it runs and the real thing appears here.
            </div>
          ) : (
            <AdvertPreview
              surface={visibleSurface}
              advert={{
                kicker: draft.kicker || null, title: draft.title, body: draft.body || null,
                meta: draft.meta || null, imageUrl: draft.imageUrl || null, videoUrl: draft.videoUrl || null,
                ctaLabel: draft.ctaLabel || null, tone: draft.tone,
              }}
            />
          )}

          <div style={{
            marginTop: 12, padding: '11px 13px', background: t.surfaceMuted,
            border: `1px solid ${t.border}`, borderRadius: 11, fontSize: 12.5, color: t.textMuted, lineHeight: 1.65,
          }}>
            {draft.placements.length === 0
              ? <span style={{ color: t.warning }}>Choose at least one place for this to run.</span>
              : <>Runs in <strong style={{ color: t.text }}>{draft.placements.map(prettyPlacement).join(', ')}</strong>.</>}
            <br />
            {draft.audience.length === 0
              ? 'Everyone sees it.'
              : <>Only <strong style={{ color: t.text }}>{draft.audience.join(', ')}</strong> see it.</>}
            <br />
            {describeWindow(draft)}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, borderTop: `1px solid ${t.border}`, paddingTop: 14 }}>
        <Button tone="subtle" onClick={onClose}>Cancel</Button>
        <Button tone="primary" disabled={busy || !ready} onClick={onSave}>
          {busy ? 'Saving…' : draft.id ? 'Save changes' : 'Place advert'}
        </Button>
      </div>
    </Modal>
  );
}

/* ---------- the slide, as the apps draw it ---------- */

function SlidePreview({ advert, width, compact = false }: {
  advert: {
    kicker: string | null; title: string; body: string | null; meta: string | null;
    imageUrl: string | null; ctaLabel: string | null; tone: number;
  };
  width: number;
  compact?: boolean;
}) {
  const palette: Record<number, { bg: string; text: string; soft: string }> = {
    1: { bg: 'linear-gradient(135deg,#2A4E82,#1B3557)', text: '#FFFFFF', soft: 'rgba(255,255,255,.72)' },
    2: { bg: 'linear-gradient(135deg,#F1F5F9,#E2E8F0)', text: '#0F172A', soft: '#475569' },
    3: { bg: 'linear-gradient(135deg,#15803D,#0F5F2E)', text: '#FFFFFF', soft: 'rgba(255,255,255,.75)' },
    4: { bg: 'linear-gradient(135deg,#0B1220,#1E293B)', text: '#FFFFFF', soft: 'rgba(255,255,255,.66)' },
  };
  const skin = palette[advert.tone] ?? palette[1];

  return (
    <div style={{
      width, flexShrink: 0, borderRadius: 14, overflow: 'hidden',
      background: skin.bg, color: skin.text,
      padding: compact ? 11 : 15, boxSizing: 'border-box',
      minHeight: compact ? 84 : 128, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    }}>
      <div>
        {advert.kicker ? (
          <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 1.3, color: ORANGE, marginBottom: 4 }}>
            {advert.kicker.toUpperCase()}
          </div>
        ) : null}
        <div style={{
          fontSize: compact ? 12.5 : 16, fontWeight: 800, lineHeight: 1.25,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {advert.title}
        </div>
        {advert.body && !compact ? (
          <div style={{
            fontSize: 12, color: skin.soft, marginTop: 5, lineHeight: 1.45,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {advert.body}
          </div>
        ) : null}
      </div>

      {!compact && (advert.ctaLabel || advert.meta) ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 12 }}>
          {advert.ctaLabel ? (
            <span style={{
              fontSize: 11.5, fontWeight: 800, padding: '6px 12px', borderRadius: 999,
              background: ORANGE, color: '#FFFFFF',
            }}>{advert.ctaLabel}</span>
          ) : <span />}
          {advert.meta ? <span style={{ fontSize: 11, color: skin.soft }}>{advert.meta}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

/* ---------- small pieces ---------- */

function SectionLabel({ children }: { children: React.ReactNode }) {
  const { t } = useTheme();
  return (
    <div style={{
      fontSize: 10.5, fontWeight: 800, letterSpacing: 0.9, color: t.textSubtle,
      textTransform: 'uppercase', margin: '16px 0 9px',
    }}>
      {children}
    </div>
  );
}

/** A date the API can read back. Stored as an ISO string; shown as the browser's own picker. */
function DateInput({ value, onChange }: { value: string | null | undefined; onChange: (value: string | null) => void }) {
  const { t } = useTheme();
  const local = value ? new Date(value).toISOString().slice(0, 10) : '';
  return (
    <input
      type="date"
      value={local}
      onChange={event => onChange(event.target.value ? new Date(`${event.target.value}T00:00:00Z`).toISOString() : null)}
      style={{
        width: '100%', boxSizing: 'border-box', padding: '10px 11px', borderRadius: 10,
        border: `1px solid ${t.borderStrong}`, background: t.surfaceMuted, color: t.text,
        fontSize: 13.5, fontFamily: 'inherit', outline: 'none',
      }}
    />
  );
}

function prettyPlacement(name: string) {
  return PLACEMENTS.find(placement => placement.value === name)?.label ?? name;
}

function describeWindow(draft: Draft) {
  const starts = draft.startsAt ? new Date(draft.startsAt) : null;
  const ends = draft.endsAt ? new Date(draft.endsAt) : null;
  if (!draft.active) return 'Switched off — it will not show at all.';
  if (starts && starts.getTime() > Date.now()) {
    return `Starts ${starts.toLocaleDateString()}${ends ? `, ends ${ends.toLocaleDateString()}` : ''}.`;
  }
  if (ends) return `Running until ${ends.toLocaleDateString()}.`;
  return 'Runs from now until you switch it off.';
}

function Tally({ label, value, tone, onClick }: {
  label: string; value: number | null; tone?: 'success' | 'info'; onClick?: () => void;
}) {
  const { t } = useTheme();
  const colour = tone === 'success' ? t.success : tone === 'info' ? t.info : t.text;
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      style={{
        background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, padding: '11px 14px',
        textAlign: 'left', fontFamily: 'inherit', cursor: onClick ? 'pointer' : 'default', width: '100%',
      }}
    >
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.8, color: t.textSubtle, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: colour, marginTop: 2 }}>
        {value === null ? '—' : value.toLocaleString()}
      </div>
    </button>
  );
}
