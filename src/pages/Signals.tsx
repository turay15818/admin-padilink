/**
 * What watches the room.
 *
 * Every night the sweep looks for the shapes fraud takes on a marketplace like this one: the
 * same government ID behind two accounts, one phone signed into six, a customer who reviewed
 * one provider five times in a month, two people reviewing each other, a medical skill with
 * no licence behind it, a price four times everyone else's. Each is a question, not a
 * verdict — a family really can share a phone — so the evidence is on the screen and the
 * answer is a person's.
 *
 * Dismissing is not forgetting. A dismissed signal reopens by itself if it grows: three
 * accounts on a phone that become six is a new question. Actioning is the note that says
 * what was done, kept next to the signal for whoever looks next.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import { Button, Card, EmptyState, ErrorNote, Loading, PageHeader, Pill, Textarea, Toasts, useToasts } from '../components/ui';
import { adminApi, type TrustSignal } from '../api/admin';

const KIND_HINT: Record<number, string> = {
  1: 'Two accounts verified with the same ID number. Sometimes a spouse; sometimes one person twice.',
  2: 'Several accounts signed in from one phone. A family shares a phone; a farm of fake reviewers does too.',
  3: 'One customer, one provider, many reviews in a month. A regular customer reviews over a year, not a fortnight.',
  4: 'Two people reviewing each other within ninety days. Two friends can; so can two accounts one person runs.',
  5: 'A medical skill listed with no approved licence behind it. This one is rarely innocent — check the health desk.',
  6: 'A price four times the skill\'s median, or under a quarter of it. A typo, a premium, or bait.',
};

type Filter = 'open' | 'all';

export function Signals() {
  const { t } = useTheme();
  const { toasts, push } = useToasts();
  const [rows, setRows] = useState<TrustSignal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('open');
  const [kind, setKind] = useState<number | 'all'>('all');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [sweeping, setSweeping] = useState(false);
  const [openEvidence, setOpenEvidence] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    adminApi.trustSignals(filter === 'open').then(setRows).catch((e) => { setError(e instanceof Error ? e.message : 'Could not load the signals.'); setRows([]); });
  }, [filter]);
  useEffect(load, [load]);

  const sweep = async () => {
    setSweeping(true);
    try {
      const result = await adminApi.sweepTrustSignals();
      push(`Swept. ${result.written} new, ${result.updated} refreshed, ${result.open} open.`);
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : 'The sweep did not run.', 'error');
    } finally {
      setSweeping(false);
    }
  };

  const handle = async (row: TrustSignal, status: 2 | 3) => {
    const note = (notes[row.id] ?? '').trim();
    if (status === 3 && !note) {
      push('Say what was done — the next person to look needs it.', 'error');
      return;
    }
    setBusy(row.id);
    try {
      await adminApi.handleTrustSignal(row.id, { status, note: note || null });
      push(status === 2 ? 'Dismissed. It reopens by itself if it grows.' : 'Actioned, with your note.');
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : 'That did not save.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const kinds = useMemo(() => {
    const map = new Map<number, string>();
    for (const r of rows ?? []) map.set(r.kind, r.kindLabel);
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [rows]);
  const visible = useMemo(() => (rows ?? []).filter((r) => kind === 'all' || r.kind === kind), [rows, kind]);
  const bySeverity = useMemo(() => ({ high: visible.filter((r) => r.severity === 3).length, medium: visible.filter((r) => r.severity === 2).length, low: visible.filter((r) => r.severity === 1).length }), [visible]);

  const severityTone = (s: number): 'danger' | 'warning' | 'neutral' => (s === 3 ? 'danger' : s === 2 ? 'warning' : 'neutral');
  const chip = (active: boolean, label: string, onClick: () => void) => (
    <button
      key={label}
      onClick={onClick}
      style={{ padding: '6px 12px', borderRadius: 999, border: `1px solid ${active ? t.brand : t.border}`, background: active ? t.brandSoft : 'transparent', color: active ? t.brand : t.textMuted, fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}
    >
      {label}
    </button>
  );

  return (
    <>
      <PageHeader
        title="Signals"
        subtitle="What the nightly sweep noticed. A signal is a question with its evidence attached — never a verdict."
        action={<Button onClick={sweep} disabled={sweeping}>{sweeping ? 'Sweeping…' : 'Sweep now'}</Button>}
      />
      {error ? <ErrorNote message={error} /> : null}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        {chip(filter === 'open', 'Open', () => setFilter('open'))}
        {chip(filter === 'all', 'Everything, handled too', () => setFilter('all'))}
        <span style={{ width: 1, height: 22, background: t.border, margin: '0 4px' }} />
        {chip(kind === 'all', 'All kinds', () => setKind('all'))}
        {kinds.map(([k, label]) => chip(kind === k, label, () => setKind(k)))}
        {visible.length ? (
          <span style={{ marginLeft: 'auto', fontSize: 12.5, color: t.textMuted, fontVariantNumeric: 'tabular-nums' }}>
            {bySeverity.high ? `${bySeverity.high} high · ` : ''}{bySeverity.medium ? `${bySeverity.medium} medium · ` : ''}{bySeverity.low} low
          </span>
        ) : null}
      </div>

      {rows === null ? <Loading /> : null}
      {rows !== null && visible.length === 0 && !error ? (
        <EmptyState icon="shield" title={filter === 'open' ? 'Nothing open' : 'Nothing here'} message="The sweep runs every night. Press Sweep now to run it this minute." />
      ) : null}

      <div style={{ display: 'grid', gap: 12 }}>
        {visible.map((row) => (
          <Card key={row.id}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              {/* a severity stripe, so the eye sorts before the mind reads */}
              <span aria-hidden style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: row.severity === 3 ? t.danger : row.severity === 2 ? t.warning : t.border }} />
              <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Pill tone={severityTone(row.severity)}>{row.severityLabel}</Pill>
                  <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: t.textMuted }}>{row.kindLabel}</span>
                  {row.status !== 1 ? <Pill tone="neutral">{row.statusLabel}</Pill> : null}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: t.text, marginTop: 6, lineHeight: 1.45 }}>{row.summary}</div>
                <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 4 }}>
                  {row.userName ? `${row.userName} · ` : ''}
                  {row.count} {row.count === 1 ? 'item' : 'items'} · first seen {new Date(row.firstSeenAt).toLocaleDateString()} · last {new Date(row.lastSeenAt).toLocaleDateString()}
                  {row.handledAt ? ` · handled ${new Date(row.handledAt).toLocaleDateString()}` : ''}
                </div>
                <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 6, fontStyle: 'italic' }}>{KIND_HINT[row.kind]}</div>
                {row.handlingNote ? <div style={{ fontSize: 13, color: t.text, marginTop: 6 }}>Note: {row.handlingNote}</div> : null}

                <button onClick={() => setOpenEvidence(openEvidence === row.id ? null : row.id)} style={{ marginTop: 8, background: 'none', border: 'none', color: t.brand, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', padding: 0 }}>
                  {openEvidence === row.id ? 'Hide the evidence' : 'Show the evidence'}
                </button>
                {openEvidence === row.id ? (
                  <pre style={{ marginTop: 6, padding: 10, borderRadius: 8, background: t.surfaceMuted, color: t.text, fontSize: 11.5, lineHeight: 1.5, overflowX: 'auto', maxHeight: 280 }}>
                    {pretty(row.evidenceJson)}
                  </pre>
                ) : null}
              </div>
            </div>

            {row.status === 1 ? (
              <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                <Textarea
                  rows={2}
                  placeholder="What you did, or why this is fine — kept next to the signal for whoever looks next."
                  value={notes[row.id] ?? ''}
                  onChange={(value) => setNotes((prev) => ({ ...prev, [row.id]: value }))}
                />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Button onClick={() => handle(row, 3)} disabled={busy === row.id}>Actioned</Button>
                  <Button tone="danger" onClick={() => handle(row, 2)} disabled={busy === row.id}>Dismiss — it is fine</Button>
                  {row.userId ? <a href={`/users?q=${encodeURIComponent(row.userName ?? row.userId)}`} style={{ alignSelf: 'center', fontSize: 12.5, fontWeight: 700, color: t.brand }}>Open the account →</a> : null}
                </div>
              </div>
            ) : null}
          </Card>
        ))}
      </div>
      <Toasts toasts={toasts} />
    </>
  );
}

function pretty(json: string): string {
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
  }
}
