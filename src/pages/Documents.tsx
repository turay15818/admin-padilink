/**
 * The document queue: what people have uploaded, and what still needs a human.
 *
 * The decision is the whole point of this screen, so it is built around it — the preview,
 * what the scanner read, and the person's history sit side by side with the two buttons.
 * A rejection cannot be sent without a reason, because the applicant is shown that reason
 * verbatim and "rejected" on its own is a dead end for them.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import {
  Button, Card, EmptyState, ErrorNote, Field, Input, Loading, Modal, PageHeader, Pill,
  Spinner, Textarea, Toasts, useToasts,
} from '../components/ui';
import { Select } from '../components/Select';
import { Pagination } from '../components/Pagination';
import { adminApi, DocumentStatus, type AdminDocument, type DocumentPage } from '../api/admin';
import { config } from '../api/client';

const STATUS_OPTIONS = [
  { value: 'awaiting', label: 'Needs a decision', detail: 'Uploaded but not yet judged' },
  { value: '', label: 'Everything' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'expired', label: 'Expired' },
];

const OWNER_OPTIONS = [
  { value: '', label: 'Anyone' },
  { value: 'user', label: 'Individuals' },
  { value: 'provider', label: 'Providers' },
  { value: 'company', label: 'Companies' },
];

const SORT_OPTIONS = [
  { value: '-created', label: 'Newest first' },
  { value: 'created', label: 'Oldest first — clear the backlog' },
  { value: 'name', label: 'File name (A–Z)' },
];

export function Documents() {
  const { t } = useTheme();
  const { toasts, push } = useToasts();

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState('awaiting');
  const [ownerType, setOwnerType] = useState('');
  const [sort, setSort] = useState('created');
  const [pageIndex, setPageIndex] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [page, setPage] = useState<DocumentPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reviewing, setReviewing] = useState<AdminDocument | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => { setDebounced(search.trim()); setPageIndex(1); }, 260);
    return () => window.clearTimeout(timer);
  }, [search]);

  const seq = useRef(0);
  const load = useCallback(() => {
    const mine = ++seq.current;
    setLoading(true);
    adminApi.documents({
      search: debounced || undefined,
      status: status || undefined,
      ownerType: ownerType || undefined,
      sort, pageIndex, pageSize,
    })
      .then(result => { if (mine === seq.current) { setPage(result); setError(null); } })
      .catch((caught: unknown) => {
        if (mine === seq.current) setError(caught instanceof Error ? caught.message : 'Could not load the queue.');
      })
      .finally(() => { if (mine === seq.current) setLoading(false); });
  }, [debounced, status, ownerType, sort, pageIndex, pageSize]);
  useEffect(load, [load]);

  return (
    <>
      <PageHeader
        title="Documents"
        subtitle="What people have uploaded to prove who they are. Every decision is recorded, and the person is told the outcome."
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 11, marginBottom: 15 }}>
        <Tally label="Needs a decision" value={page?.awaitingCount ?? null} tone="warning" onClick={() => { setStatus('awaiting'); setPageIndex(1); }} />
        <Tally label="Approved" value={page?.approvedCount ?? null} tone="success" onClick={() => { setStatus('approved'); setPageIndex(1); }} />
        <Tally label="Rejected" value={page?.rejectedCount ?? null} tone="danger" onClick={() => { setStatus('rejected'); setPageIndex(1); }} />
        <Tally label="On this list" value={page?.totalCount ?? null} />
      </div>

      <Card pad={0}>
        <div style={{
          display: 'flex', gap: 9, padding: '13px 14px', flexWrap: 'wrap', alignItems: 'center',
          borderBottom: `1px solid ${t.border}`,
        }}>
          <div style={{ flex: 1, minWidth: 210, position: 'relative' }}>
            <Input value={search} onChange={setSearch} placeholder="Search by person, email or file name…" />
            {loading ? (
              <span style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)' }}><Spinner size={14} /></span>
            ) : null}
          </div>
          <Select width={196} value={status} onChange={value => { setStatus(value); setPageIndex(1); }} options={STATUS_OPTIONS} />
          <Select width={150} value={ownerType} onChange={value => { setOwnerType(value); setPageIndex(1); }} options={OWNER_OPTIONS} />
          <Select width={210} align="right" value={sort} onChange={setSort} options={SORT_OPTIONS} />
        </div>

        <div style={{ padding: '4px 14px 14px' }}>
          {error ? <div style={{ padding: 14 }}><ErrorNote message={error} /></div>
            : !page ? <Loading />
            : page.items.length === 0 ? (
              <EmptyState
                icon="✓"
                title={status === 'awaiting' ? 'Nothing waiting' : 'Nothing here'}
                message={status === 'awaiting'
                  ? 'Every upload has been decided. This is what an empty queue looks like.'
                  : 'Try a different filter.'}
              />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                  <thead>
                    <tr>
                      {['Person', 'Document', 'Uploaded', 'Status', ''].map((head, index) => (
                        <th key={head || index} style={{
                          textAlign: 'left', padding: '9px 10px', fontSize: 11, fontWeight: 800,
                          letterSpacing: 0.7, color: t.textSubtle, textTransform: 'uppercase',
                          borderBottom: `1px solid ${t.border}`, whiteSpace: 'nowrap',
                        }}>{head}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {page.items.map(document => (
                      <tr key={document.id} style={{ borderBottom: `1px solid ${t.border}` }}>
                        <td style={{ padding: '11px 10px' }}>
                          <div style={{ fontWeight: 700, color: t.text }}>{document.ownerName}</div>
                          <div style={{ fontSize: 12, color: t.textSubtle }}>
                            {document.ownerEmail ?? 'No email'}
                            {document.ownerIsProvider ? ' · Provider' : ''}
                          </div>
                        </td>
                        <td style={{ padding: '11px 10px' }}>
                          <div style={{ color: t.text }}>{document.documentTypeName}</div>
                          <div style={{ fontSize: 12, color: t.textSubtle }}>
                            {document.fileName} · {formatSize(document.fileSize)}
                          </div>
                        </td>
                        <td style={{ padding: '11px 10px', color: t.textMuted, whiteSpace: 'nowrap', fontSize: 12.5 }}>
                          {new Date(document.dateCreated).toLocaleDateString()}
                          <div style={{ fontSize: 11.5, color: t.textSubtle }}>{waitedFor(document)}</div>
                        </td>
                        <td style={{ padding: '11px 10px', whiteSpace: 'nowrap' }}>
                          <StatusPill document={document} />
                        </td>
                        <td style={{ padding: '11px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <Button
                            size="sm"
                            tone={isAwaiting(document) ? 'primary' : 'subtle'}
                            onClick={() => setReviewing(document)}
                          >
                            {isAwaiting(document) ? 'Review' : 'Open'}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

          {page && page.items.length > 0 ? (
            <Pagination
              pageIndex={page.pageIndex} pageSize={page.pageSize} totalCount={page.totalCount}
              onPage={setPageIndex} onPageSize={size => { setPageSize(size); setPageIndex(1); }}
              noun="document"
            />
          ) : null}
        </div>
      </Card>

      {reviewing ? (
        <ReviewDialog
          document={reviewing}
          onClose={() => setReviewing(null)}
          onDone={message => { push(message); setReviewing(null); load(); }}
          onError={message => push(message, 'error')}
        />
      ) : null}

      <Toasts toasts={toasts} />
    </>
  );
}

/* ---------- the decision ---------- */

function ReviewDialog({ document, onClose, onDone, onError }: {
  document: AdminDocument;
  onClose: () => void;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const { t } = useTheme();
  const [reason, setReason] = useState('');
  const [alsoVerify, setAlsoVerify] = useState(false);
  const [silent, setSilent] = useState(false);
  const [busy, setBusy] = useState(false);
  const decided = !isAwaiting(document);

  const decide = (approved: boolean) => {
    if (!approved && reason.trim().length < 6) {
      onError('Say why it was rejected — the person is shown exactly these words.');
      return;
    }
    setBusy(true);
    adminApi.decideDocument(document.id, {
      approved,
      reason: reason.trim() || null,
      alsoVerifyProvider: approved && alsoVerify,
      silent,
    })
      .then(() => onDone(approved
        ? `Approved. ${silent ? 'Nobody was told.' : `${document.ownerName} has been told.`}`
        : `Rejected. ${silent ? 'Nobody was told.' : `${document.ownerName} has been told why.`}`))
      .catch((caught: unknown) => onError(caught instanceof Error ? caught.message : 'That did not work.'))
      .finally(() => setBusy(false));
  };

  const fileUrl = document.fileUrl.startsWith('http')
    ? document.fileUrl
    : `${config.apiBaseUrl}${document.fileUrl}`;
  const isImage = document.contentType.startsWith('image/');

  return (
    <Modal title={`${document.documentTypeName} — ${document.ownerName}`} onClose={onClose} width={720}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,260px)', gap: 16 }}>
        {/* ---- the document itself ---- */}
        <div>
          <div style={{
            border: `1px solid ${t.border}`, borderRadius: 12, overflow: 'hidden',
            background: t.surfaceMuted, minHeight: 240, display: 'grid', placeItems: 'center',
          }}>
            {isImage ? (
              <img src={fileUrl} alt={document.fileName} style={{ maxWidth: '100%', maxHeight: 340, display: 'block' }} />
            ) : (
              <div style={{ textAlign: 'center', padding: 30 }}>
                <div style={{ fontSize: 34, marginBottom: 8 }}>📄</div>
                <div style={{ fontSize: 13, color: t.textMuted, wordBreak: 'break-all' }}>{document.fileName}</div>
                <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 4 }}>
                  {document.contentType} · {formatSize(document.fileSize)}
                </div>
              </div>
            )}
          </div>
          <div style={{ marginTop: 8 }}>
            <a
              href={fileUrl}
              target="_blank"
              rel="noreferrer noopener"
              style={{ fontSize: 12.5, color: t.brand, fontWeight: 700, textDecoration: 'none' }}
            >
              Open the original ↗
            </a>
          </div>
        </div>

        {/* ---- what we already know ---- */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Panel title="The person">
            <Line label="Name" value={document.ownerName} />
            <Line label="Email" value={document.ownerEmail ?? '—'} />
            <Line label="Uploads" value={`${document.ownerApprovedCount} of ${document.ownerDocumentCount} approved`} />
            {document.ownerIsProvider ? (
              <Line label="Provider" value={document.providerVerificationStatus ?? 'Yes'} />
            ) : null}
          </Panel>

          {document.extractedFullName || document.extractedDocumentNumber || document.confidenceScore !== null ? (
            <Panel title="What the scanner read">
              {document.extractedFullName ? <Line label="Name" value={document.extractedFullName} /> : null}
              {document.extractedDocumentNumber ? <Line label="Number" value={document.extractedDocumentNumber} /> : null}
              {document.extractedDateOfBirth ? <Line label="Born" value={new Date(document.extractedDateOfBirth).toLocaleDateString()} /> : null}
              {document.extractedExpiryDate ? <Line label="Expires" value={new Date(document.extractedExpiryDate).toLocaleDateString()} /> : null}
              {document.confidenceScore !== null ? <Line label="Confidence" value={`${Math.round(document.confidenceScore)}%`} /> : null}
              {document.scanIsExpired ? (
                <div style={{ marginTop: 6 }}><Pill tone="danger">Expired document</Pill></div>
              ) : null}
              {document.scanIsReadable === false ? (
                <div style={{ marginTop: 6 }}><Pill tone="warning">Hard to read</Pill></div>
              ) : null}
            </Panel>
          ) : (
            <Panel title="What the scanner read">
              <div style={{ fontSize: 12.5, color: t.textSubtle, lineHeight: 1.55 }}>
                Nothing — this one has not been scanned. Read it yourself before deciding.
              </div>
            </Panel>
          )}

          {decided ? (
            <Panel title="Already decided">
              <Line label="Outcome" value={document.statusName} />
              {document.decidedBy ? <Line label="By" value={document.decidedBy} /> : null}
              {document.dateUpdated ? <Line label="When" value={new Date(document.dateUpdated).toLocaleString()} /> : null}
              {document.rejectionReason ? (
                <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 6, lineHeight: 1.55 }}>
                  “{document.rejectionReason}”
                </div>
              ) : null}
            </Panel>
          ) : null}
        </div>
      </div>

      {/* ---- the decision ---- */}
      <div style={{ borderTop: `1px solid ${t.border}`, marginTop: 16, paddingTop: 14 }}>
        <Field
          label={decided ? 'Change the outcome — say why' : 'Reason'}
          hint="Required to reject. The person is shown these words exactly, so tell them what to fix."
        >
          <Textarea
            value={reason}
            onChange={setReason}
            rows={2}
            placeholder="e.g. The photo page is cut off — upload the whole page in one image."
          />
        </Field>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
          {document.ownerIsProvider ? (
            <Check
              checked={alsoVerify}
              onChange={setAlsoVerify}
              label="Also verify this provider"
              hint="Only for identity documents — an approved utility bill is not an identity check."
            />
          ) : null}
          <Check
            checked={silent}
            onChange={setSilent}
            label="Do not tell them"
            hint="No email, no notification. The trail still records it."
          />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Button tone="subtle" onClick={onClose}>Close</Button>
          <Button tone="danger" disabled={busy} onClick={() => decide(false)}>
            {busy ? 'Working…' : 'Reject'}
          </Button>
          <Button tone="primary" disabled={busy} onClick={() => decide(true)}>
            {busy ? 'Working…' : 'Approve'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- pieces ---------- */

function isAwaiting(document: AdminDocument) {
  return document.status === DocumentStatus.Pending
    || document.status === DocumentStatus.Scanning
    || document.status === DocumentStatus.Scanned;
}

function StatusPill({ document }: { document: AdminDocument }) {
  if (document.status === DocumentStatus.Approved) return <Pill tone="success">Approved</Pill>;
  if (document.status === DocumentStatus.Rejected) return <Pill tone="danger">Rejected</Pill>;
  if (document.status === DocumentStatus.Expired) return <Pill tone="warning">Expired</Pill>;
  return <Pill tone="info">{document.statusName}</Pill>;
}

function waitedFor(document: AdminDocument) {
  if (!isAwaiting(document)) return document.statusName;
  const days = Math.floor((Date.now() - new Date(document.dateCreated).getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Waiting 1 day';
  return `Waiting ${days} days`;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  const { t } = useTheme();
  return (
    <div style={{ background: t.surfaceMuted, border: `1px solid ${t.border}`, borderRadius: 11, padding: '11px 13px' }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.8, color: t.textSubtle, textTransform: 'uppercase', marginBottom: 7 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  const { t } = useTheme();
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 12.5, marginBottom: 3 }}>
      <span style={{ color: t.textSubtle, minWidth: 66 }}>{label}</span>
      <span style={{ color: t.text, fontWeight: 600, wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
}

function Check({ checked, onChange, label, hint }: {
  checked: boolean; onChange: (value: boolean) => void; label: string; hint?: string;
}) {
  const { t } = useTheme();
  return (
    <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', cursor: 'pointer', maxWidth: 320 }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={event => onChange(event.target.checked)}
        style={{ marginTop: 2, accentColor: t.brand, width: 15, height: 15 }}
      />
      <span>
        <span style={{ fontSize: 13, fontWeight: 700, color: t.text, display: 'block' }}>{label}</span>
        {hint ? <span style={{ fontSize: 11.5, color: t.textSubtle, lineHeight: 1.5 }}>{hint}</span> : null}
      </span>
    </label>
  );
}

function Tally({ label, value, tone, onClick }: {
  label: string; value: number | null; tone?: 'success' | 'warning' | 'danger'; onClick?: () => void;
}) {
  const { t } = useTheme();
  const colour = tone === 'success' ? t.success : tone === 'warning' ? t.warning : tone === 'danger' ? t.danger : t.text;
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      style={{
        background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, padding: '11px 14px',
        textAlign: 'left', fontFamily: 'inherit', cursor: onClick ? 'pointer' : 'default', width: '100%',
      }}
    >
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.8, color: t.textSubtle, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: colour, marginTop: 2 }}>
        {value === null ? '—' : value.toLocaleString()}
      </div>
    </button>
  );
}
