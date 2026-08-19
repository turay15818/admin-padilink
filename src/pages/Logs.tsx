/**
 * Logs.
 *
 * Serilog was writing to the console, which on a deployed server means the last few thousand
 * lines exist until the process restarts and then do not. This is the same information, kept,
 * and answerable.
 *
 * The endpoint table is ranked by total time - requests multiplied by median - rather than by
 * the slowest single request. That ordering is the opinion this screen has: an endpoint taking
 * 90 ms called ten thousand times costs more than one taking four seconds called twice, and
 * only one of those is worth spending an afternoon on. Sorting by the worst request would put
 * the four-second one at the top every time and quietly waste the afternoon.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  adminApi, type ClientErrorRow, type LogDetail, type LogOverview, type LogPage, type LogRow,
} from '../api/admin';
import { useTheme } from '../theme/ThemeProvider';
import {
  Button, Card, EmptyState, ErrorNote, Input, Loading, Modal, PageHeader, Pill, fmtDateTime, timeAgo,
} from '../components/ui';

const LEVELS = ['Info', 'Warning', 'Error'];

function levelTone(level: number): 'success' | 'warning' | 'danger' {
  return level >= 2 ? 'danger' : level === 1 ? 'warning' : 'success';
}

function ms(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${value}ms`;
}

export function Logs() {
  const { t } = useTheme();
  const [tab, setTab] = useState<'requests' | 'crashes'>('requests');

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="Logs"
        subtitle="Every request the API served, and every crash the app and website reported. Quote a correlation id to pull one request apart."
      />
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['requests', 'crashes'] as const).map(key => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              border: `1px solid ${tab === key ? t.brand : t.borderStrong}`,
              background: tab === key ? t.brand : t.surface,
              color: tab === key ? t.brandText : t.text,
              borderRadius: 10, padding: '8px 16px', fontSize: 13, fontWeight: 700,
              fontFamily: 'inherit', cursor: 'pointer',
            }}>
            {key === 'requests' ? 'API requests' : 'App & web crashes'}
          </button>
        ))}
      </div>
      {tab === 'requests' ? <RequestLogs /> : <Crashes />}
    </div>
  );
}

function RequestLogs() {
  const { t } = useTheme();
  const [hours, setHours] = useState(24);
  const [overview, setOverview] = useState<LogOverview | null>(null);
  const [page, setPage] = useState<LogPage | null>(null);
  const [pageIndex, setPageIndex] = useState(1);
  const [search, setSearch] = useState('');
  const [correlationId, setCorrelationId] = useState('');
  const [minLevel, setMinLevel] = useState<number | undefined>(undefined);
  const [slowOnly, setSlowOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LogDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    try { setOverview(await adminApi.logOverview(hours)); }
    catch { /* the table below still works without the summary */ }
  }, [hours]);

  const loadPage = useCallback(async () => {
    setError(null);
    try {
      setPage(await adminApi.logs({
        search: search.trim() || undefined,
        correlationId: correlationId.trim() || undefined,
        minLevel, slowOnly, hours, pageIndex, pageSize: 50,
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the logs.');
    }
  }, [search, correlationId, minLevel, slowOnly, hours, pageIndex]);

  useEffect(() => { void loadOverview(); }, [loadOverview]);
  useEffect(() => { void loadPage(); }, [loadPage]);

  useEffect(() => {
    if (!openId) { setDetail(null); return; }
    adminApi.logDetail(openId).then(setDetail).catch(() => setDetail(null));
  }, [openId]);

  const peak = useMemo(
    () => Math.max(1, ...(overview?.traffic ?? []).map(point => point.requests)),
    [overview],
  );

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {[1, 6, 24, 24 * 7].map(value => (
          <button
            key={value}
            onClick={() => { setHours(value); setPageIndex(1); }}
            style={{
              border: `1px solid ${hours === value ? t.brand : t.borderStrong}`,
              background: hours === value ? t.brand : t.surface,
              color: hours === value ? t.brandText : t.textMuted,
              borderRadius: 999, padding: '5px 12px', fontSize: 12, fontWeight: 700,
              fontFamily: 'inherit', cursor: 'pointer',
            }}>
            {value === 1 ? 'Last hour' : value === 24 * 7 ? 'Last week' : `Last ${value}h`}
          </button>
        ))}
      </div>

      {overview ? (
        <>
          {overview.droppedRows > 0 ? (
            <div style={{
              border: `1px solid ${t.danger}`, background: t.dangerSoft, color: t.danger,
              borderRadius: 10, padding: '10px 13px', fontSize: 12.5, marginBottom: 12, lineHeight: 1.55,
            }}>
              {overview.droppedRows.toLocaleString()} log rows have been dropped since the API
              last restarted, because the write queue filled up. The figures below are therefore
              incomplete — the API kept serving requests, which is the intended trade, but
              something is producing more log volume than the database is taking.
            </div>
          ) : null}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 14 }}>
            <Stat label="Requests" value={overview.requests.toLocaleString()} />
            <Stat label="Errors" value={overview.errors.toLocaleString()} tone={overview.errors > 0 ? 'danger' : undefined} />
            <Stat label="Error rate" value={`${overview.errorRate}%`} tone={overview.errorRate >= 1 ? 'danger' : undefined} />
            <Stat label="Slow (>1s)" value={overview.slow.toLocaleString()} tone={overview.slow > 0 ? 'warning' : undefined} />
            <Stat label="Median" value={ms(overview.medianMs)} />
            <Stat label="95th percentile" value={ms(overview.p95Ms)} />
          </div>

          {overview.traffic.length > 1 ? (
            <Card pad={14} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: t.textMuted, fontWeight: 700, marginBottom: 10 }}>
                REQUESTS PER HOUR
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 90 }}>
                {overview.traffic.map(point => (
                  <div
                    key={point.hour}
                    title={`${fmtDateTime(point.hour)} — ${point.requests} requests, ${point.errors} errors, ${point.slow} slow`}
                    style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 1 }}>
                    {point.errors > 0 ? (
                      <div style={{ height: `${(point.errors / peak) * 80}px`, background: t.danger, borderRadius: '3px 3px 0 0', minHeight: 2 }} />
                    ) : null}
                    <div style={{ height: `${((point.requests - point.errors) / peak) * 80}px`, background: t.brand, borderRadius: point.errors > 0 ? 0 : '3px 3px 0 0', minHeight: 2 }} />
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {overview.slowestEndpoints.length > 0 ? (
            <Card pad={14} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: t.textMuted, fontWeight: 700, marginBottom: 4 }}>
                WHERE THE TIME GOES
              </div>
              <div style={{ fontSize: 11.5, color: t.textSubtle, marginBottom: 10 }}>
                Ranked by total time — requests multiplied by median — not by the single worst request.
              </div>
              {overview.slowestEndpoints.map(stat => (
                <div key={`${stat.method}-${stat.routeTemplate}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderTop: `1px solid ${t.border}` }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: t.textMuted, width: 46 }}>{stat.method}</span>
                  <span style={{ flex: 1, fontSize: 12.5, color: t.text, fontFamily: 'ui-monospace, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {stat.routeTemplate}
                  </span>
                  <span style={{ fontSize: 12, color: t.textMuted, width: 90, textAlign: 'right' }}>{stat.requests.toLocaleString()} calls</span>
                  <span style={{ fontSize: 12, color: t.textMuted, width: 80, textAlign: 'right' }}>med {ms(stat.medianMs)}</span>
                  <span style={{ fontSize: 12, color: t.textMuted, width: 80, textAlign: 'right' }}>p95 {ms(stat.p95Ms)}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: t.text, width: 90, textAlign: 'right' }}>{ms(stat.totalMs)} total</span>
                  {stat.errors > 0 ? <Pill tone="danger">{stat.errors} err</Pill> : null}
                </div>
              ))}
            </Card>
          ) : null}
        </>
      ) : null}

      <Card pad={14} style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 2, minWidth: 200 }}>
            <Input value={search} onChange={value => { setSearch(value); setPageIndex(1); }} placeholder="Search path or exception…" />
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <Input value={correlationId} onChange={value => { setCorrelationId(value); setPageIndex(1); }} placeholder="Correlation id" />
          </div>
          {[undefined, 1, 2].map(level => (
            <button
              key={String(level)}
              onClick={() => { setMinLevel(level); setPageIndex(1); }}
              style={{
                border: `1px solid ${minLevel === level ? t.brand : t.borderStrong}`,
                background: minLevel === level ? t.brand : t.surface,
                color: minLevel === level ? t.brandText : t.textMuted,
                borderRadius: 8, padding: '7px 12px', fontSize: 12.5, fontWeight: 700,
                fontFamily: 'inherit', cursor: 'pointer',
              }}>
              {level === undefined ? 'Everything' : level === 1 ? 'Warnings up' : 'Errors only'}
            </button>
          ))}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: t.textMuted, fontSize: 12.5 }}>
            <input type="checkbox" checked={slowOnly} onChange={event => { setSlowOnly(event.target.checked); setPageIndex(1); }} />
            Slow only
          </label>
          <Button size="sm" onClick={() => { void loadPage(); void loadOverview(); }}>Refresh</Button>
        </div>
      </Card>

      {error ? <ErrorNote message={error} /> : null}

      {page === null ? <Loading label="Reading the logs…" /> : page.items.length === 0 ? (
        <EmptyState icon="📋" title="Nothing matches" message="No requests in this window match those filters." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {page.items.map(row => <LogLine key={row.id} row={row} onOpen={() => setOpenId(row.id)} />)}
        </div>
      )}

      {page && page.totalPages > 1 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
          <Button size="sm" disabled={pageIndex <= 1} onClick={() => setPageIndex(index => index - 1)}>Previous</Button>
          <span style={{ color: t.textMuted, fontSize: 13 }}>
            Page {page.pageIndex} of {page.totalPages} · {page.totalCount.toLocaleString()} rows
          </span>
          <Button size="sm" disabled={pageIndex >= page.totalPages} onClick={() => setPageIndex(index => index + 1)}>Next</Button>
        </div>
      ) : null}

      {openId ? (
        <Modal title="One request" width={760} onClose={() => setOpenId(null)}>
          {detail === null ? <Loading /> : <Detail detail={detail} onFollow={setCorrelationId} onClose={() => setOpenId(null)} />}
        </Modal>
      ) : null}
    </>
  );
}

function LogLine({ row, onOpen }: { row: LogRow; onOpen: () => void }) {
  const { t } = useTheme();
  return (
    <button
      onClick={onOpen}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
        border: `1px solid ${t.border}`, background: t.surface, borderRadius: 8,
        padding: '8px 11px', cursor: 'pointer', fontFamily: 'inherit',
        borderLeft: `3px solid ${row.level >= 2 ? t.danger : row.level === 1 ? '#C98500' : t.border}`,
      }}>
      <span style={{ fontSize: 11, color: t.textSubtle, width: 62 }}>{timeAgo(row.occurredAt)}</span>
      <span style={{ fontSize: 11, fontWeight: 800, color: t.textMuted, width: 46 }}>{row.method}</span>
      <span style={{
        fontSize: 12, fontWeight: 700, width: 34,
        color: row.statusCode >= 500 ? t.danger : row.statusCode >= 400 ? '#C98500' : t.textMuted,
      }}>{row.statusCode}</span>
      <span style={{ flex: 1, fontSize: 12.5, color: t.text, fontFamily: 'ui-monospace, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {row.path}
        {row.exceptionMessage ? <span style={{ color: t.danger }}> — {row.exceptionMessage}</span> : null}
      </span>
      {row.userName ? <span style={{ fontSize: 11.5, color: t.textSubtle, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.userName}</span> : null}
      <span style={{ fontSize: 12, fontWeight: 700, color: row.isSlow ? '#C98500' : t.textMuted, width: 58, textAlign: 'right' }}>
        {ms(row.durationMs)}
      </span>
    </button>
  );
}

function Detail({ detail, onFollow, onClose }: { detail: LogDetail; onFollow: (id: string) => void; onClose: () => void }) {
  const { t } = useTheme();
  const { row } = detail;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Pill tone={levelTone(row.level)}>{LEVELS[row.level] ?? 'Info'}</Pill>
        <span style={{ fontWeight: 800, color: t.text }}>{row.method} {row.statusCode}</span>
        <span style={{ color: t.textMuted, fontSize: 13 }}>{ms(row.durationMs)}</span>
        <span style={{ color: t.textSubtle, fontSize: 12.5 }}>{fmtDateTime(row.occurredAt)}</span>
      </div>

      <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12.5, color: t.text, wordBreak: 'break-all' }}>{row.path}</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, fontSize: 12.5 }}>
        <Field label="Correlation id" value={row.correlationId} mono />
        <Field label="Route" value={row.routeTemplate ?? '—'} mono />
        <Field label="User" value={row.userName ?? (row.userId ?? 'Not signed in')} />
        <Field label="From" value={row.ipAddress ?? '—'} />
        <Field label="Client" value={detail.userAgent ?? '—'} />
      </div>

      {row.exceptionType ? (
        <div style={{ border: `1px solid ${t.danger}`, background: t.dangerSoft, borderRadius: 10, padding: 12 }}>
          <div style={{ color: t.danger, fontWeight: 800, fontSize: 13 }}>{row.exceptionType}</div>
          <div style={{ color: t.text, fontSize: 12.5, marginTop: 4 }}>{row.exceptionMessage}</div>
          {detail.exceptionStack ? (
            <pre style={{
              marginTop: 8, fontSize: 11, color: t.textMuted, whiteSpace: 'pre-wrap',
              maxHeight: 220, overflow: 'auto', fontFamily: 'ui-monospace, monospace',
            }}>{detail.exceptionStack}</pre>
          ) : null}
        </div>
      ) : null}

      {detail.sameCorrelation.length > 0 ? (
        <div>
          <div style={{ fontSize: 12, color: t.textMuted, fontWeight: 700, marginBottom: 6 }}>
            {detail.sameCorrelation.length} OTHER REQUEST{detail.sameCorrelation.length === 1 ? '' : 'S'} WITH THE SAME ID
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {detail.sameCorrelation.map(sibling => (
              <div key={sibling.id} style={{ display: 'flex', gap: 8, fontSize: 12, color: t.textMuted, fontFamily: 'ui-monospace, monospace' }}>
                <span style={{ width: 40, fontWeight: 700 }}>{sibling.method}</span>
                <span style={{ width: 32 }}>{sibling.statusCode}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sibling.path}</span>
                <span>{ms(sibling.durationMs)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 8 }}>
        <Button size="sm" onClick={() => { onFollow(row.correlationId); onClose(); }}>
          Filter to this correlation id
        </Button>
      </div>
    </div>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  const { t } = useTheme();
  return (
    <div>
      <div style={{ fontSize: 11, color: t.textSubtle, fontWeight: 700 }}>{label}</div>
      <div style={{ color: t.text, fontFamily: mono ? 'ui-monospace, monospace' : 'inherit', wordBreak: 'break-all' }}>{value}</div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'danger' | 'warning' }) {
  const { t } = useTheme();
  const color = tone === 'danger' ? t.danger : tone === 'warning' ? '#C98500' : t.text;
  return (
    <Card pad={13}>
      <div style={{ fontSize: 21, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 11.5, color: t.textSubtle, fontWeight: 600 }}>{label}</div>
    </Card>
  );
}

function Crashes() {
  const { t } = useTheme();
  const [unacknowledgedOnly, setUnacknowledgedOnly] = useState(true);
  const [pageIndex, setPageIndex] = useState(1);
  const [rows, setRows] = useState<ClientErrorRow[] | null>(null);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const page = await adminApi.clientErrors(unacknowledgedOnly, pageIndex, 50);
      setRows(page.items);
      setTotalPages(page.totalPages);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the crash reports.');
    }
  }, [unacknowledgedOnly, pageIndex]);

  useEffect(() => { void load(); }, [load]);

  const acknowledge = async (reportId: string) => {
    await adminApi.acknowledgeClientError(reportId);
    await load();
  };

  return (
    <>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: t.textMuted, fontSize: 13 }}>
          <input type="checkbox" checked={unacknowledgedOnly} onChange={event => { setUnacknowledgedOnly(event.target.checked); setPageIndex(1); }} />
          Only what nobody has looked at
        </label>
        <Button size="sm" onClick={() => void load()}>Refresh</Button>
      </div>

      {error ? <ErrorNote message={error} /> : null}

      {rows === null ? <Loading /> : rows.length === 0 ? (
        <EmptyState
          icon="📱"
          title={unacknowledgedOnly ? 'Nothing new' : 'No crashes reported'}
          message="The app and the website report their own errors here. Silence is good news — but if this stays empty after a release, check the reporter is wired up."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map(row => (
            <Card key={row.id} pad={13}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <Pill tone={row.platform === 'web' ? 'info' : 'accent'}>{row.platform}</Pill>
                {row.appVersion ? <span style={{ fontSize: 11.5, color: t.textSubtle }}>v{row.appVersion}</span> : null}
                {row.screen ? <span style={{ fontSize: 11.5, color: t.textMuted }}>on {row.screen}</span> : null}
                {row.occurrences > 1 ? <Pill tone="warning">{row.occurrences} people</Pill> : null}
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 11.5, color: t.textSubtle }}>{timeAgo(row.occurredAt)}</span>
                {row.acknowledged ? <Pill tone="neutral">Seen</Pill> : (
                  <Button size="sm" onClick={() => void acknowledge(row.id)}>Mark seen</Button>
                )}
              </div>
              <div style={{ fontSize: 13, color: t.text, marginTop: 7, fontWeight: 600 }}>{row.message}</div>
              <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 4 }}>
                {row.userName ?? 'Not signed in'}
                {row.deviceInfo ? ` · ${row.deviceInfo}` : ''}
                {row.correlationId ? ` · request ${row.correlationId}` : ''}
              </div>
              {row.stack ? (
                <pre style={{
                  marginTop: 8, fontSize: 11, color: t.textMuted, whiteSpace: 'pre-wrap',
                  maxHeight: 160, overflow: 'auto', fontFamily: 'ui-monospace, monospace',
                }}>{row.stack}</pre>
              ) : null}
            </Card>
          ))}
        </div>
      )}

      {totalPages > 1 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
          <Button size="sm" disabled={pageIndex <= 1} onClick={() => setPageIndex(index => index - 1)}>Previous</Button>
          <span style={{ color: t.textMuted, fontSize: 13 }}>Page {pageIndex} of {totalPages}</span>
          <Button size="sm" disabled={pageIndex >= totalPages} onClick={() => setPageIndex(index => index + 1)}>Next</Button>
        </div>
      ) : null}
    </>
  );
}
