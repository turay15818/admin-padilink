/**
 * The vouches a machine would not verify alone.
 *
 * A guarantor put a government ID and their own face behind somebody. The reader read the
 * ID, matched the name and compared the face, and on these cases something did not line up:
 * a name spelt differently, a dark photo, an ID that has vouched before. The question is the
 * same as on the identity queue — "are these the same person, and is this their name" — and
 * it is answered by looking, so the evidence is the screen.
 *
 * What a refusal costs: the provider loses a guarantor and is told why, word for word. What
 * an approval grants: "verified guarantor" on a public profile, and, for a recommendation
 * that names a skill, a rung on somebody's ladder. Look at both photos.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import { Button, Card, EmptyState, ErrorNote, Loading, PageHeader, Pill, Textarea, Toasts, useToasts } from '../components/ui';
import { adminApi, type VouchCase } from '../api/admin';
import { EvidenceImage } from '../components/EvidenceImage';

export function Vouches() {
  const { t } = useTheme();
  const { toasts, push } = useToasts();
  const [cases, setCases] = useState<VouchCase[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    adminApi.vouchQueue().then(setCases).catch((e) => { setError(e instanceof Error ? e.message : 'Could not load the vouch queue.'); setCases([]); });
  }, []);
  useEffect(load, [load]);

  const decide = async (row: VouchCase, approve: boolean) => {
    const note = (notes[row.id] ?? '').trim();
    if (!approve && !note) {
      push('Say why — the provider is told, word for word.', 'error');
      return;
    }
    setBusy(row.id);
    try {
      await adminApi.decideVouch(row.id, { approve, note: note || null });
      push(approve ? `${row.fullName} is a verified ${row.kindLabel.toLowerCase()} for ${row.providerName}.` : `${row.fullName}'s vouch was refused.`);
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
        title="Vouches"
        subtitle="Guarantors and recommenders whose ID the machine would not verify alone. Look at both photos before you decide."
      />
      {error ? <ErrorNote message={error} /> : null}
      {cases === null ? <Loading /> : null}
      {cases !== null && cases.length === 0 && !error ? (
        <EmptyState icon="shield" title="Nothing waiting" message="Every vouch with an ID has either verified on its own or been decided." />
      ) : null}

      <div style={{ display: 'grid', gap: 14 }}>
        {(cases ?? []).map((row) => (
          <Card key={row.id}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: t.textMuted }}>
                  {row.kindLabel} for {row.providerName}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: t.text, marginTop: 2 }}>{row.fullName}</div>
                <div style={{ fontSize: 13, color: t.textMuted, marginTop: 2 }}>
                  {row.relationship}{row.organisation ? ` · ${row.organisation}` : ''} · On the ID: {row.idName || '—'}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  <Pill tone={row.nameMatched ? 'success' : 'warning'}>{row.nameMatched ? 'Name matches' : 'Name does not match'}</Pill>
                  <Pill tone={row.faceMatched ? 'success' : 'warning'}>
                    {row.faceMatched ? `Face matches (${row.faceConfidence}%)` : `Face unsure (${row.faceConfidence}%)`}
                  </Pill>
                  {row.idExpiresAt ? <Pill tone="neutral">Expires {new Date(row.idExpiresAt).toLocaleDateString()}</Pill> : null}
                  <Pill tone="neutral">Raised {new Date(row.raisedAt).toLocaleDateString()}</Pill>
                </div>
                <div style={{ fontSize: 13, color: t.text, marginTop: 10 }}>{row.doubtLabel}</div>
              </div>

              {/* The evidence. Without it this screen is asking somebody to rubber-stamp a name. */}
              <div style={{ display: 'flex', gap: 10, flex: '0 0 auto' }}>
                <EvidenceImage url={row.documentUrl} label="The ID" />
                <EvidenceImage url={row.photoUrl} label="Their face" />
              </div>
            </div>

            <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
              <Textarea
                rows={2}
                placeholder="Why — the provider is shown this word for word when you refuse."
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
