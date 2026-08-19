/**
 * What providers have said about this person as a customer.
 *
 * The only screen in the product where those notes are readable. A customer never sees one
 * and neither does another provider, which is the point: a note nobody can retaliate over
 * gets written honestly, and an honest note is the only thing worth settling a dispute on.
 *
 * "Remove" does not delete anything. The rating stays, marked struck out, so the next
 * person to pick up the ticket can see it was already dealt with rather than reopening it.
 */
import { useCallback, useEffect, useState } from 'react';
import { adminApi, type AdminCustomerStanding } from '../api/admin';
import { useTheme } from '../theme/ThemeProvider';
import { Button, Card, Field, Input, Modal, Pill, fmtDate } from './ui';

export function CustomerStandingCard({ userId }: { userId: string }) {
  const { t } = useTheme();
  const [data, setData] = useState<AdminCustomerStanding | null>(null);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setData(await adminApi.customerStanding(userId)); }
    catch { setData(null); }
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  if (!data) return null;

  const { standing, ratings } = data;
  if (standing.completedBookings === 0 && ratings.length === 0) return null;

  const strike = async () => {
    if (!voiding) return;
    setBusy(true);
    try {
      await adminApi.voidCustomerRating(voiding, reason.trim() || 'Removed by support.');
      setVoiding(null);
      setReason('');
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <div style={{ fontSize: 14.5, fontWeight: 800, color: t.text, marginBottom: 4 }}>
        As a customer
      </div>
      <div style={{ fontSize: 12.5, color: t.textMuted, marginBottom: 12, lineHeight: 1.55 }}>
        {standing.label} — {standing.summary} Providers see the label and the counts only;
        they never see these notes, and neither does this person.
      </div>

      <div style={{ display: 'flex', gap: 20, marginBottom: 14, flexWrap: 'wrap' }}>
        {[
          ['Jobs done', standing.completedBookings],
          ['No-shows', standing.noShowsReported],
          ['Late cancels', standing.cancelledLate],
          ['Ratings', standing.ratingCount],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <div style={{ fontSize: 19, fontWeight: 800, color: t.text }}>{value}</div>
            <div style={{ fontSize: 11.5, color: t.textSubtle, fontWeight: 600 }}>{label}</div>
          </div>
        ))}
      </div>

      {ratings.length === 0 ? (
        <div style={{ fontSize: 12.5, color: t.textSubtle }}>No provider has rated this person yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ratings.map(row => (
            <div
              key={row.id}
              style={{
                border: `1px solid ${t.border}`, borderRadius: 10, padding: '10px 12px',
                opacity: row.voided ? 0.55 : 1,
              }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{row.providerName}</span>
                <span style={{ fontSize: 13, color: t.textMuted }}>{'★'.repeat(row.rating)}</span>
                {!row.showedUp ? <Pill tone="danger">Did not show</Pill> : null}
                {!row.paidAsAgreed ? <Pill tone="danger">Payment problem</Pill> : null}
                {!row.respectful ? <Pill tone="danger">Treated badly</Pill> : null}
                {row.voided ? <Pill tone="neutral">Struck out</Pill> : null}
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 11.5, color: t.textSubtle }}>{fmtDate(row.dateCreated)}</span>
                {row.voided ? null : (
                  <Button size="sm" tone="danger" onClick={() => { setVoiding(row.id); setReason(''); }}>
                    Remove
                  </Button>
                )}
              </div>
              {row.note ? (
                <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 6, lineHeight: 1.5 }}>
                  “{row.note}”
                </div>
              ) : null}
              {row.voided && row.voidReason ? (
                <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 6 }}>
                  Struck out: {row.voidReason}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {voiding ? (
        <Modal title="Remove this rating" onClose={() => setVoiding(null)}>
          <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 12, lineHeight: 1.55 }}>
            It stops counting towards this person's standing immediately. The rating stays on
            this screen, marked struck out, so nobody re-opens the same complaint next month.
          </div>
          <Field label="Why" hint="Kept on the record. The provider is not told.">
            <Input value={reason} onChange={setReason} placeholder="e.g. retaliation after a poor review" autoFocus />
          </Field>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <Button tone="danger" disabled={busy} onClick={() => void strike()}>
              {busy ? 'Removing…' : 'Remove it'}
            </Button>
            <Button tone="subtle" onClick={() => setVoiding(null)}>Cancel</Button>
          </div>
        </Modal>
      ) : null}
    </Card>
  );
}
