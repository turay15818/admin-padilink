/**
 * Classes and the certificates they produce.
 *
 * The number worth building the screen around is "missing" — students who finished a class
 * that offers a certificate and never got one. Certificate issue catches its own failures
 * one student at a time and writes them to a log nobody reads, so until now the only person
 * who knew was the student, and they had nobody to tell.
 *
 * Withdrawing a certificate is the other half. It is not a delete: the public page keeps
 * answering and starts saying it was withdrawn and why, because "no such certificate" reads
 * to the employer holding it as a mistyped number rather than as an answer.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../theme/ThemeProvider';
import {
  Button, Card, Cell, EmptyState, ErrorNote, Field, Input, Loading, Modal, PageHeader,
  Pill, Row, Table, Textarea, Toasts, fmtDate, timeAgo, useToasts,
} from '../components/ui';
import { Pager, Tallies, useOpsQuery } from '../components/Ops';
import { adminApi, type AdminIdentity, type CertificatePage, type CertificateRow, type ClassPage, type ClassRow } from '../api/admin';

export function Learn({ identity }: { identity: AdminIdentity }) {
  const [tab, setTab] = useState<'classes' | 'certificates'>('classes');
  const { t } = useTheme();

  return (
    <>
      <PageHeader
        title="Learn"
        subtitle="Classes people are running, and the certificates that come out of them."
      />

      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {(['classes', 'certificates'] as const).map(option => (
          <button
            key={option}
            type="button"
            onClick={() => setTab(option)}
            style={{
              background: tab === option ? t.brand : 'transparent',
              border: `1px solid ${tab === option ? t.brand : t.border}`,
              color: tab === option ? '#FFFFFF' : t.textMuted,
              borderRadius: 10, padding: '8px 15px', fontSize: 13, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {option === 'classes' ? 'Classes' : 'Certificates'}
          </button>
        ))}
      </div>

      {tab === 'classes' ? <Classes identity={identity} /> : <Certificates identity={identity} />}
    </>
  );
}

/* ---------------- classes ---------------- */

function Classes({ identity }: { identity: AdminIdentity }) {
  const { t } = useTheme();
  const { toasts, push } = useToasts();
  const [page, setPage] = useState<ClassPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<ClassRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { query, set } = useOpsQuery();

  const load = useCallback(() => {
    adminApi.classes(query)
      .then(result => { setPage(result); setError(null); })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load classes.'));
  }, [query]);

  useEffect(() => {
    const timer = setTimeout(load, 240);
    return () => clearTimeout(timer);
  }, [load]);

  if (error) return <ErrorNote message={error} />;
  if (!page) return <Loading />;

  const reissue = (row: ClassRow) => {
    setBusy(row.id);
    adminApi.reissueCertificates(row.id)
      .then(result => { push(result.message); load(); })
      .catch((caught: unknown) => push(caught instanceof Error ? caught.message : 'That did not work.', 'error'))
      .finally(() => setBusy(null));
  };

  return (
    <>
      <Tallies
        items={[
          { label: 'Draft', value: page.draftCount, bucket: 'draft' },
          { label: 'Taking applications', value: page.openCount, bucket: 'open', tone: 'success' },
          { label: 'Running', value: page.runningCount, bucket: 'running', tone: 'info' },
          { label: 'Finished', value: page.completedCount, bucket: 'completed' },
          { label: 'Cancelled', value: page.cancelledCount, bucket: 'cancelled' },
        ]}
        active={query.bucket ?? ''}
        onPick={bucket => set({ bucket, pageIndex: 1 })}
      />

      {page.missingCertificates > 0 ? (
        <div style={{
          background: t.warningSoft, border: `1px solid ${t.warning}`, borderRadius: 11,
          padding: '12px 14px', margin: '14px 0 0', fontSize: 13, color: t.textMuted, lineHeight: 1.65,
        }}>
          <strong style={{ color: t.text }}>
            {page.missingCertificates} {page.missingCertificates === 1 ? 'person has' : 'people have'} finished a
            class without getting a certificate.
          </strong>{' '}
          Issuing catches its own failures one student at a time and writes them to a log, so nobody
          finds out. Open the finished classes below and press Issue missing — it skips anyone who
          already has one.
        </div>
      ) : null}

      <div style={{ maxWidth: 380, margin: '14px 0 12px' }}>
        <Input
          value={query.search ?? ''}
          onChange={value => set({ search: value, pageIndex: 1 })}
          placeholder="Class, subject, or who is teaching it…"
        />
      </div>

      <Card pad={0}>
        {page.items.length === 0 ? (
          <div style={{ padding: 34 }}>
            <EmptyState icon="🎓" title="Nothing matches that" message="Try another bucket, or a shorter search." />
          </div>
        ) : (
          <Table head={['Class', 'Who is teaching', 'State', 'People', 'Certificates', '']}>
            {page.items.map(row => (
              <Row key={row.id}>
                <Cell>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: t.text }}>{row.title}</div>
                  <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 3 }}>
                    {[row.skillName, row.levelLabel, row.modeLabel, row.city,
                      row.feeAmount === null ? 'Free' : `${row.currency} ${row.feeAmount.toLocaleString()}`]
                      .filter(Boolean).join(' · ')}
                  </div>
                  <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 2 }}>
                    {row.startDate ? `Starts ${fmtDate(row.startDate)}` : `Created ${timeAgo(row.dateCreated)}`}
                    {row.lessonCount > 0 ? ` · ${row.lessonCount} lessons` : ' · no lessons yet'}
                  </div>
                </Cell>
                <Cell>
                  <Link to={`/users/${row.instructorUserId}`} style={{ fontSize: 13, color: t.text, fontWeight: 700, textDecoration: 'none' }}>
                    {row.instructorName}
                  </Link>
                  <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 2 }}>{row.instructorEmail ?? '—'}</div>
                </Cell>
                <Cell>
                  <Pill tone={classTone(row.status)}>{row.statusName}</Pill>
                </Cell>
                <Cell>
                  <div style={{ fontSize: 12.5, color: t.text }}>
                    {row.enrolledCount} of {row.capacity} enrolled
                  </div>
                  {row.pendingCount > 0 ? (
                    <div style={{ fontSize: 11.5, color: t.warning, marginTop: 2 }}>
                      {row.pendingCount} waiting on a decision
                    </div>
                  ) : null}
                </Cell>
                <Cell>
                  {!row.certificateOffered ? (
                    <span style={{ fontSize: 12.5, color: t.textSubtle }}>Not offered</span>
                  ) : (
                    <>
                      <div style={{ fontSize: 12.5, color: t.text }}>{row.certificatesIssued} issued</div>
                      {row.certificatesMissing > 0 ? (
                        <div style={{ fontSize: 11.5, color: t.warning, fontWeight: 700, marginTop: 2 }}>
                          {row.certificatesMissing} missing
                        </div>
                      ) : null}
                    </>
                  )}
                </Cell>
                <Cell style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {row.certificatesMissing > 0 ? (
                    <>
                      <Button
                        size="sm"
                        tone="primary"
                        disabled={!identity.canManageContent || busy === row.id}
                        onClick={() => reissue(row)}
                      >
                        {busy === row.id ? 'Issuing…' : 'Issue missing'}
                      </Button>
                      {' '}
                    </>
                  ) : null}
                  <Button
                    size="sm"
                    tone="danger"
                    disabled={!identity.canManageContent || row.status === 4 || row.status === 5}
                    title={row.status === 4 || row.status === 5 ? `Already ${row.statusName.toLowerCase()}` : undefined}
                    onClick={() => setCancelling(row)}
                  >
                    Cancel
                  </Button>
                </Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      <Pager
        page={page}
        noun="classes"
        onPick={pageIndex => set({ pageIndex })}
        onSize={pageSize => set({ pageSize, pageIndex: 1 })}
      />

      {cancelling ? (
        <CancelClassDialog
          row={cancelling}
          onClose={() => setCancelling(null)}
          onDone={message => { push(message); load(); }}
        />
      ) : null}

      <Toasts toasts={toasts} />
    </>
  );
}

function CancelClassDialog({ row, onClose, onDone }: {
  row: ClassRow;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { t } = useTheme();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const affected = row.enrolledCount + row.pendingCount;

  const submit = () => {
    if (reason.trim().length < 6 || busy) return;
    setBusy(true);
    setError(null);
    adminApi.cancelClass(row.id, reason.trim())
      .then(result => { onDone(`“${result.title}” is cancelled.`); onClose(); })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'That did not work.'))
      .finally(() => setBusy(false));
  };

  return (
    <Modal title={`Cancel “${row.title}”`} onClose={onClose} width={520}>
      <p style={{ color: t.textMuted, fontSize: 13, lineHeight: 1.65, marginTop: 0 }}>
        The instructor can cancel their own class. This is for the one they will not. Everyone
        enrolled and everyone still waiting on a decision is told, in your words — a class that
        silently stops existing is how somebody turns up to an empty room.
      </p>

      {affected > 0 ? (
        <div style={{
          background: t.warningSoft, border: `1px solid ${t.warning}`, borderRadius: 10,
          padding: '10px 12px', marginBottom: 14, fontSize: 12.5, color: t.textMuted, lineHeight: 1.6,
        }}>
          <strong style={{ color: t.text }}>{affected} {affected === 1 ? 'person' : 'people'}</strong> will
          get this message — {row.enrolledCount} enrolled and {row.pendingCount} waiting — plus {row.instructorName}.
        </div>
      ) : null}

      <Field label="Why" hint="Required. Sent to everyone in the class, word for word.">
        <Textarea
          value={reason}
          onChange={setReason}
          placeholder="e.g. The instructor has left and nobody has taken it over."
          rows={3}
        />
      </Field>

      {error ? <div style={{ marginBottom: 12 }}><ErrorNote message={error} /></div> : null}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button tone="subtle" onClick={onClose}>Keep it</Button>
        <Button tone="danger" disabled={busy || reason.trim().length < 6} onClick={submit}>
          {busy ? 'Cancelling…' : 'Cancel the class'}
        </Button>
      </div>
    </Modal>
  );
}

/* ---------------- certificates ---------------- */

function Certificates({ identity }: { identity: AdminIdentity }) {
  const { t } = useTheme();
  const { toasts, push } = useToasts();
  const [page, setPage] = useState<CertificatePage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<CertificateRow | null>(null);
  const [viewing, setViewing] = useState<CertificateRow | null>(null);
  const { query, set } = useOpsQuery();

  const load = useCallback(() => {
    adminApi.certificates(query)
      .then(result => { setPage(result); setError(null); })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load certificates.'));
  }, [query]);

  useEffect(() => {
    const timer = setTimeout(load, 240);
    return () => clearTimeout(timer);
  }, [load]);

  if (error) return <ErrorNote message={error} />;
  if (!page) return <Loading />;

  return (
    <>
      <Tallies
        items={[
          { label: 'Valid', value: page.validCount, bucket: 'valid', tone: 'success' },
          { label: 'Withdrawn', value: page.revokedCount, bucket: 'revoked', tone: 'danger' },
        ]}
        active={query.bucket ?? ''}
        onPick={bucket => set({ bucket, pageIndex: 1 })}
      />

      <div style={{ maxWidth: 380, margin: '14px 0 12px' }}>
        <Input
          value={query.search ?? ''}
          onChange={value => set({ search: value, pageIndex: 1 })}
          placeholder="Certificate number, student, or class…"
        />
      </div>

      <Card pad={0}>
        {page.items.length === 0 ? (
          <div style={{ padding: 34 }}>
            <EmptyState icon="📜" title="Nothing matches that" message="Certificate numbers look like LC-XXXXXXXX." />
          </div>
        ) : (
          <Table head={['Number', 'Who earned it', 'For', 'How they did', 'State', '']}>
            {page.items.map(row => (
              <Row key={row.id}>
                <Cell mono>
                  <span style={{ fontWeight: 700, color: t.text }}>{row.certificateNumber}</span>
                  <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 2 }}>{fmtDate(row.issuedOn)}</div>
                </Cell>
                <Cell>
                  <Link to={`/users/${row.studentUserId}`} style={{ fontSize: 13, color: t.text, fontWeight: 700, textDecoration: 'none' }}>
                    {row.studentName}
                  </Link>
                  <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 2 }}>{row.studentEmail ?? '—'}</div>
                </Cell>
                <Cell>
                  <div style={{ fontSize: 13, color: t.text }}>{row.classTitle}</div>
                  <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 2 }}>
                    taught by {row.instructorName}
                  </div>
                </Cell>
                <Cell>
                  <div style={{ fontSize: 12.5, color: t.text }}>
                    {row.lessonsCompleted} of {row.lessonCount} lessons
                  </div>
                  <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 2 }}>
                    {row.quizAveragePercent === null ? 'No quizzes' : `${row.quizAveragePercent}% average`}
                  </div>
                </Cell>
                <Cell>
                  <Pill tone={row.revoked ? 'danger' : 'success'}>{row.revoked ? 'Withdrawn' : 'Valid'}</Pill>
                  {row.revoked && row.revokedByName ? (
                    <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 3 }}>
                      by {row.revokedByName}
                    </div>
                  ) : null}
                </Cell>
                <Cell style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'inline-flex', gap: 6 }}>
                    {/* First, because looking is what you do before deciding. Withdrawing a
                        certificate you have not read is how the wrong one gets withdrawn. */}
                    <Button
                      size="sm"
                      tone="subtle"
                      title={`Open ${row.certificateNumber}`}
                      disabled={!identity.canManageContent}
                      onClick={() => setViewing(row)}
                    >
                      View
                    </Button>
                    <Button
                      size="sm"
                      tone={row.revoked ? 'subtle' : 'danger'}
                      disabled={!identity.canManageContent}
                      onClick={() => setActing(row)}
                    >
                      {row.revoked ? 'Restore' : 'Withdraw'}
                    </Button>
                  </div>
                </Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      <Pager
        page={page}
        noun="certificates"
        onPick={pageIndex => set({ pageIndex })}
        onSize={pageSize => set({ pageSize, pageIndex: 1 })}
      />

      {viewing ? (
        <CertificateViewer
          row={viewing}
          onClose={() => setViewing(null)}
          onWithdraw={() => { setActing(viewing); setViewing(null); }}
          canAct={identity.canManageContent}
        />
      ) : null}

      {acting ? (
        <RevokeDialog
          row={acting}
          onClose={() => setActing(null)}
          onDone={message => { push(message); load(); }}
        />
      ) : null}

      <Toasts toasts={toasts} />
    </>
  );
}

/**
 * The certificate itself, on screen.
 *
 * Until now the console could withdraw a certificate it had never seen — the only way to
 * look at one was to guess the public URL and hope it had not already been withdrawn, since
 * the public download refuses those. That is precisely backwards: the withdrawn ones are the
 * ones somebody has a reason to examine.
 *
 * Rendered in an object tag from a blob, not a plain link, because the endpoint wants the
 * bearer token and an iframe src cannot carry one. The blob URL is revoked on close, so a
 * console left open all afternoon does not accumulate documents in memory. Every open is on
 * the audit trail as Notable — "who looked at this student's certificate" has an answer.
 */
function CertificateViewer({ row, onClose, onWithdraw, canAct }: {
  row: CertificateRow;
  onClose: () => void;
  onWithdraw: () => void;
  canAct: boolean;
}) {
  const { t } = useTheme();
  const [source, setSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let revoke: (() => void) | null = null;
    let cancelled = false;

    adminApi.certificateFileUrl(row.id)
      .then(result => {
        if (cancelled) { result.revoke(); return; }
        revoke = result.revoke;
        setSource(result.url);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'The certificate would not open.');
      });

    return () => { cancelled = true; revoke?.(); };
  }, [row.id]);

  return (
    <Modal title={row.certificateNumber} onClose={onClose} width={780}>
      <div style={{
        display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center',
        fontSize: 12.5, color: t.textMuted, marginBottom: 12, lineHeight: 1.6,
      }}>
        <Pill tone={row.revoked ? 'danger' : 'success'}>{row.revoked ? 'Withdrawn' : 'Valid'}</Pill>
        <span>
          <strong style={{ color: t.text }}>{row.studentName}</strong> — {row.classTitle}, issued {fmtDate(row.issuedOn)}
        </span>
      </div>

      {row.revoked ? (
        <div style={{
          background: t.warningSoft, border: `1px solid ${t.warning}`, borderRadius: 10,
          padding: '11px 13px', marginBottom: 12, fontSize: 12.5, color: t.textMuted, lineHeight: 1.6,
        }}>
          This one was withdrawn{row.revokedByName ? ` by ${row.revokedByName}` : ''} and no longer
          downloads publicly. You are seeing it because deciding whether that was right means
          reading what was issued.
          {row.revokedReason ? <> The reason given: {row.revokedReason}</> : null}
        </div>
      ) : null}

      <div style={{
        border: `1px solid ${t.border}`, borderRadius: 11, overflow: 'hidden',
        background: t.surfaceMuted, minHeight: 420,
      }}>
        {error ? (
          <div style={{ padding: 30 }}><ErrorNote message={error} /></div>
        ) : source === null ? (
          <div style={{ padding: 30 }}><Loading /></div>
        ) : (
          <object
            data={source}
            type="application/pdf"
            aria-label={`Certificate ${row.certificateNumber}`}
            style={{ display: 'block', width: '100%', height: 460, border: 0 }}
          >
            {/* A browser with no PDF plugin gets a link rather than a blank rectangle. */}
            <div style={{ padding: 24, fontSize: 13, color: t.textMuted, lineHeight: 1.7 }}>
              Your browser will not display the PDF here.{' '}
              <a href={source} target="_blank" rel="noreferrer" style={{ color: t.brand }}>
                Open it in a new tab
              </a>.
            </div>
          </object>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14, alignItems: 'center' }}>
        <a
          href={`/lc/${row.certificateNumber}`}
          target="_blank"
          rel="noreferrer"
          style={{ marginRight: 'auto', fontSize: 12.5, color: t.textSubtle }}
        >
          What a stranger sees when they check it ↗
        </a>
        {!row.revoked && canAct ? (
          <Button size="sm" tone="danger" onClick={onWithdraw}>Withdraw it</Button>
        ) : null}
        <Button size="sm" tone="subtle" onClick={onClose}>Close</Button>
      </div>
    </Modal>
  );
}

function RevokeDialog({ row, onClose, onDone }: {
  row: CertificateRow;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { t } = useTheme();
  const [reason, setReason] = useState('');
  const [silent, setSilent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const restoring = row.revoked;
  const ready = restoring || reason.trim().length >= 6;

  const submit = () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    adminApi.revokeCertificate(row.id, {
      revoked: !restoring,
      reason: restoring ? null : reason.trim(),
      silent,
    })
      .then(result => {
        onDone(restoring
          ? `${result.certificateNumber} is valid again.`
          : `${result.certificateNumber} is withdrawn.`);
        onClose();
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'That did not work.'))
      .finally(() => setBusy(false));
  };

  return (
    <Modal
      title={restoring ? `Restore ${row.certificateNumber}` : `Withdraw ${row.certificateNumber}`}
      onClose={onClose}
      width={520}
    >
      <div style={{
        background: t.surfaceMuted, borderRadius: 10, padding: '11px 13px', marginBottom: 14,
        fontSize: 12.5, color: t.textMuted, lineHeight: 1.6,
      }}>
        <strong style={{ color: t.text }}>{row.studentName}</strong> — {row.classTitle}, taught by {row.instructorName}.
        Issued {fmtDate(row.issuedOn)}.
      </div>

      {restoring ? (
        <>
          <p style={{ color: t.textMuted, fontSize: 13, lineHeight: 1.65, marginTop: 0 }}>
            It verifies again straight away, the download comes back, and {row.studentName.split(' ')[0]} is told.
          </p>
          {row.revokedReason ? (
            <div style={{
              background: t.warningSoft, borderRadius: 10, padding: '11px 13px', margin: '0 0 14px',
              fontSize: 12.5, color: t.textMuted, lineHeight: 1.6,
            }}>
              <strong style={{ color: t.text }}>It was withdrawn because:</strong> {row.revokedReason}
            </div>
          ) : null}
        </>
      ) : (
        <>
          <p style={{ color: t.textMuted, fontSize: 13, lineHeight: 1.65, marginTop: 0 }}>
            The certificate stops being valid and the PDF stops downloading — but the public page
            keeps answering, and starts saying it was withdrawn and why. That matters: a page that
            reports no such certificate reads to an employer as a mistyped number, not as an answer.
          </p>

          <Field label="Why" hint="Required. Anyone who checks this certificate reads it, including strangers.">
            <Textarea
              value={reason}
              onChange={setReason}
              placeholder="e.g. The assessment was found to have been sat by somebody else."
              rows={3}
            />
          </Field>

          <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', cursor: 'pointer', marginBottom: 14 }}>
            <input
              type="checkbox"
              checked={silent}
              onChange={event => setSilent(event.target.checked)}
              style={{ marginTop: 2, accentColor: t.brand, width: 15, height: 15 }}
            />
            <span>
              <span style={{ fontSize: 13, fontWeight: 700, color: t.text, display: 'block' }}>Do not tell them</span>
              <span style={{ fontSize: 11.5, color: t.textSubtle, lineHeight: 1.5 }}>
                Off by default. Finding out from a rejected job application is worse than
                hearing it from us.
              </span>
            </span>
          </label>
        </>
      )}

      {error ? <div style={{ marginBottom: 12 }}><ErrorNote message={error} /></div> : null}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button tone="subtle" onClick={onClose}>Cancel</Button>
        <Button tone={restoring ? 'primary' : 'danger'} disabled={!ready || busy} onClick={submit}>
          {busy ? 'Working…' : restoring ? 'Restore it' : 'Withdraw it'}
        </Button>
      </div>
    </Modal>
  );
}

/* ---------------- pieces ---------------- */

function classTone(status: number): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
  if (status === 2) return 'success';
  if (status === 3) return 'info';
  if (status === 5) return 'danger';
  if (status === 1) return 'warning';
  return 'neutral';
}
