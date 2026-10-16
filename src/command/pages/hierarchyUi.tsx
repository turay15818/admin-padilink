/**
 * The pieces the ladder's three pages share: the breadcrumb, the range, the health of a
 * district in colour and in words, the map of the country painted by that health, the
 * list of what needs a hand, and the form that records a district's stations in one go.
 *
 * Nothing on these pages is decoration. A colour always has its word beside it, a
 * number always has the figure it is measured against, and a page for a rung the person
 * does not stand on is a plain link only when the API said they may open it.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  HEALTH_WORDS, commandApi, errorWords,
  type DistrictHealth, type DistrictRollup, type HierarchyAttention, type HierarchyFigures, type RegisterStationsResult, type NewStation,
} from '../api';
import { Icon } from '../icons';
import { T } from '../theme';
import { Actions, Btn, ErrorLine, Field, Input, Modal, Pill, Segmented, Select, Table, Td, Textarea, Th, Tile, delta, minutesWord, type PillTone } from '../ui';
import { useCommand } from '../useCommand';

/* ---------- where we are ---------- */

export type Crumb = { label: string; to?: string };

export function Crumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Where you are" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.subtle, flexWrap: 'wrap' }}>
      {items.map((c, i) => (
        <span key={`${c.label}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {i > 0 ? <Icon name="chevronRight" size={11} /> : null}
          {c.to ? <Link to={c.to} style={{ color: T.muted, textDecoration: 'none' }}>{c.label}</Link> : <span style={{ color: T.text, fontWeight: 600 }}>{c.label}</span>}
        </span>
      ))}
    </nav>
  );
}

export function DaysPicker({ days, onChange }: { days: number; onChange: (d: number) => void }) {
  return <Segmented value={days} onChange={onChange} options={[[7, '7 days'], [30, '30 days'], [90, '90 days']]} />;
}

/* ---------- health ---------- */

export const HEALTH_TONE: Record<DistrictHealth, PillTone> = { unserved: 'bad', unstaffed: 'warn', strained: 'bad', busy: 'info', calm: 'good' };
export const HEALTH_COLOUR: Record<DistrictHealth, string> = { unserved: '#5A6B84', unstaffed: T.warn, strained: T.bad, busy: T.info, calm: T.good };

export function HealthPill({ health }: { health: DistrictHealth }) {
  const w = HEALTH_WORDS[health];
  return <span title={w.hint}><Pill tone={HEALTH_TONE[health]} dot>{w.label}</Pill></span>;
}

/** "12 more than the 30 days before" in the words a wall would use. */
export function Change({ now, before, lowerIsBetter }: { now: number; before: number; lowerIsBetter?: boolean }) {
  const d = delta(now, before);
  if (d === null || d === 0) return <span style={{ color: T.subtle }}>{before === 0 && now > 0 ? 'new' : 'level'}</span>;
  const worse = lowerIsBetter ? d > 0 : false;
  const better = lowerIsBetter ? d < 0 : false;
  return <span className="cc-num" style={{ color: worse ? T.warn : better ? T.good : T.muted }}>{d > 0 ? '+' : ''}{d}%</span>;
}

/* ---------- the figures every rung shares ---------- */

export function FigureTiles({ f, days, onOpen, unit }: { f: HierarchyFigures; days: number; onOpen?: (what: 'open' | 'p1' | 'unowned') => void; unit: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
      <Tile label="Open now" value={f.openNow} tone={f.openNow > 0 ? T.text : T.subtle} note={`${f.unowned} nobody has taken`} onClick={onOpen ? () => onOpen('open') : undefined} />
      <Tile label="Critical open" value={f.p1Open} tone={f.p1Open > 0 ? T.bad : T.subtle} note="P1, not yet closed" onClick={onOpen ? () => onOpen('p1') : undefined} />
      <Tile label={`Reported · ${days} days`} value={f.reported} note={<>against {f.reportedBefore} before · <Change now={f.reported} before={f.reportedBefore} /></>} />
      <Tile label="Resolved" value={f.resolved} tone={f.resolved > 0 ? T.good : T.subtle} note={f.reported === 0 ? 'nothing reported' : `${Math.round((f.resolved / Math.max(1, f.reported)) * 100)}% of those reported`} />
      <Tile label="First answer" value={f.acknowledge.medianMinutes === null ? '—' : minutesWord(f.acknowledge.medianMinutes)} note={f.acknowledge.p90Minutes === null ? 'median to acknowledge' : `median · 9 in 10 within ${minutesWord(f.acknowledge.p90Minutes)}`} />
      <Tile label="On a desk" value={f.people} note={`${unit} · ${f.respondersOnDuty} of ${f.responders} responders on duty`} />
    </div>
  );
}

/* ---------- what needs a hand ---------- */

const WEIGHT_COLOUR = { high: T.bad, medium: T.warn, low: T.subtle } as const;
const WEIGHT_WORD = { high: 'Now', medium: 'Soon', low: 'When you can' } as const;

export function AttentionList({ items, link, empty = 'Nothing needs a hand. Every station here has a desk, an administrator and a pin.' }: { items: HierarchyAttention[]; link?: (a: HierarchyAttention) => string | null; empty?: string }) {
  if (items.length === 0) return <div style={{ padding: '14px 12px', fontSize: 12.5, color: T.good, display: 'flex', gap: 8, alignItems: 'center' }}><Icon name="check" size={14} color={T.good} />{empty}</div>;
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {items.map((a, i) => {
        const to = link?.(a) ?? null;
        const body = (
          <span style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 12px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, lineHeight: 1.45, color: T.text }}>
            <span title={WEIGHT_WORD[a.weight]} style={{ marginTop: 5, width: 7, height: 7, borderRadius: 4, background: WEIGHT_COLOUR[a.weight], flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0 }}>{a.text}</span>
            <span style={{ fontSize: 10.5, color: WEIGHT_COLOUR[a.weight], letterSpacing: 0.6, textTransform: 'uppercase', whiteSpace: 'nowrap', marginTop: 2 }}>{WEIGHT_WORD[a.weight]}</span>
          </span>
        );
        return <li key={`${a.kind}-${a.facilityId ?? a.districtSlug ?? i}-${i}`}>{to ? <Link to={to} className="cc-row" style={{ display: 'block', textDecoration: 'none' }}>{body}</Link> : body}</li>;
      })}
    </ul>
  );
}

/* ---------- the country, painted by how each district is doing ---------- */

export function CountryMap({ districts, selected, onPick }: { districts: DistrictRollup[]; selected?: string | null; onPick?: (slug: string) => void }) {
  const { shapes } = useCommand();
  const [hover, setHover] = useState<string | null>(null);
  const bySlug = useMemo(() => new Map(districts.map(d => [d.slug, d])), [districts]);
  const drawn = useMemo(() => {
    if (shapes.length === 0) return null;
    let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;
    for (const s of shapes) for (const ring of s.rings) for (const [lat, lng] of ring) {
      if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
    }
    const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
    const w = (maxLng - minLng) * k, h = maxLat - minLat;
    const scale = 1000 / Math.max(w, h);
    const pt = ([lat, lng]: number[]) => `${((lng - minLng) * k * scale).toFixed(1)},${((maxLat - lat) * scale).toFixed(1)}`;
    return {
      width: Math.ceil(w * scale), height: Math.ceil(h * scale),
      paths: shapes.map(s => ({ slug: s.slug, name: s.name, d: s.rings.map(r => `M${r.map(pt).join('L')}Z`).join(''), centre: pt([s.latitude, s.longitude]) })),
    };
  }, [shapes]);
  if (!drawn) return <div style={{ padding: 20, fontSize: 12, color: T.subtle }}>The district outlines are not loaded.</div>;
  const shown = hover ? bySlug.get(hover) : null;
  const shownName = hover ? drawn.paths.find(p => p.slug === hover)?.name : null;

  return (
    <div>
      <svg viewBox={`0 0 ${drawn.width} ${drawn.height}`} role="img" aria-label="Sierra Leone by district, coloured by how each is doing" style={{ width: '100%', maxHeight: 420, display: 'block' }}>
        {drawn.paths.map(p => {
          const row = bySlug.get(p.slug);
          const colour = row ? HEALTH_COLOUR[row.health] : T.surface3;
          const live = row?.canOpen ?? false;
          return (
            <path key={p.slug} d={p.d} fill={colour} fillOpacity={row ? (hover === p.slug || selected === p.slug ? 0.85 : 0.5) : 0.35}
              stroke={selected === p.slug ? T.accent : T.bg} strokeWidth={selected === p.slug ? 5 : 2.5} strokeLinejoin="round"
              style={{ cursor: live && onPick ? 'pointer' : 'default', transition: 'fill-opacity .12s' }}
              onMouseEnter={() => setHover(p.slug)} onMouseLeave={() => setHover(h => (h === p.slug ? null : h))}
              onClick={() => { if (live && onPick) onPick(p.slug); }}>
              <title>{`${p.name}${row ? ` · ${HEALTH_WORDS[row.health].label} · ${row.figures.stations} stations · ${row.figures.openNow} open` : ''}`}</title>
            </path>
          );
        })}
      </svg>
      <div style={{ minHeight: 34, fontSize: 12, color: T.muted, padding: '2px 4px' }}>
        {shown ? <><b style={{ color: T.text }}>{shown.name}</b> · {HEALTH_WORDS[shown.health].label} · {shown.figures.stations} {shown.figures.stations === 1 ? 'station' : 'stations'} · {shown.figures.openNow} open{shown.figures.p1Open > 0 ? <span style={{ color: T.bad }}> · {shown.figures.p1Open} critical</span> : null}</>
          : hover && shownName ? <><b style={{ color: T.text }}>{shownName}</b> · outside your reach</> : 'Point at a district.'}
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: T.muted, padding: '2px 4px 4px' }}>
        {(Object.keys(HEALTH_WORDS) as DistrictHealth[]).map(h => <span key={h} title={HEALTH_WORDS[h].hint} style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><span style={{ width: 9, height: 9, borderRadius: 2, background: HEALTH_COLOUR[h] }} />{HEALTH_WORDS[h].label}</span>)}
      </div>
    </div>
  );
}

/* ---------- recording a district's stations ---------- */

type Line = { name: string; community: string; adminName: string; adminEmail: string; adminPhone: string; latitude: string; longitude: string };
const blank = (): Line => ({ name: '', community: '', adminName: '', adminEmail: '', adminPhone: '', latitude: '', longitude: '' });
const MAX = 60;

/** One line per station: name, community, admin name, admin e-mail — separated by a tab, a pipe or a comma. */
export function parseLines(text: string): Line[] {
  return text.split(/\r?\n/).map(raw => raw.trim()).filter(Boolean).slice(0, MAX).map(raw => {
    const parts = raw.split(/\t|\||,/).map(x => x.trim());
    const email = parts.find(x => /.+@.+\..+/.test(x)) ?? '';
    const rest = parts.filter(x => x !== email);
    return { ...blank(), name: rest[0] ?? '', community: rest[1] ?? '', adminName: rest[2] ?? '', adminEmail: email };
  }).filter(l => l.name);
}

export function RecordStations({ districts, fixed, institutionId, onClose, onDone }: {
  districts: { slug: string; name: string }[]; fixed?: string | null; institutionId?: string | null; onClose: () => void; onDone: (r: RegisterStationsResult) => void;
}) {
  const [slug, setSlug] = useState(fixed ?? '');
  const [status, setStatus] = useState(2);
  const [lines, setLines] = useState<Line[]>([blank(), blank(), blank()]);
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RegisterStationsResult | null>(null);

  const set = (i: number, patch: Partial<Line>) => setLines(list => list.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const filled = lines.filter(l => l.name.trim());
  const withAdmin = filled.filter(l => l.adminEmail.trim()).length;
  const problems = filled.some(l => l.adminEmail.trim() && !/.+@.+\..+/.test(l.adminEmail.trim())) ? 'An administrator needs a valid e-mail address — it is where the setup link goes.' : null;
  const take = () => {
    const parsed = parseLines(paste);
    if (parsed.length === 0) return;
    setLines(list => [...list.filter(l => l.name.trim()), ...parsed].slice(0, MAX));
    setPaste('');
  };

  const save = () => {
    setBusy(true); setError(null);
    const stations: NewStation[] = filled.map(l => ({
      name: l.name.trim(), community: l.community.trim() || null,
      latitude: l.latitude.trim() === '' ? null : Number(l.latitude), longitude: l.longitude.trim() === '' ? null : Number(l.longitude),
      adminName: l.adminName.trim() || null, adminEmail: l.adminEmail.trim() || null, adminPhone: l.adminPhone.trim() || null,
    }));
    commandApi.registerStations({ institutionId: institutionId ?? null, districtSlug: slug, stations, status })
      .then(r => { setResult(r); onDone(r); })
      .catch(caught => setError(errorWords(caught, 'Those did not save.')))
      .finally(() => setBusy(false));
  };

  if (result) {
    return (
      <Modal title={`${result.districtName}: ${result.created} recorded`} onClose={onClose} width={680}>
        <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 10, lineHeight: 1.5 }}>
          {result.created} {result.created === 1 ? 'station is' : 'stations are'} on the chart{result.skipped > 0 ? `, ${result.skipped} skipped` : ''}{result.adminsBound > 0 ? `, ${result.adminsBound} ${result.adminsBound === 1 ? 'administrator' : 'administrators'} appointed. Anyone new has a setup link in their inbox` : ''}.
        </div>
        <Table minWidth={560}>
          <thead><tr><Th>Station</Th><Th>Result</Th></tr></thead>
          <tbody>{result.rows.map((r, i) => (
            <tr key={`${r.name}-${i}`}><Td><b>{r.name}</b></Td><Td><Pill tone={r.created ? (r.adminBound || !r.message.includes('not added') ? 'good' : 'warn') : 'neutral'} dot>{r.created ? 'recorded' : 'skipped'}</Pill> <span style={{ color: T.muted, fontSize: 12 }}>{r.message}</span></Td></tr>
          ))}</tbody>
        </Table>
        <Actions><Btn tone="primary" onClick={onClose}>Done</Btn></Actions>
      </Modal>
    );
  }

  return (
    <Modal title="Record stations" onClose={onClose} width={900}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'end', marginBottom: 4 }}>
        <Field label="District" hint={fixed ? 'Your district command records its own stations.' : 'The district these stations belong to. Reports there are routed to them.'}>
          <Select value={slug} onChange={setSlug} disabled={Boolean(fixed)}><option value="">Pick a district</option>{districts.map(d => <option key={d.slug} value={d.slug}>{d.name}</option>)}</Select>
        </Field>
        <Field label="They start as"><Segmented value={status} onChange={setStatus} options={[[2, 'Active'], [1, 'Draft']]} /></Field>
      </div>
      <details style={{ marginBottom: 12, fontSize: 12.5 }}>
        <summary style={{ cursor: 'pointer', color: T.accent }}>Paste a list</summary>
        <div style={{ marginTop: 8 }}>
          <Textarea value={paste} onChange={setPaste} rows={5} placeholder={'Kenema Central, Hangha Road, Mariama Kamara, mariama@police.gov.sl\nBlama Police Station, Blama\nTongo Field Police Post | Tongo'} />
          <div style={{ fontSize: 11, color: T.subtle, margin: '4px 0 6px', lineHeight: 1.45 }}>One station a line: name, community, then the station administrator's name and e-mail if you have them. Separate with a comma, a pipe or a tab.</div>
          <Btn size="sm" onClick={take} disabled={!paste.trim()}>Add these to the list</Btn>
        </div>
      </details>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: 880, borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr><Th>Station</Th><Th>Community</Th><Th>Administrator</Th><Th>Administrator e-mail</Th><Th>Latitude</Th><Th>Longitude</Th><Th /></tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td style={{ padding: '3px 4px', minWidth: 230 }}><Input value={l.name} onChange={v => set(i, { name: v })} placeholder="Station name" /></td>
                <td style={{ padding: '3px 4px', minWidth: 120 }}><Input value={l.community} onChange={v => set(i, { community: v })} /></td>
                <td style={{ padding: '3px 4px' }}><Input value={l.adminName} onChange={v => set(i, { adminName: v })} /></td>
                <td style={{ padding: '3px 4px' }}><Input value={l.adminEmail} onChange={v => set(i, { adminEmail: v })} type="email" /></td>
                <td style={{ padding: '3px 4px', width: 90 }}><Input value={l.latitude} onChange={v => set(i, { latitude: v })} mono placeholder="7.88" /></td>
                <td style={{ padding: '3px 4px', width: 90 }}><Input value={l.longitude} onChange={v => set(i, { longitude: v })} mono placeholder="-11.19" /></td>
                <td style={{ padding: '3px 0', width: 28 }}><button type="button" aria-label="Remove this line" onClick={() => setLines(list => (list.length > 1 ? list.filter((_, j) => j !== i) : [blank()]))} style={{ border: 'none', background: 'transparent', color: T.subtle, cursor: 'pointer', fontSize: 16 }}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8 }}>
        <Btn size="sm" tone="ghost" onClick={() => setLines(list => (list.length < MAX ? [...list, blank()] : list))}>Add a line</Btn>
        <span style={{ fontSize: 11.5, color: T.subtle }}>{filled.length} {filled.length === 1 ? 'station' : 'stations'}{withAdmin > 0 ? `, ${withAdmin} with an administrator` : ''} · at most {MAX} at a time</span>
      </div>
      <div style={{ fontSize: 11.5, color: T.muted, lineHeight: 1.5, margin: '10px 0 0', padding: '8px 10px', borderRadius: 8, background: T.surface2 }}>
        An administrator is appointed to that station alone: they see its reports, its people and nothing from the next station. Someone without a Vacancy account is sent a link to choose their own password. A station already on the chart is skipped, never changed.
      </div>
      {problems ? <div style={{ marginTop: 8 }}><ErrorLine>{problems}</ErrorLine></div> : null}
      {error ? <div style={{ marginTop: 8 }}><ErrorLine>{error}</ErrorLine></div> : null}
      <Actions><Btn onClick={onClose}>Cancel</Btn><Btn tone="primary" disabled={busy || !slug || filled.length === 0 || Boolean(problems)} onClick={save}>{busy ? 'Recording…' : `Record ${filled.length || ''} ${filled.length === 1 ? 'station' : 'stations'}`}</Btn></Actions>
    </Modal>
  );
}

/* ---------- a person, in a line ---------- */

export function AdminNames({ names, none = 'none yet' }: { names: string[]; none?: ReactNode }) {
  if (names.length === 0) return <span style={{ color: T.warn }}>{none}</span>;
  return <span>{names.slice(0, 2).join(', ')}{names.length > 2 ? <span style={{ color: T.subtle }}> +{names.length - 2}</span> : null}</span>;
}

export function useGo() {
  const navigate = useNavigate();
  return {
    district: (slug: string) => navigate(`/districts/${slug}`),
    station: (id: string) => navigate(`/stations/${id}`),
    queue: (what: 'open' | 'p1' | 'unowned') => navigate(what === 'open' ? '/queue' : `/queue?filter=${what}`),
  };
}

