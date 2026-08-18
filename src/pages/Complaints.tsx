/**
 * The complaints queue: reports about content and people, disputes about bookings.
 *
 * One screen for both, because they are one job — somebody says something is wrong, and
 * somebody decides. Two screens that look alike but use different words is how a team ends
 * up with two habits and one of them going unworked.
 *
 * The step that matters most here is the smallest: picking a case up. Without it two
 * administrators open the same complaint on a busy morning and both write an outcome, and
 * the second one wins silently.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../theme/ThemeProvider';
import {
  Button, Card, Cell, EmptyState, ErrorNote, Field, Loading, Modal, PageHeader,
  Pill, Row, Table, Textarea, Toasts, fmtDateTime, timeAgo, useToasts,
} from '../components/ui';
import { Input } from '../components/ui';
import { Pager, Tallies, useOpsQuery } from '../components/Ops';
import {
  adminApi, type AdminIdentity, type CasePage, type CaseRow, type CaseTriage,
} from '../api/admin';

export function Complaints({ identity }: { identity: AdminIdentity }) {
  const { t } = useTheme();
  const { toasts, push } = useToasts();
  const [kind, setKind] = useState<'dispute' | 'report'>('dispute');
  const [page, setPage] = useState<CasePage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<CaseRow | null>(null);
  const { query, set } = useOpsQuery({ bucket: 'open' });

  const load = useCallback(() => {
    adminApi.cases(kind, query)
      .then(result => { setPage(result); setError(null); })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load the queue.'));
  }, [kind, query]);

  useEffect(() => {
    const timer = setTimeout(load, 240);
    return () => clearTimeout(timer);
  }, [load]);

  if (error) return <ErrorNote message={error} />;

  return (
    <>
      <PageHeader
        title="Complaints"
        subtitle="What people have reported, and what they are disputing. Pick one up before you decide it."
      />

      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {(['dispute', 'report'] as const).map(option => (
          <button
            key={option}
            type="button"
            onClick={() => { setKind(option); set({ pageIndex: 1 }); }}
            style={{
              background: kind === option ? t.brand : 'transparent',
              border: `1px solid ${kind === option ? t.brand : t.border}`,
              color: kind === option ? '#FFFFFF' : t.textMuted,
              borderRadius: 10, padding: '8px 15px', fontSize: 13, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {option === 'dispute' ? 'Disputes about bookings' : 'Reports about content'}
          </button>
        ))}
      </div>

      {!page ? <Loading /> : (
        <>
          <Tallies
            items={[
              { label: 'Open', value: page.openCount, bucket: 'open', tone: 'warning' },
              { label: 'Being looked at', value: page.underReviewCount, bucket: 'reviewing', tone: 'info' },
              { label: 'Resolved', value: page.resolvedCount, bucket: 'resolved', tone: 'success' },
              { label: 'Dismissed', value: page.dismissedCount, bucket: 'dismissed' },
            ]}
            active={query.bucket ?? ''}
            onPick={bucket => set({ bucket, pageIndex: 1 })}
          />

          <div style={{ maxWidth: 360, margin: '14px 0 12px' }}>
            <Input
              value={query.search ?? ''}
              onChange={value => set({ search: value, pageIndex: 1 })}
              placeholder={kind === 'dispute' ? 'Reference, or who raised it…' : 'What they wrote, or who wrote it…'}
            />
          </div>

          <Card pad={0}>
            {page.items.length === 0 ? (
              <div style={{ padding: 34 }}>
                <EmptyState
                  icon="✓"
                  title={query.bucket === 'open' ? 'Nothing waiting' : 'Nothing matches that'}
                  message={query.bucket === 'open'
                    ? 'The queue is empty. That is the goal.'
                    : 'Try another bucket, or a shorter search.'}
                />
              </div>
            ) : (
              <Table head={['What', 'About', 'Who raised it', 'State', '']}>
                {page.items.map(row => (
                  <Row key={row.id}>
                    <Cell>
                      <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{row.reasonName}</div>
                      {row.details ? (
                        <div style={{ fontSize: 12, color: t.textSubtle, marginTop: 3, maxWidth: 380, lineHeight: 1.5 }}>
                          “{row.details.length > 120 ? `${row.details.slice(0, 117)}…` : row.details}”
                        </div>
                      ) : null}
                    </Cell>
                    <Cell>
                      {row.targetRoute ? (
                        <Link to={row.targetRoute} style={{ fontSize: 13, color: t.brand, fontWeight: 700, textDecoration: 'none' }}>
                          {row.targetLabel}
                        </Link>
                      ) : (
                        <span style={{ fontSize: 13, color: t.text }}>{row.targetLabel}</span>
                      )}
                      <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 2 }}>{row.targetType}</div>
                    </Cell>
                    <Cell>
                      <div style={{ fontSize: 13, color: t.text }}>{row.raisedByName}</div>
                      <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 2 }}>{timeAgo(row.dateCreated)}</div>
                    </Cell>
                    <Cell>
                      <Pill tone={tone(row.status)}>{row.statusName}</Pill>
                      {row.handledByName ? (
                        <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 3 }}>
                          {row.status >= 3 ? 'by ' : 'with '}{row.handledByName}
                        </div>
                      ) : null}
                    </Cell>
                    <Cell style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <Button size="sm" tone="subtle" onClick={() => setOpen(row)}>
                        {row.status >= 3 ? 'Read' : 'Work it'}
                      </Button>
                    </Cell>
                  </Row>
                ))}
              </Table>
            )}
          </Card>

          <Pager
            page={page}
            noun={kind === 'dispute' ? 'disputes' : 'reports'}
            onPick={pageIndex => set({ pageIndex })}
            onSize={pageSize => set({ pageSize, pageIndex: 1 })}
          />
        </>
      )}

      {open ? (
        <CaseDialog
          row={open}
          kind={kind}
          canAct={identity.canManageBookings}
          myUserId={identity.userId}
          onClose={() => setOpen(null)}
          onDone={message => { push(message); load(); }}
        />
      ) : null}

      <Toasts toasts={toasts} />
    </>
  );
}

/* ---------------- working one case ---------------- */

function CaseDialog({ row, kind, canAct, myUserId, onClose, onDone }: {
  row: CaseRow;
  kind: 'dispute' | 'report';
  canAct: boolean;
  myUserId: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { t } = useTheme();
  const [current, setCurrent] = useState(row);
  const [resolution, setResolution] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [triage, setTriage] = useState<CaseTriage | null>(null);
  const [reading, setReading] = useState(false);

  const decided = current.status >= 3;
  const mine = current.handledByUserId === myUserId;
  const heldByOther = current.status === 2 && !mine;

  const act = (run: Promise<CaseRow>, message: string) => {
    setBusy(true);
    setError(null);
    run
      .then(result => {
        setCurrent(result);
        onDone(message);
        if (result.status >= 3) onClose();
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'That did not work.'))
      .finally(() => setBusy(false));
  };

  const askForRead = () => {
    if (reading) return;
    setReading(true);
    setTriage(null);
    adminApi.triage(kind, current.id)
      .then(setTriage)
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'That did not work.'))
      .finally(() => setReading(false));
  };

  const decide = (status: 3 | 4) => {
    if (resolution.trim().length < 6 || busy) return;
    act(adminApi.decideCase(kind, current.id, status, resolution.trim()),
      status === 3 ? 'Resolved.' : 'Dismissed.');
  };

  return (
    <Modal title={current.reasonName} onClose={onClose} width={560}>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 14 }}>
        <Pill tone={tone(current.status)}>{current.statusName}</Pill>
        <Pill tone="neutral">{current.targetType}</Pill>
        {current.handledByName ? <Pill tone="info">{current.handledByName}</Pill> : null}
      </div>

      <Row2 label="About">
        {current.targetRoute ? (
          <Link to={current.targetRoute} style={{ color: t.brand, fontWeight: 700, textDecoration: 'none' }}>
            {current.targetLabel} →
          </Link>
        ) : current.targetLabel}
      </Row2>
      <Row2 label="Raised by">
        <Link to={`/users/${current.raisedByUserId}`} style={{ color: t.brand, fontWeight: 700, textDecoration: 'none' }}>
          {current.raisedByName}
        </Link>
        {current.raisedByEmail ? (
          <span style={{ color: t.textSubtle }}> · {current.raisedByEmail}</span>
        ) : null}
      </Row2>
      <Row2 label="When">{fmtDateTime(current.dateCreated)}</Row2>

      {current.details ? (
        <div style={{
          background: t.surfaceMuted, borderRadius: 11, padding: '12px 14px', margin: '12px 0 4px',
          fontSize: 13, color: t.text, lineHeight: 1.65,
        }}>
          “{current.details}”
        </div>
      ) : null}

      {/* A read on the case, never a decision on it. The button says "ask", the output says
          "suggested", and the person still has to type a resolution below — because the point
          of a recommendation is that somebody can disagree with it. */}
      {!decided ? (
        <div style={{ marginTop: 14 }}>
          {triage === null ? (
            <Button size="sm" tone="subtle" disabled={reading} onClick={askForRead}>
              {reading ? 'Reading it…' : '✦ Ask for a read on this'}
            </Button>
          ) : (
            <div style={{
              border: `1px solid ${t.border}`, borderRadius: 11, padding: '13px 15px',
              background: t.surfaceMuted,
            }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, color: t.textSubtle, marginBottom: 8 }}>
                SUGGESTED — YOU DECIDE
              </div>

              {triage.unavailable ? (
                <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.6 }}>{triage.unavailable}</div>
              ) : (
                <>
                  <div style={{ fontSize: 13, color: t.text, lineHeight: 1.7 }}>{triage.summary}</div>

                  {triage.whatTheEvidenceShows.length > 0 ? (
                    <>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: t.textSubtle, margin: '11px 0 4px' }}>
                        What the evidence shows
                      </div>
                      <ul style={{ margin: 0, paddingLeft: 17 }}>
                        {triage.whatTheEvidenceShows.map(point => (
                          <li key={point} style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.6 }}>{point}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}

                  {triage.whatIsMissing.length > 0 ? (
                    <>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: t.warning, margin: '11px 0 4px' }}>
                        What nobody has provided
                      </div>
                      <ul style={{ margin: 0, paddingLeft: 17 }}>
                        {triage.whatIsMissing.map(point => (
                          <li key={point} style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.6 }}>{point}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}

                  <div style={{
                    marginTop: 12, paddingTop: 11, borderTop: `1px solid ${t.border}`,
                    fontSize: 13, color: t.text, lineHeight: 1.7,
                  }}>
                    <strong>Suggestion:</strong> {triage.recommendation}
                  </div>
                  <div style={{ fontSize: 12, color: t.textSubtle, marginTop: 5, lineHeight: 1.6 }}>
                    {triage.reasoning} <em>({triage.confidence})</em>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      ) : null}

      {decided ? (
        <div style={{
          border: `1px solid ${t.border}`, borderRadius: 11, padding: '12px 14px', marginTop: 12,
          fontSize: 13, color: t.textMuted, lineHeight: 1.65,
        }}>
          <strong style={{ color: t.text }}>
            {current.status === 3 ? 'Resolved' : 'Dismissed'}
            {current.handledByName ? ` by ${current.handledByName}` : ''}
            {current.handledAt ? ` · ${fmtDateTime(current.handledAt)}` : ''}
          </strong>
          <div style={{ marginTop: 5 }}>{current.resolution}</div>
        </div>
      ) : (
        <>
          {heldByOther ? (
            <div style={{
              background: t.warningSoft, border: `1px solid ${t.warning}`, borderRadius: 10,
              padding: '10px 12px', margin: '12px 0', fontSize: 12.5, color: t.textMuted, lineHeight: 1.6,
            }}>
              <strong style={{ color: t.text }}>{current.handledByName} has this one.</strong> You can still
              decide it, but check with them first — two outcomes on one complaint is how a
              person gets told two different things.
            </div>
          ) : null}

          <div style={{ margin: '14px 0 8px' }}>
            <Button
              size="sm"
              tone={mine ? 'subtle' : 'primary'}
              disabled={!canAct || busy}
              onClick={() => act(
                adminApi.claimCase(kind, current.id, mine ? 1 : 2),
                mine ? 'Back in the queue.' : 'Yours to work on.')}
            >
              {mine ? 'Put it back' : "I'll take this one"}
            </Button>
          </div>

          <Field
            label={current.status === 2 ? 'What you decided' : 'What you decided'}
            hint="Required either way. The person who raised it reads this, word for word."
          >
            <Textarea
              value={resolution}
              onChange={setResolution}
              placeholder={kind === 'dispute'
                ? 'e.g. Provider refunded in cash and both agreed to close it.'
                : 'e.g. Listing taken down; the seller has been warned.'}
              rows={3}
            />
          </Field>

          {error ? <div style={{ marginBottom: 12 }}><ErrorNote message={error} /></div> : null}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button tone="subtle" onClick={onClose}>Close</Button>
            <Button
              tone="subtle"
              disabled={!canAct || busy || resolution.trim().length < 6}
              onClick={() => decide(4)}
            >
              {busy ? '…' : 'Dismiss'}
            </Button>
            <Button
              tone="primary"
              disabled={!canAct || busy || resolution.trim().length < 6}
              onClick={() => decide(3)}
            >
              {busy ? 'Saving…' : 'Resolve'}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}

/* ---------------- pieces ---------------- */

function tone(status: number): 'neutral' | 'info' | 'success' | 'warning' {
  if (status === 1) return 'warning';
  if (status === 2) return 'info';
  if (status === 3) return 'success';
  return 'neutral';
}

function Row2({ label, children }: { label: string; children: React.ReactNode }) {
  const { t } = useTheme();
  return (
    <div style={{ display: 'flex', gap: 12, padding: '6px 0', fontSize: 13, color: t.text }}>
      <div style={{ width: 90, flexShrink: 0, color: t.textSubtle, fontWeight: 700, fontSize: 12.5 }}>{label}</div>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}
