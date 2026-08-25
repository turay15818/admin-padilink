/**
 * The medical verification desk — the human eyes the Vacancy Health badge depends on.
 *
 * Everything the platform promises about Health rests on this screen doing its job
 * slowly and properly: open the actual license, read the actual number, then decide.
 * A rejection cannot be sent without a note, because the professional is shown that
 * note verbatim and "rejected" on its own is a dead end for them.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import {
  Button, Card, EmptyState, ErrorNote, Loading, Modal, PageHeader, Pill, Textarea, Toasts, useToasts,
} from '../components/ui';
import { adminApi, type DemoHealthStatus, type MedicalReviewRow } from '../api/admin';
import { config } from '../api/client';

const STATUS_LABEL: Record<number, string> = { 1: 'Pending', 2: 'Approved', 3: 'Rejected' };

export function Medical() {
  const { t } = useTheme();
  const { toasts, push } = useToasts();

  const [pendingOnly, setPendingOnly] = useState(true);
  const [rows, setRows] = useState<MedicalReviewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<MedicalReviewRow | null>(null);
  const [note, setNote] = useState('');
  const [deciding, setDeciding] = useState(false);
  const [demo, setDemo] = useState<DemoHealthStatus | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const [confirmStrike, setConfirmStrike] = useState(false);

  const load = useCallback(() => {
    setError(null);
    adminApi.medicalQueue(pendingOnly)
      .then(setRows)
      .catch(caught => setError(caught instanceof Error ? caught.message : 'Could not load the queue.'));
    adminApi.demoHealthStatus().then(setDemo).catch(() => setDemo(null));
  }, [pendingOnly]);
  useEffect(load, [load]);

  const runDemo = (work: () => Promise<DemoHealthStatus>, done: (status: DemoHealthStatus) => string) => {
    setDemoBusy(true);
    work()
      .then(status => { setDemo(status); push(done(status)); load(); })
      .catch(caught => push(caught instanceof Error ? caught.message : 'That did not work.', 'error'))
      .finally(() => { setDemoBusy(false); setConfirmStrike(false); });
  };

  const decide = (approve: boolean) => {
    if (!reviewing) return;
    if (!approve && note.trim().length < 5) {
      push('A rejection needs a note — the professional is shown it verbatim.', 'error');
      return;
    }
    setDeciding(true);
    adminApi.decideMedical(reviewing.id, { approve, note: note.trim() || null })
      .then(() => {
        push(approve
          ? 'Approved — they now appear in Vacancy Health.'
          : 'Rejected — the professional has been told what to fix.');
        setReviewing(null);
        setNote('');
        load();
      })
      .catch(caught => push(caught instanceof Error ? caught.message : 'That did not work.', 'error'))
      .finally(() => setDeciding(false));
  };

  return (
    <div>
      <PageHeader
        title="Medical verification"
        subtitle="Every Vacancy Health badge is a decision made on this screen. Open the actual license, read the actual number, then decide — nobody appears in the health directory without it."
        action={
          <Button tone="ghost" onClick={() => setPendingOnly(current => !current)}>
            {pendingOnly ? 'Show history' : 'Show pending only'}
          </Button>
        }
      />

      {/* The demo cast: a directory that demonstrates itself, and one honest kill-switch
          for going live. Every demo row wears the demo-seed marker and a
          @demo.vacancysl.com login that cannot authenticate — the strike removes exactly
          those rows and provably cannot reach a real professional. */}
      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 800, fontSize: 14.5, color: t.text }}>Demo directory</span>
              {demo ? (
                <Pill tone={demo.demoProfessionals > 0 ? 'warning' : 'success'}>
                  {demo.demoProfessionals > 0 ? `${demo.demoProfessionals} demo professionals live` : 'stage is empty'}
                </Pill>
              ) : null}
            </div>
            <div style={{ color: t.textMuted, fontSize: 13, marginTop: 3, lineHeight: 1.5 }}>
              Twenty verified professionals across all ten professions, with profiles and weekly
              availability — so Vacancy Health demonstrates itself before the real ones arrive.
              Their accounts cannot log in, and going live removes every demo row in one press.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button tone="primary" disabled={demoBusy} onClick={() => runDemo(
              () => adminApi.demoHealthSeed(),
              status => status.seededNow > 0
                ? `${status.seededNow} demo professionals seeded — ${status.demoProfessionals} on stage.`
                : 'The cast was already on stage — nobody duplicated.')}>
              Seed the demo cast
            </Button>
            <Button tone="danger" disabled={demoBusy || (demo?.demoProfessionals ?? 0) === 0} onClick={() => setConfirmStrike(true)}>
              Remove every demo row
            </Button>
          </div>
        </div>
      </Card>

      {confirmStrike ? (
        <Modal title="Going live — strike the demo set?" onClose={() => setConfirmStrike(false)}>
          <p style={{ color: t.textMuted, fontSize: 13.5, lineHeight: 1.6, marginTop: 0 }}>
            This permanently removes every demo professional — their profiles, credentials,
            availability and any test bookings made against them. Real professionals are matched
            by neither belt of the filter and cannot be touched. There is no undo; reseeding
            simply creates a fresh cast.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button tone="ghost" onClick={() => setConfirmStrike(false)}>Keep them</Button>
            <Button tone="danger" disabled={demoBusy} onClick={() => runDemo(
              () => adminApi.demoHealthClear(),
              status => `${status.removedRows} demo rows removed. Real professionals were never in reach.`)}>
              Remove them all
            </Button>
          </div>
        </Modal>
      ) : null}

      {error ? <ErrorNote message={error} /> : null}
      {rows === null && !error ? <Loading /> : null}

      {rows !== null && rows.length === 0 ? (
        <EmptyState
          icon="◈"
          title={pendingOnly ? 'Nothing waiting' : 'No credentials yet'}
          message={pendingOnly
            ? 'Every submitted license has been decided. New submissions land here the moment they arrive.'
            : 'When health professionals submit their licenses, the whole history lives here.'}
        />
      ) : null}

      <div style={{ display: 'grid', gap: 10 }}>
        {(rows ?? []).map(row => (
          <Card key={row.id}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 260 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 800, fontSize: 15, color: t.text }}>{row.providerName}</span>
                  <Pill tone={row.status === 2 ? 'success' : row.status === 3 ? 'danger' : 'warning'}>
                    {STATUS_LABEL[row.status] ?? 'Unknown'}
                  </Pill>
                </div>
                <div style={{ color: t.textMuted, fontSize: 13, marginTop: 3 }}>
                  {row.professionLabel}{row.specialtyText ? ` · ${row.specialtyText}` : ''}{row.city ? ` · ${row.city}` : ''}
                </div>
                <div style={{ color: t.textMuted, fontSize: 13, marginTop: 2 }}>
                  {row.licensingBody} · license <span style={{ fontWeight: 700, color: t.text }}>{row.licenseNumber}</span>
                </div>
                <div style={{ color: t.textSubtle, fontSize: 12, marginTop: 4 }}>
                  Submitted {new Date(row.submittedAt).toLocaleDateString()}
                  {row.reviewedAt ? ` · decided ${new Date(row.reviewedAt).toLocaleDateString()}${row.reviewedByName ? ` by ${row.reviewedByName}` : ''}` : ''}
                </div>
                {row.reviewNote ? (
                  <div style={{ color: t.textMuted, fontSize: 12.5, marginTop: 4 }}>Note: “{row.reviewNote}”</div>
                ) : null}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <a href={`${config.apiBaseUrl}${row.documentUrl}`} target="_blank" rel="noreferrer"
                  style={{ color: t.accent, fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
                  Open license
                </a>
                {row.supportingDocumentUrl ? (
                  <a href={`${config.apiBaseUrl}${row.supportingDocumentUrl}`} target="_blank" rel="noreferrer"
                    style={{ color: t.accent, fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
                    Supporting file
                  </a>
                ) : null}
                {row.status === 1 ? (
                  <Button onClick={() => { setReviewing(row); setNote(''); }}>Decide</Button>
                ) : null}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {reviewing ? (
        <Modal title={`${reviewing.providerName} — ${reviewing.professionLabel}`} onClose={() => setReviewing(null)}>
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ color: t.textMuted, fontSize: 13.5, lineHeight: 1.6 }}>
              {reviewing.licensingBody} · license <b style={{ color: t.text }}>{reviewing.licenseNumber}</b>.
              Open the document and check the name, the number and the expiry against what was typed.
            </div>
            <a href={`${config.apiBaseUrl}${reviewing.documentUrl}`} target="_blank" rel="noreferrer"
              style={{ color: t.accent, fontWeight: 700, fontSize: 13.5, textDecoration: 'none' }}>
              Open the license document
            </a>
            <Textarea
              placeholder="Note to the professional — required on rejection, optional on approval"
              value={note}
              onChange={setNote}
              rows={3}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Button tone="danger" disabled={deciding} onClick={() => decide(false)}>Reject with note</Button>
              <Button disabled={deciding} onClick={() => decide(true)}>Approve — badge goes live</Button>
            </div>
          </div>
        </Modal>
      ) : null}

      <Toasts toasts={toasts} />
    </div>
  );
}
