/**
 * The queue.
 *
 * Every open incident this desk may see, densest first: unowned and critical at the top,
 * oldest within that. A row opens a drawer beside the queue rather than a new page, so the
 * person at the desk keeps the whole picture while they work one incident. The queue
 * follows the room — every hub nudge refetches — and the filters are in the URL so a
 * bookmark to "unowned" is a bookmark to "unowned".
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CATEGORY, INCIDENT_STATUS, commandApi, errorWords, isOpen, type DispatchQueue, type QueueCard } from '../api';
import { T } from '../theme';
import { Btn, Drawer, Empty, ErrorLine, Input, Loading, Pill, Segmented, SeverityMark, Table, Td, Th, Toasts, age, useToasts } from '../ui';
import { useCommand } from '../useCommand';
import { IncidentPanel, useIncident } from './Incident';

type Filter = 'all' | 'unowned' | 'p1' | 'responding' | 'escalated' | 'closed';

export function Queue() {
  const { tick, districtName } = useCommand();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const filter = (params.get('filter') as Filter) || 'all';
  const selected = params.get('open');
  const [queue, setQueue] = useState<DispatchQueue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [training, setTraining] = useState(false);
  const { toasts, push } = useToasts();
  const { inc, setInc, error: incError } = useIncident(selected);

  useEffect(() => {
    commandApi.queue({ take: 500, includeClosed: filter === 'closed', includeTraining: training })
      .then(q => { setQueue(q); setError(null); })
      .catch(caught => setError(errorWords(caught, 'Could not load the queue.')));
  }, [tick, filter, training]);

  const rows = useMemo(() => {
    const cards = queue?.cards ?? [];
    const needle = search.trim().toLowerCase();
    const picked = cards.filter(c =>
      (filter === 'all' ? isOpen(c.status)
        : filter === 'unowned' ? c.unowned && isOpen(c.status)
        : filter === 'p1' ? c.severity === 1 && isOpen(c.status)
        : filter === 'responding' ? [9, 10, 11].includes(c.status)
        : filter === 'escalated' ? c.escalationLevel > 0 && isOpen(c.status)
        : !isOpen(c.status))
      && (!needle || `${c.number} ${c.situationWords} ${c.community ?? ''} ${c.landmark ?? ''} ${c.facilityName ?? ''} ${districtName(c.districtSlug)}`.toLowerCase().includes(needle)));
    return picked.sort((a, b) => (Number(b.unowned) - Number(a.unowned)) || (a.severity - b.severity) || (b.ageMinutes - a.ageMinutes));
  }, [queue, filter, search, districtName]);

  const setFilter = (f: Filter) => { const next = new URLSearchParams(params); if (f === 'all') next.delete('filter'); else next.set('filter', f); setParams(next, { replace: true }); };
  const open = (id: string | null) => { const next = new URLSearchParams(params); if (id) next.set('open', id); else next.delete('open'); setParams(next, { replace: true }); };

  const counts = useMemo(() => {
    const cards = queue?.cards ?? [];
    return { all: cards.filter(c => isOpen(c.status)).length, unowned: cards.filter(c => c.unowned && isOpen(c.status)).length, p1: cards.filter(c => c.severity === 1 && isOpen(c.status)).length, responding: cards.filter(c => [9, 10, 11].includes(c.status)).length, escalated: cards.filter(c => c.escalationLevel > 0 && isOpen(c.status)).length };
  }, [queue]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0, flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Segmented value={filter} onChange={setFilter} options={[
          ['all', <>Open <Count n={counts.all} /></>], ['unowned', <>Unowned <Count n={counts.unowned} tone={T.warn} /></>], ['p1', <>P1 <Count n={counts.p1} tone={T.bad} /></>],
          ['responding', <>Responding <Count n={counts.responding} tone={T.good} /></>], ['escalated', <>Escalated <Count n={counts.escalated} tone={T.bad} /></>], ['closed', 'Closed'],
        ]} />
        <span style={{ flex: 1 }} />
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11.5, color: T.muted, cursor: 'pointer' }}><input type="checkbox" checked={training} onChange={e => setTraining(e.target.checked)} style={{ accentColor: T.accent }} /> training</label>
        <div style={{ width: 240 }}><Input value={search} onChange={setSearch} placeholder="Number, words, place, station…" /></div>
        <span style={{ fontSize: 11, color: T.subtle }}>{queue ? `${queue.desk}${queue.national ? ' · national' : ''}` : ''}</span>
      </div>
      {error ? <ErrorLine>{error}</ErrorLine> : null}
      <div style={{ border: `1px solid ${T.line}`, borderRadius: T.radius, background: T.surface, overflow: 'hidden', flex: 1, minHeight: 0 }}>
        {!queue ? <Loading /> : rows.length === 0 ? <Empty>{filter === 'closed' ? 'Nothing closed in the window.' : search ? 'Nothing matches.' : 'Nothing open on this desk. The room is quiet.'}</Empty> : (
          <Table minWidth={860}>
            <thead><tr><Th width={28} /><Th>Number</Th><Th>What</Th><Th>Where</Th><Th>Station</Th><Th>Status</Th><Th>Owner</Th><Th right>Age</Th></tr></thead>
            <tbody>
              {rows.map(c => <Row key={c.id} c={c} active={selected === c.id} onOpen={() => open(c.id)} districtName={districtName} />)}
            </tbody>
          </Table>
        )}
      </div>

      {selected ? (
        <Drawer width={720} onClose={() => open(null)} title={<span style={{ fontSize: 12, color: T.muted }}>Incident</span>} header={<Btn size="xs" tone="ghost" onClick={() => navigate(`/incidents/${selected}`)}>Full page</Btn>}>
          {incError ? <ErrorLine>{incError}</ErrorLine> : !inc ? <Loading label="Opening…" /> : <IncidentPanel inc={inc} onChanged={setInc} push={push} />}
        </Drawer>
      ) : null}
      <Toasts toasts={toasts} />
    </div>
  );
}

function Count({ n, tone }: { n: number; tone?: string }) {
  return <span className="cc-num" style={{ marginLeft: 4, color: n > 0 ? (tone ?? T.text) : T.subtle }}>{n}</span>;
}

function Row({ c, active, onOpen, districtName }: { c: QueueCard; active: boolean; onOpen: () => void; districtName: (s: string | null) => string }) {
  const tone = c.status === 1 ? 'warn' : c.status === 4 ? 'bad' : [9, 10, 11].includes(c.status) ? 'good' : !isOpen(c.status) ? 'neutral' : 'info';
  return (
    <tr className="cc-row" data-active={active ? '1' : '0'} onClick={onOpen} style={{ cursor: 'pointer' }}>
      <Td style={{ paddingRight: 0 }}><SeverityMark severity={c.severity} /></Td>
      <Td mono><b>{c.number}</b>{c.isSensitive ? <span style={{ color: T.subtle }} title="Private"> ·</span> : null}</Td>
      <Td><div style={{ fontWeight: 500 }}>{c.situationWords}</div><div style={{ fontSize: 11, color: T.subtle }}>{CATEGORY[c.category]}{c.peopleAffected ? ` · ${c.peopleAffected} people` : ''}{c.isTraining ? ' · training' : ''}</div></Td>
      <Td><div>{districtName(c.districtSlug)}</div><div style={{ fontSize: 11, color: T.subtle, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[c.community, c.landmark].filter(Boolean).join(' · ') || (c.hasPin ? 'pin only' : 'no pin')}</div></Td>
      <Td muted>{c.facilityName ?? <span style={{ color: T.warn }}>unrouted</span>}</Td>
      <Td><Pill tone={tone}>{INCIDENT_STATUS[c.status]}</Pill>{c.escalationLevel > 0 ? <Pill tone="bad"> L{c.escalationLevel}</Pill> : null}</Td>
      <Td>{c.unowned ? <span style={{ color: T.warn, fontWeight: 600 }}>nobody</span> : <span style={{ color: T.muted }}>{c.dispatcherName}</span>}</Td>
      <Td right mono style={{ color: c.unowned && c.ageMinutes > 10 ? T.bad : undefined }}>{age(c.ageMinutes)}</Td>
    </tr>
  );
}
