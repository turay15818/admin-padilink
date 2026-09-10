/**
 * The identity cases a machine would not decide alone.
 *
 * This queue used to exist and be undrainable. A name that did not match set somebody to
 * UnderReview and kept no document at all, so a reviewer opened a case and saw a name and
 * nothing else. A review queue you cannot review is worse than no queue: it looks like
 * diligence and is not.
 *
 * So the evidence is the screen. The ID and the selfie sit side by side, above the two
 * buttons, with the machine's own reading of what is in doubt — because the only question
 * being asked here is "are these the same person, and is this their name", and that question
 * is answered by looking.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import { Button, Card, EmptyState, ErrorNote, Loading, PageHeader, Pill, Textarea, Toasts, useToasts } from '../components/ui';
import { adminApi, type IdentityCase } from '../api/admin';
import { EvidenceImage } from '../components/EvidenceImage';

export function Identity() {
  const { t } = useTheme();
  const { toasts, push } = useToasts();
  const [cases, setCases] = useState<IdentityCase[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    adminApi.identityQueue().then(setCases).catch((e) => { setError((e instanceof Error ? e.message : 'Could not load the identity queue.')); setCases([]); });
  }, []);
  useEffect(load, [load]);

  const decide = async (row: IdentityCase, approve: boolean) => {
    const note = (notes[row.id] ?? '').trim();
    // A refusal somebody cannot act on is a dead end: they are told no and not told what
    // would make it a yes. The server refuses one too — this is the same rule, said early.
    if (!approve && !note) {
      push('Say why, so the person knows what to fix.', 'error');
      return;
    }
    setBusy(row.id);
    try {
      await adminApi.decideIdentity(row.id, { approve, note: note || null });
      push(approve ? `${row.personName} is verified.` : `${row.personName} was refused.`);
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : 'That decision did not save.', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Identity"
        subtitle="Checks a machine would not decide on its own. Look at both photos before you decide."
      />
      {error ? <ErrorNote message={error} /> : null}
      {cases === null ? <Loading /> : null}
      {cases !== null && cases.length === 0 && !error ? (
        <EmptyState icon="shield" title="Nothing waiting" message="Every identity check has either passed on its own or been decided." />
      ) : null}

      <div style={{ display: 'grid', gap: 14 }}>
        {(cases ?? []).map((row) => (
          <Card key={row.id}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: t.text }}>{row.personName}</div>
                <div style={{ fontSize: 13, color: t.textMuted, marginTop: 2 }}>
                  On the ID: {row.documentName || '—'}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  <Pill tone={row.nameMatched ? 'success' : 'warning'}>{row.nameMatched ? 'Name matches' : 'Name does not match'}</Pill>
                  <Pill tone={row.faceMatched ? 'success' : 'warning'}>
                    {row.faceMatched ? `Face matches (${row.faceConfidence}%)` : `Face unsure (${row.faceConfidence}%)`}
                  </Pill>
                  {/*
                    THE EXPIRY DATE NOW DOES SOMETHING.
                    A passed check stops counting as proof the day the document behind it runs
                    out — the badge no longer outlives the paper. So a reviewer approving this
                    case needs to see how long their yes will actually last, and a date that is
                    already past means approving it grants nothing at all.
                  */}
                  {row.documentExpiresAt ? <ExpiryPill on={row.documentExpiresAt} /> : null}
                </div>
                <div style={{ fontSize: 13, color: t.text, marginTop: 10 }}>{row.doubtLabel}</div>
              </div>

              {/* The evidence. Without it this screen is asking somebody to rubber-stamp a name. */}
              {/* Fetched with the bearer token: a plain <img> carries none, and the server
                  rightly refuses. This queue was showing broken pictures. */}
              <div style={{ display: 'flex', gap: 10, flex: '0 0 auto' }}>
                <EvidenceImage url={row.documentUrl} label="The ID" />
                <EvidenceImage url={row.selfieUrl} label="Their face" />
              </div>
            </div>

            <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
              <Textarea
                rows={2}
                placeholder="Why — the person is shown this word for word when you refuse."
                value={notes[row.id] ?? ''}
                onChange={(value) => setNotes((prev) => ({ ...prev, [row.id]: value }))}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <Button onClick={() => decide(row, true)} disabled={busy === row.id}>This is them</Button>
                <Button tone="danger" onClick={() => decide(row, false)} disabled={busy === row.id}>Refuse</Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
      <Toasts toasts={toasts} />
    </>
  );
}


/**
 * How long a yes on this case would last.
 *
 * Neutral while the document has a year or more to run, a warning inside sixty days, and a
 * refusal once it is past — approving an expired document grants nothing, because the rule that
 * decides whether somebody is verified reads this date too.
 */
function ExpiryPill({ on }: { on: string }) {
  const when = new Date(on);
  const days = Math.round((when.getTime() - Date.now()) / 86_400_000);
  const shown = when.toLocaleDateString();
  if (days < 0) return <Pill tone="danger">Expired {shown} — approving this grants nothing</Pill>;
  if (days <= 60) return <Pill tone="warning">Expires {shown} — {days} day{days === 1 ? '' : 's'} left</Pill>;
  return <Pill tone="neutral">Expires {shown}</Pill>;
}
