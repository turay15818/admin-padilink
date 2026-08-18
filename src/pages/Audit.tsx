/**
 * The audit trail — the screen that makes the rest of the console trustworthy.
 *
 * Refused attempts are rendered as loudly as successful ones: a console that only shows
 * what worked hides exactly the events a reviewer is looking for.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTheme } from '../theme/ThemeProvider';
import {
  Button, Card, ErrorNote, EmptyState, Input, Loading, Modal, PageHeader, Pill, fmtDateTime, timeAgo,
} from '../components/ui';
import { mono } from '../theme/theme';
import { adminApi, type AuditEntry, type AuditPage } from '../api/admin';

function severityTone(severity: number, succeeded: boolean) {
  if (!succeeded) return 'danger' as const;
  return severity === 3 ? 'warning' as const : severity === 2 ? 'info' as const : 'neutral' as const;
}

/** One line of trail — used here and on the overview. */
export function AuditRowLine({ entry, when, onClick }: { entry: AuditEntry; when: string; onClick?: () => void }) {
  const { t } = useTheme();
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 0',
        borderBottom: `1px solid ${t.border}`, cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <span style={{
        width: 7, height: 7, borderRadius: '50%', marginTop: 6, flexShrink: 0,
        background: !entry.succeeded ? t.danger : entry.severity === 3 ? t.warning : t.textSubtle,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: t.text, fontWeight: 600, lineHeight: 1.45 }}>
          {entry.summary}
          {!entry.succeeded ? <span style={{ color: t.danger, fontWeight: 800 }}> · refused</span> : null}
        </div>
        <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 2 }}>
          {entry.actorName} · {when}
        </div>
      </div>
    </div>
  );
}

function Detail({ entry, onClose }: { entry: AuditEntry; onClose: () => void }) {
  const { t } = useTheme();
  let changes: { before?: unknown; after?: unknown } | null = null;
  try {
    changes = entry.changesJson ? JSON.parse(entry.changesJson) : null;
  } catch {
    changes = null;
  }

  const line = (label: string, value: string) => (
    <div style={{ display: 'flex', gap: 12, padding: '7px 0', borderBottom: `1px solid ${t.border}` }}>
      <div style={{ width: 118, flexShrink: 0, fontSize: 12, fontWeight: 700, color: t.textSubtle }}>{label}</div>
      <div style={{ fontSize: 13, color: t.text, wordBreak: 'break-word' }}>{value}</div>
    </div>
  );

  return (
    <Modal title={entry.actionLabel} onClose={onClose} width={560}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <Pill tone={severityTone(entry.severity, entry.succeeded)}>
          {entry.succeeded ? entry.severityLabel : 'Refused'}
        </Pill>
        <Pill tone="neutral">{entry.entityType}</Pill>
      </div>

      <div style={{ fontSize: 14.5, fontWeight: 700, color: t.text, marginBottom: 12, lineHeight: 1.5 }}>{entry.summary}</div>

      {line('When', fmtDateTime(entry.at))}
      {line('Administrator', `${entry.actorName}${entry.actorEmail ? ` · ${entry.actorEmail}` : ''}`)}
      {entry.entityLabel ? line('Target', entry.entityLabel) : null}
      {entry.reason ? line('Reason given', entry.reason) : null}
      {entry.failureReason ? line('Refused because', entry.failureReason) : null}
      {line('From', entry.ipAddress ?? 'unknown address')}
      {entry.userAgent ? line('Client', entry.userAgent) : null}
      {entry.entityId ? line('Record id', entry.entityId) : null}

      {changes && (changes.before || changes.after) ? (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: t.textSubtle, letterSpacing: 0.6, marginBottom: 8 }}>
            WHAT CHANGED
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {(['before', 'after'] as const).map(side => (
              <div key={side}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: side === 'before' ? t.textSubtle : t.success, marginBottom: 4 }}>
                  {side === 'before' ? 'Before' : 'After'}
                </div>
                <pre style={{
                  margin: 0, padding: 10, borderRadius: 9, background: t.surfaceMuted,
                  border: `1px solid ${t.border}`, color: t.text, fontFamily: mono, fontSize: 11.5,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {changes[side] === undefined || changes[side] === null
                    ? '—'
                    : JSON.stringify(changes[side], null, 1)}
                </pre>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

export function Audit() {
  const { t } = useTheme();
  const [params, setParams] = useSearchParams();
  const entityId = params.get('entityId') ?? '';

  const [page, setPage] = useState<AuditPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');
  const [severity, setSeverity] = useState('');
  const [failedOnly, setFailedOnly] = useState(false);
  const [pageIndex, setPageIndex] = useState(1);
  const [open, setOpen] = useState<AuditEntry | null>(null);

  const load = useCallback(() => {
    setBusy(true);
    adminApi.audit({
      search: search || undefined,
      action: action || undefined,
      severity: severity ? Number(severity) : undefined,
      entityId: entityId || undefined,
      pageIndex,
      pageSize: 50,
    })
      .then(result => { setPage(result); setError(null); })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load the trail.'))
      .finally(() => setBusy(false));
  }, [search, action, severity, entityId, pageIndex]);

  useEffect(() => {
    const timer = window.setTimeout(load, 220);
    return () => window.clearTimeout(timer);
  }, [load]);

  // Refused-attempt filtering is client side: it is a view of the page, not a query the
  // server needs to know about.
  const rows = useMemo(
    () => (page?.items ?? []).filter(entry => !failedOnly || !entry.succeeded),
    [page, failedOnly],
  );

  const totalPages = page ? Math.max(1, Math.ceil(page.totalCount / page.pageSize)) : 1;

  return (
    <>
      <PageHeader
        title="Audit trail"
        subtitle="Every administrator action, including the ones that were refused. Append-only — nothing here can be edited."
        action={
          entityId ? (
            <Button tone="subtle" onClick={() => { setParams({}); setPageIndex(1); }}>
              Clear record filter
            </Button>
          ) : undefined
        }
      />

      <Card pad={14} style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 2, minWidth: 220 }}>
            <Input
              value={search}
              onChange={value => { setSearch(value); setPageIndex(1); }}
              placeholder="Search summaries, people, reasons…"
            />
          </div>
          <select
            value={action}
            onChange={event => { setAction(event.target.value); setPageIndex(1); }}
            style={{
              padding: '10px 12px', borderRadius: 10, border: `1px solid ${t.borderStrong}`,
              background: t.surfaceMuted, color: t.text, fontSize: 13.5, fontFamily: 'inherit', minWidth: 170,
            }}
          >
            <option value="">All actions</option>
            {(page?.knownActions ?? []).map(name => <option key={name} value={name}>{name}</option>)}
          </select>
          <select
            value={severity}
            onChange={event => { setSeverity(event.target.value); setPageIndex(1); }}
            style={{
              padding: '10px 12px', borderRadius: 10, border: `1px solid ${t.borderStrong}`,
              background: t.surfaceMuted, color: t.text, fontSize: 13.5, fontFamily: 'inherit',
            }}
          >
            <option value="">Any severity</option>
            <option value="3">Sensitive</option>
            <option value="2">Notable</option>
            <option value="1">Info</option>
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: t.text, cursor: 'pointer' }}>
            <input type="checkbox" checked={failedOnly} onChange={event => setFailedOnly(event.target.checked)} />
            Refused only
          </label>
        </div>
      </Card>

      {error ? <ErrorNote message={error} /> : null}

      <Card pad={0}>
        {!page && busy ? <Loading /> : rows.length === 0 ? (
          <EmptyState icon="🛡" title="Nothing matches" message="No administrator action fits those filters yet." />
        ) : (
          <div style={{ padding: '4px 18px 10px' }}>
            {rows.map(entry => (
              <AuditRowLine
                key={entry.id}
                entry={entry}
                when={`${timeAgo(entry.at)} · ${fmtDateTime(entry.at)}`}
                onClick={() => setOpen(entry)}
              />
            ))}
          </div>
        )}
      </Card>

      {page && page.totalCount > page.pageSize ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, justifyContent: 'center' }}>
          <Button size="sm" tone="subtle" disabled={pageIndex <= 1 || busy} onClick={() => setPageIndex(index => index - 1)}>← Newer</Button>
          <span style={{ fontSize: 12.5, color: t.textMuted }}>
            Page {page.pageIndex} of {totalPages} · {page.totalCount} entries
          </span>
          <Button size="sm" tone="subtle" disabled={pageIndex >= totalPages || busy} onClick={() => setPageIndex(index => index + 1)}>Older →</Button>
        </div>
      ) : null}

      {open ? <Detail entry={open} onClose={() => setOpen(null)} /> : null}
    </>
  );
}
