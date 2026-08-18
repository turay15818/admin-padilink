/**
 * Getting the numbers out.
 *
 * A CSV per subject, with a date range. Deliberately plain: the useful export is the one
 * somebody can open in a spreadsheet and pivot themselves, not a chart on a screen they
 * cannot take to a meeting.
 *
 * Every download is written to the audit trail as a sensitive action, whether or not the
 * file carries personal data — "who took the spreadsheet home" is the question that gets
 * asked afterwards, and the screen says so before anyone clicks.
 */
import { useEffect, useState } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import {
  Button, Card, ErrorNote, Field, Input, Loading, PageHeader, Pill, Toasts, useToasts,
} from '../components/ui';
import { adminApi, type ExportKind } from '../api/admin';

export function Reports() {
  const { t } = useTheme();
  const { toasts, push } = useToasts();
  const [kinds, setKinds] = useState<ExportKind[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    adminApi.exportKinds()
      .then(result => { setKinds(result.kinds); setError(null); })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load exports.'));
  }, []);

  if (error) return <ErrorNote message={error} />;
  if (!kinds) return <Loading />;

  const download = (kind: ExportKind) => {
    setBusy(kind.key);
    adminApi.downloadExport(kind.key, { from: from || undefined, to: to || undefined })
      .then(result => push(`${result.name} downloaded.`))
      .catch((caught: unknown) => push(caught instanceof Error ? caught.message : 'That export failed.', 'error'))
      .finally(() => setBusy(null));
  };

  const windowed = Boolean(from || to);

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Take the numbers away as a spreadsheet — every column, no rounding, nothing summarised for you."
      />

      <Card>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: t.text, marginBottom: 4 }}>
          How far back
        </div>
        <p style={{ fontSize: 12.5, color: t.textMuted, margin: '0 0 12px', lineHeight: 1.6 }}>
          Leave both empty for everything. The dates are inclusive — “to the 5th” includes the
          whole of the 5th.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', maxWidth: 460 }}>
          <div style={{ flex: '1 1 180px' }}>
            <Field label="From">
              <Input value={from} onChange={setFrom} placeholder="2026-01-01" />
            </Field>
          </div>
          <div style={{ flex: '1 1 180px' }}>
            <Field label="To">
              <Input value={to} onChange={setTo} placeholder="2026-08-13" />
            </Field>
          </div>
        </div>
        {windowed ? (
          <Button size="sm" tone="subtle" onClick={() => { setFrom(''); setTo(''); }}>
            Clear the dates
          </Button>
        ) : null}
      </Card>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
        gap: 14, marginTop: 14, alignItems: 'start',
      }}>
        {kinds.map(kind => (
          <Card key={kind.key}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 5 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: t.text }}>{kind.label}</span>
              {kind.personal ? <Pill tone="warning">personal data</Pill> : null}
            </div>
            <p style={{ fontSize: 12.5, color: t.textMuted, margin: '0 0 12px', lineHeight: 1.65, minHeight: 40 }}>
              {kind.description}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Button
                tone="primary"
                size="sm"
                disabled={busy === kind.key}
                onClick={() => download(kind)}
              >
                {busy === kind.key ? 'Building…' : 'Download CSV'}
              </Button>
              <span style={{ fontSize: 12, color: t.textSubtle }}>
                {windowed
                  ? `${kind.estimatedRows.toLocaleString()} rows in total, fewer in that window`
                  : `${kind.estimatedRows.toLocaleString()} rows`}
              </span>
            </div>
          </Card>
        ))}
      </div>

      <div style={{
        background: t.surfaceMuted, borderRadius: 11, padding: '13px 15px', marginTop: 14,
        fontSize: 12.5, color: t.textMuted, lineHeight: 1.65,
      }}>
        <strong style={{ color: t.text }}>Every download is recorded</strong> — who took it, which
        export, how many rows, and when. That applies to all of them, not only the ones marked as
        carrying personal data. Files open cleanly in Excel and Numbers, and a name that begins with
        an equals sign is written so a spreadsheet treats it as text rather than as a formula.
      </div>

      <Toasts toasts={toasts} />
    </>
  );
}
