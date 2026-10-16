/**
 * What rang, and who took it.
 *
 * Every report that rang this desk over the last days: how loud it was and why, who took it and how
 * quickly, how many times the phones were pushed, and which nobody took. The numbers are the
 * proof an institution can show — a siren that is answered in under a minute, or the list of the ones
 * that were not. A private report never names itself here: no words, only its number and level.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ALARM_WORDS, CATEGORY, SEVERITY_WORDS, commandApi, errorWords, type AlarmHistory, type AlarmHistoryRow } from '../api';
import { T } from '../theme';
import { Empty, ErrorLine, Loading, Panel, Pill, Segmented, Select, Table, Td, Th, Tile, fmtDateTime, titleCase, type PillTone } from '../ui';
import { useCommand } from '../useCommand';

const LEVEL_TONE: Record<number, PillTone> = { 3: 'bad', 2: 'warn', 1: 'info', 0: 'neutral' };

/** "42 s", "3 min 05 s", "1 h 12 min" — how long somebody took. */
export function took(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—';
  if (seconds < 60) return `${seconds} s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, '0')} s`;
  return `${Math.floor(seconds / 3600)} h ${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')} min`;
}

const BUCKETS: { label: string; max: number }[] = [
  { label: 'Under 30 s', max: 30 }, { label: 'Under 1 min', max: 60 }, { label: 'Under 2 min', max: 120 },
  { label: 'Under 5 min', max: 300 }, { label: 'Under 10 min', max: 600 }, { label: '10 min or more', max: Infinity },
];

/** How the rows that rang (not silent) were answered: counted into time-to-take buckets, with the ones nobody took last. */
export function bucketsOf(rows: AlarmHistoryRow[]): { label: string; count: number; tone: string }[] {
  const loud = rows.filter(r => r.level > 0);
  const out = BUCKETS.map((b, i) => ({
    label: b.label,
    count: loud.filter(r => r.secondsToTake !== null && r.secondsToTake < b.max && (i === 0 || r.secondsToTake >= BUCKETS[i - 1].max)).length,
    tone: i < 2 ? T.good : i < 4 ? T.warn : T.bad,
  }));
  out.push({ label: 'Nobody took it', count: loud.filter(r => r.secondsToTake === null).length, tone: T.bad });
  return out;
}

export function AlarmHistoryPage() {
  const { access, institutions } = useCommand();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [scope, setScope] = useState<string>(params.get('institution') ?? '');
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [onlyUntaken, setOnlyUntaken] = useState(false);
  const [minLevel, setMinLevel] = useState(0);
  const [data, setData] = useState<AlarmHistory | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null); setError(null);
    commandApi.alarmHistory({ institutionId: scope || null, days, take: 200, onlyUntaken, minLevel })
      .then(setData).catch(caught => setError(errorWords(caught, 'Could not load the alarm history.')));
  }, [scope, days, onlyUntaken, minLevel]);

  const buckets = useMemo(() => (data ? bucketsOf(data.rows) : []), [data]);
  const most = Math.max(1, ...buckets.map(b => b.count));
  const s = data?.summary;

  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 1180 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Link to="/settings/alarm" style={{ fontSize: 12, color: T.muted, textDecoration: 'none' }}>‹ Alarm rules</Link>
        <div style={{ fontSize: 17, fontWeight: 600 }}>What rang, and who took it</div>
        {data ? <span style={{ fontSize: 12, color: T.muted }}>{data.scopeName}</span> : null}
        <span style={{ flex: 1 }} />
        {access.national ? (
          <span style={{ minWidth: 240 }}>
            <Select value={scope} onChange={setScope}>
              <option value="">Every institution</option>
              {institutions.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </Select>
          </span>
        ) : null}
        <Segmented size="xs" value={days} options={[[7, '7 days'], [30, '30 days'], [90, '90 days']] as [7 | 30 | 90, string][]} onChange={setDays} />
      </div>

      {error ? <ErrorLine>{error}</ErrorLine> : !data || !s ? <Loading label="Opening the alarm history…" /> : (
        <>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <Tile label="Rang" value={s.siren + s.urgent + s.chime} note={`${s.silent} kept quiet by the rules`} />
            <Tile label="Sirens" value={s.siren} tone={s.siren > 0 ? T.bad : undefined} note={`${s.urgent} urgent calls`} />
            <Tile label="Typical time to take" value={took(s.medianSeconds)} note={s.slowestTenthSeconds !== null ? `the slowest tenth took ${took(s.slowestTenthSeconds)}` : 'nobody has taken one yet'} />
            <Tile label="Sirens taken in a minute" value={s.sirensTaken === 0 ? '—' : `${Math.round((s.sirensTakenInAMinute / s.sirensTaken) * 100)}%`} note={`${s.sirensTakenInAMinute} of ${s.sirensTaken}`} tone={s.sirensTaken > 0 && s.sirensTakenInAMinute < s.sirensTaken ? T.warn : T.good} />
            <Tile label="Nobody took it" value={s.neverTaken + s.stillWaiting} tone={s.neverTaken + s.stillWaiting > 0 ? T.bad : undefined} note={`${s.stillWaiting} waiting now · ${s.neverTaken} closed without anybody`} />
            <Tile label="Supervisors told" value={s.supervisorsTold} note="after the wait set in the rules" />
          </div>

          <div className="cc-grid-2" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 340px)', gap: 12, alignItems: 'start' }}>
            <Panel title="Alarms" note={`${data.rows.length} shown`} flush
              action={<span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
                <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12, cursor: 'pointer' }}><input type="checkbox" checked={onlyUntaken} onChange={e => setOnlyUntaken(e.target.checked)} style={{ accentColor: T.accent }} /> Only the untaken</label>
                <Segmented size="xs" value={minLevel} options={[[0, 'All'], [2, 'Urgent +'], [3, 'Siren']] as [number, string][]} onChange={setMinLevel} />
              </span>}>
              {data.rows.length === 0 ? <Empty>Nothing rang in these {data.days} days.</Empty> : (
                <Table minWidth={860}>
                  <thead><tr><Th>Level</Th><Th>Report</Th><Th>District</Th><Th>Raised</Th><Th>Taken by</Th><Th right>Time to take</Th><Th right>Pushes</Th></tr></thead>
                  <tbody>
                    {data.rows.map(r => (
                      <tr key={`${r.incidentId}-${r.role}`} onClick={() => navigate(`/incidents/${r.incidentId}`)} style={{ cursor: 'pointer', background: r.secondsToTake === null && r.level > 0 ? 'rgba(255, 77, 94, 0.07)' : undefined }} data-alarm-row={r.number}>
                        <Td><Pill tone={LEVEL_TONE[r.level]}>{ALARM_WORDS[r.level]}</Pill>{r.role === 'asked' ? <span style={{ fontSize: 10.5, color: T.subtle, marginLeft: 6 }}>asked to join</span> : null}</Td>
                        <Td>
                          <div className="cc-num" style={{ fontWeight: 600 }}>{r.number}</div>
                          <div style={{ fontSize: 11.5, color: T.muted }}>{r.isSensitive ? 'A private report' : `${r.words ?? CATEGORY[r.category] ?? ''} · P${r.severity} ${SEVERITY_WORDS[r.severity] ?? ''}`}</div>
                          <div style={{ fontSize: 11, color: T.subtle }} title="Why it rang at that level">{r.why}</div>
                        </Td>
                        <Td muted>{r.isSensitive ? '—' : titleCase(r.districtSlug)}</Td>
                        <Td muted>{fmtDateTime(r.raisedAt)}</Td>
                        <Td>{r.takenBy ?? (r.stillWaiting ? <span style={{ color: T.warn }}>Waiting now</span> : r.neverTaken ? <span style={{ color: T.bad }}>Nobody</span> : '—')}</Td>
                        <Td right mono>{took(r.secondsToTake)}</Td>
                        <Td right mono>{r.pushes}{r.supervisorsToldAt ? <span title="The supervisors were told" style={{ color: T.warn, marginLeft: 6 }}>+ chiefs</span> : null}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Panel>

            <Panel title="How fast they were taken" note="Every report that rang">
              <div style={{ display: 'grid', gap: 8 }}>
                {buckets.map(b => (
                  <div key={b.label} style={{ display: 'grid', gridTemplateColumns: '112px minmax(0, 1fr) 28px', gap: 8, alignItems: 'center', fontSize: 12 }}>
                    <span style={{ color: T.muted }}>{b.label}</span>
                    <span style={{ height: 8, background: T.surface3, borderRadius: 4, overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${(b.count / most) * 100}%`, background: b.tone, borderRadius: 4 }} /></span>
                    <span className="cc-num" style={{ textAlign: 'right' }}>{b.count}</span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: T.subtle, marginTop: 10, lineHeight: 1.5 }}>Counted over the alarms shown. Time to take runs from the moment it rang to the moment a person on a desk took it.</div>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
