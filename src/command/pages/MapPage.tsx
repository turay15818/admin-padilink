/**
 * The wall, full bleed.
 *
 * The map fills the screen; a panel on the right lists what is on it and lets the desk
 * filter by severity and status. Clicking an incident on either side opens it in a drawer
 * so the map is never left. Responders sharing a position are listed with how long ago
 * they were seen — a position older than ten minutes is a guess, and is coloured as one.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { INCIDENT_STATUS, RESPONDER_ROLE, RESPONDER_STATUS, commandApi, errorWords, type LivePicture, type MyStation } from '../api';
import { LiveMap, type StationPin } from '../LiveMap';
import { T } from '../theme';
import { Btn, Drawer, Empty, ErrorLine, Eyebrow, LiveDot, Loading, Pill, Segmented, SeverityMark, Toasts, age, useToasts } from '../ui';
import { useCommand } from '../useCommand';
import { IncidentPanel, useIncident } from './Incident';

export function MapPage() {
  const { tick, shapes, socket, districtName } = useCommand();
  const navigate = useNavigate();
  const [live, setLive] = useState<LivePicture | null>(null);
  const [stations, setStations] = useState<StationPin[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [severity, setSeverity] = useState<0 | 1 | 2 | 3>(0);
  const [tab, setTab] = useState<'incidents' | 'responders'>('incidents');
  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState<[number, number] | null>(null);
  const [panel, setPanel] = useState(true);
  const { toasts, push } = useToasts();
  const { inc, setInc, error: incError } = useIncident(selected);

  useEffect(() => { commandApi.live().then(l => { setLive(l); setError(null); }).catch(caught => setError(errorWords(caught, 'Could not load the live picture.'))); }, [tick]);
  useEffect(() => {
    commandApi.myStations().then(r => setStations(r.stations.filter((s: MyStation) => s.detail.row.latitude != null && s.detail.row.longitude != null).map((s: MyStation) => ({ id: s.detail.row.id, name: s.detail.row.name, latitude: s.detail.row.latitude!, longitude: s.detail.row.longitude!, verified: s.detail.row.verified })))).catch(() => setStations([]));
  }, []);

  const shown = useMemo(() => {
    if (!live) return null;
    const incidents = live.incidents.filter(i => severity === 0 || i.severity <= severity).sort((a, b) => (Number(b.unowned) - Number(a.unowned)) || (a.severity - b.severity) || (b.ageMinutes - a.ageMinutes));
    return { ...live, incidents };
  }, [live, severity]);

  const pointOf = (i: LivePicture['incidents'][number]): [number, number] | null => {
    if (i.latitude !== null && i.longitude !== null) return [i.longitude, i.latitude];
    const d = live?.districts.find(x => x.slug === i.districtSlug);
    return d ? [d.longitude, d.latitude] : null;
  };

  return (
    <div style={{ position: 'relative', flex: 1, minHeight: 'calc(100vh - 46px)', display: 'flex' }}>
      <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
        <LiveMap live={shown} shapes={shapes} stations={stations} onOpen={setSelected} focus={focus} height="100%" fit />
        <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', gap: 8, alignItems: 'center', background: 'rgba(7,11,18,.85)', border: `1px solid ${T.line2}`, borderRadius: 8, padding: '6px 10px', backdropFilter: 'blur(6px)' }}>
          <LiveDot up={socket} />
          <span style={{ fontSize: 11, color: T.subtle }}>·</span>
          <Segmented size="xs" value={severity} onChange={setSeverity} options={[[0, 'All'], [1, 'P1'], [2, '≤ P2'], [3, '≤ P3']]} />
          <span style={{ fontSize: 11, color: T.subtle }}>·</span>
          <Legend />
          <Btn size="xs" tone="ghost" onClick={() => setPanel(p => !p)}>{panel ? 'Hide list' : 'Show list'}</Btn>
        </div>
        {error ? <div style={{ position: 'absolute', bottom: 30, left: 10, right: 10 }}><ErrorLine>{error}</ErrorLine></div> : null}
      </div>

      {panel ? (
        <aside style={{ width: 340, flexShrink: 0, borderLeft: `1px solid ${T.line}`, background: T.surface, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '10px 12px', borderBottom: `1px solid ${T.line}`, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Segmented size="xs" value={tab} onChange={setTab} options={[['incidents', <>Incidents <b className="cc-num">{shown?.incidents.length ?? 0}</b></>], ['responders', <>Responders <b className="cc-num">{live?.responders.length ?? 0}</b></>]]} />
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 10.5, color: T.subtle }}>{live ? live.scope : ''}</span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {!live ? <Loading /> : tab === 'incidents' ? (
              shown!.incidents.length === 0 ? <Empty>Nothing open at this severity.</Empty> : shown!.incidents.map(i => {
                const p = pointOf(i);
                return (
                  <div key={i.id} className="cc-row" data-active={selected === i.id ? '1' : '0'} onClick={() => { setSelected(i.id); if (p) setFocus(p); }} style={{ display: 'grid', gridTemplateColumns: '14px 1fr auto', gap: 8, alignItems: 'start', padding: '8px 12px', borderBottom: `1px solid ${T.line}`, cursor: 'pointer' }}>
                    <SeverityMark severity={i.severity} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><b className="cc-num" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{i.number}</b><span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.isSensitive ? 'Private' : i.situationWords}</span></div>
                      <div style={{ fontSize: 11, color: T.subtle }}>{districtName(i.districtSlug)} · {i.facilityName ?? 'unrouted'} · {INCIDENT_STATUS[i.status]}{i.responding > 0 ? ` · ${i.responding} going` : ''}{i.latitude === null ? ' · no pin' : ''}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}><div className="cc-num" style={{ fontSize: 11.5, color: i.unowned && i.ageMinutes > 10 ? T.bad : T.muted }}>{age(i.ageMinutes)}</div>{i.unowned ? <Pill tone="warn">unowned</Pill> : i.escalationLevel > 0 ? <Pill tone="bad">L{i.escalationLevel}</Pill> : null}</div>
                  </div>
                );
              })
            ) : (
              live.responders.length === 0 ? <Empty>Nobody on duty is sharing a position.</Empty> : live.responders.map(r => (
                <div key={r.id} className="cc-row" onClick={() => setFocus([r.longitude, r.latitude])} style={{ display: 'grid', gridTemplateColumns: '10px 1fr auto', gap: 8, alignItems: 'center', padding: '8px 12px', borderBottom: `1px solid ${T.line}`, cursor: 'pointer' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: r.onIncidentNumber ? T.warn : T.good }} />
                  <div style={{ minWidth: 0 }}><div style={{ fontSize: 12, fontWeight: 600 }}>{r.name}</div><div style={{ fontSize: 11, color: T.subtle }}>{RESPONDER_ROLE[r.role]} · {RESPONDER_STATUS[r.status]}{r.onIncidentNumber ? ` · on ${r.onIncidentNumber}` : ''} · {r.institutionName}</div></div>
                  <span className="cc-num" style={{ fontSize: 11, color: r.ageMinutes > 10 ? T.warn : T.muted }}>{r.ageMinutes === 0 ? 'now' : `${r.ageMinutes}m`}</span>
                </div>
              ))
            )}
          </div>
          {live ? (
            <div style={{ padding: '8px 12px', borderTop: `1px solid ${T.line}` }}>
              <Eyebrow style={{ marginBottom: 4 }}>Fleet</Eyebrow>
              {live.fleet.map(f => <div key={f.institutionName} style={{ fontSize: 11.5, color: T.muted, display: 'flex', gap: 8 }}><span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.institutionName}</span><span className="cc-num" style={{ color: T.good }}>{f.respondersOnDuty} on</span><span className="cc-num">{f.respondersFree} free</span><span className="cc-num">{f.vehiclesFree} veh</span></div>)}
            </div>
          ) : null}
        </aside>
      ) : null}

      {selected ? (
        <Drawer width={720} onClose={() => setSelected(null)} title={<span style={{ fontSize: 12, color: T.muted }}>Incident</span>} header={<Btn size="xs" tone="ghost" onClick={() => navigate(`/incidents/${selected}`)}>Full page</Btn>}>
          {incError ? <ErrorLine>{incError}</ErrorLine> : !inc ? <Loading label="Opening…" /> : <IncidentPanel inc={inc} onChanged={setInc} push={push} />}
        </Drawer>
      ) : null}
      <Toasts toasts={toasts} />
    </div>
  );
}

function Legend() {
  return (
    <span style={{ display: 'inline-flex', gap: 10, fontSize: 10.5, color: T.muted, alignItems: 'center' }}>
      {[['P1', T.severity[0]], ['P2', T.severity[1]], ['P3', T.severity[2]], ['P4', T.severity[3]]].map(([l, c]) => <span key={l} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><span style={{ width: 8, height: 8, borderRadius: 4, background: c }} />{l}</span>)}
      <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><span style={{ width: 8, height: 8, borderRadius: 4, background: T.good }} />responder</span>
      <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><span style={{ width: 8, height: 8, borderRadius: 4, border: `1.5px solid ${T.text}` }} />station</span>
    </span>
  );
}
