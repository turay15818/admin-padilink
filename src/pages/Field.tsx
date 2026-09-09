/**
 * Field work — the places we know of, the people we sent, and what they brought back.
 *
 * Three halves of one idea, which is why they share a page rather than three.
 *
 * A directory of Sierra Leone's health facilities cannot be imported. The lists that exist are
 * years old, disagree with each other, and were never checked by anybody who stood outside the
 * building. So the entries here are made the only way they can be trusted: somebody walks to the
 * gate, and their handset's own fix is what proves they were there. This desk is the other end
 * of that — it issues the codes those people carry, and it reads what came back.
 *
 * PLACES stopped being a constant in a source file for the same reason. Freetown had its areas
 * hard-coded and Bo had nothing, so a surveyor in Bo could say "Bo" and no more. Now a town gains
 * Kandeh Town from this desk, in a minute, without a deploy. A place's slug is permanent once
 * issued: links and saved requests carry it, so renaming Kandeh Town changes the label and
 * nothing else, and switching one off removes it from the picker while every row that already
 * points at it still resolves. Nothing here deletes.
 *
 * CODES are traceable and cheap to stop. One belongs to one named person, carries a budget and an
 * expiry, and can be tied to an area. Suspending it stops the next submission within seconds and
 * touches none of the ones already in — because the point of a code is not security, it is
 * knowing whose work you are looking at when something is wrong.
 *
 * THE QUEUE is where judgement happens, and it is built to make the doubt visible. Every row
 * leads with what the server thought was worth a second look — a pin two hundred metres wide, a
 * form filled in ninety seconds, a name that already exists a street away — and a reviewer who
 * disagrees can approve anyway. Approving dates the entry to THE DAY THEY VISITED, not to today,
 * because the whole directory rests on that date meaning what it says.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import {
  Button, Card, Cell, EmptyState, ErrorNote, Field as FormField, Input, Loading, Modal,
  PageHeader, Pill, Row, Table, Textarea, Toasts, fmtDate, fmtDateTime, useToasts,
} from '../components/ui';
import { Select } from '../components/Select';
import {
  adminApi,
  type AdminPlace,
  type AdminPlaceTree,
  type AdminRegistration,
  type AdminSurveyorCode,
  type AtlasStampReport,
} from '../api/admin';

type Tab = 'queue' | 'codes' | 'places' | 'map';


export function Field() {
  const { toasts, push } = useToasts();
  const [tab, setTab] = useState<Tab>('queue');

  const [queue, setQueue] = useState<AdminRegistration[] | null>(null);
  const [codes, setCodes] = useState<AdminSurveyorCode[] | null>(null);
  const [tree, setTree] = useState<AdminPlaceTree | null>(null);
  const [waitingOnly, setWaitingOnly] = useState(true);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [deciding, setDeciding] = useState<{ row: AdminRegistration; approve: boolean } | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [suspending, setSuspending] = useState<AdminSurveyorCode | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<AdminPlace | null>(null);
  const [note, setNote] = useState('');
  const [merge, setMerge] = useState(true);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [rows, issued, places] = await Promise.all([
        adminApi.facilityRegistrations({ waitingOnly, take: 100 }),
        adminApi.surveyorCodes(false).catch(() => [] as AdminSurveyorCode[]),
        adminApi.places(true).catch(() => ({ places: [], pickable: [] } as AdminPlaceTree)),
      ]);
      setQueue(rows);
      setCodes(issued);
      setTree(places);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That could not be loaded.');
    } finally {
      setBusy(false);
    }
  }, [waitingOnly]);

  useEffect(() => { void load(); }, [load]);

  const act = async (work: () => Promise<unknown>, said: string) => {
    try {
      await work();
      push(said);
      setDeciding(null);
      setIssuing(false);
      setSuspending(null);
      setAdding(false);
      setEditing(null);
      setNote('');
      await load();
    } catch (caught) {
      push(caught instanceof Error ? caught.message : 'That did not work.');
    }
  };

  // The triage across the top: what is actually waiting, and what is worth worrying about.
  const waiting = queue?.length ?? 0;
  const flagged = queue?.filter(row => row.concerns.length > 0).length ?? 0;
  const live = codes?.filter(row => row.status === 'Active' && !row.expired).length ?? 0;

  return (
    <div>
      <PageHeader
        title="Field work"
        subtitle="What came back from people standing at the gate, the codes they carry, and the places they can name."
      />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <Count label="Waiting on a decision" value={waiting} tone={waiting ? 'warning' : 'success'} state={waiting ? 'waiting' : 'clear'} />
        <Count label="With something to check" value={flagged} tone={flagged ? 'danger' : 'success'} state={flagged ? 'look' : 'clear'} />
        <Count label="Codes in use" value={live} tone="info" state="live" />
        <Count label="Places a surveyor can name" value={tree?.pickable.length ?? 0} tone="neutral" />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <Button tone={tab === 'queue' ? 'primary' : 'ghost'} size="sm" onClick={() => setTab('queue')}>
          What came back{waiting ? ` (${waiting})` : ''}
        </Button>
        <Button tone={tab === 'codes' ? 'primary' : 'ghost'} size="sm" onClick={() => setTab('codes')}>Codes</Button>
        <Button tone={tab === 'places' ? 'primary' : 'ghost'} size="sm" onClick={() => setTab('places')}>Places</Button>
        {/* On this page rather than its own, because it is the same job. Somebody who has just
            added Kandeh Town to the tree above is standing exactly where they would want to
            press this — every provider who wrote "Kandeh Town" has been unplaceable until now. */}
        <Button tone={tab === 'map' ? 'primary' : 'ghost'} size="sm" onClick={() => setTab('map')}>National map</Button>
      </div>

      {error ? <ErrorNote message={error} /> : null}
      {busy ? <Loading label="Reading the desk…" /> : null}

      {!busy && tab === 'queue' ? (
        <Queue
          rows={queue}
          waitingOnly={waitingOnly}
          onWaitingOnly={setWaitingOnly}
          onDecide={(row, approve) => { setDeciding({ row, approve }); setMerge(!!row.possibleDuplicateFacilityId); setNote(''); }}
        />
      ) : null}

      {!busy && tab === 'codes' ? (
        <Codes rows={codes} onIssue={() => setIssuing(true)} onSuspend={setSuspending} />
      ) : null}

      {!busy && tab === 'places' ? (
        <Places tree={tree} onAdd={() => setAdding(true)} onEdit={setEditing} />
      ) : null}

      {!busy && tab === 'map' ? <MapCoverage onToast={push} /> : null}

      {deciding ? (
        <DecideModal
          row={deciding.row}
          approve={deciding.approve}
          note={note}
          onNote={setNote}
          merge={merge}
          onMerge={setMerge}
          onClose={() => setDeciding(null)}
          onSubmit={() => act(
            () => adminApi.decideRegistration(deciding.row.id, {
              approve: deciding.approve,
              note: note.trim(),
              mergeIntoFacilityId: deciding.approve && merge ? deciding.row.possibleDuplicateFacilityId : null,
              publish: true,
            }),
            deciding.approve ? 'In the directory, dated to the day they visited.' : 'Turned down.',
          )}
        />
      ) : null}

      {issuing ? (
        <IssueModal
          areas={tree?.pickable ?? []}
          onClose={() => setIssuing(false)}
          onSubmit={body => act(() => adminApi.issueSurveyorCode(body), 'Issued — hand the code over in person.')}
        />
      ) : null}

      {suspending ? (
        <SuspendModal
          code={suspending}
          note={note}
          onNote={setNote}
          onClose={() => setSuspending(null)}
          onSubmit={() => act(
            () => adminApi.suspendSurveyorCode(suspending.id, {
              suspend: suspending.status === 'Active',
              reason: note.trim() || null,
            }),
            suspending.status === 'Active' ? 'Stopped. What it already sent stays.' : 'Back in use.',
          )}
        />
      ) : null}

      {adding ? (
        <AddPlaceModal
          towns={tree?.places.filter(p => p.kind === 'Town' || p.kind === 'District') ?? []}
          onClose={() => setAdding(false)}
          onSubmit={body => act(() => adminApi.addPlace(body), 'Added — surveyors can pick it now.')}
        />
      ) : null}

      {editing ? (
        <EditPlaceModal
          place={editing}
          onClose={() => setEditing(null)}
          onSubmit={body => act(() => adminApi.editPlace(editing.slug, body), 'Saved.')}
        />
      ) : null}

      <Toasts toasts={toasts} />
    </div>
  );
}

function Count({ label, value, tone, state }: {
  label: string;
  value: number;
  tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  /** The word for what this number IS. Left out where the number is just a number. */
  state?: string;
}) {
  const { t } = useTheme();
  return (
    <Card pad={13} style={{ minWidth: 152 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: t.text, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
        {state ? <Pill tone={tone}>{state}</Pill> : null}
      </div>
      <div style={{ fontSize: 11.5, color: t.textMuted, marginTop: 3 }}>{label}</div>
    </Card>
  );
}

// ==================================================================== what came back

function Queue({
  rows, waitingOnly, onWaitingOnly, onDecide,
}: {
  rows: AdminRegistration[] | null;
  waitingOnly: boolean;
  onWaitingOnly: (next: boolean) => void;
  onDecide: (row: AdminRegistration, approve: boolean) => void;
}) {
  const { t } = useTheme();

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button tone={waitingOnly ? 'primary' : 'ghost'} size="sm" onClick={() => onWaitingOnly(true)}>Waiting</Button>
        <Button tone={waitingOnly ? 'ghost' : 'primary'} size="sm" onClick={() => onWaitingOnly(false)}>Everything</Button>
      </div>

      {!rows?.length ? (
        <EmptyState
          icon="✓"
          title="Nothing waiting"
          message="Every submission has been decided. New ones appear here within seconds of somebody pressing send at a gate."
        />
      ) : null}

      {rows?.map(row => (
        <Card key={row.id}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: t.text }}>{row.name}</div>
              <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 2 }}>
                {[row.kind, row.ownership, row.placePath ?? row.address].filter(Boolean).join(' · ')}
              </div>
            </div>
            <Pill tone={row.status === 'Submitted' ? 'warning' : row.status === 'Approved' ? 'success' : 'neutral'}>
              {row.status}
            </Pill>
          </div>

          {/*
            The doubt goes first, above the facts it is doubt about. A reviewer who reads the
            name, the number and the services and only then meets "the pin is 380 m wide" has
            already decided.
          */}
          {row.concerns.length ? (
            <div style={{ marginTop: 11, borderLeft: `3px solid ${t.warning}`, paddingLeft: 11, display: 'grid', gap: 4 }}>
              {row.concerns.map(concern => (
                <div key={concern} style={{ fontSize: 12.5, color: t.warning, lineHeight: 1.5 }}>{concern}</div>
              ))}
            </div>
          ) : (
            <div style={{ marginTop: 11, fontSize: 12.5, color: t.success }}>Nothing flagged on this one.</div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 12, marginTop: 13 }}>
            <Facts title="Where they stood">
              <Fact label="Pin" value={`${row.latitude.toFixed(5)}, ${row.longitude.toFixed(5)}`} mono />
              <Fact label="How good" value={row.accuracyLabel} />
              <Fact label="Taken" value={fmtDateTime(row.capturedAt)} />
              <Fact label="On the form" value={row.minutesOnForm != null ? `${row.minutesOnForm} min` : 'not reported'} />
            </Facts>

            <Facts title="Who went">
              <Fact label="Surveyor" value={row.surveyorName} />
              <Fact label="Code" value={row.surveyorCode} mono />
              <Fact label="Sent" value={fmtDateTime(row.submittedAt)} />
              <Fact label="Spoke to" value={row.spokeTo ?? 'not recorded'} />
            </Facts>

            <Facts title="How to reach it">
              <Fact label="Phone" value={row.phone ?? 'none'} />
              <Fact label="Emergency" value={row.emergencyPhone ?? 'none'} />
              <Fact label="Hours" value={row.openingHours ?? (row.open24Hours ? 'open 24 hours' : 'not recorded')} />
              <Fact label="Beds" value={row.beds != null ? String(row.beds) : 'not recorded'} />
            </Facts>
          </div>

          {row.services.length ? (
            <div style={{ marginTop: 12 }}>
              <Label>What they said they do</Label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 5 }}>
                {row.services.map(service => <Pill key={service} tone="info">{service}</Pill>)}
              </div>
            </div>
          ) : null}

          {row.note ? (
            <div style={{ marginTop: 12 }}>
              <Label>Their note</Label>
              <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.55, marginTop: 3 }}>{row.note}</div>
            </div>
          ) : null}

          {row.possibleDuplicateName ? (
            <div style={{ marginTop: 12, fontSize: 12.5, color: t.text, background: t.warningSoft, borderRadius: 9, padding: '9px 11px' }}>
              Looks like <strong>{row.possibleDuplicateName}</strong>, which is already in the directory nearby.
              Approving offers to fold this into it rather than making a second entry.
            </div>
          ) : null}

          {/*
            The photo is the cheapest proof there is — a sign, a gate, a board of opening hours —
            and opens full size, because a reviewer is reading a hand-painted board in it.
          */}
          {row.photoUrl ? (
            <div style={{ marginTop: 12 }}>
              <a href={row.photoUrl} target="_blank" rel="noreferrer">
                <img
                  src={row.photoUrl}
                  alt={`Photograph taken at ${row.name}`}
                  style={{ maxWidth: 240, borderRadius: 10, border: `1px solid ${t.border}`, display: 'block' }}
                />
              </a>
            </div>
          ) : null}

          {row.status === 'Submitted' ? (
            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <Button tone="primary" onClick={() => onDecide(row, true)}>Accept into the directory</Button>
              <Button tone="danger" onClick={() => onDecide(row, false)}>Turn it down</Button>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${row.latitude},${row.longitude}`}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 12.5, color: t.textMuted, alignSelf: 'center', textDecoration: 'underline' }}
              >
                Open the pin on a map
              </a>
            </div>
          ) : (
            <div style={{ marginTop: 12, fontSize: 12, color: t.textSubtle }}>
              {row.status} · {row.reviewNote || 'no note was left'}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function Facts({ title, children }: { title: string; children: React.ReactNode }) {
  const { t } = useTheme();
  return (
    <div style={{ background: t.surfaceMuted, borderRadius: 10, padding: 11 }}>
      <Label>{title}</Label>
      <div style={{ display: 'grid', gap: 4, marginTop: 6 }}>{children}</div>
    </div>
  );
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const { t } = useTheme();
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
      <span style={{ color: t.textSubtle, minWidth: 74 }}>{label}</span>
      <span style={{ color: t.text, fontFamily: mono ? 'ui-monospace,SFMono-Regular,Menlo,monospace' : 'inherit' }}>{value}</span>
    </div>
  );
}

function Label({ children }: { children: string }) {
  const { t } = useTheme();
  return (
    <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1, color: t.textSubtle }}>
      {children.toUpperCase()}
    </div>
  );
}

// ==================================================================== codes

function Codes({
  rows, onIssue, onSuspend,
}: {
  rows: AdminSurveyorCode[] | null;
  onIssue: () => void;
  onSuspend: (code: AdminSurveyorCode) => void;
}) {
  const { t } = useTheme();
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div>
        <Button tone="primary" onClick={onIssue}>Issue a code</Button>
      </div>

      {!rows?.length ? (
        <EmptyState
          icon="◇"
          title="No codes issued"
          message="A code belongs to one named person, carries a budget and an expiry, and can be tied to one area. Hand it over in person — it is how their work is traced back to them."
        />
      ) : (
        <Card pad={0}>
          <Table head={['Code', 'Who holds it', 'Used', 'Accepted', 'Runs out', 'Status', '']}>
            {rows.map(row => (
              <Row key={row.id}>
                <Cell mono>{row.code}</Cell>
                <Cell>
                  <div style={{ color: t.text, fontWeight: 700 }}>{row.holderName}</div>
                  <div style={{ fontSize: 11.5, color: t.textSubtle }}>
                    {[row.holderPhone, row.areaName ? `${row.areaName} only` : null].filter(Boolean).join(' · ') || 'anywhere'}
                  </div>
                </Cell>
                <Cell>{row.used} of {row.max}</Cell>
                {/*
                  Accepted over rejected, not submissions. A code that sent forty and had thirty
                  turned down is the thing this table exists to make visible.
                */}
                <Cell>
                  <span style={{ color: row.rejected > row.approved ? t.danger : t.text }}>
                    {row.approved} in{row.rejected ? ` · ${row.rejected} turned down` : ''}
                  </span>
                </Cell>
                <Cell>{fmtDate(row.expiresAt)}</Cell>
                <Cell>
                  <Pill tone={statusToneOf(row)}>{row.expired ? 'Expired' : row.status}</Pill>
                </Cell>
                {/*
                  A code that ran out of days or out of budget cannot be put back by this button,
                  so it is not offered one. Un-suspending is the only thing that reverses, and
                  offering an action that silently does nothing is how a person stops trusting
                  every other button on the page.
                */}
                <Cell>
                  {row.status === 'Active' ? (
                    <Button size="sm" tone="danger" onClick={() => onSuspend(row)}>Stop it</Button>
                  ) : row.status === 'Suspended' ? (
                    <Button size="sm" onClick={() => onSuspend(row)}>Put it back</Button>
                  ) : (
                    <span style={{ fontSize: 11.5, color: t.textSubtle }}>
                      {row.expired ? 'Issue a new one' : 'Budget spent — issue a new one'}
                    </span>
                  )}
                </Cell>
              </Row>
            ))}
          </Table>
        </Card>
      )}
    </div>
  );
}

function statusToneOf(row: AdminSurveyorCode): 'success' | 'warning' | 'danger' | 'neutral' {
  if (row.expired || row.status === 'Spent') return 'neutral';
  if (row.status === 'Suspended') return 'danger';
  // Nearly out is worth seeing before it stops: a surveyor standing at a gate with three left
  // is a phone call the office would rather make today than tomorrow.
  if (row.remaining <= 3) return 'warning';
  return 'success';
}

// ==================================================================== places

function Places({
  tree, onAdd, onEdit,
}: {
  tree: AdminPlaceTree | null;
  onAdd: () => void;
  onEdit: (place: AdminPlace) => void;
}) {
  const { t } = useTheme();

  // Grouped as the tree means it: a town, then the sections under it. A flat table of 400 rows
  // is the thing this page replaced.
  const grouped = useMemo(() => {
    const places = tree?.places ?? [];
    const parents = places.filter(place => !place.parentSlug || place.kind === 'Town' || place.kind === 'District');
    const roots = parents.filter(place => place.kind !== 'Section');
    return roots
      .map(root => ({ root, children: places.filter(place => place.parentSlug === root.slug) }))
      .sort((a, b) => a.root.name.localeCompare(b.root.name));
  }, [tree]);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div>
        <Button tone="primary" onClick={onAdd}>Add a town or section</Button>
      </div>

      {!grouped.length ? (
        <EmptyState icon="◈" title="No places yet" message="Seed the tree from the API, or add the first town here." />
      ) : null}

      {grouped.map(({ root, children }) => (
        <Card key={root.slug}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: root.active ? t.text : t.textSubtle }}>{root.name}</div>
            <Pill tone="neutral">{root.kind}</Pill>
            {root.hasPin ? null : <Pill tone="warning">no pin</Pill>}
            {root.active ? null : <Pill tone="danger">off</Pill>}
            <span style={{ fontSize: 11.5, color: t.textSubtle }}>{root.regionName}</span>
            <Button size="sm" onClick={() => onEdit(root)} style={{ marginLeft: 'auto' }}>Edit</Button>
          </div>

          {children.length ? (
            <div style={{ display: 'grid', gap: 1, marginTop: 11 }}>
              {children.map(child => (
                <div
                  key={child.slug}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0',
                    borderTop: `1px solid ${t.border}`, flexWrap: 'wrap',
                  }}
                >
                  <span style={{ fontSize: 13, color: child.active ? t.text : t.textSubtle, fontWeight: 600 }}>{child.name}</span>
                  {/* The slug is shown because it is permanent, and a person editing needs to know that. */}
                  <span style={{ fontSize: 11, color: t.textSubtle, fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace' }}>{child.slug}</span>
                  {child.hasPin ? null : <Pill tone="warning">no pin</Pill>}
                  {child.active ? null : <Pill tone="danger">off</Pill>}
                  <Button size="sm" onClick={() => onEdit(child)} style={{ marginLeft: 'auto' }}>Edit</Button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: t.textSubtle, marginTop: 9 }}>
              No sections yet. A surveyor in {root.name} can only say “{root.name}” until one is added.
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

// ==================================================================== the modals

function DecideModal({
  row, approve, note, onNote, merge, onMerge, onClose, onSubmit,
}: {
  row: AdminRegistration;
  approve: boolean;
  note: string;
  onNote: (next: string) => void;
  merge: boolean;
  onMerge: (next: boolean) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const { t } = useTheme();
  return (
    <Modal title={approve ? `Accept ${row.name}` : `Turn down ${row.name}`} onClose={onClose} width={520}>
      <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.6, marginBottom: 12 }}>
        {approve
          ? `It goes into the directory dated ${fmtDate(row.capturedAt)} — the day ${row.surveyorName} stood there — not today. Everything they recorded is stored as our team's word, on that date.`
          : 'Nothing is deleted. The submission stays against the code that sent it, which is how a surveyor sending bad work is spotted.'}
      </div>

      {approve && row.possibleDuplicateName ? (
        <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', marginBottom: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={merge} onChange={event => onMerge(event.target.checked)} style={{ marginTop: 3 }} />
          <span style={{ fontSize: 12.5, color: t.text, lineHeight: 1.55 }}>
            Fold into <strong>{row.possibleDuplicateName}</strong> instead of making a second entry.
            The number and pin they brought back win, because they were there more recently.
          </span>
        </label>
      ) : null}

      <FormField
        label="Why"
        hint="Required either way. A decision nobody can review later is one nobody can trust."
      >
        <Textarea value={note} onChange={onNote} rows={3} placeholder="Rang the number, they answered, the sign matches." />
      </FormField>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button tone={approve ? 'primary' : 'danger'} disabled={!note.trim()} onClick={onSubmit}>
          {approve ? 'Accept it' : 'Turn it down'}
        </Button>
      </div>
    </Modal>
  );
}

function IssueModal({
  areas, onClose, onSubmit,
}: {
  areas: AdminPlace[];
  onClose: () => void;
  onSubmit: (body: { holderName: string; holderPhone?: string | null; maxRegistrations: number; daysValid: number; areaSlug?: string | null; note?: string | null }) => void;
}) {
  const { t } = useTheme();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [max, setMax] = useState('50');
  const [days, setDays] = useState('30');
  const [area, setArea] = useState<string | null>(null);
  const [note, setNote] = useState('');

  return (
    <Modal title="Issue a code" onClose={onClose} width={480}>
      <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.6, marginBottom: 13 }}>
        Give it to the person directly, not over a message anybody else can read. Everything they
        send is traced to this code, and stopping it takes one click.
      </div>

      <FormField label="Whose code is it" hint="Their real name. This is what a reviewer sees against every submission.">
        <Input value={name} onChange={setName} placeholder="Mohamed Kamara" autoFocus />
      </FormField>

      <FormField label="Their number" hint="So somebody can ring them about a submission.">
        <Input value={phone} onChange={setPhone} placeholder="+232 76 000000" />
      </FormField>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FormField label="How many places" hint="It stops itself at this many.">
          <Input value={max} onChange={setMax} type="number" />
        </FormField>
        <FormField label="Days it lasts">
          <Input value={days} onChange={setDays} type="number" />
        </FormField>
      </div>

      <FormField
        label="Tie it to one area"
        hint="Optional. With an area set, the code refuses a place outside it — worth doing for somebody covering one town."
      >
        <Select
          value={area}
          onChange={setArea}
          clearable
          clearLabel="Anywhere in Sierra Leone"
          placeholder="Anywhere in Sierra Leone"
          options={areas.map(place => ({ value: place.slug, label: place.name, detail: place.path }))}
        />
      </FormField>

      <FormField label="Note">
        <Input value={note} onChange={setNote} placeholder="Covering Bo district for the October sweep" />
      </FormField>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          tone="primary"
          disabled={!name.trim() || !Number(max) || !Number(days)}
          onClick={() => onSubmit({
            holderName: name.trim(),
            holderPhone: phone.trim() || null,
            maxRegistrations: Number(max),
            daysValid: Number(days),
            areaSlug: area,
            note: note.trim() || null,
          })}
        >
          Issue it
        </Button>
      </div>
    </Modal>
  );
}

function SuspendModal({
  code, note, onNote, onClose, onSubmit,
}: {
  code: AdminSurveyorCode;
  note: string;
  onNote: (next: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const { t } = useTheme();
  const stopping = code.status === 'Active';
  return (
    <Modal title={stopping ? `Stop ${code.code}` : `Put ${code.code} back`} onClose={onClose} width={440}>
      <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.6, marginBottom: 13 }}>
        {stopping
          ? `${code.holderName} will be refused on the next submission. The ${code.used} already sent stay exactly where they are — stopping a code is not a way to undo its work.`
          : `${code.holderName} can register again straight away, with ${code.remaining} left on the budget.`}
      </div>
      <FormField label="Why" hint="Shown to nobody in the field. It is for whoever reads this desk next.">
        <Input value={note} onChange={onNote} placeholder={stopping ? 'Phone lost' : 'Phone recovered'} autoFocus />
      </FormField>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button tone={stopping ? 'danger' : 'primary'} onClick={onSubmit}>{stopping ? 'Stop it' : 'Put it back'}</Button>
      </div>
    </Modal>
  );
}

function AddPlaceModal({
  towns, onClose, onSubmit,
}: {
  towns: AdminPlace[];
  onClose: () => void;
  onSubmit: (body: { name: string; kind: string; parentSlug?: string | null; latitude?: number | null; longitude?: number | null; sort?: number }) => void;
}) {
  const { t } = useTheme();
  const [name, setName] = useState('');
  const [kind, setKind] = useState('Section');
  const [parent, setParent] = useState<string | null>(null);
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');

  const needsParent = kind === 'Section' || kind === 'Town';

  return (
    <Modal title="Add a place" onClose={onClose} width={470}>
      <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.6, marginBottom: 13 }}>
        A section is an area inside a town — Kandeh Town inside Bo. Once added, a surveyor
        standing there can name it, and every facility registered under it inherits the town and
        the region without anybody typing them.
      </div>

      <FormField label="Name" hint="As people there say it, not as a form would spell it.">
        <Input value={name} onChange={setName} placeholder="Kandeh Town" autoFocus />
      </FormField>

      <FormField label="What kind">
        <Select
          value={kind}
          onChange={setKind}
          options={[
            { value: 'Section', label: 'Section', detail: 'An area inside a town' },
            { value: 'Town', label: 'Town', detail: 'A town or city' },
            { value: 'District', label: 'District' },
            { value: 'Province', label: 'Province' },
          ]}
        />
      </FormField>

      {needsParent ? (
        <FormField label="Inside which" hint="A section with nothing above it is refused — the path would be a dead end.">
          <Select
            value={parent}
            onChange={setParent}
            placeholder="Choose the town or district"
            options={towns.map(place => ({ value: place.slug, label: place.name, detail: place.path }))}
          />
        </FormField>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FormField label="Latitude" hint="Optional — a place with no pin still lists.">
          <Input value={lat} onChange={setLat} placeholder="7.9647" />
        </FormField>
        <FormField label="Longitude">
          <Input value={lon} onChange={setLon} placeholder="-11.7383" />
        </FormField>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          tone="primary"
          disabled={!name.trim() || (needsParent && !parent)}
          onClick={() => onSubmit({
            name: name.trim(),
            kind,
            parentSlug: parent,
            latitude: lat.trim() ? Number(lat) : null,
            longitude: lon.trim() ? Number(lon) : null,
          })}
        >
          Add it
        </Button>
      </div>
    </Modal>
  );
}

function EditPlaceModal({
  place, onClose, onSubmit,
}: {
  place: AdminPlace;
  onClose: () => void;
  onSubmit: (body: { name?: string | null; latitude?: number | null; longitude?: number | null; active?: boolean | null; sort?: number | null }) => void;
}) {
  const { t } = useTheme();
  const [name, setName] = useState(place.name);
  const [lat, setLat] = useState(place.latitude != null ? String(place.latitude) : '');
  const [lon, setLon] = useState(place.longitude != null ? String(place.longitude) : '');
  const [active, setActive] = useState(place.active);

  return (
    <Modal title={place.name} onClose={onClose} width={470}>
      <div style={{ fontSize: 12, color: t.textSubtle, lineHeight: 1.6, marginBottom: 13 }}>
        <div><strong style={{ color: t.textMuted }}>{place.path}</strong></div>
        {/* Said plainly, because it is the one thing on this form that cannot be undone. */}
        <div style={{ marginTop: 5 }}>
          Its address is <code style={{ color: t.text }}>{place.slug}</code> and never changes. Renaming
          changes the label everywhere; every saved link and request still resolves.
        </div>
      </div>

      <FormField label="Name">
        <Input value={name} onChange={setName} autoFocus />
      </FormField>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FormField label="Latitude">
          <Input value={lat} onChange={setLat} placeholder="not set" />
        </FormField>
        <FormField label="Longitude">
          <Input value={lon} onChange={setLon} placeholder="not set" />
        </FormField>
      </div>

      <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', marginBottom: 14, cursor: 'pointer' }}>
        <input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} style={{ marginTop: 3 }} />
        <span style={{ fontSize: 12.5, color: t.text, lineHeight: 1.55 }}>
          Offer it in the picker. Switching this off is not deleting — {place.children
            ? `the ${place.children} places under it and `
            : ''}everything already recorded here keeps working.
        </span>
      </label>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          tone="primary"
          disabled={!name.trim()}
          onClick={() => onSubmit({
            name: name.trim(),
            latitude: lat.trim() ? Number(lat) : null,
            longitude: lon.trim() ? Number(lon) : null,
            active,
          })}
        >
          Save
        </Button>
      </div>
    </Modal>
  );
}

/**
 * How complete the national skills map is, and the one button that makes it more so.
 *
 * WHY THIS IS A BUTTON AND NOT A MIGRATION. Most providers give a town, not a coordinate, so the
 * map draws them on their district's anchor — which depends on their district being worked out
 * from whatever they typed into a sign-up form. That resolution gets better over time: the day
 * somebody adds Kandeh Town to the tree on the Places tab, every provider who wrote Kandeh Town
 * stops being unplaceable. Nothing tells anybody that happened, and a map that silently improves
 * only when a developer remembers to run something is a map that does not improve.
 *
 * THE NUMBER THAT MATTERS IS "not placed". It reads like a maintenance chore and it is not: it is
 * a measurement of how good the sign-up form is, and it names the work — those are the towns to
 * add to the tree next. A map with four hundred unplaced providers is not a broken map, it is a
 * form asking a question people are answering in a way we do not yet understand.
 *
 * The preview and the run are the same walk over the same rows by the same rules on the server,
 * so the figure somebody decides from cannot disagree with what happens when they press it.
 */
function MapCoverage({ onToast }: { onToast: (message: string) => void }) {
  const { t } = useTheme();
  const [report, setReport] = useState<AtlasStampReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const read = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await adminApi.atlasCoverage());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The coverage could not be read.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void read(); }, [read]);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const done = await adminApi.atlasRestamp();
      setReport(done);
      onToast(done.changed === 0
        ? 'Nothing to change — the map was already up to date.'
        : `Restamped ${done.changed.toLocaleString()} ${done.changed === 1 ? 'profile' : 'profiles'}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The restamp did not run.');
    } finally {
      setRunning(false);
    }
  };

  if (loading) return <Loading label="Counting who is on the map…" />;

  const placed = report ? report.exact + report.byDistrict : 0;
  const share = report && report.profiles > 0 ? Math.round((placed / report.profiles) * 1000) / 10 : 0;

  return (
    <div style={{ display: 'grid', gap: 13 }}>
      {error ? <ErrorNote message={error} /> : null}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Count label="Providers" value={report?.profiles ?? 0} tone="neutral" />
        <Count label="On their own pin" value={report?.exact ?? 0} tone="success" state="clear" />
        <Count label="On their district" value={report?.byDistrict ?? 0} tone="info" />
        <Count
          label="Not placed"
          value={report?.unplaced ?? 0}
          tone={report?.unplaced ? 'warning' : 'success'}
          state={report?.unplaced ? 'look' : 'clear'}
        />
      </div>

      <Card>
        <div style={{ fontSize: 13, fontWeight: 800, color: t.text, marginBottom: 5 }}>
          {share}% of providers can be drawn on the national map
        </div>
        <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.65 }}>
          A provider with their own coordinate is drawn where they are. One without is drawn on
          their district's main town, and the map shows that pin hollow so nobody is sent to the
          wrong street. A provider we cannot place at all named only a province, or a town that is
          not in the tree on the Places tab — <b style={{ color: t.text }}>those are the towns to add next</b>.
        </div>
      </Card>

      {report && report.unplaced > 0 ? (
        <Card>
          <div style={{ fontSize: 13, fontWeight: 800, color: t.text, marginBottom: 5 }}>
            {report.unplaced.toLocaleString()} {report.unplaced === 1 ? 'provider is' : 'providers are'} counted nationally and drawn nowhere
          </div>
          <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.65 }}>
            They are reported rather than dropped, and never placed at a guess: a map that quietly
            loses people reports a smaller country than the one it has, and one that invents a
            district for them reports a false one. Add the town they named on the Places tab, then
            run the restamp.
          </div>
        </Card>
      ) : null}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button tone="primary" onClick={() => void run()} disabled={running}>
          {running ? 'Restamping…' : report?.changed ? `Restamp ${report.changed.toLocaleString()} profiles` : 'Restamp the map'}
        </Button>
        <Button tone="ghost" size="sm" onClick={() => void read()} disabled={running}>Check again</Button>
        <span style={{ fontSize: 12, color: t.textMuted }}>
          {report?.changed
            ? `${report.changed.toLocaleString()} ${report.changed === 1 ? 'row' : 'rows'} would change.`
            : 'Nothing would change — the map is up to date.'}
          {' '}Never touches the coordinates a provider gave.
        </span>
      </div>

      {report ? (
        <div style={{ fontSize: 11.5, color: t.textMuted }}>Counted {fmtDateTime(report.ranAt)}.</div>
      ) : null}
    </div>
  );
}
