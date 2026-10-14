/**
 * The emergency screen's categories — police, health, fire and whatever else the operator
 * decides — as the cards a citizen sees.
 *
 * <p>A sector already existed as a row in the directory. This page is the same row seen from
 * the phone's side: its glyph and tone (a closed set the apps can draw), the one line under
 * its name, its own hotline when the country has one, its order, and whether it is shown at
 * all. The preview on each card is the phone's card, so what the operator sees is what a
 * person in Lumley sees.</p>
 *
 * <p>Hiding a category (Active off) takes it off the phone and the website; its institutions,
 * stations and contacts stay where they are.</p>
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import { Actions, Button, Card, ErrorNote, Field, Input, Loading, Modal, PageHeader, Pill, Textarea, Toasts, fmtDateTime, useToasts } from '../components/ui';
import type { InstitutionRow, RegistrationCodeRow, SampleSummary, SituationRow } from '../api/emergency';
import { SECTOR_GLYPHS, SECTOR_TONES, SEVERITY_WORDS, emergencyApi, type DirectoryOverview, type SectorRow } from '../api/emergency';
import type { AdminIdentity } from '../api/admin';

const err = (caught: unknown, fallback: string) => (caught instanceof Error ? caught.message : fallback);

/** The tones as the phone paints them, in light and dark, so the preview is honest. */
export function toneColor(tone: string, dark: boolean): { fg: string; bg: string } {
  const light: Record<string, { fg: string; bg: string }> = {
    navy: { fg: '#1F3A5F', bg: '#E4EBF4' }, red: { fg: '#B42318', bg: '#FCE8E6' }, orange: { fg: '#C2410C', bg: '#FDEBDD' },
    teal: { fg: '#0F766E', bg: '#DDF3F0' }, blue: { fg: '#1D4ED8', bg: '#E1EAFD' }, amber: { fg: '#A16207', bg: '#FBF0D2' },
    green: { fg: '#15803D', bg: '#DDF3E4' }, purple: { fg: '#6D28D9', bg: '#ECE4FB' }, grey: { fg: '#475467', bg: '#EAECF0' },
  };
  const darkMap: Record<string, { fg: string; bg: string }> = {
    navy: { fg: '#9FBDE6', bg: '#1C2A3C' }, red: { fg: '#F59089', bg: '#3A1E1C' }, orange: { fg: '#F5A46F', bg: '#3A281C' },
    teal: { fg: '#6ED3C8', bg: '#173230' }, blue: { fg: '#8FB0F5', bg: '#1B2740' }, amber: { fg: '#E8C56A', bg: '#3A311B' },
    green: { fg: '#7BD3A0', bg: '#1A3324' }, purple: { fg: '#C4A8F5', bg: '#2C2140' }, grey: { fg: '#B0B8C2', bg: '#262B33' },
  };
  return (dark ? darkMap : light)[tone] ?? (dark ? darkMap.navy : light.navy);
}

export function SectorGlyph({ name, color, size = 26 }: { name: string; color: string; size?: number }) {
  const paths: Record<string, string> = {
    shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
    cross: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z',
    flame: 'M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-9z',
    wave: 'M3 9c3-3 6 3 9 0s6 3 9 0M3 15c3-3 6 3 9 0s6 3 9 0',
    car: 'M5 11l2-5h10l2 5h2v6h-2a2 2 0 0 1-4 0H9a2 2 0 0 1-4 0H3v-6zM7 11h10',
    bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
    anchor: 'M12 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm0 0v13m-7-6a7 7 0 0 0 14 0M3 15h4M17 15h4',
    people: 'M8 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3 3-5 6-5s6 2 6 5m0 0c0-3 3-5 6-5s2 0 2 5',
    phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
    alert: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 5v5m0 3h.01',
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name] ?? paths.shield} />
    </svg>
  );
}

/** The phone's card, drawn here so the console shows exactly what the citizen sees. */
export function SectorCardPreview({ sector, nearYou, dark }: { sector: Pick<SectorRow, 'name' | 'tagline' | 'glyph' | 'tone' | 'hotline' | 'hotlineLabel'>; nearYou?: number; dark: boolean }) {
  const { t } = useTheme();
  const tone = toneColor(sector.tone, dark);
  return (
    <div style={{ width: 190, borderRadius: 16, border: `1px solid ${t.border}`, background: t.surface, padding: 12, display: 'grid', gap: 6 }}>
      <div style={{ width: 40, height: 40, borderRadius: 12, background: tone.bg, display: 'grid', placeItems: 'center' }}>
        <SectorGlyph name={sector.glyph} color={tone.fg} />
      </div>
      <div style={{ fontSize: 14.5, fontWeight: 800, color: t.text, lineHeight: 1.2 }}>{sector.name || 'Name'}</div>
      <div style={{ fontSize: 11.5, color: t.textMuted, lineHeight: 1.4, minHeight: 32 }}>{sector.tagline || 'One line under the name.'}</div>
      {sector.hotline ? (
        <div style={{ fontSize: 13, fontWeight: 800, color: tone.fg, fontVariantNumeric: 'tabular-nums' }}>Ring {sector.hotline}</div>
      ) : (
        <div style={{ fontSize: 11.5, color: t.textSubtle }}>No hotline yet</div>
      )}
      <div style={{ fontSize: 11.5, color: t.textSubtle }}>{nearYou === undefined ? 'N near you' : `${nearYou} near you`}</div>
    </div>
  );
}

export function EmergencyCategories({ identity }: { identity: AdminIdentity }) {
  const { t, name: themeName } = useTheme();
  const { toasts, push } = useToasts();
  const [overview, setOverview] = useState<DirectoryOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<SectorRow | 'new' | null>(null);
  const [hiding, setHiding] = useState<SectorRow | null>(null);
  const [codesFor, setCodesFor] = useState<SectorRow | null>(null);
  const [sentencesFor, setSentencesFor] = useState<SectorRow | null>(null);
  const [sample, setSample] = useState<SampleSummary | null>(null);
  const [sampleBusy, setSampleBusy] = useState(false);
  const [confirmPurge, setConfirmPurge] = useState(false);
  void identity;
  const dark = themeName === 'dark';

  const load = useCallback(() => {
    emergencyApi.overview().then(o => { setOverview(o); setError(null); }).catch((caught: unknown) => setError(err(caught, 'Could not load the categories.')));
    emergencyApi.sampleStatus().then(setSample).catch(() => setSample(null));
  }, []);
  useEffect(load, [load]);

  const seed = () => {
    setSampleBusy(true);
    emergencyApi.sampleSeed()
      .then(result => { push(`${result.facilities} sample places added across ${result.institutions} categories.`); load(); })
      .catch((caught: unknown) => push(err(caught, 'Could not add sample places.'), 'error'))
      .finally(() => setSampleBusy(false));
  };
  const purge = () => {
    setSampleBusy(true);
    emergencyApi.samplePurge()
      .then(result => { setConfirmPurge(false); push(`${result.facilities} sample places removed.`); load(); })
      .catch((caught: unknown) => push(err(caught, 'Could not remove them.'), 'error'))
      .finally(() => setSampleBusy(false));
  };

  if (error) return <ErrorNote message={error} />;
  if (!overview) return <Loading />;
  const canEdit = overview.canEdit;
  const sectors = [...overview.sectors].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));

  const reorder = (row: SectorRow, by: number) => {
    const index = sectors.findIndex(s => s.id === row.id);
    const other = sectors[index + by];
    if (!other) return;
    Promise.all([
      emergencyApi.saveSector({ ...row, sort: other.sort === row.sort ? row.sort + by : other.sort }),
      emergencyApi.saveSector({ ...other, sort: row.sort === other.sort ? other.sort - by : row.sort }),
    ]).then(() => load()).catch((caught: unknown) => push(err(caught, 'Could not reorder.'), 'error'));
  };

  return (
    <>
      <PageHeader
        title="Emergency categories"
        subtitle="What the emergency screen is made of: one card per category, in this order. A person taps a card and sees the stations near them and who to ring."
        action={canEdit ? <Button tone="primary" onClick={() => setEditing('new')}>Add a category</Button> : undefined}
      />
      {canEdit ? (
        <Card style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <strong style={{ fontSize: 14, color: t.text }}>Sample places</strong>
              <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 3, lineHeight: 1.5 }}>
                {sample && sample.facilities > 0
                  ? `${sample.facilities} sample places in ${sample.institutions} sample institutions are in the directory now. Every phone and the website can see them. Remove them all with one click.`
                  : 'Thirty stations per category, on real towns with invented numbers, so the emergency screens can be looked at before the real directory is typed in. Nothing here can ring a real phone.'}
              </div>
            </div>
            {sample && sample.facilities > 0
              ? <Button tone="danger" disabled={sampleBusy} onClick={() => setConfirmPurge(true)}>Remove all sample places</Button>
              : <Button tone="primary" disabled={sampleBusy} onClick={seed}>{sampleBusy ? 'Adding…' : 'Add sample places'}</Button>}
          </div>
        </Card>
      ) : null}
      <div style={{ display: 'grid', gap: 10 }}>
        {sectors.map((row, index) => (
          <Card key={row.id}>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 16, alignItems: 'start' }}>
              <SectorCardPreview sector={row} dark={dark} />
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 15, color: t.text }}>{row.name}</strong>
                  <span style={{ fontSize: 12, color: t.textSubtle, fontFamily: 'ui-monospace, monospace' }}>{row.code}</span>
                  {!row.active ? <Pill tone="neutral">Hidden</Pill> : null}
                  {!row.hotline ? <Pill tone="warning">No hotline</Pill> : null}
                </div>
                <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 4, lineHeight: 1.5 }}>{row.description ?? '—'}</div>
                <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 6 }}>
                  {row.institutions} {row.institutions === 1 ? 'institution' : 'institutions'} · glyph {row.glyph} · tone {row.tone}{row.hotline ? ` · hotline ${row.hotline}${row.hotlineLabel ? ` (${row.hotlineLabel})` : ''}` : ''}
                </div>
              </div>
              {canEdit ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <Button size="sm" tone="subtle" onClick={() => setEditing(row)}>Edit</Button>
                  <Button size="sm" tone="subtle" onClick={() => setSentencesFor(row)}>Sentences</Button>
                  <Button size="sm" tone="primary" onClick={() => setCodesFor(row)}>Codes</Button>
                  <Button size="sm" tone="subtle" disabled={index === 0} onClick={() => reorder(row, -1)}>Up</Button>
                  <Button size="sm" tone="subtle" disabled={index === sectors.length - 1} onClick={() => reorder(row, 1)}>Down</Button>
                  {row.active
                    ? <Button size="sm" tone="danger" onClick={() => setHiding(row)}>Hide</Button>
                    : <Button size="sm" tone="primary" onClick={() => emergencyApi.saveSector({ ...row, active: true }).then(() => { push('Shown again.'); load(); }).catch((caught: unknown) => push(err(caught, 'Could not show it.'), 'error'))}>Show</Button>}
                </div>
              ) : null}
            </div>
          </Card>
        ))}
      </div>

      {editing ? <SectorDialog existing={editing === 'new' ? null : editing} nextSort={(sectors[sectors.length - 1]?.sort ?? 0) + 1} dark={dark} onClose={() => setEditing(null)} onDone={() => { setEditing(null); push('Saved.'); load(); }} /> : null}
      {hiding ? (
        <Modal title={`Hide ${hiding.name}`} onClose={() => setHiding(null)}>
          <div style={{ fontSize: 13.5, color: t.text, lineHeight: 1.6, marginBottom: 12 }}>The card leaves the phone and the website. Its {hiding.institutions} {hiding.institutions === 1 ? 'institution' : 'institutions'}, their stations and contacts stay in the directory, and the desk still routes to them.</div>
          <Actions>
            <Button tone="subtle" onClick={() => setHiding(null)}>Cancel</Button>
            <Button tone="danger" onClick={() => emergencyApi.removeSector(hiding).then(() => { setHiding(null); push('Hidden.'); load(); }).catch((caught: unknown) => push(err(caught, 'Could not hide it.'), 'error'))}>Hide</Button>
          </Actions>
        </Modal>
      ) : null}
      {codesFor ? <CodesDialog sector={codesFor} onClose={() => setCodesFor(null)} push={push} /> : null}
      {sentencesFor ? <SentencesDialog sector={sentencesFor} overview={overview} onClose={() => setSentencesFor(null)} push={push} /> : null}
      {confirmPurge && sample ? (
        <Modal title="Remove every sample place" onClose={() => setConfirmPurge(false)}>
          <div style={{ fontSize: 13.5, color: t.text, lineHeight: 1.6, marginBottom: 12 }}>
            {sample.facilities} places, {sample.contacts} numbers and {sample.institutions} sample institutions leave the directory. Anything a person typed stays. A report that was routed to a sample station keeps its name on the timeline.
          </div>
          <Actions>
            <Button tone="subtle" onClick={() => setConfirmPurge(false)}>Cancel</Button>
            <Button tone="danger" disabled={sampleBusy} onClick={purge}>{sampleBusy ? 'Removing…' : 'Remove them all'}</Button>
          </Actions>
        </Modal>
      ) : null}
      <Toasts toasts={toasts} />
    </>
  );
}

/**
 * "What is happening" — the sentences a reporter picks from, for one category.
 *
 * Each carries what the router needs: how serious it is, which capability the answering
 * station must claim, a second category usually told as well, and whether it is private.
 * The phone and the website draw exactly this list, in this order.
 */
function SentencesDialog({ sector, overview, onClose, push }: { sector: SectorRow; overview: DirectoryOverview; onClose: () => void; push: (message: string, tone?: 'ok' | 'error') => void }) {
  const { t } = useTheme();
  const [rows, setRows] = useState<SituationRow[] | null>(null);
  const [editing, setEditing] = useState<SituationRow | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  const empty = { words: '', severity: 3, capability: '', alsoSectorCode: '', sensitive: false, active: true };
  const [form, setForm] = useState(empty);

  const load = useCallback(() => {
    emergencyApi.situations(sector.id).then(setRows).catch((caught: unknown) => push(err(caught, 'Could not load the sentences.'), 'error'));
  }, [sector.id, push]);
  useEffect(load, [load]);

  const capabilities = overview.capabilities.filter(c => c.sector === sector.code);
  const others = overview.sectors.filter(s => s.id !== sector.id && s.active);
  const open = (row: SituationRow | 'new') => {
    setEditing(row);
    setForm(row === 'new' ? empty : { words: row.words, severity: row.severity, capability: row.capability ?? '', alsoSectorCode: row.alsoSectorCode ?? '', sensitive: row.sensitive, active: row.active });
  };
  const save = () => {
    if (!editing) return;
    setBusy(true);
    const sort = editing === 'new' ? ((rows ?? []).reduce((m, r) => Math.max(m, r.sort), 0) + 10) : editing.sort;
    emergencyApi.saveSituation({ id: editing === 'new' ? null : editing.id, sectorId: sector.id, words: form.words, severity: form.severity, capability: form.capability || null, alsoSectorCode: form.alsoSectorCode || null, sensitive: form.sensitive, sort, active: form.active })
      .then(() => { setEditing(null); push('Saved.'); load(); })
      .catch((caught: unknown) => push(err(caught, 'That did not save.'), 'error'))
      .finally(() => setBusy(false));
  };
  const move = (row: SituationRow, by: number) => {
    if (!rows) return;
    const index = rows.findIndex(r => r.id === row.id);
    const other = rows[index + by];
    if (!other) return;
    setBusy(true);
    Promise.all([
      emergencyApi.saveSituation({ ...row, sort: other.sort === row.sort ? row.sort + by : other.sort }),
      emergencyApi.saveSituation({ ...other, sort: row.sort === other.sort ? other.sort - by : row.sort }),
    ]).then(load).catch((caught: unknown) => push(err(caught, 'Could not reorder.'), 'error')).finally(() => setBusy(false));
  };
  const toggle = (row: SituationRow) => {
    setBusy(true);
    emergencyApi.saveSituation({ ...row, active: !row.active }).then(load).catch((caught: unknown) => push(err(caught, 'Could not change it.'), 'error')).finally(() => setBusy(false));
  };
  const selectStyle = { width: '100%', padding: '9px 10px', borderRadius: 10, border: `1px solid ${t.borderStrong}`, background: t.surfaceMuted, color: t.text, fontFamily: 'inherit', fontSize: 13 } as const;

  return (
    <Modal title={`What is happening — ${sector.name}`} onClose={onClose} width={720}>
      <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.55, marginBottom: 12 }}>
        The sentences a person taps when they report under this category, in this order. Each one tells the router how serious it is and which station can handle it. A person who finds none fitting can still write their own — "Something else".
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <Button tone="primary" onClick={() => open('new')}>Add a sentence</Button>
      </div>
      {editing ? (
        <Card style={{ marginBottom: 12 }}>
          <Field label="The sentence" hint="In the reporter's words. Short."><Input value={form.words} onChange={v => setForm({ ...form, words: v })} placeholder="Someone is being attacked right now" /></Field>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginTop: 10 }}>
            <Field label="How serious">
              <select value={form.severity} onChange={e => setForm({ ...form, severity: Number(e.target.value) })} style={selectStyle}>
                {Object.entries(SEVERITY_WORDS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
              </select>
            </Field>
            <Field label="Needs a station that can handle" hint="Or any station in the category.">
              <select value={form.capability} onChange={e => setForm({ ...form, capability: e.target.value })} style={selectStyle}>
                <option value="">Any {sector.name} station</option>
                {capabilities.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
            </Field>
            <Field label="Usually also tell" hint="Noted for the desk.">
              <select value={form.alsoSectorCode} onChange={e => setForm({ ...form, alsoSectorCode: e.target.value })} style={selectStyle}>
                <option value="">Nobody else</option>
                {others.map(o => <option key={o.id} value={o.code}>{o.name}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, color: t.text }}><input type="checkbox" checked={form.sensitive} onChange={e => setForm({ ...form, sensitive: e.target.checked })} /> Private — only the responding team sees where</label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, color: t.text }}><input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} /> Shown to reporters</label>
          </div>
          <Actions>
            <Button tone="subtle" onClick={() => setEditing(null)}>Cancel</Button>
            <Button tone="primary" disabled={busy || form.words.trim().length < 3} onClick={save}>{busy ? 'Saving…' : 'Save'}</Button>
          </Actions>
        </Card>
      ) : null}
      {rows === null ? <Loading /> : rows.length === 0 ? (
        <div style={{ fontSize: 13, color: t.textMuted }}>No sentences yet for this category — reporters will only be able to write their own.</div>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {rows.map((row, index) => (
            <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 10, border: `1px solid ${t.border}`, borderRadius: 12, padding: '8px 12px', opacity: row.active ? 1 : 0.6 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{row.words}</div>
                <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>
                  {SEVERITY_WORDS[row.severity] ?? '—'}{row.capability ? ` · ${capabilities.find(c => c.code === row.capability)?.label ?? row.capability}` : ' · any station'}{row.alsoSectorCode ? ` · also ${overview.sectors.find(s => s.code === row.alsoSectorCode)?.name ?? row.alsoSectorCode}` : ''}{row.sensitive ? ' · private' : ''}{row.active ? '' : ' · hidden'}
                </div>
              </div>
              <Button size="sm" tone="subtle" disabled={busy || index === 0} onClick={() => move(row, -1)}>Up</Button>
              <Button size="sm" tone="subtle" disabled={busy || index === rows.length - 1} onClick={() => move(row, 1)}>Down</Button>
              <Button size="sm" tone="subtle" disabled={busy} onClick={() => open(row)}>Edit</Button>
              <Button size="sm" tone={row.active ? 'danger' : 'primary'} disabled={busy} onClick={() => toggle(row)}>{row.active ? 'Hide' : 'Show'}</Button>
            </div>
          ))}
        </div>
      )}
      <Actions><Button tone="subtle" onClick={onClose}>Close</Button></Actions>
    </Modal>
  );
}

/**
 * Registration codes for one category.
 *
 * Issue one — for the whole category or bound to one institution — hand it to the people
 * who run the stations, and watch the stations arrive. Each row says who used it and
 * whether their station has been verified yet.
 */
function CodesDialog({ sector, onClose, push }: { sector: SectorRow; onClose: () => void; push: (message: string, tone?: 'ok' | 'error') => void }) {
  const { t } = useTheme();
  const [codes, setCodes] = useState<RegistrationCodeRow[] | null>(null);
  const [institutions, setInstitutions] = useState<InstitutionRow[]>([]);
  const [showSpent, setShowSpent] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ institutionId: '', label: '', grant: 1, maxUses: 1, expiresInDays: 90, note: '' });
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(() => {
    emergencyApi.codes(sector.id, showSpent).then(r => setCodes(r.codes)).catch((caught: unknown) => push(err(caught, 'Could not load the codes.'), 'error'));
  }, [sector.id, showSpent, push]);
  useEffect(load, [load]);
  useEffect(() => {
    emergencyApi.searchInstitutions({ sectorId: sector.id, pageSize: 100 }).then(page => setInstitutions(page.items)).catch(() => setInstitutions([]));
  }, [sector.id]);

  const issue = () => {
    setBusy(true);
    emergencyApi.issueCode({ sectorId: sector.id, institutionId: form.institutionId || null, label: form.label || null, grant: form.grant, maxUses: form.maxUses, expiresInDays: form.expiresInDays || null, note: form.note || null })
      .then(row => { push(`Code ${row.code} issued.`); setIssuing(false); setForm({ institutionId: '', label: '', grant: 1, maxUses: 1, expiresInDays: 90, note: '' }); load(); })
      .catch((caught: unknown) => push(err(caught, 'Could not issue a code.'), 'error'))
      .finally(() => setBusy(false));
  };
  const revoke = (row: RegistrationCodeRow) => {
    setBusy(true);
    emergencyApi.revokeCode(row.id).then(() => { push(`${row.code} withdrawn.`); load(); }).catch((caught: unknown) => push(err(caught, 'Could not withdraw it.'), 'error')).finally(() => setBusy(false));
  };
  const copy = (code: string) => {
    try { void navigator.clipboard.writeText(code); setCopied(code); window.setTimeout(() => setCopied(null), 1500); } catch { /* the code is on screen */ }
  };
  const GRANT: Record<number, string> = { 1: 'Dispatcher', 2: 'Supervisor' };

  return (
    <Modal title={`Registration codes — ${sector.name}`} onClose={onClose} width={720}>
      <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.55, marginBottom: 12 }}>
        Give a code to the people who run the stations. In the app they enter it, name their station, drop a pin and give its numbers — and they are on that station's desk from that moment. The station stays a draft until you verify it.
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <Button tone="primary" onClick={() => setIssuing(v => !v)}>{issuing ? 'Cancel' : 'Issue a code'}</Button>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, color: t.textMuted, marginLeft: 'auto' }}>
          <input type="checkbox" checked={showSpent} onChange={e => setShowSpent(e.target.checked)} /> Show spent and withdrawn
        </label>
      </div>
      {issuing ? (
        <Card style={{ marginBottom: 12 }}>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <Field label="For" hint="Bind it to one institution, or let each person name theirs.">
              <select value={form.institutionId} onChange={e => setForm({ ...form, institutionId: e.target.value })} style={{ width: '100%', padding: '9px 10px', borderRadius: 10, border: `1px solid ${t.borderStrong}`, background: t.surfaceMuted, color: t.text, fontFamily: 'inherit', fontSize: 13 }}>
                <option value="">Any institution in {sector.name}</option>
                {institutions.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </Field>
            <Field label="Label" hint="For your eye only."><Input value={form.label} onChange={v => setForm({ ...form, label: v })} placeholder="Western Area divisions" /></Field>
            <Field label="Makes the person a">
              <select value={form.grant} onChange={e => setForm({ ...form, grant: Number(e.target.value) })} style={{ width: '100%', padding: '9px 10px', borderRadius: 10, border: `1px solid ${t.borderStrong}`, background: t.surfaceMuted, color: t.text, fontFamily: 'inherit', fontSize: 13 }}>
                <option value={1}>Dispatcher — works their station's desk</option>
                <option value={2}>Supervisor — runs the institution's desk</option>
              </select>
            </Field>
            <Field label="Stations it may register" hint="0 for no limit."><Input type="number" value={String(form.maxUses)} onChange={v => setForm({ ...form, maxUses: Math.max(0, Number(v) || 0) })} /></Field>
            <Field label="Expires in days" hint="0 for never."><Input type="number" value={String(form.expiresInDays)} onChange={v => setForm({ ...form, expiresInDays: Math.max(0, Number(v) || 0) })} /></Field>
          </div>
          <Actions>
            <Button tone="primary" disabled={busy} onClick={issue}>{busy ? 'Issuing…' : 'Issue'}</Button>
          </Actions>
        </Card>
      ) : null}
      {codes === null ? <Loading /> : codes.length === 0 ? (
        <div style={{ fontSize: 13, color: t.textMuted }}>No codes yet for this category.</div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {codes.map(row => (
            <div key={row.id} style={{ border: `1px solid ${t.border}`, borderRadius: 12, padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <code style={{ fontSize: 16, fontWeight: 800, letterSpacing: 1, color: row.usable ? t.text : t.textSubtle, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{row.code}</code>
                <Button size="sm" tone="subtle" onClick={() => copy(row.code)}>{copied === row.code ? 'Copied' : 'Copy'}</Button>
                {row.usable ? <Pill tone="success">Live</Pill> : row.active ? <Pill tone="neutral">Spent</Pill> : <Pill tone="danger">Withdrawn</Pill>}
                <Pill tone="info">{GRANT[row.grant] ?? 'Dispatcher'}</Pill>
                <span style={{ flex: 1 }} />
                {row.usable ? <Button size="sm" tone="danger" disabled={busy} onClick={() => revoke(row)}>Withdraw</Button> : null}
              </div>
              <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 5 }}>
                {row.institutionName ?? `Any institution in ${row.sectorName}`}{row.label ? ` · ${row.label}` : ''} · used {row.uses}{row.maxUses ? ` of ${row.maxUses}` : ''}{row.expiresAt ? ` · expires ${fmtDateTime(row.expiresAt)}` : ' · never expires'}{row.issuedByName ? ` · issued by ${row.issuedByName}` : ''}
              </div>
              {row.registrations.length > 0 ? (
                <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
                  {row.registrations.map(r => (
                    <div key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, flexWrap: 'wrap' }}>
                      <strong style={{ color: t.text }}>{r.facilityName}</strong>
                      <span style={{ color: t.textMuted }}>{r.institutionName} · {r.personName}{r.personPhone ? ` · ${r.personPhone}` : ''} · {fmtDateTime(r.registeredAt)}</span>
                      {r.facilityVerified ? <Pill tone="success">Verified</Pill> : <Pill tone="warning">Awaiting verification</Pill>}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
      <Actions><Button tone="subtle" onClick={onClose}>Close</Button></Actions>
    </Modal>
  );
}

function SectorDialog({ existing, nextSort, dark, onClose, onDone }: { existing: SectorRow | null; nextSort: number; dark: boolean; onClose: () => void; onDone: () => void }) {
  const { t } = useTheme();
  const [form, setForm] = useState({
    name: existing?.name ?? '', code: existing?.code ?? '', description: existing?.description ?? '', tagline: existing?.tagline ?? '',
    glyph: existing?.glyph ?? 'shield', tone: existing?.tone ?? 'navy', hotline: existing?.hotline ?? '', hotlineLabel: existing?.hotlineLabel ?? '',
    sort: existing?.sort ?? nextSort, active: existing?.active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm(f => ({ ...f, [key]: value }));

  const save = () => {
    setBusy(true); setError(null);
    emergencyApi.saveSector({
      id: existing?.id ?? undefined, name: form.name.trim(), code: form.code.trim() || form.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      description: form.description || null, tagline: form.tagline || null, glyph: form.glyph, tone: form.tone,
      hotline: form.hotline || null, hotlineLabel: form.hotlineLabel || null, sort: form.sort, active: form.active,
    }).then(onDone).catch((caught: unknown) => setError(err(caught, 'That did not save.'))).finally(() => setBusy(false));
  };

  const pick = (selected: boolean) => ({ border: `1px solid ${selected ? t.brand : t.border}`, background: selected ? t.brandSoft : 'transparent', borderRadius: 10, padding: 6, cursor: 'pointer', display: 'grid', placeItems: 'center', gap: 2 } as const);

  return (
    <Modal title={existing ? `Edit ${existing.name}` : 'Add a category'} onClose={onClose} width={720}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 18, alignItems: 'start' }}>
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0 12px' }}>
            <Field label="Name"><Input value={form.name} onChange={v => set('name', v)} autoFocus placeholder="Police and security" /></Field>
            <Field label="Code" hint="Short, stable. Used by routing."><Input value={form.code} onChange={v => set('code', v)} placeholder="police" disabled={!!existing} /></Field>
          </div>
          <Field label="One line under the name" hint="What a person recognises: the situations, not the institution."><Input value={form.tagline} onChange={v => set('tagline', v)} placeholder="Attack, theft, a missing person." /></Field>
          <Field label="Glyph" hint="Drawn by the app. Never an emoji.">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 6 }}>
              {SECTOR_GLYPHS.map(g => (
                <button key={g} type="button" title={g} onClick={() => set('glyph', g)} style={pick(form.glyph === g)}>
                  <SectorGlyph name={g} color={form.glyph === g ? t.brand : t.textMuted} size={22} />
                </button>
              ))}
            </div>
          </Field>
          <Field label="Tone">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {SECTOR_TONES.map(tone => {
                const c = toneColor(tone, dark);
                return (
                  <button key={tone} type="button" title={tone} onClick={() => set('tone', tone)} style={{ ...pick(form.tone === tone), padding: '6px 10px', gridAutoFlow: 'column' }}>
                    <span style={{ width: 14, height: 14, borderRadius: 7, background: c.fg, display: 'inline-block' }} />
                    <span style={{ fontSize: 12, color: t.text }}>{tone}</span>
                  </button>
                );
              })}
            </div>
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
            <Field label="Hotline" hint="The sector's own number, if the country has one. Confirm it with the service first."><Input value={form.hotline} onChange={v => set('hotline', v)} placeholder="019" /></Field>
            <Field label="Hotline label"><Input value={form.hotlineLabel} onChange={v => set('hotlineLabel', v)} placeholder="Free from any phone" /></Field>
          </div>
          <Field label="Description" hint="For the console. The phone shows the one line above."><Textarea value={form.description} onChange={v => set('description', v)} rows={2} /></Field>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: t.text, marginBottom: 12, cursor: 'pointer' }}><input type="checkbox" checked={form.active} onChange={e => set('active', e.target.checked)} /> Shown on the phone and the website</label>
        </div>
        <div style={{ display: 'grid', gap: 8, justifyItems: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: t.textSubtle, textTransform: 'uppercase', letterSpacing: 0.4 }}>On the phone</div>
          <SectorCardPreview sector={{ name: form.name, tagline: form.tagline, glyph: form.glyph, tone: form.tone, hotline: form.hotline, hotlineLabel: form.hotlineLabel }} dark={dark} />
        </div>
      </div>
      {error ? <ErrorNote message={error} /> : null}
      <Actions>
        <Button tone="subtle" onClick={onClose}>Cancel</Button>
        <Button tone="primary" disabled={busy || !form.name.trim()} onClick={save}>{busy ? 'Saving…' : 'Save'}</Button>
      </Actions>
    </Modal>
  );
}

export function Note({ children }: { children: ReactNode }) {
  const { t } = useTheme();
  return <div style={{ fontSize: 12.5, color: t.textMuted }}>{children}</div>;
}
