/**
 * Every booking on the platform, and one booking in full.
 *
 * The screen an administrator opens when somebody rings up and says "my plumber never
 * came" — so it is built around finding one booking fast, seeing what actually happened to
 * it, and reaching both people. Everything else is decoration.
 *
 * The timeline is rebuilt from the booking's own timestamps rather than a status log,
 * because there isn't one. That is honest: it can never disagree with the booking, and a
 * step that never happened simply does not appear rather than being guessed at.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTheme } from '../theme/ThemeProvider';
import {
  Button, Card, Cell, EmptyState, ErrorNote, Field, Input, Loading, Modal, PageHeader,
  Pill, Row, Table, Toasts, fmtDate, fmtDateTime, timeAgo, useToasts,
} from '../components/ui';
import { Select } from '../components/Select';
import { Pager, Tallies, useOpsQuery } from '../components/Ops';
import { adminApi, type AdminIdentity, type BookingDetail, type BookingPage, type BookingRow } from '../api/admin';

const BUCKETS = [
  { value: '', label: 'Every booking' },
  { value: 'pending', label: 'Waiting for a provider' },
  { value: 'active', label: 'In flight' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled or turned down' },
  { value: 'disputed', label: 'With an open dispute' },
];

const SORTS = [
  { value: '', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'scheduled', label: 'By the date of the job' },
  { value: 'amount', label: 'Biggest first' },
];

export function Bookings() {
  const { t } = useTheme();
  const [page, setPage] = useState<BookingPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { query, set, reset } = useOpsQuery();

  const load = useCallback(() => {
    adminApi.bookings(query)
      .then(result => { setPage(result); setError(null); })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load bookings.'));
  }, [query]);

  useEffect(() => {
    const timer = setTimeout(load, 260);
    return () => clearTimeout(timer);
  }, [load]);

  if (error) return <ErrorNote message={error} />;
  if (!page) return <Loading />;

  return (
    <>
      <PageHeader
        title="Bookings"
        subtitle="Every job booked through Vacancy — whose it is, what was agreed, and what happened."
      />

      <Tallies
        items={[
          { label: 'Waiting for a provider', value: page.pendingCount, bucket: 'pending' },
          { label: 'In flight', value: page.activeCount, bucket: 'active', tone: 'info' },
          { label: 'Completed', value: page.completedCount, bucket: 'completed', tone: 'success' },
          { label: 'Cancelled', value: page.cancelledCount, bucket: 'cancelled' },
          { label: 'Disputed', value: page.disputedCount, bucket: 'disputed', tone: 'warning' },
        ]}
        active={query.bucket ?? ''}
        onPick={bucket => set({ bucket, pageIndex: 1 })}
      />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', margin: '14px 0 12px' }}>
        <div style={{ flex: '1 1 280px', maxWidth: 360 }}>
          <Input
            value={query.search ?? ''}
            onChange={value => set({ search: value, pageIndex: 1 })}
            placeholder="Reference, customer, provider or service…"
          />
        </div>
        <div style={{ width: 210 }}>
          <Select
            value={query.bucket ?? ''}
            onChange={value => set({ bucket: value, pageIndex: 1 })}
            options={BUCKETS}
            placeholder="Every booking"
          />
        </div>
        <div style={{ width: 190 }}>
          <Select
            value={query.sort ?? ''}
            onChange={value => set({ sort: value, pageIndex: 1 })}
            options={SORTS}
            placeholder="Newest first"
          />
        </div>
        {query.search || query.bucket || query.sort ? (
          <Button size="sm" tone="subtle" onClick={reset}>Clear</Button>
        ) : null}
      </div>

      <Card pad={0}>
        {page.items.length === 0 ? (
          <div style={{ padding: 34 }}>
            <EmptyState
              icon="📋"
              title="Nothing matches that"
              message="Try a shorter search, or a different bucket."
            />
          </div>
        ) : (
          <Table head={['Booking', 'Between', 'Service', 'State', 'Agreed', '']}>
            {page.items.map(booking => (
              <Row key={booking.id}>
                <Cell>
                  <Link
                    to={`/bookings/${booking.id}`}
                    style={{ color: t.text, fontWeight: 700, textDecoration: 'none' }}
                  >
                    {booking.reference ?? 'No reference'}
                  </Link>
                  <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 2 }}>
                    {timeAgo(booking.dateCreated)}
                  </div>
                </Cell>
                <Cell>
                  <div style={{ fontSize: 13, color: t.text }}>{booking.customerName}</div>
                  <div style={{ fontSize: 12, color: t.textSubtle, marginTop: 2 }}>
                    with {booking.providerName}
                  </div>
                </Cell>
                <Cell>
                  <div style={{ fontSize: 13, color: t.text }}>{booking.skillName}</div>
                  <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 2 }}>
                    {booking.scheduledStartAt ? fmtDateTime(booking.scheduledStartAt) : fmtDate(booking.bookingDate)}
                  </div>
                </Cell>
                <Cell>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    <Pill tone={stateTone(booking.status)}>{booking.statusName}</Pill>
                    {booking.hasOpenDispute ? <Pill tone="danger">Disputed</Pill> : null}
                    {booking.noShowReported ? <Pill tone="warning">No-show</Pill> : null}
                  </div>
                </Cell>
                <Cell>{money(booking)}</Cell>
                <Cell style={{ textAlign: 'right' }}>
                  <Link
                    to={`/bookings/${booking.id}`}
                    style={{ fontSize: 12.5, color: t.brand, fontWeight: 700, textDecoration: 'none' }}
                  >
                    Open →
                  </Link>
                </Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      <Pager
        page={page}
        noun="bookings"
        onPick={pageIndex => set({ pageIndex })}
        onSize={pageSize => set({ pageSize, pageIndex: 1 })}
      />
    </>
  );
}

/* ---------------- one booking ---------------- */

export function Booking({ identity }: { identity: AdminIdentity }) {
  const { bookingId } = useParams();
  const { t } = useTheme();
  const { toasts, push } = useToasts();
  const [detail, setDetail] = useState<BookingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!bookingId) return;
    adminApi.booking(bookingId)
      .then(result => { setDetail(result); setError(null); })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load this booking.'));
  }, [bookingId]);
  useEffect(load, [load]);

  if (error) return <ErrorNote message={error} />;
  if (!detail) return <Loading />;

  const { row } = detail;
  const settled = [4, 5, 6, 8].includes(row.status);

  const cancel = () => {
    if (!bookingId || reason.trim().length < 6 || busy) return;
    setBusy(true);
    adminApi.cancelBooking(bookingId, reason.trim())
      .then(result => {
        setDetail(result);
        setCancelOpen(false);
        setReason('');
        push(`${result.row.reference} is cancelled. Both people have been told.`);
      })
      .catch((caught: unknown) => push(caught instanceof Error ? caught.message : 'That did not work.', 'error'))
      .finally(() => setBusy(false));
  };

  return (
    <>
      <Link to="/bookings" style={{ fontSize: 13, color: t.textMuted, textDecoration: 'none' }}>← All bookings</Link>

      <PageHeader
        title={row.reference ?? 'Booking'}
        subtitle={`${row.skillName} · ${row.customerName} with ${row.providerName}`}
        action={
          <Button
            tone="danger"
            disabled={!identity.canManageBookings || settled}
            title={settled ? `Already ${row.statusName.toLowerCase()}` : undefined}
            onClick={() => { setReason(''); setCancelOpen(true); }}
          >
            Cancel on their behalf
          </Button>
        }
      />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <Pill tone={stateTone(row.status)}>{row.statusName}</Pill>
        {row.hasOpenDispute ? <Pill tone="danger">Open dispute</Pill> : null}
        {row.noShowReported ? <Pill tone="warning">No-show reported</Pill> : null}
        {detail.hasAgreement ? (
          <Pill tone={detail.agreementFullySigned ? 'success' : 'info'}>
            {detail.agreementFullySigned ? 'Agreement signed by both' : 'Agreement not fully signed'}
          </Pill>
        ) : null}
        {detail.proofCount > 0 ? <Pill tone="info">{detail.proofCount} photos</Pill> : null}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: 14, alignItems: 'start' }}>
        <Card>
          <Heading>The two people</Heading>
          <Party
            role="Customer"
            name={row.customerName}
            to={`/users/${row.customerUserId}`}
            email={detail.customerEmail}
            phone={detail.customerPhone}
          />
          <div style={{ height: 12 }} />
          <Party
            role="Provider"
            name={row.providerName}
            to={`/users/${row.providerUserId}`}
            email={detail.providerEmail}
            phone={detail.providerPhone}
          />
        </Card>

        <Card>
          <Heading>What was agreed</Heading>
          <Line label="Service" value={row.skillName} />
          <Line label="For" value={row.scheduledStartAt ? fmtDateTime(row.scheduledStartAt) : fmtDate(row.bookingDate)} />
          <Line label="Quoted" value={row.quotedAmount === null ? '—' : `${row.currencyCode} ${row.quotedAmount.toLocaleString()}`} />
          <Line label="Agreed" value={row.agreedAmount === null ? '—' : `${row.currencyCode} ${row.agreedAmount.toLocaleString()}`} />
          <Line label="Quote accepted" value={detail.quoteAccepted ? 'Yes' : 'No'} />
          {detail.description ? (
            <p style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.65, margin: '12px 0 0' }}>
              “{detail.description}”
            </p>
          ) : null}
          {detail.cancellationReason ? (
            <div style={{
              marginTop: 12, padding: '10px 12px', borderRadius: 9,
              background: t.warningSoft, fontSize: 12.5, color: t.textMuted, lineHeight: 1.6,
            }}>
              <strong style={{ color: t.text }}>Cancelled</strong>
              {detail.cancelledByName ? ` by ${detail.cancelledByName}` : ''} — {detail.cancellationReason}
            </div>
          ) : null}
          <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 12, lineHeight: 1.6 }}>
            Amounts are the terms the two of them agreed. No money moves through Vacancy.
          </div>
        </Card>
      </div>

      <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: 14, alignItems: 'start' }}>
        <Card>
          <Heading>What happened</Heading>
          <div style={{ position: 'relative', paddingLeft: 18 }}>
            <div style={{
              position: 'absolute', left: 4, top: 6, bottom: 6, width: 2,
              background: t.border, borderRadius: 1,
            }} />
            {detail.timeline.map((entry, index) => (
              <div key={`${entry.at}-${index}`} style={{ position: 'relative', paddingBottom: 14 }}>
                <div style={{
                  position: 'absolute', left: -18, top: 4, width: 10, height: 10, borderRadius: 5,
                  background: index === detail.timeline.length - 1 ? t.brand : t.textSubtle,
                  border: `2px solid ${t.surface}`,
                }} />
                <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{entry.label}</div>
                <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 1 }}>{fmtDateTime(entry.at)}</div>
                {entry.detail ? (
                  <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 3, lineHeight: 1.55 }}>{entry.detail}</div>
                ) : null}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11.5, color: t.textSubtle, lineHeight: 1.6, marginTop: 4 }}>
            Built from the booking's own timestamps — a step that never happened has no line.
          </div>
        </Card>

        <Card>
          <Heading>Disputes</Heading>
          {detail.disputes.length === 0 ? (
            <p style={{ fontSize: 13, color: t.textMuted, margin: 0, lineHeight: 1.6 }}>
              Nobody has complained about this one.
            </p>
          ) : (
            detail.disputes.map(dispute => (
              <div
                key={dispute.id}
                style={{
                  border: `1px solid ${t.border}`, borderRadius: 11, padding: '12px 14px', marginBottom: 10,
                }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Pill tone={caseTone(dispute.status)}>{dispute.statusName}</Pill>
                  <span style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{dispute.reasonName}</span>
                </div>
                <div style={{ fontSize: 12, color: t.textSubtle, marginTop: 4 }}>
                  Raised by {dispute.raisedByName} · {timeAgo(dispute.dateCreated)}
                </div>
                {dispute.details ? (
                  <p style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.6, margin: '7px 0 0' }}>
                    “{dispute.details}”
                  </p>
                ) : null}
                {dispute.resolution ? (
                  <p style={{ fontSize: 12.5, color: t.text, lineHeight: 1.6, margin: '7px 0 0' }}>
                    <strong>Outcome:</strong> {dispute.resolution}
                    {dispute.handledByName ? ` — ${dispute.handledByName}` : ''}
                  </p>
                ) : (
                  <Link
                    to="/complaints"
                    style={{ fontSize: 12.5, color: t.brand, fontWeight: 700, textDecoration: 'none', display: 'inline-block', marginTop: 8 }}
                  >
                    Work this in the queue →
                  </Link>
                )}
              </div>
            ))
          )}
        </Card>
      </div>

      {cancelOpen ? (
        <Modal title={`Cancel ${row.reference}`} onClose={() => setCancelOpen(false)}>
          <p style={{ color: t.textMuted, fontSize: 13, lineHeight: 1.6, marginTop: 0 }}>
            Cancels on the platform's behalf and tells both people why, in your words. It moves
            no money — nothing on Vacancy does — and it cannot be undone. Use it when a booking
            is stuck and neither person can be reached.
          </p>
          <Field label="Why" hint="Required. Sent to both of them, and recorded on the audit trail.">
            <Input
              value={reason}
              onChange={setReason}
              placeholder="e.g. Neither party could be reached for three weeks"
              onEnter={cancel}
            />
          </Field>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button tone="subtle" onClick={() => setCancelOpen(false)}>Keep it</Button>
            <Button tone="danger" disabled={busy || reason.trim().length < 6} onClick={cancel}>
              {busy ? 'Cancelling…' : 'Cancel the booking'}
            </Button>
          </div>
        </Modal>
      ) : null}

      <Toasts toasts={toasts} />
    </>
  );
}

/* ---------------- pieces ---------------- */

function money(booking: BookingRow) {
  const amount = booking.agreedAmount ?? booking.quotedAmount;
  if (amount === null) return '—';
  return `${booking.currencyCode} ${amount.toLocaleString()}`;
}

export function stateTone(status: number): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
  if (status === 4) return 'success';
  if (status === 2 || status === 3) return 'info';
  if (status === 1 || status === 7) return 'warning';
  return 'neutral';
}

export function caseTone(status: number): 'neutral' | 'info' | 'success' | 'warning' | 'danger' {
  if (status === 1) return 'warning';
  if (status === 2) return 'info';
  if (status === 3) return 'success';
  return 'neutral';
}

function Heading({ children }: { children: React.ReactNode }) {
  const { t } = useTheme();
  return (
    <div style={{ fontSize: 14.5, fontWeight: 800, color: t.text, marginBottom: 10 }}>{children}</div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  const { t } = useTheme();
  return (
    <div style={{ display: 'flex', gap: 12, padding: '6px 0', borderBottom: `1px solid ${t.border}` }}>
      <div style={{ width: 110, flexShrink: 0, fontSize: 12.5, color: t.textSubtle, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 13, color: t.text }}>{value}</div>
    </div>
  );
}

function Party({ role, name, to, email, phone }: {
  role: string; name: string; to: string; email: string | null; phone: string | null;
}) {
  const { t } = useTheme();
  return (
    <div style={{ background: t.surfaceMuted, borderRadius: 11, padding: '11px 13px' }}>
      <div style={{ fontSize: 11, letterSpacing: 1.1, fontWeight: 800, color: t.textSubtle, textTransform: 'uppercase' }}>
        {role}
      </div>
      <Link to={to} style={{ fontSize: 14, fontWeight: 700, color: t.text, textDecoration: 'none', display: 'block', marginTop: 3 }}>
        {name}
      </Link>
      <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 3 }}>{email ?? 'No email'}</div>
      <div style={{ fontSize: 12.5, color: t.textMuted }}>{phone ?? 'No phone number'}</div>
    </div>
  );
}
