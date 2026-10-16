/**
 * One station: what is going on in it, as its own administrator sees it.
 *
 * A station's administrator lands here. They see their station's open reports, its people,
 * its week, what it reports, and who it answers to — and nothing from the next station. A
 * district administrator or headquarters opens the same page from the district to look
 * inside one station. The incident rows open the incident, which the desk's own reach
 * rules still decide: a row that is listed here is one this person may open.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CATEGORY, INCIDENT_STATUS, LEVEL_WORDS, STATION_KIND, commandApi, deskRoleWords, errorWords, type StationView } from '../api';
import { HBars, Lines } from '../charts';
import { T } from '../theme';
import { Btn, Empty, ErrorLine, Eyebrow, Loading, Panel, Pill, SeverityMark, Table, Td, Th, age, fmtDateTime, minutesWord } from '../ui';
import { useCommand } from '../useCommand';
import { Intelligence, ViewTabs, usePageView } from './Intelligence';
import { AdminNames, AttentionList, Crumbs, DaysPicker, FigureTiles, useGo } from './hierarchyUi';

export function StationPage() {
  const { id = '' } = useParams();
  const { tick, access, institutionId } = useCommand();
  const go = useGo();
  const navigate = useNavigate();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<StationView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = usePageView();

  useEffect(() => {
    setError(null);
    commandApi.hierarchyStation(id, days, institutionId).then(setData).catch(caught => { setData(null); setError(errorWords(caught, 'Could not load this station.')); });
  }, [id, tick, days, institutionId]);

  const s = data?.station;
  const home = access.level === 1;
  const labels = data?.trend.map(x => x.day.slice(5, 10)) ?? [];
  const crumbs = home ? [{ label: data?.institutionName ?? 'Station' }, { label: s?.name ?? '' }]
    : access.level === 2 ? [{ label: data?.institutionName ?? '', to: s?.districtSlug ? `/districts/${s.districtSlug}` : undefined }, { label: data?.districtName ? `${data.districtName} district` : '', to: s?.districtSlug ? `/districts/${s.districtSlug}` : undefined }, { label: s?.name ?? '' }]
      : [{ label: data?.institutionName ?? 'Country', to: '/districts' }, { label: data?.districtName ? `${data.districtName} district` : 'Not in a district', to: s?.districtSlug ? `/districts/${s.districtSlug}` : undefined }, { label: s?.name ?? '' }];

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <Crumbs items={crumbs.filter(c => c.label)} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>{s?.name ?? 'Station'}</h1>
            {s ? <Pill tone={s.status === 2 ? 'good' : 'neutral'} dot>{s.status === 1 ? 'Draft' : s.status === 2 ? 'Active' : s.status === 3 ? 'Suspended' : 'Closed'}</Pill> : null}
            {s && !s.pinned ? <Pill tone="warn" dot>no pin</Pill> : null}
          </div>
          {s ? <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{STATION_KIND[s.kind] ?? 'Station'}{s.community ? ` · ${s.community}` : ''}{data?.districtName ? ` · ${data.districtName}, ${data.province ?? ''}` : ''} · administered by <b style={{ color: T.text }}><AdminNames names={s.admins} none="nobody yet" /></b></div> : null}
        </div>
        <span style={{ flex: 1 }} />
        <ViewTabs value={view} onChange={setView} />
        <DaysPicker days={days} onChange={setDays} />
        <Btn onClick={() => navigate('/queue')}>Queue</Btn>
        <Btn onClick={() => navigate('/people')}>People</Btn>
        {data?.canManage ? <Btn onClick={() => navigate('/institution/offices')}>Edit the station</Btn> : null}
      </div>
      {error ? <ErrorLine>{error}</ErrorLine> : null}
      {!data && !error ? <Loading label="Opening the station…" /> : null}

      {data && s ? (<>
        <FigureTiles f={{
          stations: 1, stationsActive: s.status === 2 ? 1 : 0, stationsWithAdmin: s.admins.length > 0 ? 1 : 0, stationsStaffed: s.peopleActive > 0 ? 1 : 0, stationsPinned: s.pinned ? 1 : 0,
          people: s.peopleActive, respondersOnDuty: s.respondersOnDuty, responders: s.responders, vehicles: s.vehicles,
          openNow: s.openNow, p1Open: s.p1Open, unowned: s.unowned, reported: s.reported, reportedBefore: s.reportedBefore, resolved: s.resolved, acknowledge: s.acknowledge, onScene: { medianMinutes: null, p90Minutes: null, count: 0 },
        }} days={days} onOpen={go.queue} unit={`${s.people} on the roll`} />

        {view === 'intel' ? <Intelligence days={days} scope={{ facilityId: s.id }} title={s.name} /> : (<>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 3fr) minmax(280px, 2fr)', gap: 12, alignItems: 'start' }} className="cc-grid-2">
          <Panel flush title="Latest reports at this station" note={`${data.recent.length} shown`}>
            {data.recent.length === 0 ? <Empty>Nothing has been reported to this station in {days} days.</Empty> : (
              <Table minWidth={560}>
                <thead><tr><Th>Report</Th><Th>What</Th><Th>State</Th><Th>When</Th><Th right>Answered in</Th></tr></thead>
                <tbody>
                  {data.recent.map(r => (
                    <tr key={r.id} className="cc-row" style={{ cursor: 'pointer' }} onClick={() => navigate(`/incidents/${r.id}`)}>
                      <Td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><SeverityMark severity={r.severity} /><span className="cc-num" style={{ fontWeight: 600 }}>{r.number}</span></span></Td>
                      <Td>{r.situation}</Td>
                      <Td><Pill tone={r.unowned ? 'warn' : 'neutral'} dot>{r.unowned ? 'nobody has it' : INCIDENT_STATUS[r.status] ?? 'open'}</Pill>{r.escalationLevel > 0 ? <> <Pill tone="bad">escalated</Pill></> : null}</Td>
                      <Td muted><span title={fmtDateTime(r.reportedAt)}>{age(Math.max(0, Math.round((Date.now() - new Date(r.reportedAt).getTime()) / 60_000)))} ago</span></Td>
                      <Td right mono muted>{r.minutesToAcknowledge === null ? '—' : minutesWord(r.minutesToAcknowledge)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Panel>
          <div style={{ display: 'grid', gap: 12 }}>
            <Panel flush title="Needs a hand" note={`${data.attention.length}`}>
              <AttentionList items={data.attention} empty="This station has a desk, an administrator and a pin." />
            </Panel>
            <Panel title="Answers to" note="names and titles only">
              {data.above.length === 0 ? <div style={{ fontSize: 12.5, color: T.subtle }}>Nobody above this station is appointed yet.</div> : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {data.above.map((a, i) => (
                    <div key={`${a.name}-${i}`} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <span style={{ width: 28, height: 28, borderRadius: 14, background: T.accentSoft, color: T.accent, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{a.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()}</span>
                      <div style={{ minWidth: 0 }}><div style={{ fontSize: 12.5, fontWeight: 600 }}>{a.name}</div><div style={{ fontSize: 11, color: T.subtle }}>{a.title ?? LEVEL_WORDS[a.level]}{a.where ? ` · ${a.where}` : ''}</div></div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12, alignItems: 'start' }}>
          <Panel title={`Reports a day · ${days} days`}>
            <Lines labels={labels} height={160} series={[
              { key: 'reported', label: 'Reported', colour: T.series[0], values: data.trend.map(x => x.reported), area: true },
              { key: 'p1', label: 'Critical', colour: T.severity[0], values: data.trend.map(x => x.p1) },
            ]} />
          </Panel>
          <Panel title="What is being reported">
            <HBars rows={data.categories.map(c => ({ label: CATEGORY[c.category] ?? c.name, value: c.count }))} colour={T.series[1]} />
          </Panel>
          <Panel flush title={`The team · ${data.team.length}`} note="who works this desk">
            {data.team.length === 0 ? <Empty>Nobody is on this station's desk. Reports routed here wait for the district or headquarters.</Empty> : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {data.team.map(p => (
                  <li key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderBottom: `1px solid ${T.line}`, opacity: p.active ? 1 : 0.55 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600 }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: T.subtle }}>{p.title ?? deskRoleWords(p.role, null, p.level)}</div>
                    </div>
                    {p.awaitingSetup ? <Pill tone="warn" dot>awaiting setup</Pill> : p.lastSeenAt ? <span className="cc-num" style={{ fontSize: 11, color: T.muted }}>{age(Math.round((Date.now() - new Date(p.lastSeenAt).getTime()) / 60_000))} ago</span> : <span style={{ fontSize: 11, color: T.subtle }}>never on</span>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
        </>)}
        <Eyebrow style={{ opacity: 0.8 }}>{s.verified ? 'Verified by Vacancy' : 'Not yet verified by Vacancy'}</Eyebrow>
      </>) : null}
    </div>
  );
}
