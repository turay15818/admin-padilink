/**
 * People paying to be seen, and the queue somebody works through.
 *
 * Two things are being decided on this screen and they are not the same decision. "Did the
 * money arrive" is bookkeeping — somebody checks the bank and types a reference. "Should this
 * run" is judgement — somebody reads it and decides whether it belongs in front of the whole
 * country. They are separated in the queue because the person doing them may not be the same
 * person, and because approving something unpaid is a mistake that costs money quietly.
 *
 * Paid-and-unread sits at the top. It is the only part of this queue where waiting costs the
 * platform trust rather than costing the promoter time.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import {
  Button, Card, Cell, EmptyState, ErrorNote, Field, Input, Loading, Modal, PageHeader,
  Pill, Row, Table, Textarea, Toasts, fmtDateTime, timeAgo, useToasts,
} from '../components/ui';
import { adminApi, PROMO_STATUS, type Promo } from '../api/admin';

export function Promos() {
  const { t } = useTheme();
  const { toasts, push: toast } = useToasts();
  const [items, setItems] = useState<Promo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState<Promo | null>(null);
  const [rejecting, setRejecting] = useState<Promo | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    adminApi.promoQueue()
      .then(setItems)
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load the queue.'));
  }, []);

  useEffect(load, [load]);

  const approve = (promo: Promo) => {
    setBusyId(promo.id);
    adminApi.approvePromo(promo.id)
      .then(() => { toast(`“${promo.headline}” is live.`); load(); })
      .catch((caught: unknown) => toast(caught instanceof Error ? caught.message : 'That did not work.'))
      .finally(() => setBusyId(null));
  };

  const waitingOnMoney = items?.filter(item => item.status === PROMO_STATUS.awaitingPayment) ?? [];
  const waitingOnUs = items?.filter(item => item.status === PROMO_STATUS.pendingReview) ?? [];
  const live = items?.filter(item => item.status === PROMO_STATUS.running) ?? [];

  return (
    <>
      <PageHeader
        title="Paid promos"
        subtitle="People paying to be seen. Confirm the money, then read it before it runs."
      />

      {error ? <ErrorNote message={error} /> : null}
      {items === null && !error ? <Loading /> : null}

      {items !== null ? (
        <>
          <Section
            title="Paid, waiting to be read"
            hint="Somebody has handed over money and is waiting. This is the part of the queue that matters."
            empty="Nothing waiting on us."
            items={waitingOnUs}
            render={promo => (
              <>
                <Button
                  onClick={() => approve(promo)}
                  disabled={busyId === promo.id}
                >
                  {busyId === promo.id ? 'Publishing…' : 'Approve'}
                </Button>
                <Button tone="subtle" onClick={() => setRejecting(promo)}>Reject</Button>
              </>
            )}
          />

          <Section
            title="Waiting for payment"
            hint="Nothing happens to these until the money is confirmed."
            empty="Nobody owes us anything."
            items={waitingOnMoney}
            render={promo => (
              <Button tone="subtle" onClick={() => setPaying(promo)}>Money arrived</Button>
            )}
          />

          <Section
            title="Running now"
            hint="Live on the rail. Views and taps come from the advert itself."
            empty="Nothing running."
            items={live}
            render={promo => (
              <span style={{ fontSize: 12, color: t.textSubtle }}>
                {promo.impressions.toLocaleString()} views · {promo.clicks.toLocaleString()} taps
              </span>
            )}
          />
        </>
      ) : null}

      {paying ? (
        <ConfirmPayment
          promo={paying}
          onClose={() => setPaying(null)}
          onDone={message => { setPaying(null); toast(message); load(); }}
        />
      ) : null}

      {rejecting ? (
        <Reject
          promo={rejecting}
          onClose={() => setRejecting(null)}
          onDone={message => { setRejecting(null); toast(message); load(); }}
        />
      ) : null}

      <Toasts toasts={toasts} />
    </>
  );
}

function Section({ title, hint, empty, items, render }: {
  title: string;
  hint: string;
  empty: string;
  items: Promo[];
  render: (promo: Promo) => React.ReactNode;
}) {
  const { t } = useTheme();

  return (
    <Card style={{ marginBottom: 16 }}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: t.text }}>
          {title}
          {items.length > 0 ? (
            <span style={{ color: t.textSubtle, fontWeight: 700 }}> · {items.length}</span>
          ) : null}
        </div>
        <div style={{ fontSize: 12, color: t.textSubtle, lineHeight: 1.5, marginTop: 2 }}>{hint}</div>
      </div>

      {items.length === 0 ? (
        <EmptyState icon="✓" title={empty} />
      ) : (
        <Table head={['What it says', 'Who', 'Package', 'Cost', 'Submitted', '']}>
          {items.map(promo => (
            <Row key={promo.id}>
              <Cell>
                <div style={{ fontWeight: 700, color: t.text }}>{promo.headline}</div>
                {promo.body ? (
                  <div style={{ fontSize: 12, color: t.textSubtle, lineHeight: 1.5, maxWidth: 380 }}>
                    {promo.body}
                  </div>
                ) : null}
                {promo.targetCity ? (
                  <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 2 }}>
                    Only in {promo.targetCity}
                  </div>
                ) : null}
              </Cell>
              <Cell>{promo.ownerName}</Cell>
              <Cell>
                {/* The push tier is the only one that interrupts somebody, so it is the only
                    one that stands out in the queue. */}
                <Pill tone={promo.tier === 3 ? 'warning' : 'neutral'}>{promo.tierName}</Pill>
                <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 3 }}>
                  {promo.durationDays} days
                </div>
              </Cell>
              <Cell>
                {promo.paymentMethod === 2
                  ? `${promo.pointsCost.toLocaleString()} points`
                  : `${promo.currencyCode} ${promo.priceAmount.toLocaleString()}`}
                {promo.paidAt ? (
                  <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 3 }}>
                    Paid {timeAgo(promo.paidAt)}
                  </div>
                ) : null}
              </Cell>
              <Cell>{fmtDateTime(promo.dateCreated)}</Cell>
              <Cell>
                <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end', alignItems: 'center' }}>
                  {render(promo)}
                </div>
              </Cell>
            </Row>
          ))}
        </Table>
      )}
    </Card>
  );
}

function ConfirmPayment({ promo, onClose, onDone }: {
  promo: Promo; onClose: () => void; onDone: (message: string) => void;
}) {
  const { t } = useTheme();
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    if (busy) return;
    setBusy(true); setError(null);
    adminApi.markPromoPaid(promo.id, reference.trim())
      .then(() => onDone(`Payment recorded. “${promo.headline}” is in the review queue.`))
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'That did not work.'))
      .finally(() => setBusy(false));
  };

  return (
    <Modal title="The money arrived" onClose={onClose} width={460}>
      <div style={{ fontSize: 13, color: t.text, lineHeight: 1.6, marginBottom: 14 }}>
        {promo.ownerName} owes <b>{promo.currencyCode} {promo.priceAmount.toLocaleString()}</b> for
        “{promo.headline}”. Confirm only when you can see it — this moves it into the queue to be
        published, and nothing later asks again.
      </div>

      <Field
        label="Reference (optional)"
        hint="The transfer reference, the Orange Money id, or how it was paid."
      >
        <Input value={reference} onChange={setReference} placeholder="OM-88213 / cash at the office" autoFocus />
      </Field>

      {error ? <ErrorNote message={error} /> : null}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button tone="subtle" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Confirm payment'}</Button>
      </div>
    </Modal>
  );
}

function Reject({ promo, onClose, onDone }: {
  promo: Promo; onClose: () => void; onDone: (message: string) => void;
}) {
  const { t } = useTheme();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = reason.trim().length > 3;

  const save = () => {
    if (!ready || busy) return;
    setBusy(true); setError(null);
    adminApi.rejectPromo(promo.id, reason.trim())
      .then(() => onDone(`“${promo.headline}” was refused and they were told why.`))
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'That did not work.'))
      .finally(() => setBusy(false));
  };

  return (
    <Modal title="Refuse this promo" onClose={onClose} width={480}>
      <div style={{ fontSize: 13, color: t.text, lineHeight: 1.6, marginBottom: 14 }}>
        They read this word for word, so write it to them.
        {promo.paymentMethod === 2
          ? ' Their points go back automatically.'
          : ' Refunding the money is a separate job — this does not do it.'}
      </div>

      <Field
        label="Why"
        hint="Say what to change. A refusal with no reason gets resubmitted unchanged."
      >
        <Textarea
          value={reason}
          onChange={setReason}
          rows={3}
          placeholder="Use a photo of the actual work, not a stock image."
        />
      </Field>

      {error ? <ErrorNote message={error} /> : null}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button tone="subtle" onClick={onClose}>Cancel</Button>
        <Button tone="danger" onClick={save} disabled={!ready || busy}>
          {busy ? 'Sending…' : 'Refuse and tell them'}
        </Button>
      </div>
    </Modal>
  );
}
