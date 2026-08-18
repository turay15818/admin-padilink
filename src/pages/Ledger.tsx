/**
 * Money owed.
 *
 * The first thing on this screen, before any number, is the sentence "no money moves through
 * this platform". That is not a disclaimer bolted on — it is the most important true fact
 * about everything below it. Customers pay providers directly, in cash or by mobile money.
 * What is recorded here is a stated term and, separately, what somebody has written down as
 * received. Marking a fee settled records a payment that happened elsewhere; it moves nothing.
 *
 * The screen is built around the question an operator actually has, which is not "what is the
 * total" but "who do I ring today". So the chasing list is ranked by how long the oldest
 * unsettled fee has been outstanding rather than by amount: a small debt nobody has paid in
 * ninety days is a different problem from a large one raised last week, and only one of them
 * is about money.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import {
  Button, Card, Cell, ErrorNote, Field, Input, Loading, Modal, PageHeader, Pill,
  Row, Table, Textarea, Toasts, fmtDate, useToasts,
} from '../components/ui';
import { Stat } from '../components/Charts';
import { adminApi, type FeeCharge, type LedgerPage } from '../api/admin';

const STATES = [
  { key: 'owed', label: 'Owed' },
  { key: 'overdue', label: 'Late' },
  { key: 'settled', label: 'Settled' },
  { key: 'waived', label: 'Written off' },
  { key: 'all', label: 'Everything' },
];

/** Money is always written the same way, with the currency, never bare. */
function money(amount: number, currency = 'SLE') {
  return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function Ledger() {
  const { t } = useTheme();
  const { toasts, push } = useToasts();
  const [data, setData] = useState<LedgerPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState('owed');
  const [search, setSearch] = useState('');
  const [pageIndex, setPageIndex] = useState(1);
  const [settling, setSettling] = useState<FeeCharge | null>(null);
  const [waiving, setWaiving] = useState<FeeCharge | null>(null);
  const [backfilling, setBackfilling] = useState(false);

  const load = useCallback(() => {
    adminApi.ledger({ state, search, pageIndex, pageSize: 25 })
      .then(result => { setData(result); setError(null); })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not read the ledger.'));
  }, [state, search, pageIndex]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const backfill = () => {
    setBackfilling(true);
    adminApi.ledgerBackfill()
      .then(result => { push(result.message); load(); })
      .catch((caught: unknown) => push(caught instanceof Error ? caught.message : 'That did not work.', 'error'))
      .finally(() => setBackfilling(false));
  };

  if (error) return <ErrorNote message={error} />;
  if (!data) return <Loading label="Adding it up…" />;

  const { totals } = data;

  return (
    <>
      <PageHeader
        title="Money owed"
        subtitle="What finished work owed us under the stated terms, and who is behind."
      />

      {/* The most important true sentence on the page, above every number on it. */}
      <div
        data-money-notice
        style={{
          padding: '13px 16px', borderRadius: 12, marginBottom: 14,
          background: t.surfaceMuted, border: `1px solid ${t.border}`,
          fontSize: 12.5, color: t.textMuted, lineHeight: 1.65,
        }}
      >
        {data.moneyNotice}
      </div>

      {/* Finished work with nothing raised against it. A total nobody can trust is worse than
          no total, so the gap is named and the fix is one button. */}
      {totals.unraised > 0 ? (
        <Card style={{ marginBottom: 14, background: t.warningSoft, borderColor: t.warning }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: t.text, marginBottom: 4 }}>
                {totals.unraised} finished {totals.unraised === 1 ? 'job has' : 'jobs have'} no fee against {totals.unraised === 1 ? 'it' : 'them'}
              </div>
              <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.6 }}>
                Work that finished before the ledger existed. Raising them now prices them at
                today's rate of {totals.currentRatePercent}% — nobody was recording one at the
                time — and every line says so, so a provider who queries a figure gets a
                straight answer. The totals below are incomplete until you do.
              </div>
            </div>
            <Button onClick={backfill} disabled={backfilling}>
              {backfilling ? 'Raising…' : `Raise ${totals.unraised} at ${totals.currentRatePercent}%`}
            </Button>
          </div>
        </Card>
      ) : null}

      {/* Waived sits beside settled, never inside it. Being paid and writing it off are
          different facts, and a screen that adds them hides how much is being written off. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
        <Stat label="Raised, all time" value={money(totals.raised, totals.currencyCode)} />
        <Stat label="Recorded as paid" value={money(totals.settled, totals.currencyCode)} tone={t.success} />
        <Stat label="Still outstanding" value={money(totals.outstanding, totals.currencyCode)} />
        <Stat
          label={`Late (over ${totals.graceDays} days)`}
          value={money(totals.overdue, totals.currencyCode)}
          tone={totals.overdue > 0 ? t.danger : undefined}
          note={`${totals.overdueCount} ${totals.overdueCount === 1 ? 'fee' : 'fees'}, ${totals.providersOwing} ${totals.providersOwing === 1 ? 'provider' : 'providers'} owing`}
        />
        <Stat label="Written off" value={money(totals.waived, totals.currencyCode)} note="Not the same as paid" />
      </div>

      {/* ---- who to ring today ---- */}
      {data.worstOffenders.length > 0 ? (
        <Card style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: t.text, marginBottom: 3 }}>
            Who to chase
          </div>
          <div style={{ fontSize: 12, color: t.textSubtle, marginBottom: 12, lineHeight: 1.6 }}>
            Oldest debt first, not largest. A small amount nobody has paid in three months says
            something different from a big one raised last week.
          </div>
          {data.worstOffenders.map(person => (
            <div
              key={person.providerProfileId}
              data-owing={person.providerName}
              style={{
                display: 'flex', gap: 12, alignItems: 'baseline', padding: '9px 0',
                borderBottom: `1px solid ${t.border}`, flexWrap: 'wrap',
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 700, color: t.text, minWidth: 170 }}>
                {person.providerName}
              </span>
              <span style={{ fontSize: 12, color: t.textSubtle, minWidth: 120 }}>
                {person.phone ?? 'no number on file'}
              </span>
              <span style={{ fontSize: 12, color: t.textSubtle, flex: 1, minWidth: 90 }}>
                {person.city ?? '—'}
              </span>
              <span style={{ fontSize: 12, color: t.textMuted, minWidth: 96, textAlign: 'right' }}>
                {person.jobsCharged} {person.jobsCharged === 1 ? 'job' : 'jobs'}
              </span>
              <span style={{ fontSize: 13, fontWeight: 800, color: t.text, minWidth: 116, textAlign: 'right' }}>
                {money(person.outstanding, person.currencyCode)}
              </span>
              <span style={{
                fontSize: 12, minWidth: 110, textAlign: 'right',
                color: (person.oldestUnsettledDays ?? 0) > totals.graceDays ? t.danger : t.textSubtle,
              }}>
                oldest {person.oldestUnsettledDays ?? 0} days
              </span>
              <Button size="sm" tone="subtle" onClick={() => { setState('owed'); setSearch(person.providerName); }}>
                Their fees
              </Button>
            </div>
          ))}
        </Card>
      ) : null}

      {/* ---- every line ---- */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {STATES.map(option => (
          <Button
            key={option.key}
            size="sm"
            tone={state === option.key ? 'primary' : 'subtle'}
            onClick={() => { setState(option.key); setPageIndex(1); }}
          >
            {option.label}
          </Button>
        ))}
        <div style={{ marginLeft: 'auto', minWidth: 240 }}>
          <Input
            value={search}
            onChange={value => { setSearch(value); setPageIndex(1); }}
            placeholder="Provider, phone or booking reference…"
          />
        </div>
      </div>

      <Card pad={0}>
        <Table head={['Provider', 'Job', 'Finished', 'Job was worth', 'Our share', 'Where it stands', '']}>
          {data.items.map(charge => (
            <Row key={charge.id}>
              <Cell>
                <div data-charge={charge.bookingReference} style={{ fontWeight: 700, color: t.text }}>
                  {charge.providerName}
                </div>
                <div style={{ fontSize: 11.5, color: t.textSubtle }}>
                  {charge.providerPhone ?? 'no number'}{charge.city ? ` · ${charge.city}` : ''}
                </div>
              </Cell>
              <Cell>
                <div style={{ fontSize: 12.5 }}>{charge.skillName}</div>
                <div style={{ fontSize: 11.5, color: t.textSubtle }}>{charge.bookingReference}</div>
              </Cell>
              <Cell>
                <div style={{ fontSize: 12.5 }}>{fmtDate(charge.workFinishedAt)}</div>
                <div style={{ fontSize: 11.5, color: charge.overdue ? t.danger : t.textSubtle }}>
                  {charge.daysOutstanding} days ago
                </div>
              </Cell>
              <Cell>{money(charge.bookingAmount, charge.currencyCode)}</Cell>
              <Cell>
                <div style={{ fontWeight: 700 }}>{money(charge.amountOwed, charge.currencyCode)}</div>
                {/* The rate is on every line because it is frozen per line. Two rows can
                    legitimately carry different rates, and hiding that invites an argument
                    with a provider that nobody on this screen could answer. */}
                <div style={{ fontSize: 11.5, color: t.textSubtle }}>
                  {charge.ratePercent}% {charge.backfilled ? '· at today’s rate' : ''}
                </div>
              </Cell>
              <Cell>
                {charge.state === 'settled' ? (
                  <>
                    <Pill tone="success">Paid</Pill>
                    <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 3 }}>
                      {money(charge.settledAmount ?? 0, charge.currencyCode)} · {charge.settlementReference}
                    </div>
                    {(charge.settledAmount ?? 0) < charge.amountOwed ? (
                      <div style={{ fontSize: 11.5, color: t.warning }}>
                        {money(charge.amountOwed - (charge.settledAmount ?? 0), charge.currencyCode)} short
                      </div>
                    ) : null}
                  </>
                ) : charge.state === 'waived' ? (
                  <>
                    <Pill tone="neutral">Written off</Pill>
                    <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 3, maxWidth: 240 }}>
                      {charge.waivedReason}
                    </div>
                  </>
                ) : charge.overdue ? (
                  <Pill tone="danger">Late</Pill>
                ) : (
                  <Pill tone="warning">Owed</Pill>
                )}
              </Cell>
              <Cell>
                {charge.state === 'owed' ? (
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <Button size="sm" onClick={() => setSettling(charge)}>Record payment</Button>
                    <Button size="sm" tone="subtle" onClick={() => setWaiving(charge)}>Write off</Button>
                  </div>
                ) : null}
              </Cell>
            </Row>
          ))}
        </Table>

        {data.items.length === 0 ? (
          <div style={{ padding: '26px 18px', textAlign: 'center', fontSize: 13, color: t.textSubtle }}>
            Nothing here. {state === 'owed' ? 'Every fee raised has been settled or written off.' : ''}
          </div>
        ) : null}
      </Card>

      {data.totalCount > data.pageSize ? (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 14, alignItems: 'center' }}>
          <Button size="sm" tone="subtle" disabled={pageIndex <= 1} onClick={() => setPageIndex(pageIndex - 1)}>
            Back
          </Button>
          <span style={{ fontSize: 12.5, color: t.textSubtle }}>
            {(pageIndex - 1) * data.pageSize + 1}–{Math.min(pageIndex * data.pageSize, data.totalCount)} of {data.totalCount}
          </span>
          <Button
            size="sm"
            tone="subtle"
            disabled={pageIndex * data.pageSize >= data.totalCount}
            onClick={() => setPageIndex(pageIndex + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}

      {settling ? (
        <SettleDialog
          charge={settling}
          onClose={() => setSettling(null)}
          onDone={message => { push(message); setSettling(null); load(); }}
        />
      ) : null}

      {waiving ? (
        <WaiveDialog
          charge={waiving}
          onClose={() => setWaiving(null)}
          onDone={message => { push(message); setWaiving(null); load(); }}
        />
      ) : null}

      <Toasts toasts={toasts} />
    </>
  );
}

/**
 * Recording that a fee was paid.
 *
 * The reference is required, and the dialog says why rather than just refusing: this writes
 * down money that moved somewhere else, so the pointer to where it moved is the only thing
 * that makes the row checkable by anybody later. "Settled" on its own is somebody's memory.
 */
function SettleDialog({ charge, onClose, onDone }: {
  charge: FeeCharge; onClose: () => void; onDone: (message: string) => void;
}) {
  const { t } = useTheme();
  const [reference, setReference] = useState('');
  const [amount, setAmount] = useState(String(charge.amountOwed));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const typed = Number(amount);
  const valid = amount.trim() !== '' && Number.isFinite(typed) && typed > 0;
  const short = valid ? charge.amountOwed - typed : 0;
  const ready = reference.trim().length > 0 && valid;

  const save = () => {
    if (!ready || busy) return;
    setBusy(true); setError(null);
    adminApi.settleFee(charge.id, reference.trim(), typed, note.trim() || null)
      .then(result => onDone(result.message))
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'That did not work.'))
      .finally(() => setBusy(false));
  };

  return (
    <Modal title="Record a payment" onClose={onClose} width={480}>
      <p style={{ color: t.textMuted, fontSize: 13, lineHeight: 1.65, marginTop: 0 }}>
        This writes down that <strong style={{ color: t.text }}>{charge.providerName}</strong> paid
        the {money(charge.amountOwed, charge.currencyCode)} owed on {charge.bookingReference}.
        Nothing is collected here — the money moved wherever it moved, and this is the record of it.
      </p>

      <Field label="What was received" hint="Leave as it is unless they paid a different amount.">
        <Input value={amount} onChange={setAmount} placeholder={String(charge.amountOwed)} />
      </Field>

      {valid && short > 0 ? (
        <div style={{ fontSize: 12.5, color: t.warning, margin: '-6px 0 12px', lineHeight: 1.55 }}>
          {money(short, charge.currencyCode)} less than was owed. The difference stays on the
          line rather than disappearing into the total.
        </div>
      ) : null}
      {valid && short < 0 ? (
        <div style={{ fontSize: 12.5, color: t.textMuted, margin: '-6px 0 12px' }}>
          {money(-short, charge.currencyCode)} more than was owed.
        </div>
      ) : null}

      <Field
        label="Where can this payment be found?"
        hint="A mobile-money reference, a receipt number, or where it was handed over. Required — it is the only thing that makes this checkable later."
      >
        <Input value={reference} onChange={setReference} placeholder="e.g. OM-77213, or “cash, Bo office”" onEnter={save} />
      </Field>

      <Field label="Anything else worth knowing (optional)">
        <Textarea value={note} onChange={setNote} rows={2} placeholder="Paid in two parts, second one still coming…" />
      </Field>

      {error ? <ErrorNote message={error} /> : null}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
        <Button tone="subtle" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={!ready || busy}>{busy ? 'Recording…' : 'Record it'}</Button>
      </div>
    </Modal>
  );
}

/**
 * Writing a fee off.
 *
 * The reason is required because the person who has to tell a write-off from a favour later is
 * not the person doing it now. It stays on the ledger with the reason against it rather than
 * disappearing, which is the difference between an accounting decision and a deletion.
 */
function WaiveDialog({ charge, onClose, onDone }: {
  charge: FeeCharge; onClose: () => void; onDone: (message: string) => void;
}) {
  const { t } = useTheme();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = reason.trim().length >= 4;

  const save = () => {
    if (!ready || busy) return;
    setBusy(true); setError(null);
    adminApi.waiveFee(charge.id, reason.trim())
      .then(result => onDone(result.message))
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'That did not work.'))
      .finally(() => setBusy(false));
  };

  return (
    <Modal title="Write this fee off" onClose={onClose} width={460}>
      <p style={{ color: t.textMuted, fontSize: 13, lineHeight: 1.65, marginTop: 0 }}>
        {money(charge.amountOwed, charge.currencyCode)} owed by{' '}
        <strong style={{ color: t.text }}>{charge.providerName}</strong> on {charge.bookingReference}.
        It stays on the ledger with your reason against it — written off is not the same as paid,
        and the totals keep them apart.
      </p>

      <Field label="Why?" hint="A fee written off with nothing beside it is indistinguishable from a favour.">
        <Textarea value={reason} onChange={setReason} rows={3} placeholder="The customer never paid them either." />
      </Field>

      {error ? <ErrorNote message={error} /> : null}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
        <Button tone="subtle" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={!ready || busy}>{busy ? 'Writing off…' : 'Write it off'}</Button>
      </div>
    </Modal>
  );
}
