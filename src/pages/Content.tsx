/**
 * What people have posted: job adverts and classified listings.
 *
 * The screen exists for one decision — does this stay up? — so everything on a row is there
 * to help make it: what it says, who wrote it, how many people have complained, and whether
 * it has been taken down before.
 *
 * Taking something down is not deleting it. The row stays, the reason stays, and the person
 * who posted it is told in the moderator's own words. That is what makes a mistake fixable
 * and a decision explainable; a delete would achieve the same disappearance and neither.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTheme } from '../theme/ThemeProvider';
import {
  Button, Card, Cell, EmptyState, ErrorNote, Field, Input, Loading, Modal, PageHeader,
  Pill, Row, Table, Textarea, Toasts, fmtDate, timeAgo, useToasts,
} from '../components/ui';
import { Pager, Tallies, useOpsQuery } from '../components/Ops';
import { adminApi, type AdminIdentity, type ContentPage, type ContentRow } from '../api/admin';

export function Content({ identity }: { identity: AdminIdentity }) {
  const { t } = useTheme();
  const { toasts, push } = useToasts();
  const [params, setParams] = useSearchParams();
  const kind = params.get('kind') === 'listing' ? 'listing' : 'job';
  const [page, setPage] = useState<ContentPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<ContentRow | null>(null);
  const { query, set } = useOpsQuery();

  const load = useCallback(() => {
    adminApi.content(kind, query)
      .then(result => { setPage(result); setError(null); })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load this.'));
  }, [kind, query]);

  useEffect(() => {
    const timer = setTimeout(load, 240);
    return () => clearTimeout(timer);
  }, [load]);

  // A report links straight here with the thing it is about — so open that one for them
  // rather than making them find it in a list they have just been sent to.
  const wanted = params.get('id');
  useEffect(() => {
    if (!wanted || !page) return;
    const found = page.items.find(item => item.id === wanted);
    if (found) {
      setActing(found);
      setParams(current => {
        const next = new URLSearchParams(current);
        next.delete('id');
        return next;
      }, { replace: true });
    }
  }, [wanted, page, setParams]);

  if (error) return <ErrorNote message={error} />;

  const noun = kind === 'job' ? 'job posts' : 'listings';

  return (
    <>
      <PageHeader
        title="Posted content"
        subtitle="Job adverts and classified listings, every state included — so you can answer “why did this disappear?”"
      />

      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {(['job', 'listing'] as const).map(option => (
          <button
            key={option}
            type="button"
            onClick={() => {
              setParams(current => {
                const next = new URLSearchParams(current);
                next.set('kind', option);
                next.delete('id');
                return next;
              });
              set({ pageIndex: 1, bucket: '', search: '' });
            }}
            style={{
              background: kind === option ? t.brand : 'transparent',
              border: `1px solid ${kind === option ? t.brand : t.border}`,
              color: kind === option ? '#FFFFFF' : t.textMuted,
              borderRadius: 10, padding: '8px 15px', fontSize: 13, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {option === 'job' ? 'Job posts' : 'Classified listings'}
          </button>
        ))}
      </div>

      {!page ? <Loading /> : (
        <>
          <Tallies
            items={[
              { label: 'Live', value: page.liveCount, bucket: 'live', tone: 'success' },
              { label: 'Flagged', value: page.flaggedCount, bucket: 'flagged', tone: 'warning' },
              { label: 'Taken down', value: page.removedCount, bucket: 'removed', tone: 'danger' },
              { label: 'Everything else', value: page.otherCount },
            ]}
            active={query.bucket ?? ''}
            onPick={bucket => set({ bucket, pageIndex: 1 })}
          />

          <div style={{ maxWidth: 380, margin: '14px 0 12px' }}>
            <Input
              value={query.search ?? ''}
              onChange={value => set({ search: value, pageIndex: 1 })}
              placeholder="Title, wording, or who posted it…"
            />
          </div>

          <Card pad={0}>
            {page.items.length === 0 ? (
              <div style={{ padding: 34 }}>
                <EmptyState icon="📄" title="Nothing matches that" message="Try another bucket, or a shorter search." />
              </div>
            ) : (
              <Table head={['What was posted', 'Who posted it', 'State', 'Reach', '']}>
                {page.items.map(item => (
                  <Row key={item.id}>
                    <Cell>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: t.text }}>{item.title}</div>
                      {item.summary ? (
                        <div style={{ fontSize: 12, color: t.textSubtle, marginTop: 3, maxWidth: 400, lineHeight: 1.5 }}>
                          {item.summary}
                        </div>
                      ) : null}
                      <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 3 }}>
                        {[
                          item.category,
                          item.amount === null ? null : `${item.currencyCode} ${item.amount.toLocaleString()}`,
                          [item.city, item.province].filter(Boolean).join(', ') || null,
                          timeAgo(item.dateCreated),
                        ].filter(Boolean).join(' · ')}
                      </div>
                    </Cell>
                    <Cell>
                      <Link to={`/users/${item.ownerUserId}`} style={{ fontSize: 13, color: t.text, fontWeight: 700, textDecoration: 'none' }}>
                        {item.ownerName}
                      </Link>
                      <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 2 }}>{item.ownerEmail ?? '—'}</div>
                    </Cell>
                    <Cell>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        <Pill tone={item.removed ? 'danger' : item.statusName === 'Live' || item.statusName === 'Open' ? 'success' : 'neutral'}>
                          {item.statusName}
                        </Pill>
                        {item.openReportCount > 0 ? (
                          <Pill tone="warning">
                            {item.openReportCount} {item.openReportCount === 1 ? 'complaint' : 'complaints'}
                          </Pill>
                        ) : null}
                      </div>
                      {item.removed && item.removedByName ? (
                        <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 3 }}>
                          by {item.removedByName}{item.removedAt ? ` · ${fmtDate(item.removedAt)}` : ''}
                        </div>
                      ) : null}
                    </Cell>
                    <Cell>
                      <div style={{ fontSize: 12.5, color: t.text }}>{item.viewCount.toLocaleString()} views</div>
                      {item.kind === 'job' ? (
                        <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 2 }}>
                          {item.responseCount} {item.responseCount === 1 ? 'applicant' : 'applicants'}
                        </div>
                      ) : null}
                    </Cell>
                    <Cell style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <Button
                        size="sm"
                        tone={item.removed ? 'subtle' : 'danger'}
                        disabled={!identity.canManageContent}
                        title={identity.canManageContent ? undefined : 'You cannot moderate content'}
                        onClick={() => setActing(item)}
                      >
                        {item.removed ? 'Put back' : 'Take down'}
                      </Button>
                    </Cell>
                  </Row>
                ))}
              </Table>
            )}
          </Card>

          <Pager
            page={page}
            noun={noun}
            onPick={pageIndex => set({ pageIndex })}
            onSize={pageSize => set({ pageSize, pageIndex: 1 })}
          />
        </>
      )}

      {acting ? (
        <TakedownDialog
          item={acting}
          onClose={() => setActing(null)}
          onDone={message => { push(message); load(); }}
        />
      ) : null}

      <Toasts toasts={toasts} />
    </>
  );
}

/* ---------------- taking it down, or putting it back ---------------- */

function TakedownDialog({ item, onClose, onDone }: {
  item: ContentRow;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { t } = useTheme();
  const [reason, setReason] = useState('');
  const [silent, setSilent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const putting = item.removed;
  const ready = putting || reason.trim().length >= 6;

  const submit = () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    adminApi.takedown(item.kind, item.id, {
      removed: !putting,
      reason: putting ? null : reason.trim(),
      silent,
    })
      .then(result => {
        onDone(putting ? `“${result.title}” is back.` : `“${result.title}” is down.`);
        onClose();
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'That did not work.'))
      .finally(() => setBusy(false));
  };

  return (
    <Modal
      title={putting ? `Put “${item.title}” back` : `Take “${item.title}” down`}
      onClose={onClose}
      width={520}
    >
      {putting ? (
        <>
          <p style={{ color: t.textMuted, fontSize: 13, lineHeight: 1.65, marginTop: 0 }}>
            It becomes visible again straight away and the person who posted it is told it is
            back. The reason it came down stays on the audit trail.
          </p>
          {item.removedReason ? (
            <div style={{
              background: t.surfaceMuted, borderRadius: 10, padding: '11px 13px', margin: '0 0 14px',
              fontSize: 12.5, color: t.textMuted, lineHeight: 1.6,
            }}>
              <strong style={{ color: t.text }}>It was taken down because:</strong> {item.removedReason}
              {item.removedByName ? ` — ${item.removedByName}` : ''}
            </div>
          ) : null}
        </>
      ) : (
        <>
          <p style={{ color: t.textMuted, fontSize: 13, lineHeight: 1.65, marginTop: 0 }}>
            It stops showing everywhere immediately. Nothing is deleted — the post, its history
            and your reason all stay, so this can be undone and explained.
          </p>

          {item.openReportCount > 0 ? (
            <div style={{
              background: t.warningSoft, border: `1px solid ${t.warning}`, borderRadius: 10,
              padding: '10px 12px', marginBottom: 14, fontSize: 12.5, color: t.textMuted, lineHeight: 1.6,
            }}>
              <strong style={{ color: t.text }}>
                {item.openReportCount} open {item.openReportCount === 1 ? 'complaint' : 'complaints'}
              </strong>{' '}
              about this. Taking it down does not close them — decide those in Complaints so the
              people who reported it hear back.
            </div>
          ) : null}

          <Field label="Why" hint={`Required. ${item.ownerName} reads this, word for word.`}>
            <Textarea
              value={reason}
              onChange={setReason}
              placeholder="e.g. The same generator is listed in four cities at once."
              rows={3}
            />
          </Field>

          <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', cursor: 'pointer', marginBottom: 14 }}>
            <input
              type="checkbox"
              checked={silent}
              onChange={event => setSilent(event.target.checked)}
              style={{ marginTop: 2, accentColor: t.brand, width: 15, height: 15 }}
            />
            <span>
              <span style={{ fontSize: 13, fontWeight: 700, color: t.text, display: 'block' }}>Do not tell them</span>
              <span style={{ fontSize: 11.5, color: t.textSubtle, lineHeight: 1.5 }}>
                Off by default. A post that vanishes with no explanation becomes a support
                ticket, and usually an angry one. Only use this for obvious spam accounts.
              </span>
            </span>
          </label>
        </>
      )}

      {error ? <div style={{ marginBottom: 12 }}><ErrorNote message={error} /></div> : null}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button tone="subtle" onClick={onClose}>Cancel</Button>
        <Button tone={putting ? 'primary' : 'danger'} disabled={!ready || busy} onClick={submit}>
          {busy ? 'Working…' : putting ? 'Put it back' : 'Take it down'}
        </Button>
      </div>
    </Modal>
  );
}
