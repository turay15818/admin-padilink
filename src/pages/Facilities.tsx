/**
 * The facility desk — the human attention the whole health directory is made of.
 *
 * Every screen in the app prints a sentence like "checked three weeks ago by our team". Until
 * this page existed there was no way to make that sentence true: ConfirmedAt and Verified could
 * only be set with direct SQL, a claim could be filed and never answered, and a report that
 * somebody had driven to a locked gate went into an application log nobody reads. The directory
 * was a promise with nobody behind it.
 *
 * The page is deliberately a QUEUE rather than a browser. A reviewer sitting down here should
 * not have to go looking for what needs them: drafts nobody has published, entries nobody has
 * ever checked, claims waiting on a judgement, and reports from people who went there and found
 * something wrong. The counts across the top are the whole triage.
 *
 * Confirm is the important button and is drawn as such. It is the only action in the platform
 * that writes a checked-on date, and it means one specific thing — a person rang them, they
 * exist, this is the number, today.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import {
  Button, Card, Cell, EmptyState, ErrorNote, Field, Input, Loading, Modal, PageHeader, Pill,
  Row, Table, Textarea, Toasts, fmtDate, useToasts,
} from '../components/ui';
import {
  adminApi,
  type AdminFacilityList,
  type AdminFacilityReport,
  type AdminFacilityRow,
} from '../api/admin';

type Tab = 'queue' | 'reports' | 'import';

export function Facilities() {
  const { t } = useTheme();
  const { toasts, push } = useToasts();
  const [tab, setTab] = useState<Tab>('queue');
  const [data, setData] = useState<AdminFacilityList | null>(null);
  const [reports, setReports] = useState<AdminFacilityReport[] | null>(null);
  const [search, setSearch] = useState('');
  const [needsAttention, setNeedsAttention] = useState(true);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [confirming, setConfirming] = useState<AdminFacilityRow | null>(null);
  const [claiming, setClaiming] = useState<AdminFacilityRow | null>(null);
  const [resolving, setResolving] = useState<AdminFacilityReport | null>(null);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [queue, list] = await Promise.all([
        adminApi.facilityQueue({ search: search.trim() || undefined, needsAttention, take: 50 }),
        adminApi.facilityReports(true).catch(() => [] as AdminFacilityReport[]),
      ]);
      setData(queue);
      setReports(list);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That could not be loaded.');
    } finally {
      setBusy(false);
    }
  }, [search, needsAttention]);

  useEffect(() => { void load(); }, [load]);

  const act = async (work: () => Promise<unknown>, said: string) => {
    try {
      await work();
      push(said);
      setConfirming(null);
      setClaiming(null);
      setResolving(null);
      setNote('');
      await load();
    } catch (caught) {
      push(caught instanceof Error ? caught.message : 'That did not work.');
    }
  };

  return (
    <>
      <PageHeader
        title="Health facilities"
        subtitle="The directory only means what somebody here has checked. Confirming an entry is what makes every screen in the app say a person looked at it."
      />

      {error ? <ErrorNote message={error} /> : null}

      {/* The triage. Everything a reviewer needs to know before choosing where to start. */}
      {data ? (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          <Count label="Drafts" value={data.drafts} hint="Not public yet" tone={data.drafts ? 'warning' : 'neutral'} />
          <Count label="Never checked" value={data.unverified} hint="Live, but nobody has rung them" tone={data.unverified ? 'warning' : 'neutral'} />
          <Count label="Stale" value={data.stale} hint="Checked over six months ago" tone={data.stale ? 'warning' : 'neutral'} />
          <Count label="Claims waiting" value={data.pendingClaims} hint="Somebody says they work there" tone={data.pendingClaims ? 'warning' : 'neutral'} />
          <Count label="Reports" value={data.openReports} hint="Somebody went there and told us" tone={data.openReports ? 'danger' : 'neutral'} />
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <Button tone={tab === 'queue' ? 'primary' : 'ghost'} onClick={() => setTab('queue')}>The queue</Button>
        <Button tone={tab === 'reports' ? 'primary' : 'ghost'} onClick={() => setTab('reports')}>
          Reports{reports?.length ? ` (${reports.length})` : ''}
        </Button>
        <Button tone={tab === 'import' ? 'primary' : 'ghost'} onClick={() => setTab('import')}>Bring in a list</Button>
      </div>

      {tab === 'queue' ? (
        <>
          <Card style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <Field label="Find a place">
                  <Input value={search} onChange={setSearch} placeholder="A name or a town" />
                </Field>
              </div>
              <Button tone={needsAttention ? 'primary' : 'ghost'} onClick={() => setNeedsAttention(v => !v)}>
                {needsAttention ? 'Showing what needs a person' : 'Showing everything'}
              </Button>
            </div>
          </Card>

          {busy && !data ? <Loading /> : null}
          {data && data.items.length === 0 && !busy ? (
            <EmptyState icon="certificate" title="Nothing is waiting" message="Every entry has been looked at. Switch off the filter to see the whole directory." />
          ) : null}

          {data && data.items.length > 0 ? (
            <Card pad={0}>
              <Table head={['Place', 'Who owns it', 'Where', 'Last checked', 'Waiting on you', '']}>
                {data.items.map(row => (
                  <Row key={row.id}>
                    <Cell>
                      <div style={{ fontWeight: 700, color: t.text }}>{row.name}</div>
                      <div style={{ fontSize: 12, color: t.textMuted }}>
                        {row.kind}{row.level && row.level !== 'Unknown' ? ` · ${row.level}` : ''}
                        {row.serviceCount ? ` · ${row.serviceCount} services` : ' · no services listed'}
                      </div>
                      {row.sourceNote ? <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 2 }}>{row.sourceNote}</div> : null}
                    </Cell>
                    <Cell>{row.ownership === 'Unknown' ? <Pill tone="warning">Not known</Pill> : row.ownership}</Cell>
                    <Cell>
                      <div>{[row.area, row.city].filter(Boolean).join(', ') || '—'}</div>
                      {/* A place with no pin cannot give directions. Worth seeing at a glance. */}
                      {row.latitude == null ? <div style={{ fontSize: 11.5, color: t.textSubtle }}>no map pin</div> : null}
                      {row.phone ? <div style={{ fontSize: 11.5, color: t.textSubtle }}>{row.phone}</div> : <div style={{ fontSize: 11.5, color: t.textSubtle }}>no number</div>}
                    </Cell>
                    <Cell>
                      {/* The server writes this sentence, so the desk and the app never disagree. */}
                      <span style={{ color: row.isStale ? t.warning : t.text }}>{row.freshness}</span>
                    </Cell>
                    <Cell>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {row.status === 'Draft' ? <Pill tone="warning">Draft</Pill> : null}
                        {row.status === 'Closed' ? <Pill tone="danger">Closed</Pill> : null}
                        {row.claimPending ? <Pill tone="warning">Claim</Pill> : null}
                        {row.openReports ? <Pill tone="danger">{row.openReports} report{row.openReports === 1 ? '' : 's'}</Pill> : null}
                        {row.verified ? <Pill tone="success">Confirmed</Pill> : null}
                      </div>
                    </Cell>
                    <Cell>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <Button tone="primary" onClick={() => { setNote(''); setConfirming(row); }}>Confirm</Button>
                        {row.status === 'Draft' ? (
                          <Button tone="ghost" onClick={() => act(() => adminApi.setFacilityStatus(row.id, { status: 'Listed' }), 'Published.')}>Publish</Button>
                        ) : null}
                        {row.status === 'Listed' ? (
                          <Button tone="ghost" onClick={() => act(() => adminApi.setFacilityStatus(row.id, { status: 'Closed' }), 'Marked closed.')}>Closed</Button>
                        ) : null}
                        {row.claimPending ? (
                          <Button tone="ghost" onClick={() => { setNote(''); setClaiming(row); }}>Claim…</Button>
                        ) : null}
                      </div>
                    </Cell>
                  </Row>
                ))}
              </Table>
            </Card>
          ) : null}
        </>
      ) : null}

      {tab === 'reports' ? <Reports reports={reports} onResolve={report => { setNote(''); setResolving(report); }} /> : null}
      {tab === 'import' ? <Import onDone={load} /> : null}

      {/* ---------------------------------------------------------------- confirm */}
      {confirming ? (
        <Modal title={`Confirm ${confirming.name}`} onClose={() => setConfirming(null)}>
          <p style={{ color: t.textMuted, fontSize: 13.5, lineHeight: 1.6, marginTop: 0 }}>
            This means one specific thing: <strong style={{ color: t.text }}>you rang them, they exist, and this is the
            number</strong>. Every screen in the app will say a person checked it today, and somebody will drive there
            on the strength of that.
          </p>
          <Field label="How did you check?" hint="Kept on the entry so the next reviewer knows what was done.">
            <Textarea value={note} onChange={setNote} rows={3} placeholder="Rang the switchboard, spoke to the matron." />
          </Field>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <Button tone="primary" onClick={() => act(() => adminApi.confirmFacility(confirming.id, { verified: true, note: note.trim() || null }), 'Confirmed.')}>
              I checked it — confirm
            </Button>
            {confirming.verified ? (
              <Button tone="ghost" onClick={() => act(() => adminApi.confirmFacility(confirming.id, { verified: false, note: note.trim() || null }), 'Confirmation withdrawn.')}>
                Withdraw the confirmation
              </Button>
            ) : null}
            <Button tone="ghost" onClick={() => setConfirming(null)}>Cancel</Button>
          </div>
        </Modal>
      ) : null}

      {/* ---------------------------------------------------------------- a claim */}
      {claiming ? (
        <Modal title={`Claim on ${claiming.name}`} onClose={() => setClaiming(null)}>
          <p style={{ color: t.textMuted, fontSize: 13.5, lineHeight: 1.6, marginTop: 0 }}>
            <strong style={{ color: t.text }}>{claiming.claimedByName}</strong> ({claiming.claimedByEmail}) says they work
            there, and asked to keep the hours and services current. Approving lets them answer messages sent to the
            place. It never lets them change the name, the ownership or the location.
          </p>
          {claiming.sourceNote ? <p style={{ color: t.textSubtle, fontSize: 12.5 }}>{claiming.sourceNote}</p> : null}
          <Field label="Note">
            <Textarea value={note} onChange={setNote} rows={2} placeholder="Spoke to the pharmacy, she is the superintendent." />
          </Field>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Button tone="primary" onClick={() => act(() => adminApi.answerFacilityClaim(claiming.id, { approve: true, note: note.trim() || null }), 'Approved.')}>Approve</Button>
            <Button tone="danger" onClick={() => act(() => adminApi.answerFacilityClaim(claiming.id, { approve: false, note: note.trim() || null }), 'Refused — the entry is free again.')}>Refuse</Button>
            <Button tone="ghost" onClick={() => setClaiming(null)}>Cancel</Button>
          </div>
        </Modal>
      ) : null}

      {/* ---------------------------------------------------------------- a report */}
      {resolving ? (
        <Modal title={resolving.kindLabel} onClose={() => setResolving(null)}>
          <p style={{ color: t.text, fontSize: 14, lineHeight: 1.6, marginTop: 0 }}>“{resolving.what}”</p>
          <p style={{ color: t.textSubtle, fontSize: 12.5 }}>
            {resolving.facilityName} · {resolving.reportedByName ?? 'Anonymous'} · {fmtDate(resolving.reportedAt)}
          </p>
          <Field label="What did you do?" hint="Required either way — a decision with no note is one nobody can review later, including you.">
            <Textarea value={note} onChange={setNote} rows={3} placeholder="Rang them; they have moved to Wilberforce. Marked closed and added the new entry." />
          </Field>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Button tone="primary" onClick={() => act(() => adminApi.resolveFacilityReport(resolving.id, { acted: true, note: note.trim() }), 'Closed.')}>
              I changed the entry
            </Button>
            <Button tone="ghost" onClick={() => act(() => adminApi.resolveFacilityReport(resolving.id, { acted: false, note: note.trim() }), 'Closed.')}>
              Nothing needed doing
            </Button>
          </div>
        </Modal>
      ) : null}

      <Toasts toasts={toasts} />
    </>
  );
}

function Count({ label, value, hint, tone }: { label: string; value: number; hint: string; tone: 'neutral' | 'warning' | 'danger' }) {
  const { t } = useTheme();
  const colour = tone === 'danger' ? t.danger : tone === 'warning' ? t.warning : t.textMuted;
  return (
    <div style={{ border: `1px solid ${t.border}`, borderRadius: 12, padding: '10px 14px', minWidth: 130 }}>
      <div style={{ color: colour, fontSize: 22, fontWeight: 800 }}>{value}</div>
      <div style={{ color: t.text, fontSize: 12.5, fontWeight: 700 }}>{label}</div>
      <div style={{ color: t.textSubtle, fontSize: 11 }}>{hint}</div>
    </div>
  );
}

function Reports({ reports, onResolve }: { reports: AdminFacilityReport[] | null; onResolve: (report: AdminFacilityReport) => void }) {
  const { t } = useTheme();
  if (!reports) return <Loading />;
  if (reports.length === 0) {
    return <EmptyState icon="certificate" title="Nothing reported" message="When somebody drives to a place and finds it shut, it appears here." />;
  }
  return (
    <Card pad={0}>
      <Table head={['What', 'Place', 'Who', 'When', '']}>
        {reports.map(report => (
          <Row key={report.id}>
            <Cell>
              <div style={{ fontWeight: 700, color: report.kind === 'Closed' || report.kind === 'NotReal' ? t.danger : t.text }}>
                {report.kindLabel}
              </div>
              <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 2 }}>{report.what}</div>
            </Cell>
            <Cell>{report.facilityName}</Cell>
            {/* Anonymous is the norm: the person at the locked gate had no account, and
                demanding one would have lost the report. */}
            <Cell>{report.reportedByName ?? <span style={{ color: t.textSubtle }}>Anonymous</span>}</Cell>
            <Cell>{fmtDate(report.reportedAt)}</Cell>
            <Cell><Button tone="primary" onClick={() => onResolve(report)}>Deal with it</Button></Cell>
          </Row>
        ))}
      </Table>
    </Card>
  );
}

function Import({ onDone }: { onDone: () => void }) {
  const { t } = useTheme();
  const { toasts, push } = useToasts();
  const [source, setSource] = useState('');
  const [json, setJson] = useState('');
  const [result, setResult] = useState<{ dryRun: boolean; added: number; updated: number; skipped: number; notes: string[]; rules: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (dryRun: boolean) => {
    let rows: unknown[];
    try {
      const parsed = JSON.parse(json);
      rows = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      push('That is not valid JSON.');
      return;
    }
    setBusy(true);
    try {
      const answer = await adminApi.importFacilities({ source: source.trim(), rows, dryRun });
      setResult(answer);
      if (!dryRun) { push(`${answer.added} added, ${answer.updated} updated.`); onDone(); }
    } catch (caught) {
      push(caught instanceof Error ? caught.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card>
        <p style={{ color: t.textMuted, fontSize: 13.5, lineHeight: 1.6, marginTop: 0 }}>
          Paste a list of places as JSON — the Ministry's facility list, a district register, a survey. Everything
          arrives as a <strong style={{ color: t.text }}>draft</strong>, invisible to the public until somebody
          publishes it, and nothing arrives confirmed: a list is not a person ringing a hospital, and the whole
          directory is built on knowing the difference.
        </p>
        <Field label="Where did this list come from?" hint="Written onto every row. An entry whose source nobody recorded is one nobody can ever check.">
          <Input value={source} onChange={setSource} placeholder="MoHS master facility list, 2026 edition" />
        </Field>
        <Field
          label="The rows"
          hint='[{"name":"Kabala Government Hospital","kind":"Hospital","ownership":"Government","level":"DistrictHospital","city":"Kabala","province":"Koinadugu District","phone":"+232…","latitude":9.58,"longitude":-11.55,"services":["Emergency","CaesareanSection"]}]'
        >
          <Textarea value={json} onChange={setJson} rows={10} placeholder="[ … ]" />
        </Field>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <Button tone="primary" onClick={() => void run(true)} disabled={busy || !source.trim() || !json.trim()}>
            Try it (writes nothing)
          </Button>
          <Button
            tone="danger"
            onClick={() => void run(false)}
            disabled={busy || !source.trim() || !json.trim() || !result?.dryRun}
          >
            Bring them in
          </Button>
        </div>
        {!result?.dryRun ? (
          <p style={{ color: t.textSubtle, fontSize: 12, marginBottom: 0 }}>Try it first — an import of two thousand rows on a typo is very hard to undo.</p>
        ) : null}
      </Card>

      {result ? (
        <Card style={{ marginTop: 14 }}>
          <div style={{ color: t.text, fontWeight: 700, marginBottom: 8 }}>
            {result.dryRun ? 'What would happen' : 'What happened'} — {result.added} new, {result.updated} filled in, {result.skipped} skipped
          </div>
          <div style={{ maxHeight: 280, overflowY: 'auto', display: 'grid', gap: 3 }}>
            {result.notes.map((line, index) => (
              <div key={`${line}-${index}`} style={{ color: t.textMuted, fontSize: 12.5 }}>· {line}</div>
            ))}
          </div>
          <div style={{ borderTop: `1px solid ${t.border}`, marginTop: 10, paddingTop: 10, display: 'grid', gap: 3 }}>
            {result.rules.map(rule => <div key={rule} style={{ color: t.textSubtle, fontSize: 11.5, lineHeight: 1.5 }}>· {rule}</div>)}
          </div>
        </Card>
      ) : null}
      <Toasts toasts={toasts} />
    </>
  );
}
