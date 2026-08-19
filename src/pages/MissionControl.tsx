/**
 * Mission Control.
 *
 * The order of this page is the order of the questions: is it us, how bad, is this normal,
 * where is the time going, what do I do. Anything that does not answer one of those is not
 * on it.
 *
 * The AI panel loads separately from everything else. A model call takes seconds and can
 * fail, and the measurements have to be on screen either way — a dashboard that waits for an
 * opinion before showing facts is a dashboard nobody opens during an incident.
 */
import { useCallback, useEffect, useState } from 'react';
import { adminApi, type AiAnalysis, type MissionControl as Control } from '../api/admin';
import { useTheme } from '../theme/ThemeProvider';
import { Button, Card, ErrorNote, Loading, PageHeader, Pill } from '../components/ui';
import { Sparkline } from '../components/ops/Sparkline';
import { bytes, duration, ms, stateColor, stateIcon, stateWord, useChart } from '../components/ops/chartTokens';

const WINDOWS = [1, 6, 24, 24 * 7];

export function MissionControl() {
  const { t } = useTheme();
  const chart = useChart();
  const [hours, setHours] = useState(24);
  const [data, setData] = useState<Control | null>(null);
  const [ai, setAi] = useState<AiAnalysis | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try { setData(await adminApi.missionControl(hours)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not read the system state.'); }
  }, [hours]);

  useEffect(() => { void load(); }, [load]);

  // Every half minute. Fast enough to watch an incident develop, slow enough that leaving the
  // tab open all day is not itself a load problem.
  useEffect(() => {
    const tick = window.setInterval(() => { void load(); }, 30_000);
    return () => window.clearInterval(tick);
  }, [load]);

  const analyse = async () => {
    setAiBusy(true);
    try { setAi(await adminApi.missionControlAnalysis(hours)); }
    catch { setAi({ available: false, headline: '', recommendations: [], generatedAt: new Date().toISOString(), unavailable: 'The analysis could not be reached.' }); }
    finally { setAiBusy(false); }
  };

  if (!data && !error) return <div style={{ padding: 24 }}><Loading label="Reading the system…" /></div>;

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="Mission Control"
        subtitle={data?.headline ?? 'System state, service objectives, database health and what to do about them.'}
        action={<Button onClick={() => void load()}>Refresh</Button>}
      />

      {error ? <ErrorNote message={error} /> : null}
      {!data ? null : (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            {WINDOWS.map(value => (
              <button
                key={value}
                onClick={() => setHours(value)}
                style={{
                  border: `1px solid ${hours === value ? t.brand : t.borderStrong}`,
                  background: hours === value ? t.brand : t.surface,
                  color: hours === value ? t.brandText : t.textMuted,
                  borderRadius: 999, padding: '5px 13px', fontSize: 12, fontWeight: 700,
                  fontFamily: 'inherit', cursor: 'pointer',
                }}>
                {value === 1 ? 'Last hour' : value === 168 ? 'Last week' : `Last ${value}h`}
              </button>
            ))}
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: t.textSubtle }}>
              up {duration(data.uptimeSeconds)} · refreshed {new Date(data.generatedAt).toLocaleTimeString()}
            </span>
          </div>

          {data.droppedLogRows > 0 ? (
            <div style={{
              border: `1px solid ${chart.warning}`, borderRadius: 10, padding: '9px 13px',
              fontSize: 12.5, marginBottom: 12, color: t.text, lineHeight: 1.55,
            }}>
              <strong>Incomplete data.</strong> {data.droppedLogRows.toLocaleString()} log rows were
              dropped because the write queue filled, so the counts below understate reality. The
              API kept serving requests, which is the intended trade.
            </div>
          ) : null}

          {/* ---- is it us? ------------------------------------------------------------ */}
          <SectionTitle>Dependencies</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10, marginBottom: 18 }}>
            {data.dependencies.map(dependency => (
              <Card key={dependency.name} pad={13}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {/* Icon plus word plus colour. Never colour alone. */}
                  <span style={{
                    width: 18, height: 18, borderRadius: 9, flexShrink: 0,
                    background: stateColor(dependency.state, chart), color: '#fff',
                    fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{stateIcon(dependency.state)}</span>
                  <span style={{ fontWeight: 800, color: t.text, fontSize: 13.5 }}>{dependency.name}</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 12, color: t.textMuted, fontWeight: 700 }}>{stateWord(dependency.state)}</span>
                  {dependency.latencyMs > 0 ? <span style={{ fontSize: 11.5, color: t.textSubtle }}>{dependency.latencyMs}ms</span> : null}
                </div>
                <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 5, lineHeight: 1.5 }}>{dependency.detail}</div>
              </Card>
            ))}
          </div>

          {/* ---- how bad? -------------------------------------------------------------- */}
          {/* Two rows, split by meaning rather than by what fits. Traffic is what was asked
              of the system; saturation is whether it coped. Mixing them in one auto-fitting
              grid also left a single orphaned tile on a row of its own, which reads as a
              rendering fault. */}
          <SectionTitle>Traffic</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
            <Stat label="Requests" value={data.signals.requests.toLocaleString()} note={`${data.signals.requestsPerMinute}/min`} />
            <Stat label="Errors" value={data.signals.errors.toLocaleString()} note={`${data.signals.errorRatePercent}%`}
                  tone={data.signals.errorRatePercent >= 1 ? 'bad' : undefined} />
            <Stat label="Median" value={ms(data.signals.medianMs)} />
            <Stat label="95th pct" value={ms(data.signals.p95Ms)} tone={data.signals.p95Ms > 800 ? 'warn' : undefined} />
            <Stat label="99th pct" value={ms(data.signals.p99Ms)} />
          </div>

          <SectionTitle>Saturation</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
            <Stat label="CPU" value={`${data.signals.cpuPercent}%`} tone={data.signals.cpuPercent > 85 ? 'warn' : undefined} />
            <Stat label="Memory" value={`${data.signals.workingSetMb} MB`} />
            <Stat label="Queued work" value={String(data.signals.threadPoolQueue)}
                  note="thread pool" tone={data.signals.threadPoolQueue > 50 ? 'warn' : undefined} />
            <Stat label="DB conns"
                  value={data.signals.dbMaxConnections > 0 ? `${data.signals.dbConnections}/${data.signals.dbMaxConnections}` : String(data.signals.dbConnections)}
                  tone={data.signals.dbMaxConnections > 0 && data.signals.dbConnections > data.signals.dbMaxConnections * 0.8 ? 'warn' : undefined} />
          </div>

          {/* Four measures, four charts, four scales. Never one plot with two axes. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 10, marginBottom: 18 }}>
            <Card pad={13}><Sparkline label="REQUESTS" color={chart.slot1} points={data.series.map(p => p.requests)} format={v => v.toLocaleString()} /></Card>
            <Card pad={13}><Sparkline label="95TH PERCENTILE" color={chart.slot2} points={data.series.map(p => p.p95Ms)} format={ms} /></Card>
            <Card pad={13}><Sparkline label="CPU" color={chart.slot3} points={data.series.map(p => p.cpuPercent)} format={v => `${v.toFixed(0)}%`} /></Card>
            <Card pad={13}><Sparkline label="ERRORS" color={chart.critical} points={data.series.map(p => p.errors)} format={v => v.toLocaleString()} /></Card>
          </div>

          {/* ---- what was promised ------------------------------------------------------ */}
          <SectionTitle>Service objectives</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 10, marginBottom: 18 }}>
            {data.objectives.map(objective => {
              // Over budget fills the track completely rather than emptying it. An empty bar
              // next to "-38%" reads as missing data, which is the opposite of the message.
              const over = objective.budgetRemainingPercent < 0;
              const remaining = over ? 100 : Math.max(0, Math.min(100, objective.budgetRemainingPercent));
              const tone = objective.budgetRemainingPercent < 0 ? chart.critical
                : objective.budgetRemainingPercent < 25 ? chart.warning
                : chart.good;
              return (
                <Card key={objective.name} pad={14}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontWeight: 800, color: t.text, fontSize: 14 }}>{objective.name}</span>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 18, fontWeight: 800, color: tone }}>
                      {objective.budgetRemainingPercent}%
                    </span>
                    <span style={{ fontSize: 11.5, color: t.textSubtle }}>budget left</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 999, background: t.surfaceMuted, overflow: 'hidden', marginTop: 8 }}>
                    <div style={{ height: 8, width: `${remaining}%`, background: tone }} />
                  </div>
                  {over ? (
                    <div style={{ fontSize: 11, color: chart.critical, marginTop: 4, fontWeight: 700 }}>
                      Budget spent, and {Math.abs(objective.budgetRemainingPercent)}% over.
                    </div>
                  ) : null}
                  <div style={{ fontSize: 12, color: t.textMuted, marginTop: 7, lineHeight: 1.5 }}>
                    {objective.description} Currently <strong>{objective.actualPercent}%</strong> over{' '}
                    {objective.totalEvents.toLocaleString()} requests.
                  </div>
                  {objective.budgetRemainingPercent < 0 ? (
                    <div style={{ fontSize: 12, color: chart.critical, marginTop: 6, fontWeight: 700 }}>
                      This promise is broken for the window. Freeze anything risky.
                    </div>
                  ) : null}
                </Card>
              );
            })}
          </div>

          {/* ---- is this normal? -------------------------------------------------------- */}
          {data.anomalies.length > 0 ? (
            <>
              <SectionTitle>Out of character for this hour</SectionTitle>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
                {data.anomalies.map(anomaly => (
                  <Card key={anomaly.metric} pad={13} style={{ borderLeft: `3px solid ${stateColor(anomaly.severity, chart)}` }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 800, color: t.text, fontSize: 13.5 }}>{anomaly.metric}</span>
                      <Pill tone={anomaly.severity >= 2 ? 'danger' : 'warning'}>{Math.abs(anomaly.sigma).toFixed(1)}σ</Pill>
                      <span style={{ flex: 1 }} />
                      <span style={{ fontSize: 12.5, color: t.textMuted }}>
                        now <strong style={{ color: t.text }}>{anomaly.current}</strong> · usually {anomaly.typicalForThisHour}
                      </span>
                    </div>
                    <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 5 }}>{anomaly.summary}</div>
                  </Card>
                ))}
              </div>
            </>
          ) : null}

          {/* ---- where is the time going ------------------------------------------------ */}
          <SectionTitle>Where the time goes</SectionTitle>
          <Card pad={0} style={{ marginBottom: 18, overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', fontSize: 11.5, color: t.textSubtle, borderBottom: `1px solid ${t.border}` }}>
              Ranked by total time — calls multiplied by median — not by the worst single request.
              An endpoint at 90ms called ten thousand times costs more than one at four seconds called twice.
            </div>
            {data.topEndpoints.map(endpoint => {
              const share = data.topEndpoints[0].totalMs > 0 ? endpoint.totalMs / data.topEndpoints[0].totalMs : 0;
              return (
                <div key={`${endpoint.method}-${endpoint.routeTemplate}`} style={{ padding: '9px 14px', borderTop: `1px solid ${t.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: t.textMuted, width: 46 }}>{endpoint.method}</span>
                    <span style={{ flex: 1, fontSize: 12.5, color: t.text, fontFamily: 'ui-monospace, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {endpoint.routeTemplate}
                    </span>
                    <span style={{ fontSize: 12, color: t.textMuted, width: 86, textAlign: 'right' }}>{endpoint.requests.toLocaleString()} calls</span>
                    <span style={{ fontSize: 12, color: t.textMuted, width: 78, textAlign: 'right' }}>med {ms(endpoint.medianMs)}</span>
                    <span style={{ fontSize: 12, color: t.textMuted, width: 78, textAlign: 'right' }}>p95 {ms(endpoint.p95Ms)}</span>
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: t.text, width: 84, textAlign: 'right' }}>{ms(endpoint.totalMs)}</span>
                    {endpoint.errors > 0 ? <Pill tone="danger">{endpoint.errors}</Pill> : null}
                  </div>
                  <div style={{ height: 4, borderRadius: 999, background: t.surfaceMuted, marginTop: 6, overflow: 'hidden' }}>
                    <div style={{ height: 4, width: `${Math.max(1, share * 100)}%`, background: chart.slot1 }} />
                  </div>
                </div>
              );
            })}
          </Card>

          <DatabasePanel data={data} />

          {/* ---- what do I do ----------------------------------------------------------- */}
          <SectionTitle>What to fix first</SectionTitle>
          <Card pad={14} style={{ marginBottom: 24 }}>
            {ai === null ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 220, fontSize: 12.5, color: t.textMuted, lineHeight: 1.55 }}>
                  Hands every measurement on this page to the model and asks what is worth doing,
                  ranked. Each answer has to cite the figure it came from — and it is told to say
                  there is not enough traffic rather than invent work.
                </div>
                <Button tone="primary" disabled={aiBusy} onClick={() => void analyse()}>
                  {aiBusy ? 'Analysing…' : 'Analyse this window'}
                </Button>
              </div>
            ) : !ai.available ? (
              <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.6 }}>
                {ai.unavailable}
                <div style={{ marginTop: 10 }}><Button onClick={() => void analyse()}>Try again</Button></div>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: t.text, flex: 1 }}>{ai.headline}</span>
                  <span style={{ fontSize: 11.5, color: t.textSubtle }}>{new Date(ai.generatedAt).toLocaleTimeString()}</span>
                  <Button size="sm" disabled={aiBusy} onClick={() => void analyse()}>{aiBusy ? '…' : 'Re-run'}</Button>
                </div>
                {ai.recommendations.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: t.textSubtle }}>
                    No recommendations for this window — which is the honest answer when there is
                    not enough traffic to conclude anything.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                    {ai.recommendations.map((rec, index) => (
                      <div key={`${rec.title}-${index}`} style={{ border: `1px solid ${t.border}`, borderRadius: 10, padding: '11px 13px' }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{
                            width: 20, height: 20, borderRadius: 6, background: t.surfaceMuted, color: t.textMuted,
                            fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>{rec.priority}</span>
                          <span style={{ fontWeight: 800, color: t.text, fontSize: 13.5 }}>{rec.title}</span>
                          <Pill tone="info">{rec.area}</Pill>
                        </div>
                        <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 6, lineHeight: 1.6 }}>{rec.detail}</div>
                        {rec.evidence ? (
                          <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 6, fontFamily: 'ui-monospace, monospace' }}>
                            from: {rec.evidence}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function DatabasePanel({ data }: { data: Control }) {
  const { t } = useTheme();
  const chart = useChart();
  const db = data.database;

  return (
    <>
      <SectionTitle>Database</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(132px, 1fr))', gap: 10, marginBottom: 10 }}>
        <Stat label="Cache hit" value={`${db.cacheHitPercent}%`} note="99%+ is healthy"
              tone={db.cacheHitPercent > 0 && db.cacheHitPercent < 95 ? 'warn' : undefined} />
        <Stat label="Connections" value={db.maxConnections > 0 ? `${db.connections}/${db.maxConnections}` : String(db.connections)}
              tone={db.maxConnections > 0 && db.connections > db.maxConnections * 0.8 ? 'bad' : undefined} />
        <Stat label="Rollbacks" value={`${db.rollbackPercent}%`} tone={db.rollbackPercent > 5 ? 'warn' : undefined} />
        <Stat label="Deadlocks" value={db.deadlocks.toLocaleString()} tone={db.deadlocks > 0 ? 'bad' : undefined} />
        <Stat label="Longest txn" value={duration(db.longestTransactionSeconds)}
              note="blocks vacuum" tone={db.longestTransactionSeconds > 300 ? 'bad' : undefined} />
        <Stat label="Size" value={db.databaseSize} />
        <Stat label="Dead rows" value={db.deadTuples.toLocaleString()} note="awaiting vacuum" />
        <Stat label="Temp files" value={bytes(db.tempBytes)} note="queries spilling to disk" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 10, marginBottom: 18 }}>
        <Card pad={13}>
          <div style={{ fontSize: 11.5, color: t.textMuted, fontWeight: 700, marginBottom: 8 }}>LARGEST TABLES</div>
          {db.largestTables.map(table => {
            const scanning = table.sequentialScans > table.indexScans && table.liveRows > 5000;
            return (
              <div key={table.name} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '5px 0', borderTop: `1px solid ${t.border}` }}>
                <span style={{ flex: 1, fontSize: 12.5, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{table.name}</span>
                <span style={{ fontSize: 12, color: t.textMuted, width: 74, textAlign: 'right' }}>{table.size}</span>
                <span style={{ fontSize: 11.5, color: scanning ? chart.warning : t.textSubtle, width: 118, textAlign: 'right' }}>
                  {scanning ? `${table.sequentialScans.toLocaleString()} full scans` : `${table.indexScans.toLocaleString()} index scans`}
                </span>
              </div>
            );
          })}
        </Card>

        <Card pad={13}>
          <div style={{ fontSize: 11.5, color: t.textMuted, fontWeight: 700, marginBottom: 4 }}>INDEXES NOBODY USES</div>
          <div style={{ fontSize: 11, color: t.textSubtle, marginBottom: 8, lineHeight: 1.5 }}>
            Never scanned since the last statistics reset. Each one is paid for on every insert
            and update to its table. Check the counters have been running a while before dropping one.
          </div>
          {db.unusedIndexes.length === 0 ? (
            <div style={{ fontSize: 12.5, color: t.textSubtle }}>Every index over 1MB is being used.</div>
          ) : db.unusedIndexes.map(index => (
            <div key={index.name} style={{ display: 'flex', gap: 8, padding: '5px 0', borderTop: `1px solid ${t.border}` }}>
              <span style={{ flex: 1, fontSize: 12, color: t.text, fontFamily: 'ui-monospace, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{index.name}</span>
              <span style={{ fontSize: 12, color: t.textMuted }}>{index.size}</span>
            </div>
          ))}
        </Card>
      </div>

      {db.slowStatements === null ? (
        <Card pad={13} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.6 }}>
            <strong>Per-query timings are not available.</strong> {db.note}
          </div>
        </Card>
      ) : db.slowStatements.length > 0 ? (
        <Card pad={13} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11.5, color: t.textMuted, fontWeight: 700, marginBottom: 8 }}>QUERIES BY TOTAL TIME</div>
          {db.slowStatements.map((statement, index) => (
            <div key={index} style={{ padding: '7px 0', borderTop: `1px solid ${t.border}` }}>
              <div style={{ display: 'flex', gap: 10, fontSize: 12, color: t.textMuted }}>
                <span style={{ fontWeight: 700, color: t.text }}>{ms(statement.totalMs)} total</span>
                <span>{statement.calls.toLocaleString()} calls</span>
                <span>{statement.meanMs.toFixed(1)}ms mean</span>
              </div>
              <div style={{ fontSize: 11.5, color: t.textSubtle, fontFamily: 'ui-monospace, monospace', marginTop: 3, wordBreak: 'break-all' }}>
                {statement.statement}
              </div>
            </div>
          ))}
        </Card>
      ) : null}
    </>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  const { t } = useTheme();
  return (
    <div style={{ fontSize: 11.5, color: t.textMuted, fontWeight: 800, letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: 8 }}>
      {children}
    </div>
  );
}

function Stat({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: 'warn' | 'bad' }) {
  const { t } = useTheme();
  const chart = useChart();
  const color = tone === 'bad' ? chart.critical : tone === 'warn' ? chart.warning : t.text;
  return (
    <Card pad={12}>
      <div style={{ fontSize: 19, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 11, color: t.textSubtle, fontWeight: 600 }}>{label}</div>
      {note ? <div style={{ fontSize: 10.5, color: t.textSubtle, marginTop: 1 }}>{note}</div> : null}
    </Card>
  );
}
