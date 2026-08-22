/**
 * Announcements: what was sent, to whom, by whom, and how many it reached.
 *
 * Broadcasting used to go straight to Firebase and write nothing at all, so "what did we
 * send on Tuesday and who decided that" had no answer anywhere. It also emailed everybody
 * every time without saying so. Both are corrected here: every send is a row, and email is
 * a tick rather than a side effect.
 *
 * The number that governs the screen is the preview. Sending is the only action in this
 * console with no undo, so how many people you are about to interrupt is shown before the
 * button is offered — it is the sentence that makes somebody re-read their own wording.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../theme/ThemeProvider';
import {
  Button, Card, Cell, EmptyState, ErrorNote, Field, Input, Loading, Modal, PageHeader,
  Pill, Row, Table, Textarea, Toasts, fmtDateTime, timeAgo, useToasts,
} from '../components/ui';
import { Pager, Tallies, useOpsQuery } from '../components/Ops';
import {
  adminApi, type AdminIdentity, type BroadcastPage,
  type BroadcastSchedule, type ScheduledBroadcast,
} from '../api/admin';

export function Broadcasts({ identity }: { identity: AdminIdentity }) {
  const { t } = useTheme();
  const { toasts, push } = useToasts();
  const navigate = useNavigate();
  const location = useLocation();
  const [page, setPage] = useState<BroadcastPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<BroadcastSchedule | null>(null);
  const [cancelling, setCancelling] = useState<ScheduledBroadcast | null>(null);
  const { query, set } = useOpsQuery();

  const load = useCallback(() => {
    adminApi.broadcasts(query)
      .then(result => { setPage(result); setError(null); })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load announcements.'));

    // Fetched alongside and allowed to fail alone: losing the waiting list must not take the
    // record of what has already gone out with it.
    adminApi.scheduled().then(setSchedule).catch(() => setSchedule(null));
  }, [query]);

  // Sending is a page now, so its result arrives back here in router state rather than through
  // a callback. Replaced immediately: a refresh must not re-announce a send from ten minutes ago.
  useEffect(() => {
    const sent = (location.state as { sent?: string } | null)?.sent;
    if (!sent) return;
    push(sent);
    load();
    navigate('/broadcasts', { replace: true, state: null });
  }, [location.state, navigate, push, load]);

  useEffect(() => {
    const timer = setTimeout(load, 240);
    return () => clearTimeout(timer);
  }, [load]);

  if (error) return <ErrorNote message={error} />;
  if (!page) return <Loading />;

  return (
    <>
      <PageHeader
        title="Announcements"
        subtitle="What has gone out to everybody's phone — and who decided it should."
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <Link to="/audiences" style={{ textDecoration: 'none' }}>
              <Button tone="subtle">Audiences</Button>
            </Link>
            {/* A page now, not a modal. Writing an announcement is work, and work does not
                belong in a 560px box whose preview is below its own fold. */}
            <Link
              to="/broadcasts/new"
              style={{ textDecoration: 'none', pointerEvents: identity.canManageUsers ? 'auto' : 'none' }}
            >
              <Button tone="primary" disabled={!identity.canManageUsers}>＋ Write one</Button>
            </Link>
          </div>
        }
      />

      <Tallies
        items={[
          { label: 'Sent in 30 days', value: page.sent30d },
          { label: 'People reached', value: page.peopleReached30d, tone: 'info' },
        ]}
        active=""
        onPick={() => undefined}
      />

      {/* What has not happened yet, above what has. A message going out at six tomorrow is the
          thing somebody needs to see before they write another one. */}
      {schedule && schedule.waiting.length > 0 ? (
        <Card style={{ marginTop: 14, borderColor: t.warning, background: t.warningSoft }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14.5, fontWeight: 800, color: t.text }}>Waiting to go out</span>
            <Pill tone="warning">{schedule.waiting.length}</Pill>
          </div>
          <div style={{ fontSize: 12, color: t.textMuted, marginTop: 5, lineHeight: 1.6 }}>
            {schedule.verdict}
          </div>
          <div style={{ marginTop: 12 }}>
            {schedule.waiting.map(item => (
              <div
                key={item.id}
                data-waiting={item.title}
                style={{
                  display: 'flex', gap: 12, alignItems: 'baseline', padding: '9px 0',
                  borderTop: `1px solid ${t.border}`, flexWrap: 'wrap',
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 700, color: t.text, flex: '1 1 200px' }}>
                  {item.title}
                </span>
                <span style={{ fontSize: 12, color: t.textMuted, flex: '1 1 220px' }}>
                  {item.segmentName ?? item.describes}
                </span>
                <span style={{ fontSize: 12, color: t.textSubtle, minWidth: 130, textAlign: 'right' }}>
                  {/* Both, because "in 3 hours" is what a person plans around and the clock time
                      is what they check against. */}
                  {item.minutesAway <= 0 ? 'due now' : `in ${humanWait(item.minutesAway)}`} · {fmtDateTime(item.scheduledFor)}
                </span>
                <span style={{ fontSize: 12, color: t.textSubtle, minWidth: 96, textAlign: 'right' }}>
                  ~{item.reachableNow.toLocaleString()} people
                </span>
                <Button size="sm" tone="subtle" onClick={() => setCancelling(item)}>Call it off</Button>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <div style={{ maxWidth: 380, margin: '14px 0 12px' }}>
        <Input
          value={query.search ?? ''}
          onChange={value => set({ search: value, pageIndex: 1 })}
          placeholder="Heading, wording, or who sent it…"
        />
      </div>

      <Card pad={0}>
        {page.items.length === 0 ? (
          <div style={{ padding: 34 }}>
            <EmptyState
              icon="📣"
              title="Nothing has been announced"
              message="When one goes out, it is recorded here — permanently."
            />
          </div>
        ) : (
          <Table head={['What was said', 'To whom', 'How', 'Reached', 'Opened', 'Sent']}>
            {page.items.map(row => (
              <Row key={row.id}>
                <Cell>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: t.text }}>{row.title}</div>
                  <div style={{ fontSize: 12, color: t.textSubtle, marginTop: 3, maxWidth: 420, lineHeight: 1.5 }}>
                    {row.body.length > 140 ? `${row.body.slice(0, 137)}…` : row.body}
                  </div>
                  {row.failureReason ? (
                    <div style={{ fontSize: 11.5, color: t.warning, marginTop: 4 }}>
                      Some did not go out — {row.failureReason}
                    </div>
                  ) : null}
                </Cell>
                <Cell>
                  <Pill tone="info">{row.segmentName ?? row.audienceLabel}</Pill>
                  {row.segmentName ? (
                    <div style={{ fontSize: 11, color: t.textSubtle, marginTop: 3 }}>saved group</div>
                  ) : null}
                </Cell>
                <Cell>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {row.sendPush ? <Pill tone="neutral">Push</Pill> : null}
                    {row.sendEmail ? <Pill tone="warning">Email</Pill> : null}
                  </div>
                </Cell>
                <Cell>
                  <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>
                    {row.deliveredCount.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 2 }}>
                    of {row.recipientCount.toLocaleString()} addressed
                    {row.emailedCount > 0 ? ` · ${row.emailedCount.toLocaleString()} emailed` : ''}
                  </div>
                </Cell>
                <Cell>
                  {row.sentAt === null ? (
                    <span style={{ fontSize: 12, color: t.textSubtle }}>—</span>
                  ) : (
                    <div data-opened={row.openedCount}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>
                        {row.openedCount.toLocaleString()}
                      </div>
                      <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 2 }}>
                        {/* Against what was DELIVERED, and it says so. Against the audience it
                            would divide by people who never got it. */}
                        {row.openRatePercent === null
                          ? 'nothing was delivered'
                          : `${row.openRatePercent}% of those who got it`}
                      </div>
                    </div>
                  )}
                </Cell>
                <Cell>
                  <div style={{ fontSize: 12.5, color: t.text }}>
                    {row.cancelledAt
                      ? 'Called off'
                      : row.sentAt
                        ? timeAgo(row.sentAt)
                        : row.scheduledFor
                          ? `due ${fmtDateTime(row.scheduledFor)}`
                          : 'Not sent'}
                  </div>
                  {row.cancelledReason ? (
                    <div style={{ fontSize: 11, color: t.textSubtle, marginTop: 2, maxWidth: 200 }}>
                      {row.cancelledReason}
                    </div>
                  ) : null}
                  <Link
                    to={`/users/${row.actorUserId}`}
                    style={{ fontSize: 11.5, color: t.textSubtle, textDecoration: 'none' }}
                  >
                    by {row.actorName}
                  </Link>
                </Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      <Pager
        page={page}
        noun="announcements"
        onPick={pageIndex => set({ pageIndex })}
        onSize={pageSize => set({ pageSize, pageIndex: 1 })}
      />

      {cancelling ? (
        <CallOff
          item={cancelling}
          onClose={() => setCancelling(null)}
          onDone={message => { push(message); setCancelling(null); load(); }}
        />
      ) : null}

      <Toasts toasts={toasts} />
    </>
  );
}

/**
 * "in 3 hours", not "in 187 minutes".
 *
 * Rounded deliberately: nobody schedules to the minute in their head, and a precise number
 * invites reading it as a promise the sweep cannot make — it runs once a minute.
 */
function humanWait(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 60 * 24) {
    const hours = Math.round(minutes / 60);
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }
  const days = Math.round(minutes / (60 * 24));
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

/**
 * Calling one off before it goes.
 *
 * Only before. The dialog says so plainly, because the instinct after a mistake is to look for
 * an undo, and there isn't one — a notification already on a thousand phones cannot be recalled
 * by anything, and a button that implied otherwise would be the most dangerous thing on this
 * screen.
 */
function CallOff({ item, onClose, onDone }: {
  item: ScheduledBroadcast; onClose: () => void; onDone: (message: string) => void;
}) {
  const { t } = useTheme();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = reason.trim().length >= 3;

  const save = () => {
    if (!ready || busy) return;
    setBusy(true); setError(null);
    adminApi.cancelScheduled(item.id, reason.trim())
      .then(() => onDone(`“${item.title}” will not go out.`))
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'That did not work.'))
      .finally(() => setBusy(false));
  };

  return (
    <Modal title="Call this off?" onClose={onClose} width={460}>
      <p style={{ color: t.textMuted, fontSize: 13, lineHeight: 1.65, marginTop: 0 }}>
        <strong style={{ color: t.text }}>{item.title}</strong> is due{' '}
        {item.minutesAway <= 0 ? 'now' : `in ${humanWait(item.minutesAway)}`}, to about{' '}
        {item.reachableNow.toLocaleString()} people. Calling it off stops it going. It stays on
        the record with your reason against it rather than disappearing.
      </p>
      <Field label="Why?" hint="Somebody will read this later wondering what happened to it.">
        <Textarea value={reason} onChange={setReason} rows={3} placeholder="The date moved." />
      </Field>
      {error ? <ErrorNote message={error} /> : null}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
        <Button tone="subtle" onClick={onClose}>Leave it</Button>
        <Button onClick={save} disabled={!ready || busy}>{busy ? 'Calling off…' : 'Call it off'}</Button>
      </div>
    </Modal>
  );
}


/* ---------------- writing one ---------------- */
