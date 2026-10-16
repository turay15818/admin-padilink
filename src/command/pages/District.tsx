/**
 * One district: its command, its stations, what is happening in them.
 *
 * Kenema, say, with fifteen stations. The district administrator opens this page to see
 * every station at once — who runs it, whether it has a desk, what is open, what is
 * critical, how fast it answers — and to record the district's stations, fifteen at a
 * time, each with an administrator of its own. Headquarters reaches the same page from
 * the country. A station administrator never sees this page: theirs is their station's.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CATEGORY, LEVEL_WORDS, commandApi, deskRoleWords, errorWords, type DistrictView, type StationRollup } from '../api';
import { HBars, Lines } from '../charts';
import { T } from '../theme';
import { Btn, Empty, ErrorLine, Eyebrow, Loading, Panel, Pill, Table, Td, Th, Toasts, age, minutesWord, useToasts } from '../ui';
import { useCommand } from '../useCommand';
import { Intelligence, ViewTabs, usePageView } from './Intelligence';
import { AdminNames, AttentionList, Change, Crumbs, DaysPicker, FigureTiles, HealthPill, RecordStations, useGo } from './hierarchyUi';

type SortKey = 'name' | 'open' | 'p1' | 'reported' | 'ack';

export function District() {
  const { slug = '' } = useParams();
  const { tick, access, institutionId } = useCommand();
  const go = useGo();
  const navigate = useNavigate();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<DistrictView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [local, setLocal] = useState(0);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('open');
  const { toasts, push } = useToasts();
  const [view, setView] = usePageView();

  useEffect(() => {
    setError(null);
    commandApi.hierarchyDistrict(slug, days, institutionId).then(setData).catch(caught => { setData(null); setError(errorWords(caught, 'Could not load this district.')); });
  }, [slug, tick, days, institutionId, local]);

  const stations = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const list = (data?.stations ?? []).filter(s => !needle || `${s.name} ${s.community ?? ''} ${s.admins.join(' ')}`.toLowerCase().includes(needle));
    const by: Record<SortKey, (a: StationRollup, b: StationRollup) => number> = {
      name: (a, b) => a.name.localeCompare(b.name),
      open: (a, b) => (b.p1Open - a.p1Open) || (b.unowned - a.unowned) || (b.openNow - a.openNow) || a.name.localeCompare(b.name),
      p1: (a, b) => (b.p1Open - a.p1Open) || a.name.localeCompare(b.name),
      reported: (a, b) => (b.reported - a.reported) || a.name.localeCompare(b.name),
      ack: (a, b) => ((b.acknowledge.medianMinutes ?? -1) - (a.acknowledge.medianMinutes ?? -1)) || a.name.localeCompare(b.name),
    };
    return [...list].sort(by[sort]);
  }, [data, search, sort]);

  const d = data?.district;
  const labels = data?.trend.map(x => x.day.slice(5, 10)) ?? [];
  const home = access.level === 2 && access.districtSlug === slug;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <Crumbs items={home ? [{ label: data?.institutionName ?? 'District' }, { label: d?.name ?? slug }] : [{ label: data?.institutionName ?? 'Country', to: '/districts' }, { label: d?.province ?? '' }, { label: d?.name ?? slug }]} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>{d ? `${d.name} district` : 'District'}</h1>
            {d ? <HealthPill health={d.health} /> : null}
          </div>
          {d ? <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{d.province} province · {d.capital} · administered by <b style={{ color: T.text }}><AdminNames names={d.admins} none="nobody yet" /></b></div> : null}
        </div>
        <span style={{ flex: 1 }} />
        <ViewTabs value={view} onChange={setView} />
        <DaysPicker days={days} onChange={setDays} />
        <Btn onClick={() => navigate('/people')}>People</Btn>
        {data?.canRegister ? <Btn tone="primary" onClick={() => setRecording(true)}>Record stations</Btn> : null}
      </div>
      {error ? <ErrorLine>{error}</ErrorLine> : null}
      {!data && !error ? <Loading label="Opening the district…" /> : null}

      {data && d ? (<>
        <FigureTiles f={d.figures} days={days} onOpen={go.queue} unit={`${d.figures.stations} ${d.figures.stations === 1 ? 'station' : 'stations'}`} />

        {view === 'intel' ? <Intelligence days={days} scope={{ districtSlug: slug }} title={`${d.name} district`} /> : (<>
        <Panel flush title={`Stations · ${data.stations.length}`} note={d.figures.stations > 0 ? `${d.figures.stationsStaffed} staffed · ${d.figures.stationsWithAdmin} with an administrator · ${d.figures.stationsPinned} on the map` : undefined}
          action={<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input aria-label="Find a station" value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a station" style={{ width: 170, fontSize: 12, padding: '4px 8px', borderRadius: 6, border: `1px solid ${T.line2}`, background: T.surface3, color: T.text, outline: 'none' }} />
            <select aria-label="Order" value={sort} onChange={e => setSort(e.target.value as SortKey)} style={{ fontSize: 12, padding: '4px 6px', borderRadius: 6, border: `1px solid ${T.line2}`, background: T.surface3, color: T.text, appearance: 'auto' }}>
              <option value="open">Most urgent first</option><option value="p1">Critical first</option><option value="reported">Busiest first</option><option value="ack">Slowest to answer first</option><option value="name">A to Z</option>
            </select>
          </div>}>
          {stations.length === 0 ? (
            <Empty>{data.stations.length === 0 ? <>No station is on record in {d.name} yet.{data.canRegister ? ' Use Record stations to add them, with an administrator for each.' : ''}</> : 'No station matches.'}</Empty>
          ) : (
            <Table minWidth={1040}>
              <thead><tr><Th>Station</Th><Th>Administrator</Th><Th right>People</Th><Th right>Responders on</Th><Th right>Open</Th><Th right>Critical</Th><Th right>Unowned</Th><Th right>Reported</Th><Th right>vs before</Th><Th right>First answer</Th><Th>Seen</Th></tr></thead>
              <tbody>
                {stations.map(s => {
                  const quiet = s.peopleActive === 0;
                  return (
                    <tr key={s.id} className={s.canOpen ? 'cc-row' : undefined} onClick={s.canOpen ? () => go.station(s.id) : undefined} style={{ cursor: s.canOpen ? 'pointer' : 'default', opacity: s.status === 2 ? 1 : 0.6 }}>
                      <Td>
                        <b>{s.name}</b>{s.status !== 2 ? <> <Pill>{s.status === 1 ? 'draft' : s.status === 3 ? 'suspended' : 'closed'}</Pill></> : null}
                        <div style={{ fontSize: 11, color: T.subtle }}>{s.community ?? (s.parentName ? `under ${s.parentName}` : 'community not set')}{!s.pinned ? <span style={{ color: T.warn }}> · no pin</span> : null}</div>
                      </Td>
                      <Td><AdminNames names={s.admins} none={quiet ? 'nobody on the desk' : 'none yet'} /></Td>
                      <Td right mono><span style={{ color: quiet ? T.warn : T.text }}>{s.peopleActive}</span></Td>
                      <Td right mono muted>{s.respondersOnDuty}/{s.responders}</Td>
                      <Td right mono>{s.openNow}</Td>
                      <Td right mono><span style={{ color: s.p1Open > 0 ? T.bad : T.subtle }}>{s.p1Open}</span></Td>
                      <Td right mono><span style={{ color: s.unowned > 0 ? T.warn : T.subtle }}>{s.unowned}</span></Td>
                      <Td right mono>{s.reported}</Td>
                      <Td right><Change now={s.reported} before={s.reportedBefore} /></Td>
                      <Td right mono muted>{s.acknowledge.medianMinutes === null ? '—' : minutesWord(s.acknowledge.medianMinutes)}</Td>
                      <Td muted>{s.lastSeenAt ? <span className="cc-num">{age(Math.round((Date.now() - new Date(s.lastSeenAt).getTime()) / 60_000))} ago</span> : <span style={{ color: T.subtle }}>never</span>}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Panel>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12, alignItems: 'start' }}>
          <Panel title={`Reports a day · ${days} days`}>
            <Lines labels={labels} height={170} series={[
              { key: 'reported', label: 'Reported', colour: T.series[0], values: data.trend.map(x => x.reported), area: true },
              { key: 'p1', label: 'Critical', colour: T.severity[0], values: data.trend.map(x => x.p1) },
            ]} />
          </Panel>
          <Panel title="What is being reported">
            <HBars rows={data.categories.map(c => ({ label: CATEGORY[c.category] ?? c.name, value: c.count }))} colour={T.series[1]} />
          </Panel>
          <Panel flush title="Needs a hand" note={`${data.attention.length}`}>
            <div style={{ maxHeight: 280, overflowY: 'auto' }}>
              <AttentionList items={data.attention} empty="Every station here has a desk, an administrator and a pin." link={a => (a.facilityId ? `/stations/${a.facilityId}` : null)} />
            </div>
          </Panel>
          <Panel flush title="The district's team" note="appointed here and above">
            {data.team.length === 0 ? <Empty>Nobody is appointed at district level yet.</Empty> : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {data.team.map(p => (
                  <li key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderBottom: `1px solid ${T.line}`, opacity: p.active ? 1 : 0.55 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600 }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: T.subtle }}>{p.title ?? deskRoleWords(p.role, null, p.level)} · {LEVEL_WORDS[p.level] ?? ''}</div>
                    </div>
                    {p.awaitingSetup ? <Pill tone="warn" dot>awaiting setup</Pill> : p.lastSeenAt ? <span className="cc-num" style={{ fontSize: 11, color: T.muted }}>{age(Math.round((Date.now() - new Date(p.lastSeenAt).getTime()) / 60_000))} ago</span> : <span style={{ fontSize: 11, color: T.subtle }}>never on</span>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
        </>)}
        <div style={{ fontSize: 11.5, color: T.subtle, lineHeight: 1.5, maxWidth: 780 }}>
          <Eyebrow style={{ marginBottom: 4 }}>How this district is run</Eyebrow>
          Headquarters appoints the district administrator. The district administrator appoints and manages each station's administrator, and each station administrator runs their own station's desk. A station sees only its own reports; the district sees all of its stations; headquarters sees every district. Open <Link to="/people" style={{ color: T.accent }}>People</Link> to appoint someone.
        </div>
      </>) : null}

      {recording && data ? (
        <RecordStations districts={[{ slug: data.district.slug, name: data.district.name }]} fixed={data.district.slug} institutionId={institutionId} onClose={() => setRecording(false)}
          onDone={r => { push(`${r.created} recorded in ${r.districtName}.`); setLocal(n => n + 1); }} />
      ) : null}
      <Toasts toasts={toasts} />
    </div>
  );
}
