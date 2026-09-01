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
                  {row.documentExpiresAt ? (
                    <Pill tone="neutral">Expires {new Date(row.documentExpiresAt).toLocaleDateString()}</Pill>
                  ) : null}
                </div>
                <div style={{ fontSize: 13, color: t.text, marginTop: 10 }}>{row.doubtLabel}</div>
              </div>

              {/* The evidence. Without it this screen is asking somebody to rubber-stamp a name. */}
              <div style={{ display: 'flex', gap: 10, flex: '0 0 auto' }}>
                {[{ url: row.documentUrl, label: 'The ID' }, { url: row.selfieUrl, label: 'Their face' }].map((shot) => (
                  <div key={shot.label} style={{ textAlign: 'center' }}>
                    {shot.url ? (
                      <a href={shot.url} target="_blank" rel="noreferrer">
                        <img
                          src={shot.url}
                          alt={shot.label}
                          style={{ width: 148, height: 108, objectFit: 'cover', borderRadius: 10, border: `1px solid ${t.border}`, display: 'block' }}
                        />
                      </a>
                    ) : (
                      <div style={{ width: 148, height: 108, borderRadius: 10, border: `1px dashed ${t.border}`, display: 'grid', placeItems: 'center', color: t.textMuted, fontSize: 12 }}>
                        Not taken
                      </div>
                    )}
                    <div style={{ fontSize: 11.5, color: t.textMuted, marginTop: 4 }}>{shot.label}</div>
                  </div>
                ))}
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
