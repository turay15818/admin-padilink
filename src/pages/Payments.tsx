/**
 * Payments — the console's window on money that never touched Vacancy.
 *
 * Customers pay providers directly. What the platform keeps is each side's statement:
 * "I sent it" and "it arrived". When those agree, the payment is settled and it counts
 * towards that provider's verified earnings. When they disagree, it lands at the top of
 * this page, because that is a phone call somebody has to make today.
 *
 * There is no settle button, on purpose. The value of the record is that only the two
 * people in it can move it — a console that could overwrite them would turn every
 * earnings figure on the platform back into a claim.
 */
import { useCallback, useEffect, useState } from 'react';
import { adminApi, type AdminPaymentsPage } from '../api/admin';
import { useTheme } from '../theme/ThemeProvider';
import { Button, Card, EmptyState, ErrorNote, Loading, PageHeader, Pill, fmtDateTime } from '../components/ui';

const TABS = [
  { key: 'disputed', label: 'Disputed' },
  { key: 'awaiting', label: 'Awaiting' },
  { key: 'settled', label: 'Settled' },
  { key: 'all', label: 'All' },
];

const money = (amount: number, code: string) => `${code} ${Math.round(amount).toLocaleString()}`;

function tone(status: number) {
  if (status === 3) return 'success' as const;
  if (status === 4) return 'danger' as const;
  if (status === 2) return 'info' as const;
  return 'warning' as const;
}

export function Payments() {
  const { t } = useTheme();
  const [state, setState] = useState('disputed');
  const [data, setData] = useState<AdminPaymentsPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try { setData(await adminApi.payments(state)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load payments.'); }
  }, [state]);
  useEffect(() => { void load(); }, [load]);

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="Payments"
        subtitle={
          data
            ? `${data.disputedCount} disputed · ${data.awaitingCount} awaiting · ${money(data.settledTotal, 'SLE')} settled to date.`
            : 'Money that moved directly between two people, and what each of them said about it.'
        }
        action={<Button onClick={() => void load()}>Refresh</Button>}
      />
      {error ? <ErrorNote message={error} /> : null}

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setState(tab.key)}
            style={{
              cursor: 'pointer', borderRadius: 999, padding: '7px 14px', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit',
              border: `1.5px solid ${state === tab.key ? '#FF6B2C' : t.border}`,
              background: state === tab.key ? 'rgba(255,107,44,0.12)' : 'transparent', color: t.text,
            }}>
            {tab.label}
            {tab.key === 'disputed' && data && data.disputedCount > 0 ? ` (${data.disputedCount})` : ''}
          </button>
        ))}
      </div>

      {data ? (
        <div style={{ color: t.textSubtle, fontSize: 11.5, lineHeight: 1.6, marginBottom: 14, maxWidth: 760 }}>
          {data.notice}
        </div>
      ) : null}

      {data === null ? <Loading label="Opening the ledger…" /> : data.rows.length === 0 ? (
        <EmptyState
          icon="🤝"
          title={state === 'disputed' ? 'Nobody is disputing anything' : 'Nothing here yet'}
          message={state === 'disputed'
            ? 'Every payment either settled or is still waiting on somebody. Nothing needs a phone call.'
            : 'Payments appear once a provider marks work done on a booking with an agreed price.'}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {data.rows.map((row) => (
            <Card key={row.id} pad={14}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, color: t.text, fontSize: 14 }}>
                      {row.customerName} → {row.providerName}
                    </span>
                    <Pill tone={tone(row.status)}>{row.statusName}</Pill>
                  </div>
                  <div style={{ color: t.textMuted, fontSize: 12.5, marginTop: 3 }}>
                    Raised {fmtDateTime(row.dateCreated)}
                    {row.payToNumber ? ` · to ${row.payToNumber}` : ''}
                    {row.customerPhone ? ` · customer ${row.customerPhone}` : ''}
                  </div>
                  <div style={{ color: t.textSubtle, fontSize: 12, marginTop: 5, lineHeight: 1.6 }}>
                    <div>
                      <b>Customer:</b>{' '}
                      {row.customerMarkedPaidAt
                        ? `said sent on ${fmtDateTime(row.customerMarkedPaidAt)}${row.customerReference ? ` · ref ${row.customerReference}` : ''}`
                        : 'has not said anything yet'}
                    </div>
                    <div>
                      <b>Provider:</b>{' '}
                      {row.providerConfirmedAt
                        ? `confirmed it arrived on ${fmtDateTime(row.providerConfirmedAt)}`
                        : row.disputedAt
                          ? `says it did NOT arrive (${fmtDateTime(row.disputedAt)})${row.disputeNote ? ` — "${row.disputeNote}"` : ''}`
                          : 'has not confirmed yet'}
                    </div>
                  </div>
                </div>
                <div style={{ fontWeight: 900, fontSize: 18, color: row.status === 3 ? '#2E9E6B' : t.text, whiteSpace: 'nowrap' }}>
                  {money(row.amount, row.currencyCode)}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
