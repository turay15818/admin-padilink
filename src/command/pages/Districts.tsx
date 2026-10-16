/**
 * The country, district by district.
 *
 * Headquarters (and a national desk standing at an institution) sees all sixteen districts
 * painted by how each is doing, the provinces they sit in, and the list of what needs a
 * hand — a district with no station, a station with nobody on its desk, a critical report
 * nobody has taken. A district command that lands here is sent to its own district; a
 * station to its own page. Every number is derived on the server from rows that exist.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { commandApi, errorWords, type HierarchyOverview } from '../api';
import { T } from '../theme';
import { Btn, Empty, ErrorLine, Eyebrow, Loading, Panel, Pill, Table, Td, Th, Toasts, minutesWord, useToasts } from '../ui';
import { useCommand } from '../useCommand';
import { Intelligence, ViewTabs, usePageView } from './Intelligence';
import { AdminNames, AttentionList, Change, CountryMap, Crumbs, DaysPicker, FigureTiles, HealthPill, RecordStations, useGo } from './hierarchyUi';

export function Districts() {
  const { tick, access, institutionId } = useCommand();
  const go = useGo();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<HierarchyOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [local, setLocal] = useState(0);
  const [show, setShow] = useState<'all' | 'attention'>('all');
  const { toasts, push } = useToasts();
  const [view, setView] = usePageView();

  useEffect(() => {
    commandApi.hierarchy(days, institutionId).then(d => { setData(d); setError(null); }).catch(caught => setError(errorWords(caught, 'Could not load the districts.')));
  }, [tick, days, institutionId, local]);

  const grouped = useMemo(() => {
    const rows = (data?.districts ?? []).filter(d => show === 'all' || d.health === 'unserved' || d.health === 'unstaffed' || d.health === 'strained');
    const provinces = [...new Set(rows.map(d => d.province))].sort();
    return provinces.map(province => ({ province, rows: rows.filter(d => d.province === province).sort((a, b) => a.name.localeCompare(b.name)) }));
  }, [data, show]);

  if (access.national && !institutionId) return <Panel><Empty>A national desk reads one institution's districts at a time. Pick one at the top of the rail.</Empty></Panel>;
  if (data && data.level === 1 && data.homeStationId) return <Navigate to={`/stations/${data.homeStationId}`} replace />;
  if (data && data.level === 2 && data.homeDistrictSlug) return <Navigate to={`/districts/${data.homeDistrictSlug}`} replace />;

  const attention = data?.attention ?? [];
  const high = attention.filter(a => a.weight === 'high').length;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <Crumbs items={[{ label: data?.institutionName ?? 'Country' }, { label: 'Districts' }]} />
          <h1 style={{ margin: '4px 0 0', fontSize: 20, fontWeight: 600 }}>{data ? `Sierra Leone · ${data.districts.length} ${data.districts.length === 1 ? 'district' : 'districts'}` : 'Sierra Leone'}</h1>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{data?.scopeLabel ?? ' '}</div>
        </div>
        <span style={{ flex: 1 }} />
        <ViewTabs value={view} onChange={setView} />
        <DaysPicker days={days} onChange={setDays} />
        {data?.canRegister ? <Btn tone="primary" onClick={() => setRecording(true)}>Record stations</Btn> : null}
      </div>
      {error ? <ErrorLine>{error}</ErrorLine> : null}
      {!data && !error ? <Loading label="Counting the districts…" /> : null}

      {data ? (<>
        <FigureTiles f={data.total} days={days} onOpen={go.queue} unit={`${data.total.stations} ${data.total.stations === 1 ? 'station' : 'stations'}`} />

        {view === 'intel' ? <Intelligence days={days} scope={{}} title={data.institutionName ?? 'The country'} /> : (<>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 5fr) minmax(300px, 6fr)', gap: 12, alignItems: 'start' }} className="cc-grid-2">
          <Panel title="By district" note="coloured by how each is doing">
            <CountryMap districts={data.districts} onPick={go.district} />
          </Panel>
          <Panel flush title={<>Needs a hand{high > 0 ? <span style={{ color: T.bad }}> · {high} now</span> : null}</>} note={`${attention.length} ${attention.length === 1 ? 'thing' : 'things'}`}>
            <div style={{ maxHeight: 440, overflowY: 'auto' }}>
              <AttentionList items={attention} empty="Every district has stations, and every station has a desk."
                link={a => (a.facilityId ? `/stations/${a.facilityId}` : a.kind === 'unplaced' ? '/institution/offices' : a.districtSlug ? `/districts/${a.districtSlug}` : null)} />
            </div>
          </Panel>
        </div>

        {data.provinces.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 8 }}>
            {data.provinces.map(p => (
              <div key={p.name} style={{ border: `1px solid ${T.line}`, borderRadius: T.radius, padding: '9px 12px', background: T.surface }}>
                <Eyebrow>{p.name}</Eyebrow>
                <div style={{ display: 'flex', gap: 14, marginTop: 4, alignItems: 'baseline' }}>
                  <span className="cc-num" style={{ fontSize: 20, fontWeight: 600 }}>{p.stations}</span><span style={{ fontSize: 11, color: T.muted }}>{p.stations === 1 ? 'station' : 'stations'} in {p.districts}</span>
                </div>
                <div style={{ fontSize: 11.5, color: T.muted, marginTop: 2 }}>{p.openNow} open{p.p1Open > 0 ? <span style={{ color: T.bad }}> · {p.p1Open} critical</span> : null} · {p.reported} reported</div>
              </div>
            ))}
          </div>
        ) : null}

        <Panel flush title="Every district" action={<div style={{ display: 'flex', gap: 6 }}>
          <Btn size="xs" tone={show === 'all' ? 'accent' : 'subtle'} onClick={() => setShow('all')}>All</Btn>
          <Btn size="xs" tone={show === 'attention' ? 'accent' : 'subtle'} onClick={() => setShow('attention')}>Need attention</Btn>
        </div>}>
          {grouped.length === 0 || grouped.every(g => g.rows.length === 0) ? <Empty>{show === 'all' ? 'No districts yet.' : 'No district needs attention.'}</Empty> : (
            <Table minWidth={980}>
              <thead><tr><Th>District</Th><Th>State</Th><Th right>Stations</Th><Th right>With an administrator</Th><Th right>Open</Th><Th right>Critical</Th><Th right>Reported</Th><Th right>vs before</Th><Th right>First answer</Th><Th>District administrator</Th></tr></thead>
              <tbody>
                {grouped.map(g => (
                  <GroupRows key={g.province} province={g.province}>
                    {g.rows.map(d => (
                      <tr key={d.slug} className={d.canOpen ? 'cc-row' : undefined} onClick={d.canOpen ? () => go.district(d.slug) : undefined} style={{ cursor: d.canOpen ? 'pointer' : 'default' }}>
                        <Td><b>{d.name}</b><div style={{ fontSize: 11, color: T.subtle }}>{d.capital}</div></Td>
                        <Td><HealthPill health={d.health} /></Td>
                        <Td right mono>{d.figures.stations}</Td>
                        <Td right mono><span style={{ color: d.figures.stations > 0 && d.figures.stationsWithAdmin < d.figures.stations ? T.warn : T.muted }}>{d.figures.stationsWithAdmin}/{d.figures.stations}</span></Td>
                        <Td right mono>{d.figures.openNow}</Td>
                        <Td right mono><span style={{ color: d.figures.p1Open > 0 ? T.bad : T.subtle }}>{d.figures.p1Open}</span></Td>
                        <Td right mono>{d.figures.reported}</Td>
                        <Td right><Change now={d.figures.reported} before={d.figures.reportedBefore} /></Td>
                        <Td right mono muted>{d.figures.acknowledge.medianMinutes === null ? '—' : minutesWord(d.figures.acknowledge.medianMinutes)}</Td>
                        <Td><AdminNames names={d.admins} none={d.figures.stations > 0 ? 'none yet' : '—'} /></Td>
                      </tr>
                    ))}
                  </GroupRows>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>
        </>)}
        {view !== 'intel' && data.unplaced > 0 && data.canRegister ? <div style={{ fontSize: 12, color: T.warn }}><Pill tone="warn" dot>{data.unplaced} not placed</Pill> {data.unplaced === 1 ? 'An office is' : `${data.unplaced} offices are`} on the chart without a district. Place each in the <Link to="/institution/offices" style={{ color: T.accent }}>institution's offices</Link> so reports reach it.</div> : null}
      </>) : null}

      {recording && data ? (
        <RecordStations districts={data.districts.map(d => ({ slug: d.slug, name: d.name }))} institutionId={institutionId} onClose={() => setRecording(false)}
          onDone={r => { push(`${r.created} recorded in ${r.districtName}.`); setLocal(n => n + 1); }} />
      ) : null}
      <Toasts toasts={toasts} />
    </div>
  );
}

function GroupRows({ province, children }: { province: string; children: ReactNode }) {
  return (<>
    <tr><td colSpan={10} style={{ padding: '10px 10px 4px', fontSize: 10.5, fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase', color: T.subtle, background: T.surface2 }}>{province}</td></tr>
    {children}
  </>);
}
