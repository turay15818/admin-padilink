/**
 * The institution, run by the institution.
 *
 * Everything the national directory says about this institution — its profile, its chart
 * of offices and branches, the departments inside them, the numbers that answer, what each
 * office can handle — on one page the institution's own administrator edits. The
 * directory's trust rules hold: nothing here marks anything as verified (Vacancy rings and
 * confirms), a changed number starts again from unverified, and every change lands on the
 * audit trail as the institution's own word. A station supervisor sees the whole chart and
 * edits only the part under their station; the rows say so.
 *
 * The readiness score at the top is the honest answer to "is this institution findable
 * and reachable": the checklist behind it is what a dispatcher and a citizen actually
 * need, weighted by how much it hurts when it is missing.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AVAILABILITY_WORDS, CLASS_SHORT, COVERAGE_WORDS, GPS_METHOD, HOURS_WORDS, OFFICE_STATUS, STATION_KIND, VERIFICATION, commandApi, errorWords,
  type DeskContact, type DeskDirectory, type DeskInstitution, type DeskOffice, type DeskUnit,
} from '../api';
import { Ring } from '../charts';
import { Icon, type IconName } from '../icons';
import { PinMap } from '../PinMap';
import { T } from '../theme';
import { Actions, Btn, Check, Crest, Empty, ErrorLine, Eyebrow, Field, Input, Loading, Modal, Panel, Pill, SECTOR_TONES, Select, Table, Td, Textarea, Th, Tile, Toasts, crestText, fmtDate, fmtDateTime, useToasts, type PillTone } from '../ui';
import { useCommand } from '../useCommand';

type Tab = 'overview' | 'profile' | 'offices' | 'departments' | 'contacts';
const TABS: { key: Tab; label: string; icon: IconName }[] = [
  { key: 'overview', label: 'Readiness', icon: 'shield' },
  { key: 'profile', label: 'Profile', icon: 'briefcase' },
  { key: 'offices', label: 'Offices', icon: 'sitemap' },
  { key: 'departments', label: 'Departments', icon: 'layers' },
  { key: 'contacts', label: 'Numbers', icon: 'phone' },
];

export function Institution() {
  const { tick, institutionId } = useCommand();
  const { tab: tabParam } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const tab: Tab = TABS.some(t => t.key === tabParam) ? (tabParam as Tab) : 'overview';
  const [dir, setDir] = useState<DeskDirectory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toasts, push } = useToasts();

  const load = () => commandApi.directory(institutionId).then(d => { setDir(d); setError(null); }).catch(caught => setError(errorWords(caught, 'Could not load the institution.')));
  useEffect(() => { void load(); }, [tick, institutionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (next: Tab, extra?: Record<string, string>) => {
    const search = new URLSearchParams(extra ?? {});
    navigate(`/institution/${next}${search.toString() ? `?${search}` : ''}`);
  };
  const done = (message: string) => { push(message); void load(); };
  const fail = (caught: unknown) => push(errorWords(caught, 'That did not save.'), 'error');

  if (error && !dir) return <ErrorLine>{error}</ErrorLine>;
  if (!dir) return <Loading label="Opening the institution…" />;
  const inst = dir.institution;
  const urgent = dir.attention.filter(a => a.severity === 3).length;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Header inst={inst} dir={dir} urgent={urgent} />
      <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${T.line}`, overflowX: 'auto' }}>
        {TABS.map(t => {
          const count = t.key === 'offices' ? dir.offices.length : t.key === 'departments' ? dir.units.length : t.key === 'contacts' ? dir.contacts.length : t.key === 'overview' ? dir.attention.length : null;
          const on = tab === t.key;
          return (
            <button key={t.key} type="button" onClick={() => go(t.key)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 12px', border: 'none', borderBottom: `2px solid ${on ? T.accent : 'transparent'}`, background: 'transparent', color: on ? T.text : T.muted, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', marginBottom: -1, whiteSpace: 'nowrap' }}>
              <Icon name={t.icon} size={14} color={on ? T.accent : T.subtle} />{t.label}
              {count !== null ? <span className="cc-num" style={{ fontSize: 10.5, padding: '0 6px', borderRadius: 4, background: on ? T.accentSoft : T.surface2, color: on ? T.accent : T.subtle }}>{count}</span> : null}
            </button>
          );
        })}
      </div>
      {error ? <ErrorLine>{error}</ErrorLine> : null}
      {tab === 'overview' ? <OverviewTab dir={dir} go={go} /> : null}
      {tab === 'profile' ? <ProfileTab dir={dir} onDone={done} onFail={fail} /> : null}
      {tab === 'offices' ? <OfficesTab dir={dir} focus={params.get('office')} setFocus={id => setParams(id ? { office: id } : {}, { replace: true })} onDone={done} onFail={fail} go={go} /> : null}
      {tab === 'departments' ? <DepartmentsTab dir={dir} onDone={done} onFail={fail} /> : null}
      {tab === 'contacts' ? <ContactsTab dir={dir} focus={params.get('contact')} officeFilter={params.get('office')} onDone={done} onFail={fail} /> : null}
      <Toasts toasts={toasts} />
    </div>
  );
}

/* ================================ header ================================ */

function Header({ inst, dir, urgent }: { inst: DeskInstitution; dir: DeskDirectory; urgent: number }) {
  const tone = SECTOR_TONES[inst.sectorTone ?? 'navy'] ?? SECTOR_TONES.navy;
  const score = dir.readiness.score;
  const scoreTone = score >= 85 ? T.good : score >= 55 ? T.warn : T.bad;
  return (
    <Panel pad={14}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <Crest text={crestText(inst.shortName ?? inst.name)} tone={tone} size={56} logo={inst.logoUrl} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: 19, fontWeight: 600, letterSpacing: -0.2 }}>{inst.name}</h1>
            {inst.shortName ? <Pill mono>{inst.shortName}</Pill> : null}
            <Pill tone={inst.status === 2 ? 'good' : inst.status === 1 ? 'warn' : 'bad'} dot>{inst.status === 2 ? 'Active' : inst.status === 1 ? 'Draft' : inst.status === 3 ? 'Suspended' : 'Archived'}</Pill>
            {inst.verified ? <Pill tone="accent">Verified by Vacancy{inst.verifiedAt ? ` · ${fmtDate(inst.verifiedAt)}` : ''}</Pill> : <Pill>Awaiting Vacancy's verification</Pill>}
          </div>
          <div style={{ fontSize: 12.5, color: T.muted, marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ color: tone, fontWeight: 600 }}>{inst.sectorName}</span>
            {inst.typeName ? <span>{inst.typeName}</span> : null}
            <span>{inst.government ? 'Government' : 'Approved private'}{inst.national ? ' · national' : ''}</span>
            {inst.publicPhone ? <span className="cc-num" style={{ color: T.text }}>{inst.publicPhone}</span> : <span style={{ color: T.warn }}>no public number</span>}
            {inst.headOfficeText ? <span>{inst.headOfficeText}</span> : null}
          </div>
          <div style={{ fontSize: 11, color: T.subtle, marginTop: 4 }}>
            {dir.canEditProfile ? 'You administer this institution.' : dir.canEdit ? `You supervise ${dir.managesOfficeName} and the offices under it; the rest is read-only here.` : 'Read-only — a supervisor changes this.'}
            {inst.updatedAt ? ` Last changed ${fmtDateTime(inst.updatedAt)}${inst.updatedBy ? ` by ${inst.updatedBy}` : ''}.` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
          <Stat label="Offices" value={dir.offices.length} />
          <Stat label="Departments" value={dir.units.length} />
          <Stat label="Numbers" value={dir.contacts.length} note={`${dir.contacts.filter(c => c.class === 1 && c.active).length} public`} />
          <Stat label="Needs a hand" value={dir.attention.length} tone={urgent > 0 ? T.bad : dir.attention.length > 0 ? T.warn : T.good} note={urgent > 0 ? `${urgent} today` : undefined} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 14, borderLeft: `1px solid ${T.line}` }}>
            <Ring part={score} whole={100} colour={scoreTone} size={58} label={`${score}`} />
            <div><Eyebrow>Readiness</Eyebrow><div style={{ fontSize: 12, color: T.muted, maxWidth: 120, lineHeight: 1.35 }}>{score >= 85 ? 'Findable and reachable.' : score >= 55 ? 'Usable, with gaps.' : 'Not yet reliable.'}</div></div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function Stat({ label, value, note, tone }: { label: string; value: number; note?: string; tone?: string }) {
  return (
    <div style={{ minWidth: 64 }}>
      <Eyebrow>{label}</Eyebrow>
      <div className="cc-num" style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.1, color: tone ?? T.text }}>{value}</div>
      {note ? <div style={{ fontSize: 10.5, color: T.subtle }}>{note}</div> : null}
    </div>
  );
}

/* ================================ readiness and attention ================================ */

const KIND_ICON: Record<string, IconName> = { pin: 'pin', hours: 'clock', contact: 'phone', stale: 'alert', people: 'team', capability: 'bolt', draft: 'facility', profile: 'briefcase' };

function OverviewTab({ dir, go }: { dir: DeskDirectory; go: (tab: Tab, extra?: Record<string, string>) => void }) {
  const pinned = dir.offices.filter(o => o.latitude != null).length;
  const verifiedNumbers = dir.contacts.filter(c => c.active && (c.verification === 1 || c.verification === 2)).length;
  const activeNumbers = dir.contacts.filter(c => c.active).length;
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
        <Tile label="Offices pinned" value={<>{pinned}<span style={{ fontSize: 14, color: T.subtle }}> / {dir.offices.length}</span></>} tone={dir.offices.length > 0 && pinned === dir.offices.length ? T.good : T.warn} note="a pin is what puts an office on the map and in the router" onClick={() => go('offices')} />
        <Tile label="Offices active" value={<>{dir.offices.filter(o => o.status === 2).length}<span style={{ fontSize: 14, color: T.subtle }}> / {dir.offices.length}</span></>} note={`${dir.offices.filter(o => o.status === 1).length} draft · ${dir.offices.filter(o => o.status === 3).length} suspended`} onClick={() => go('offices')} />
        <Tile label="Numbers confirmed" value={<>{verifiedNumbers}<span style={{ fontSize: 14, color: T.subtle }}> / {activeNumbers}</span></>} tone={activeNumbers > 0 && verifiedNumbers === activeNumbers ? T.good : T.warn} note="within the last ninety days" onClick={() => go('contacts')} />
        <Tile label="Public numbers" value={dir.contacts.filter(c => c.class === 1 && c.active).length + (dir.institution.publicPhone ? 1 : 0)} tone={dir.contacts.some(c => c.class === 1 && c.active) || dir.institution.publicPhone ? T.text : T.bad} note="what a citizen can ring" onClick={() => go('contacts')} />
        <Tile label="Offices with people" value={dir.offices.filter(o => o.people > 0 || o.responders > 0).length} note="somebody signs in or responds from here" onClick={() => go('offices')} />
        <Tile label="Open incidents" value={dir.offices.reduce((n, o) => n + o.openIncidents, 0)} note="routed to these offices right now" />
      </div>
      <div className="cc-grid-2" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 5fr) minmax(0, 7fr)', gap: 12, alignItems: 'start' }}>
        <Panel title="The checklist" note={`${dir.readiness.score} of 100 — what a dispatcher and a citizen need, weighted by how much it hurts when missing`} flush>
          {dir.readiness.items.map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: `1px solid ${T.line}` }}>
              <span style={{ width: 18, height: 18, borderRadius: 9, display: 'grid', placeItems: 'center', background: item.done ? T.goodSoft : T.surface3, color: item.done ? T.good : T.subtle, flexShrink: 0 }}>{item.done ? <Icon name="check" size={11} width={2.4} /> : <Icon name="dot" size={10} />}</span>
              <span style={{ flex: 1, fontSize: 12.5, color: item.done ? T.text : T.muted }}>{item.label}</span>
              {item.hint ? <span className="cc-num" style={{ fontSize: 11, color: T.subtle }}>{item.hint}</span> : null}
              <span className="cc-num" style={{ fontSize: 10.5, color: T.subtle, width: 28, textAlign: 'right' }}>{item.weight}</span>
            </div>
          ))}
        </Panel>
        <Panel title={<>Needs a hand · {dir.attention.length}</>} note="worst first — each one opens where it is fixed" flush>
          {dir.attention.length === 0 ? <Empty>Nothing. The directory is as complete as it can be told to be.</Empty> : dir.attention.slice(0, 60).map((a, i) => {
            const colour = a.severity === 3 ? T.bad : a.severity === 2 ? T.warn : T.subtle;
            const target = () => (a.contactId ? go('contacts', { contact: a.contactId }) : a.officeId ? go('offices', { office: a.officeId }) : a.kind === 'profile' ? go('profile') : a.kind === 'people' ? undefined : go('offices'));
            return (
              <div key={i} className="cc-row" onClick={target} style={{ display: 'flex', gap: 10, padding: '8px 12px', borderBottom: `1px solid ${T.line}`, cursor: 'pointer', borderLeft: `3px solid ${colour}` }}>
                <Icon name={KIND_ICON[a.kind] ?? 'alert'} size={15} color={colour} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{a.title}</div>
                  <div style={{ fontSize: 11.5, color: T.muted, lineHeight: 1.4 }}>{a.detail}</div>
                </div>
                <Icon name="chevronRight" size={14} color={T.subtle} />
              </div>
            );
          })}
        </Panel>
      </div>
    </div>
  );
}

/* ================================ profile ================================ */

function ProfileTab({ dir, onDone, onFail }: { dir: DeskDirectory; onDone: (m: string) => void; onFail: (c: unknown) => void }) {
  const inst = dir.institution;
  const [form, setForm] = useState({ shortName: inst.shortName ?? '', headOfficeText: inst.headOfficeText ?? '', publicPhone: inst.publicPhone ?? '', alternativePhone: inst.alternativePhone ?? '', email: inst.email ?? '', website: inst.website ?? '', description: inst.description ?? '', logoUrl: inst.logoUrl ?? '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setForm({ shortName: inst.shortName ?? '', headOfficeText: inst.headOfficeText ?? '', publicPhone: inst.publicPhone ?? '', alternativePhone: inst.alternativePhone ?? '', email: inst.email ?? '', website: inst.website ?? '', description: inst.description ?? '', logoUrl: inst.logoUrl ?? '' }); }, [inst]);
  const set = (k: keyof typeof form) => (v: string) => setForm(f => ({ ...f, [k]: v }));
  const dirty = JSON.stringify(form) !== JSON.stringify({ shortName: inst.shortName ?? '', headOfficeText: inst.headOfficeText ?? '', publicPhone: inst.publicPhone ?? '', alternativePhone: inst.alternativePhone ?? '', email: inst.email ?? '', website: inst.website ?? '', description: inst.description ?? '', logoUrl: inst.logoUrl ?? '' });
  const save = () => {
    setBusy(true); setError(null);
    commandApi.saveProfile({ institutionId: inst.id, ...Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim() || null])) })
      .then(() => onDone('Profile saved — the directory and the app show it now.'))
      .catch(caught => { setError(errorWords(caught, 'That did not save.')); onFail(caught); })
      .finally(() => setBusy(false));
  };
  const ro = !dir.canEditProfile;
  return (
    <div className="cc-grid-2" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 7fr) minmax(0, 5fr)', gap: 12, alignItems: 'start' }}>
      <Panel title="What the institution says about itself" note={ro ? "Read-only — the institution's administrator changes this." : 'Shown to citizens on the directory and in the app, and to every dispatcher who routes to you.'}>
        <div className="cc-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
          <Field label="Short name" hint="How the room refers to you — SLP, NEMS, NFF."><Input value={form.shortName} onChange={set('shortName')} disabled={ro} /></Field>
          <Field label="Head office" hint="Where the institution is run from."><Input value={form.headOfficeText} onChange={set('headOfficeText')} disabled={ro} /></Field>
          <Field label="Public phone" hint="The one number a citizen sees on the institution itself."><Input value={form.publicPhone} onChange={set('publicPhone')} disabled={ro} mono placeholder="+232 …" /></Field>
          <Field label="Alternative phone"><Input value={form.alternativePhone} onChange={set('alternativePhone')} disabled={ro} mono /></Field>
          <Field label="E-mail" hint="Vacancy writes here about the directory."><Input value={form.email} onChange={set('email')} disabled={ro} type="email" /></Field>
          <Field label="Website"><Input value={form.website} onChange={set('website')} disabled={ro} placeholder="www.…" /></Field>
          <Field label="Logo" hint="A web address for the crest, if there is one." span={2}><Input value={form.logoUrl} onChange={set('logoUrl')} disabled={ro} placeholder="https://…/crest.png" /></Field>
          <Field label="About" hint="One or two sentences on what the institution answers for." span={2}>{ro ? <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.5 }}>{form.description || '—'}</div> : <Textarea value={form.description} onChange={set('description')} rows={4} />}</Field>
        </div>
        {error ? <ErrorLine>{error}</ErrorLine> : null}
        {ro ? null : <Actions left={<span style={{ fontSize: 11, color: T.subtle }}>Saved as the institution's own word, with your name on the audit trail.</span>}><Btn tone="primary" disabled={busy || !dirty} onClick={save}>{busy ? 'Saving…' : 'Save profile'}</Btn></Actions>}
      </Panel>
      <div style={{ display: 'grid', gap: 12 }}>
        <Panel title="Set by Vacancy" note="The parts of the record the institution does not write. Ask Vacancy's administrators to change them.">
          <Line label="Name" value={inst.name} />
          <Line label="Sector" value={inst.sectorName} />
          <Line label="Type" value={inst.typeName} />
          <Line label="Government" value={inst.government ? 'Yes' : 'No — approved private'} />
          <Line label="Answers for" value={inst.national ? 'The whole country' : 'Its districts'} />
          <Line label="Standing" value={<Pill tone={inst.status === 2 ? 'good' : 'warn'}>{inst.status === 2 ? 'Active' : inst.status === 1 ? 'Draft' : inst.status === 3 ? 'Suspended' : 'Archived'}</Pill>} />
          <Line label="Verified" value={inst.verified ? <span style={{ color: T.good }}>Yes{inst.verifiedAt ? ` · ${fmtDate(inst.verifiedAt)}` : ''}</span> : <span style={{ color: T.warn }}>Not yet</span>} />
        </Panel>
        <Panel title="Numbers held at head office" note="Lines that belong to the institution rather than to one office." flush>
          {dir.contacts.filter(c => !c.officeId).length === 0 ? <Empty>None — the Numbers tab adds one.</Empty> : dir.contacts.filter(c => !c.officeId).map(c => <ContactLine key={c.id} c={c} />)}
        </Panel>
      </div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: ReactNode }) {
  return <div style={{ display: 'flex', gap: 8, fontSize: 12.5, padding: '3px 0' }}><span style={{ width: 96, flexShrink: 0, color: T.subtle }}>{label}</span><span style={{ minWidth: 0, wordBreak: 'break-word' }}>{value ?? <span style={{ color: T.subtle }}>—</span>}</span></div>;
}

const verificationTone = (v: number): PillTone => (v === 1 ? 'good' : v === 0 ? 'neutral' : v === 2 ? 'warn' : 'bad');

function ContactLine({ c }: { c: DeskContact }) {
  return (
    <div style={{ padding: '7px 12px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><b>{c.name}</b>{c.position ? <span style={{ color: T.muted }}>· {c.position}</span> : null}<span style={{ flex: 1 }} /><Pill tone={verificationTone(c.verification)}>{VERIFICATION[c.verification]}</Pill></div>
      <div style={{ color: T.muted, display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 }}><a href={`tel:${c.phone}`} className="cc-num" style={{ fontWeight: 600 }}>{c.phone}</a>{c.alternativePhone ? <span className="cc-num">{c.alternativePhone}</span> : null}<span style={{ color: T.subtle }}>{CLASS_SHORT[c.class]}</span>{c.unitName ? <span style={{ color: T.subtle }}>{c.unitName}</span> : null}</div>
    </div>
  );
}

/* ================================ offices ================================ */

type Node = DeskOffice & { children: Node[] };
function tree(offices: DeskOffice[]): Node[] {
  const byId = new Map<string, Node>(offices.map(o => [o.id, { ...o, children: [] }]));
  const roots: Node[] = [];
  byId.forEach(n => { const p = n.parentId ? byId.get(n.parentId) : null; (p ? p.children : roots).push(n); });
  const sort = (list: Node[]) => { list.sort((a, b) => a.name.localeCompare(b.name)); list.forEach(n => sort(n.children)); };
  sort(roots);
  return roots;
}
function flatten(nodes: Node[], out: Node[] = []): Node[] { nodes.forEach(n => { out.push(n); flatten(n.children, out); }); return out; }

function OfficesTab({ dir, focus, setFocus, onDone, onFail, go }: { dir: DeskDirectory; focus: string | null; setFocus: (id: string | null) => void; onDone: (m: string) => void; onFail: (c: unknown) => void; go: (tab: Tab, extra?: Record<string, string>) => void }) {
  const roots = useMemo(() => tree(dir.offices), [dir.offices]);
  const flat = useMemo(() => flatten(roots), [roots]);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<DeskOffice | null | 'new'>(null);
  const [removing, setRemoving] = useState<DeskOffice | null>(null);
  const [newUnitFor, setNewUnitFor] = useState<DeskOffice | null>(null);
  const [newContactFor, setNewContactFor] = useState<DeskOffice | null>(null);
  const chosen = dir.offices.find(o => o.id === focus) ?? flat[0] ?? null;
  const shown = query.trim() ? flat.filter(o => `${o.name} ${o.districtName ?? ''} ${o.community ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())) : flat;

  return (
    <div className="cc-grid-2" style={{ display: 'grid', gridTemplateColumns: 'minmax(250px, 320px) minmax(0, 1fr)', gap: 12, alignItems: 'start' }}>
      <Panel flush title={<>The chart · {dir.offices.length}</>} action={dir.canEdit ? <Btn size="sm" tone="primary" onClick={() => setEditing('new')}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="plus" size={12} width={2.4} />Add office</span></Btn> : null}>
        <div style={{ padding: '8px 10px', borderBottom: `1px solid ${T.line}` }}><Input value={query} onChange={setQuery} placeholder="Find an office…" /></div>
        {shown.length === 0 ? <Empty>{dir.offices.length === 0 ? 'No office on the chart yet. Add headquarters first, then its stations.' : 'Nothing matches.'}</Empty> : shown.map(o => {
          const worst = o.latitude == null || o.contacts === 0 ? T.bad : o.status !== 2 || o.capabilities.length === 0 ? T.warn : T.good;
          return (
            <div key={o.id} className="cc-row" data-active={chosen?.id === o.id ? '1' : '0'} onClick={() => setFocus(o.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', paddingLeft: 12 + (query ? 0 : o.depth * 16), borderBottom: `1px solid ${T.line}`, cursor: 'pointer', opacity: o.manageable || !dir.canEdit ? 1 : 0.7 }}>
              {!query && o.depth > 0 ? <span style={{ width: 10, height: 10, borderLeft: `1px solid ${T.line2}`, borderBottom: `1px solid ${T.line2}`, marginLeft: -12, marginRight: -2, marginTop: -8, flexShrink: 0 }} /> : null}
              <span style={{ width: 7, height: 7, borderRadius: 4, background: worst, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.name}</div>
                <div style={{ fontSize: 10.5, color: T.subtle, display: 'flex', gap: 5 }}>{STATION_KIND[o.kind] ?? 'Office'}{o.districtName ? ` · ${o.districtName}` : ''}{o.status !== 2 ? <span style={{ color: T.warn }}>· {OFFICE_STATUS[o.status]}</span> : null}</div>
              </div>
              {o.openIncidents > 0 ? <span className="cc-num" style={{ fontSize: 10.5, fontWeight: 600, color: T.warn }}>{o.openIncidents}</span> : null}
              {!o.manageable && dir.canEdit ? <span title="Outside what you supervise" style={{ color: T.subtle }}><Icon name="shield" size={12} /></span> : null}
            </div>
          );
        })}
      </Panel>
      {chosen ? <OfficeCard dir={dir} office={chosen} onEdit={() => setEditing(chosen)} onRemove={() => setRemoving(chosen)} onAddUnit={() => setNewUnitFor(chosen)} onAddContact={() => setNewContactFor(chosen)} onDone={onDone} onFail={onFail} go={go} /> : <Panel><Empty>Pick an office.</Empty></Panel>}
      {editing ? <OfficeDialog dir={dir} office={editing === 'new' ? null : editing} defaultParent={editing === 'new' ? (chosen && chosen.manageable && chosen.depth < 2 ? chosen.id : null) : null} onClose={() => setEditing(null)} onDone={m => { setEditing(null); onDone(m); }} /> : null}
      {removing ? <ReasonDialog title={`Remove ${removing.name} from the chart`} what="Its departments and numbers go with it; offices under it move up a level. People, responders and open incidents must be moved first." action="Remove office" onClose={() => setRemoving(null)} onConfirm={reason => commandApi.removeOffice(removing.id, reason, dir.institution.id).then(() => { setRemoving(null); setFocus(null); onDone(`${removing.name} removed.`); })} /> : null}
      {newUnitFor ? <UnitDialog dir={dir} unit={null} officeId={newUnitFor.id} onClose={() => setNewUnitFor(null)} onDone={m => { setNewUnitFor(null); onDone(m); }} /> : null}
      {newContactFor ? <ContactDialog dir={dir} contact={null} officeId={newContactFor.id} onClose={() => setNewContactFor(null)} onDone={m => { setNewContactFor(null); onDone(m); }} /> : null}
    </div>
  );
}

function OfficeCard({ dir, office: o, onEdit, onRemove, onAddUnit, onAddContact, onDone, onFail, go }: { dir: DeskDirectory; office: DeskOffice; onEdit: () => void; onRemove: () => void; onAddUnit: () => void; onAddContact: () => void; onDone: (m: string) => void; onFail: (c: unknown) => void; go: (tab: Tab, extra?: Record<string, string>) => void }) {
  const units = dir.units.filter(u => u.officeId === o.id);
  const contacts = dir.contacts.filter(c => c.officeId === o.id);
  const caps = dir.capabilities.filter(c => c.officeId === o.id && !c.unitId);
  const children = dir.offices.filter(x => x.parentId === o.id);
  const [claims, setClaims] = useState<Record<string, number>>({});
  const [editingCaps, setEditingCaps] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setClaims(Object.fromEntries(caps.map(c => [c.code, c.availability]))); setEditingCaps(false); }, [o.id, dir.asOf]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (code: string) => setClaims(s => { const n = { ...s }; if (code in n) delete n[code]; else n[code] = 1; return n; });
  const cycle = (code: string) => setClaims(s => ({ ...s, [code]: s[code] === 1 ? 2 : s[code] === 2 ? 3 : 1 }));
  const saveCaps = () => {
    setBusy(true);
    commandApi.saveCapabilities({ institutionId: dir.institution.id, officeId: o.id, claims: Object.entries(claims).map(([code, availability]) => ({ code, availability })) })
      .then(() => { setEditingCaps(false); onDone('Saved what this office can handle.'); }).catch(onFail).finally(() => setBusy(false));
  };
  const can = o.manageable;
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Panel title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>{o.name}<Pill tone={o.status === 2 ? 'good' : 'warn'} dot>{OFFICE_STATUS[o.status]}</Pill>{o.verified ? <Pill tone="accent">verified</Pill> : <Pill>unverified</Pill>}</span>} note={`${STATION_KIND[o.kind] ?? 'Office'}${o.parentName ? ` · reports to ${o.parentName}` : ' · top of the chart'}${children.length ? ` · ${children.length} ${children.length === 1 ? 'office reports' : 'offices report'} here` : ''}`}
        action={can ? <div style={{ display: 'flex', gap: 6 }}><Btn size="sm" onClick={onEdit}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="edit" size={12} />Edit</span></Btn><Btn size="sm" tone="danger" onClick={onRemove}>Remove</Btn></div> : <span style={{ fontSize: 11, color: T.subtle }}>{dir.canEdit ? 'outside what you supervise' : 'supervisors edit'}</span>}>
        <div className="cc-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14 }}>
          <div>
            <Eyebrow style={{ marginBottom: 6 }}>Where</Eyebrow>
            <Line label="District" value={o.districtName} />
            <Line label="Community" value={o.community} />
            <Line label="Address" value={o.address} />
            <Line label="Landmark" value={o.landmark} />
            <Line label="Pin" value={o.latitude != null && o.longitude != null ? <span className="cc-num">{o.latitude.toFixed(5)}, {o.longitude.toFixed(5)}{o.accuracyMetres ? ` ±${Math.round(o.accuracyMetres)} m` : ''}</span> : <span style={{ color: T.bad }}>none — not on the map, not measurable by the router</span>} />
            {o.latitude != null ? <Line label="Pin trust" value={<>{o.gpsVerified ? <Pill tone="good">verified</Pill> : <Pill tone="warn">{GPS_METHOD[o.gpsMethod] ?? 'unverified'}</Pill>}{o.gpsCapturedAt ? <span style={{ color: T.subtle }}> · {fmtDateTime(o.gpsCapturedAt)}</span> : null}</>} /> : null}
          </div>
          <div>
            <Eyebrow style={{ marginBottom: 6 }}>When and what for</Eyebrow>
            <Line label="Hours" value={<>{HOURS_WORDS[o.hours] ?? '—'}{o.hoursText ? <span style={{ color: T.muted }}> · {o.hoursText}</span> : null}</>} />
            {o.holidayNote ? <Line label="Holidays" value={o.holidayNote} /> : null}
            <Line label="Emergency unit" value={o.alwaysOnEmergencyUnit ? <span style={{ color: T.good }}>always on</span> : 'no'} />
            <Line label="Covers" value={<>{COVERAGE_WORDS[o.coverage] ?? '—'}{o.coverage === 1 && o.coverageRadiusKm ? ` · ${o.coverageRadiusKm} km` : ''}{o.coverage === 2 && o.coverageDistrictSlug ? ` · ${dir.options.districts.find(d => d.slug === o.coverageDistrictSlug)?.name ?? o.coverageDistrictSlug}` : ''}</>} />
            {o.coverageNote ? <Line label="Note" value={o.coverageNote} /> : null}
            <Line label="Verified" value={o.verified ? <span style={{ color: T.good }}>yes{o.verifiedAt ? ` · ${fmtDate(o.verifiedAt)}` : ''}</span> : <span style={{ color: T.muted }}>not yet — Vacancy rings and confirms</span>} />
          </div>
          <div>
            <Eyebrow style={{ marginBottom: 6 }}>On the desk</Eyebrow>
            <Line label="People" value={<>{o.people} sign in here</>} />
            <Line label="Responders" value={o.responders} />
            <Line label="Vehicles" value={o.vehicles} />
            <Line label="Open now" value={o.openIncidents > 0 ? <span style={{ color: T.warn, fontWeight: 600 }}>{o.openIncidents} incident{o.openIncidents === 1 ? '' : 's'}</span> : 'nothing'} />
            <Line label="Changed" value={fmtDateTime(o.updatedAt)} />
          </div>
        </div>
      </Panel>
      <div className="cc-grid-2" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12, alignItems: 'start' }}>
        <Panel title={<>Can handle · {caps.length}</>} note="The router picks an office by what it can do. Click a chip to claim it; click again for limited, referral only, off."
          action={can ? (editingCaps ? <div style={{ display: 'flex', gap: 6 }}><Btn size="xs" onClick={() => { setEditingCaps(false); setClaims(Object.fromEntries(caps.map(c => [c.code, c.availability]))); }}>Cancel</Btn><Btn size="xs" tone="primary" disabled={busy} onClick={saveCaps}>{busy ? 'Saving…' : 'Save'}</Btn></div> : <Btn size="xs" onClick={() => setEditingCaps(true)}>Change</Btn>) : null}>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {dir.options.capabilities.length === 0 ? <span style={{ fontSize: 12, color: T.subtle }}>No capability list for this sector yet.</span> : dir.options.capabilities.map(c => {
              const level = claims[c.code];
              const on = level !== undefined;
              const colour = level === 1 ? T.good : level === 2 ? T.warn : level === 3 ? T.info : T.muted;
              return (
                <button key={c.code} type="button" disabled={!editingCaps} title={on ? AVAILABILITY_WORDS[level] : 'Not claimed'} onClick={() => (on ? cycle(c.code) : toggle(c.code))} onContextMenu={e => { e.preventDefault(); if (editingCaps && on) toggle(c.code); }}
                  style={{ fontSize: 11.5, padding: '4px 9px', borderRadius: 6, cursor: editingCaps ? 'pointer' : 'default', border: `1px solid ${on ? colour : T.line2}`, background: on ? `${colour}1F` : 'transparent', color: on ? colour : T.subtle, fontWeight: 600, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  {on ? <Icon name="check" size={10} width={2.6} /> : null}{c.label}{on && level !== 1 ? <span style={{ fontWeight: 500, opacity: 0.85 }}>· {AVAILABILITY_WORDS[level].toLowerCase()}</span> : null}
                </button>
              );
            })}
          </div>
          {editingCaps && Object.values(claims).some(v => v > 1) === false && Object.keys(claims).length > 0 ? <div style={{ fontSize: 11, color: T.subtle, marginTop: 8 }}>Right-click a claimed chip to drop it.</div> : null}
          {editingCaps ? <div style={{ fontSize: 11, color: T.subtle, marginTop: 8 }}>Claims are stated by the institution and dated. Vacancy may ask.</div> : null}
        </Panel>
        <div style={{ display: 'grid', gap: 12 }}>
          <Panel flush title={<>Departments · {units.length}</>} action={can ? <Btn size="xs" onClick={onAddUnit}>Add department</Btn> : null}>
            {units.length === 0 ? <Empty>No department here. Traffic, Family Support, Accident and Emergency — whatever a caller is put through to.</Empty> : units.map(u => (
              <div key={u.id} className="cc-row" onClick={() => go('departments')} style={{ display: 'flex', gap: 8, padding: '7px 12px', borderBottom: `1px solid ${T.line}`, fontSize: 12.5, cursor: 'pointer' }}>
                <span style={{ fontWeight: 600 }}>{u.name}</span>{u.description ? <span style={{ color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.description}</span> : null}<span style={{ flex: 1 }} /><span className="cc-num" style={{ color: T.subtle, fontSize: 11 }}>{u.contacts} number{u.contacts === 1 ? '' : 's'}</span>
              </div>
            ))}
          </Panel>
          <Panel flush title={<>Who to ring · {contacts.length}</>} action={can ? <Btn size="xs" onClick={onAddContact}>Add number</Btn> : null}>
            {contacts.length === 0 ? <Empty>No number on record. A dispatcher sending help here has nobody to ring.</Empty> : contacts.map(c => <div key={c.id} onClick={() => go('contacts', { contact: c.id })} style={{ cursor: 'pointer' }}><ContactLine c={c} /></div>)}
          </Panel>
        </div>
      </div>
      {o.latitude != null && o.longitude != null ? <Panel flush title="On the map"><div style={{ height: 260 }}><PinMap value={{ lat: o.latitude, lng: o.longitude }} readOnly /></div></Panel> : null}
    </div>
  );
}

function OfficeDialog({ dir, office, defaultParent, onClose, onDone }: { dir: DeskDirectory; office: DeskOffice | null; defaultParent: string | null; onClose: () => void; onDone: (m: string) => void }) {
  const o = office;
  const [name, setName] = useState(o?.name ?? '');
  const [kind, setKind] = useState(String(o?.kind ?? dir.options.kinds[0]?.kind ?? 1));
  const [status, setStatus] = useState(String(o?.status === 3 || o?.status === 1 ? o.status : 2));
  const [parentId, setParentId] = useState(o?.parentId ?? defaultParent ?? '');
  const [districtSlug, setDistrictSlug] = useState(o?.districtSlug ?? '');
  const [community, setCommunity] = useState(o?.community ?? '');
  const [address, setAddress] = useState(o?.address ?? '');
  const [landmark, setLandmark] = useState(o?.landmark ?? '');
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(o?.latitude != null && o?.longitude != null ? { lat: o.latitude, lng: o.longitude } : null);
  const [pinSource, setPinSource] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [clearPin, setClearPin] = useState(false);
  const [coverage, setCoverage] = useState(String(o?.coverage ?? 2));
  const [radius, setRadius] = useState(String(o?.coverageRadiusKm ?? 15));
  const [coverageDistrict, setCoverageDistrict] = useState(o?.coverageDistrictSlug ?? o?.districtSlug ?? '');
  const [coverageNote, setCoverageNote] = useState(o?.coverageNote ?? '');
  const [hours, setHours] = useState(String(o?.hours ?? 1));
  const [hoursText, setHoursText] = useState(o?.hoursText ?? '');
  const [holidayNote, setHolidayNote] = useState(o?.holidayNote ?? '');
  const [alwaysOn, setAlwaysOn] = useState(o?.alwaysOnEmergencyUnit ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  // Where this office may hang: offices the writer supervises, two levels deep at most, never itself or anything under it.
  const under = useMemo(() => { const set = new Set<string>(); if (!o) return set; const walk = (id: string) => dir.offices.filter(x => x.parentId === id).forEach(x => { set.add(x.id); walk(x.id); }); walk(o.id); return set; }, [dir.offices, o]);
  const parents = dir.offices.filter(x => x.manageable && x.depth < 2 && x.id !== o?.id && !under.has(x.id)).sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name));
  const mayBeTop = dir.canEditProfile || (o !== null && o.parentId === null);

  const locate = () => {
    if (!navigator.geolocation) { setError('This browser cannot read a position.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(p => { setPin({ lat: p.coords.latitude, lng: p.coords.longitude }); setAccuracy(p.coords.accuracy); setPinSource(1); setClearPin(false); setLocating(false); }, () => { setError("Could not read this device's position."); setLocating(false); }, { enableHighAccuracy: true, timeout: 15_000 });
  };
  const save = () => {
    setBusy(true); setError(null);
    commandApi.saveOffice({
      institutionId: dir.institution.id, id: o?.id ?? null, parentId: parentId || null, name: name.trim(), kind: Number(kind), status: Number(status), districtSlug,
      community: community || null, address: address || null, landmark: landmark || null,
      latitude: clearPin ? null : pin?.lat ?? null, longitude: clearPin ? null : pin?.lng ?? null, accuracyMetres: accuracy, pinSource, clearPin,
      coverage: Number(coverage), coverageRadiusKm: Number(coverage) === 1 ? Number(radius) || null : null, coverageDistrictSlug: Number(coverage) === 2 ? coverageDistrict || null : null, coverageNote: coverageNote || null,
      hours: Number(hours), hoursText: hoursText || null, holidayNote: holidayNote || null, alwaysOnEmergencyUnit: alwaysOn,
    }).then(saved => onDone(o ? `${saved.name} saved.` : `${saved.name} is on the chart${saved.status === 2 ? ' and live' : ''}.`)).catch(caught => setError(errorWords(caught, 'That did not save.'))).finally(() => setBusy(false));
  };

  return (
    <Modal title={o ? `Edit ${o.name}` : 'Add an office'} onClose={onClose} width={900}>
      <div className="cc-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <div>
          <Eyebrow style={{ marginBottom: 8 }}>The office</Eyebrow>
          <Field label="Name" hint="As the public knows it — “Kenema Police Station”."><Input value={name} onChange={setName} autoFocus={!o} /></Field>
          <div style={{ display: 'grid', gap: '0 12px', gridTemplateColumns: '1fr 1fr' }}>
            <Field label="Kind"><Select value={kind} onChange={setKind}>{dir.options.kinds.map(k => <option key={k.kind} value={k.kind}>{k.label}</option>)}</Select></Field>
            <Field label="Standing" hint={status === '1' ? 'A draft is not routed to and citizens do not see it.' : status === '3' ? 'Nothing is routed to a suspended office.' : 'Live: routed to, shown to citizens.'}><Select value={status} onChange={setStatus}><option value="2">Active</option><option value="1">Draft</option><option value="3">Suspended</option></Select></Field>
          </div>
          <Field label="Reports to" hint={mayBeTop ? 'Empty puts it at the top of the chart. Three levels at most: headquarters, a regional office, a station.' : `Under ${dir.managesOfficeName} or an office beneath it.`}>
            <Select value={parentId} onChange={setParentId}>{mayBeTop ? <option value="">— top of the chart —</option> : null}{parents.map(p => <option key={p.id} value={p.id}>{'  '.repeat(p.depth)}{p.name}</option>)}</Select>
          </Field>
          <div style={{ display: 'grid', gap: '0 12px', gridTemplateColumns: '1fr 1fr' }}>
            <Field label="District"><Select value={districtSlug} onChange={v => { setDistrictSlug(v); if (!coverageDistrict) setCoverageDistrict(v); }}><option value="">—</option>{dir.options.districts.map(x => <option key={x.slug} value={x.slug}>{x.name}</option>)}</Select></Field>
            <Field label="Community"><Input value={community} onChange={setCommunity} /></Field>
          </div>
          <Field label="Address"><Input value={address} onChange={setAddress} /></Field>
          <Field label="Landmark" hint="What a driver would recognise."><Input value={landmark} onChange={setLandmark} /></Field>
          <Eyebrow style={{ margin: '6px 0 8px' }}>Hours and coverage</Eyebrow>
          <div style={{ display: 'grid', gap: '0 12px', gridTemplateColumns: '1fr 1fr' }}>
            <Field label="Hours"><Select value={hours} onChange={setHours}>{Object.entries(HOURS_WORDS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
            <Field label="In words" hint="“Mon–Fri 08:00–17:00”"><Input value={hoursText} onChange={setHoursText} /></Field>
          </div>
          <Field label="Holidays"><Input value={holidayNote} onChange={setHolidayNote} /></Field>
          <Check checked={alwaysOn} onChange={setAlwaysOn}>An emergency unit answers at any hour, whatever the opening hours say</Check>
          <div style={{ display: 'grid', gap: '0 12px', gridTemplateColumns: '1fr 1fr' }}>
            <Field label="Covers"><Select value={coverage} onChange={setCoverage}>{Object.entries(COVERAGE_WORDS).filter(([v]) => v !== '4' || dir.institution.national).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
            {coverage === '1' ? <Field label="Radius, km"><Input value={radius} onChange={setRadius} mono /></Field> : coverage === '2' ? <Field label="Which district"><Select value={coverageDistrict} onChange={setCoverageDistrict}><option value="">—</option>{dir.options.districts.map(x => <option key={x.slug} value={x.slug}>{x.name}</option>)}</Select></Field> : null}
          </div>
          <Field label="Coverage note"><Input value={coverageNote} onChange={setCoverageNote} /></Field>
        </div>
        <div>
          <Eyebrow style={{ marginBottom: 8 }}>The pin</Eyebrow>
          <div style={{ height: 240, marginBottom: 8, opacity: clearPin ? 0.4 : 1 }}><PinMap value={clearPin ? null : pin} onChange={v => { setPin(v); setPinSource(2); setAccuracy(null); setClearPin(false); }} /></div>
          <div style={{ display: 'grid', gap: '0 12px', gridTemplateColumns: '1fr 1fr auto', alignItems: 'end' }}>
            <Field label="Latitude"><Input value={pin && !clearPin ? pin.lat.toFixed(6) : ''} onChange={v => { const n = Number(v); if (v && !Number.isNaN(n)) { setPin(p => ({ lat: n, lng: p?.lng ?? -11.9 })); setPinSource(3); setClearPin(false); } }} mono /></Field>
            <Field label="Longitude"><Input value={pin && !clearPin ? pin.lng.toFixed(6) : ''} onChange={v => { const n = Number(v); if (v && !Number.isNaN(n)) { setPin(p => ({ lat: p?.lat ?? 8.5, lng: n })); setPinSource(3); setClearPin(false); } }} mono /></Field>
            <div style={{ marginBottom: 10, display: 'flex', gap: 6 }}><Btn size="sm" onClick={locate} disabled={locating}>{locating ? 'Reading…' : 'Use this device'}</Btn>{pin ? <Btn size="sm" tone="ghost" onClick={() => setClearPin(c => !c)}>{clearPin ? 'Keep pin' : 'No pin'}</Btn> : null}</div>
          </div>
          <div style={{ fontSize: 11, color: T.subtle, marginBottom: 12, lineHeight: 1.45 }}>
            Click the map to drop the pin, drag it to nudge it, or type. A pin read from a phone standing at the door is the only kind Vacancy verifies; a map pin is still worth more than none.
            {pinSource === 1 && accuracy ? ` This device says ±${Math.round(accuracy)} m.` : pinSource === 2 ? ' Placed on the map.' : pinSource === 3 ? ' Typed.' : ''}
          </div>
          <div style={{ padding: '10px 12px', borderRadius: 8, background: T.surface2, border: `1px solid ${T.line}`, fontSize: 12, color: T.muted, lineHeight: 1.5 }}>
            <b style={{ color: T.text }}>What happens when you save.</b> The office is on the chart at once and, if active, the router and the citizen directory use it straight away. It is marked unverified until Vacancy confirms it; that is a separate step and does not hold anything up.
            {o && o.openIncidents > 0 ? <div style={{ color: T.warn, marginTop: 6 }}>{o.openIncidents} open incident{o.openIncidents === 1 ? ' is' : 's are'} routed here right now — suspending or drafting it will not reroute them.</div> : null}
          </div>
        </div>
      </div>
      {error ? <div style={{ marginTop: 10 }}><ErrorLine>{error}</ErrorLine></div> : null}
      <Actions left={<span style={{ fontSize: 11, color: T.subtle }}>Saved as the institution's own word. Vacancy verifies separately.</span>}>
        <Btn onClick={onClose}>Cancel</Btn><Btn tone="primary" disabled={busy || !name.trim() || !districtSlug || (!mayBeTop && !parentId)} onClick={save}>{busy ? 'Saving…' : o ? 'Save' : 'Add to the chart'}</Btn>
      </Actions>
    </Modal>
  );
}

/* ================================ departments ================================ */

function DepartmentsTab({ dir, onDone, onFail }: { dir: DeskDirectory; onDone: (m: string) => void; onFail: (c: unknown) => void }) {
  const [editing, setEditing] = useState<DeskUnit | null | 'new'>(null);
  const [removing, setRemoving] = useState<DeskUnit | null>(null);
  const offices = useMemo(() => flatten(tree(dir.offices)), [dir.offices]);
  const grouped = offices.map(o => ({ office: o, units: dir.units.filter(u => u.officeId === o.id) })).filter(g => g.units.length > 0);
  void onFail;
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Panel flush title={<>Departments · {dir.units.length}</>} note="Inside an office: Traffic, Family Support, Accident and Emergency — whatever a caller is put through to. A number can belong to a department; an incident can be routed to one." action={dir.canEdit ? <Btn size="sm" tone="primary" onClick={() => setEditing('new')}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="plus" size={12} width={2.4} />Add department</span></Btn> : null}>
        {dir.units.length === 0 ? <Empty>No department yet.</Empty> : (
          <Table>
            <thead><tr><Th>Office</Th><Th>Department</Th><Th>What it does</Th><Th right>Numbers</Th><Th width={150}></Th></tr></thead>
            <tbody>
              {grouped.map(g => g.units.map((u, i) => (
                <tr key={u.id} className="cc-row">
                  <Td muted={i > 0} style={{ fontWeight: i === 0 ? 600 : 400 }}>{i === 0 ? g.office.name : ''}</Td>
                  <Td style={{ fontWeight: 600 }}>{u.name}</Td>
                  <Td muted>{u.description ?? '—'}</Td>
                  <Td right mono>{u.contacts}</Td>
                  <Td right>{u.manageable ? <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}><Btn size="xs" onClick={() => setEditing(u)}>Edit</Btn><Btn size="xs" tone="danger" onClick={() => setRemoving(u)}>Remove</Btn></div> : <span style={{ fontSize: 11, color: T.subtle }}>read-only</span>}</Td>
                </tr>
              )))}
            </tbody>
          </Table>
        )}
      </Panel>
      {editing ? <UnitDialog dir={dir} unit={editing === 'new' ? null : editing} officeId={editing === 'new' ? (offices.find(o => o.manageable)?.id ?? '') : editing.officeId} onClose={() => setEditing(null)} onDone={m => { setEditing(null); onDone(m); }} /> : null}
      {removing ? <ReasonDialog title={`Remove ${removing.name}`} what={`Its numbers stay with ${removing.officeName}.`} action="Remove department" onClose={() => setRemoving(null)} onConfirm={reason => commandApi.removeUnit(removing.id, reason, dir.institution.id).then(() => { setRemoving(null); onDone(`${removing.name} removed.`); })} /> : null}
    </div>
  );
}

function UnitDialog({ dir, unit, officeId: initialOffice, onClose, onDone }: { dir: DeskDirectory; unit: DeskUnit | null; officeId: string; onClose: () => void; onDone: (m: string) => void }) {
  const [officeId, setOfficeId] = useState(initialOffice);
  const [name, setName] = useState(unit?.name ?? '');
  const [description, setDescription] = useState(unit?.description ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offices = flatten(tree(dir.offices)).filter(o => o.manageable);
  const save = () => {
    setBusy(true); setError(null);
    commandApi.saveUnit({ institutionId: dir.institution.id, id: unit?.id ?? null, officeId, name: name.trim(), description: description || null, sort: unit?.sort ?? 0 })
      .then(saved => onDone(`${saved.name} saved at ${saved.officeName}.`)).catch(caught => setError(errorWords(caught, 'That did not save.'))).finally(() => setBusy(false));
  };
  return (
    <Modal title={unit ? `Edit ${unit.name}` : 'Add a department'} onClose={onClose} width={460}>
      <Field label="Office"><Select value={officeId} onChange={setOfficeId}>{offices.map(o => <option key={o.id} value={o.id}>{'  '.repeat(o.depth)}{o.name}</option>)}</Select></Field>
      <Field label="Name" hint="“Traffic”, “Family Support Unit”, “Accident and Emergency”."><Input value={name} onChange={setName} autoFocus /></Field>
      <Field label="What it does"><Textarea value={description} onChange={setDescription} rows={2} /></Field>
      {error ? <ErrorLine>{error}</ErrorLine> : null}
      <Actions><Btn onClick={onClose}>Cancel</Btn><Btn tone="primary" disabled={busy || !name.trim() || !officeId} onClick={save}>{busy ? 'Saving…' : 'Save'}</Btn></Actions>
    </Modal>
  );
}

/* ================================ numbers ================================ */

function ContactsTab({ dir, focus, officeFilter, onDone, onFail }: { dir: DeskDirectory; focus: string | null; officeFilter: string | null; onDone: (m: string) => void; onFail: (c: unknown) => void }) {
  const [office, setOffice] = useState(officeFilter ?? '');
  const [cls, setCls] = useState('');
  const [onlyAttention, setOnlyAttention] = useState(false);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<DeskContact | null | 'new'>(null);
  const [removing, setRemoving] = useState<DeskContact | null>(null);
  const [verifying, setVerifying] = useState<DeskContact | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const offices = useMemo(() => flatten(tree(dir.offices)), [dir.offices]);
  const rows = dir.contacts.filter(c => (!office || (office === 'hq' ? !c.officeId : c.officeId === office)) && (!cls || String(c.class) === cls) && (!onlyAttention || c.verification !== 1) && (!query.trim() || `${c.name} ${c.position ?? ''} ${c.phone} ${c.alternativePhone ?? ''} ${c.officeName ?? ''} ${c.unitName ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())));
  const needing = dir.contacts.filter(c => c.active && c.verification !== 1).length;
  const confirm = (c: DeskContact) => { setBusy(c.id); commandApi.verifyContact(c.id, true, null, dir.institution.id).then(() => onDone(`${c.name} confirmed — due again in ninety days.`)).catch(onFail).finally(() => setBusy(null)); };
  useEffect(() => { if (focus) { const el = document.getElementById(`contact-${focus}`); el?.scrollIntoView({ block: 'center' }); } }, [focus, dir.asOf]);
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Panel flush title={<>Numbers · {rows.length}{rows.length !== dir.contacts.length ? <span style={{ color: T.subtle, fontWeight: 400 }}> of {dir.contacts.length}</span> : null}</>}
        note={needing > 0 ? `${needing} ${needing === 1 ? 'number has' : 'numbers have'} not been confirmed in the last ninety days. “Rang it” confirms a number for another ninety.` : 'Every number confirmed within ninety days.'}
        action={<div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ width: 170 }}><Input value={query} onChange={setQuery} placeholder="Find…" /></div>
          <div style={{ width: 170 }}><Select value={office} onChange={setOffice}><option value="">Every office</option><option value="hq">Head office</option>{offices.map(o => <option key={o.id} value={o.id}>{'  '.repeat(o.depth)}{o.name}</option>)}</Select></div>
          <div style={{ width: 130 }}><Select value={cls} onChange={setCls}><option value="">Who sees it</option>{dir.options.contactClasses.map(k => <option key={k.class} value={k.class}>{k.label}</option>)}</Select></div>
          <Btn size="sm" tone={onlyAttention ? 'accent' : 'subtle'} onClick={() => setOnlyAttention(a => !a)}>Needs a check</Btn>
          {dir.canEdit ? <Btn size="sm" tone="primary" onClick={() => setEditing('new')}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="plus" size={12} width={2.4} />Add number</span></Btn> : null}
        </div>}>
        {rows.length === 0 ? <Empty>{dir.contacts.length === 0 ? 'No number on record anywhere. Start with the line a dispatcher rings at each office.' : 'Nothing matches.'}</Empty> : (
          <Table minWidth={860}>
            <thead><tr><Th>Who</Th><Th>Where</Th><Th>Number</Th><Th>Who sees it</Th><Th>Hours</Th><Th>Confirmed</Th><Th width={310}></Th></tr></thead>
            <tbody>
              {rows.map(c => (
                <tr key={c.id} id={`contact-${c.id}`} className="cc-row" data-active={focus === c.id ? '1' : '0'} style={{ opacity: c.active ? 1 : 0.55 }}>
                  <Td><div style={{ fontWeight: 600 }}>{c.name}</div>{c.position ? <div style={{ fontSize: 11, color: T.muted }}>{c.position}</div> : null}{!c.active ? <Pill>inactive</Pill> : null}</Td>
                  <Td><div>{c.officeName ?? <span style={{ color: T.muted }}>Head office</span>}</div>{c.unitName ? <div style={{ fontSize: 11, color: T.muted }}>{c.unitName}</div> : null}</Td>
                  <Td><a href={`tel:${c.phone}`} className="cc-num" style={{ fontWeight: 600 }}>{c.phone}</a>{c.alternativePhone ? <div className="cc-num" style={{ fontSize: 11, color: T.muted }}>{c.alternativePhone}</div> : null}{c.whatsApp ? <div className="cc-num" style={{ fontSize: 11, color: T.muted }}>WhatsApp {c.whatsApp}</div> : null}{c.email ? <div style={{ fontSize: 11, color: T.muted }}>{c.email}</div> : null}</Td>
                  <Td><Pill tone={c.class === 1 ? 'accent' : 'neutral'}>{CLASS_SHORT[c.class]}</Pill>{c.escalationLevel > 1 ? <div style={{ fontSize: 10.5, color: T.subtle, marginTop: 3 }}>level {c.escalationLevel}</div> : null}</Td>
                  <Td muted>{c.availableFrom || c.availableTo ? <span className="cc-num">{c.availableFrom ?? '00:00'}–{c.availableTo ?? '24:00'}</span> : 'always'}</Td>
                  <Td><Pill tone={verificationTone(c.verification)}>{VERIFICATION[c.verification]}</Pill><div style={{ fontSize: 10.5, color: T.subtle, marginTop: 3 }}>{c.lastVerifiedAt ? `${fmtDate(c.lastVerifiedAt)}${c.lastVerifiedByName ? ` · ${c.lastVerifiedByName}` : ''}` : 'never rung'}{c.nextVerificationDue && c.verification === 1 ? ` · due ${fmtDate(c.nextVerificationDue)}` : ''}</div></Td>
                  <Td right>{c.manageable ? <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', whiteSpace: 'nowrap' }}>
                    <Btn size="xs" tone="accent" disabled={busy === c.id} onClick={() => confirm(c)} title="You rang it and it answered">Rang it</Btn>
                    <Btn size="xs" onClick={() => setVerifying(c)} title="The number is dead or has changed">Changed</Btn>
                    <Btn size="xs" onClick={() => setEditing(c)}>Edit</Btn>
                    <Btn size="xs" tone="danger" onClick={() => setRemoving(c)}>Remove</Btn>
                  </div> : <span style={{ fontSize: 11, color: T.subtle }}>read-only</span>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
      {editing ? <ContactDialog dir={dir} contact={editing === 'new' ? null : editing} officeId={editing === 'new' ? (office && office !== 'hq' ? office : offices.find(o => o.manageable)?.id ?? null) : editing.officeId} onClose={() => setEditing(null)} onDone={m => { setEditing(null); onDone(m); }} /> : null}
      {removing ? <ReasonDialog title={`Remove ${removing.name}`} what={`${removing.phone} leaves the directory. Dispatchers stop seeing it at once.`} action="Remove number" onClose={() => setRemoving(null)} onConfirm={reason => commandApi.removeContact(removing.id, reason, dir.institution.id).then(() => { setRemoving(null); onDone(`${removing.name} removed.`); })} /> : null}
      {verifying ? <ReasonDialog title={`${verifying.name} — the number has changed`} what={`${verifying.phone} is marked as changed and shown as such to every dispatcher until the new number is put in. Say what you know.`} action="Mark as changed" optional onClose={() => setVerifying(null)} onConfirm={note => commandApi.verifyContact(verifying.id, false, note || null, dir.institution.id).then(() => { setVerifying(null); onDone(`${verifying.name} marked as changed.`); })} /> : null}
    </div>
  );
}

function ContactDialog({ dir, contact, officeId: initialOffice, onClose, onDone }: { dir: DeskDirectory; contact: DeskContact | null; officeId: string | null; onClose: () => void; onDone: (m: string) => void }) {
  const c = contact;
  const [officeId, setOfficeId] = useState(c ? c.officeId ?? '' : initialOffice ?? '');
  const [unitId, setUnitId] = useState(c?.unitId ?? '');
  const [name, setName] = useState(c?.name ?? '');
  const [position, setPosition] = useState(c?.position ?? '');
  const [phone, setPhone] = useState(c?.phone ?? '');
  const [alt, setAlt] = useState(c?.alternativePhone ?? '');
  const [whatsApp, setWhatsApp] = useState(c?.whatsApp ?? '');
  const [email, setEmail] = useState(c?.email ?? '');
  const [cls, setCls] = useState(String(c?.class ?? 2));
  const [priority, setPriority] = useState(String(c?.priority ?? 1));
  const [level, setLevel] = useState(String(c?.escalationLevel ?? 1));
  const [from, setFrom] = useState(c?.availableFrom ?? '');
  const [to, setTo] = useState(c?.availableTo ?? '');
  const [active, setActive] = useState(c?.active ?? true);
  const [note, setNote] = useState(c?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offices = flatten(tree(dir.offices)).filter(o => o.manageable);
  const units = dir.units.filter(u => u.officeId === officeId);
  const numberChanged = c !== null && c.phone !== phone.trim();
  const save = () => {
    setBusy(true); setError(null);
    commandApi.saveContact({
      institutionId: dir.institution.id, id: c?.id ?? null, officeId: officeId || null, unitId: unitId || null, name: name.trim(), position: position || null, phone: phone.trim(),
      alternativePhone: alt || null, whatsApp: whatsApp || null, email: email || null, class: Number(cls), priority: Number(priority), escalationLevel: Number(level),
      availableFrom: from || null, availableTo: to || null, active, note: note || null,
    }).then(saved => onDone(`${saved.name} saved${numberChanged ? ' — the new number starts unverified' : ''}.`)).catch(caught => setError(errorWords(caught, 'That did not save.'))).finally(() => setBusy(false));
  };
  return (
    <Modal title={c ? `Edit ${c.name}` : 'Add a number'} onClose={onClose} width={640}>
      <div style={{ display: 'grid', gap: '0 12px', gridTemplateColumns: '1fr 1fr' }}>
        <Field label="Office" hint={dir.canEditProfile ? 'Head office for a line that belongs to the institution itself.' : undefined}><Select value={officeId} onChange={v => { setOfficeId(v); setUnitId(''); }}>{dir.canEditProfile ? <option value="">Head office — the institution itself</option> : null}{offices.map(o => <option key={o.id} value={o.id}>{'  '.repeat(o.depth)}{o.name}</option>)}</Select></Field>
        <Field label="Department"><Select value={unitId} onChange={setUnitId} disabled={units.length === 0}><option value="">{units.length === 0 ? 'No department at this office' : '— the office itself —'}</option>{units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
        <Field label="Who answers" hint="A person, or a desk — “Duty officer”, “Control room”."><Input value={name} onChange={setName} autoFocus={!c} /></Field>
        <Field label="Position"><Input value={position} onChange={setPosition} /></Field>
        <Field label="Phone" hint={numberChanged ? 'A changed number starts again from unverified.' : undefined}><Input value={phone} onChange={setPhone} mono placeholder="+232 …" /></Field>
        <Field label="Other phone"><Input value={alt} onChange={setAlt} mono /></Field>
        <Field label="WhatsApp"><Input value={whatsApp} onChange={setWhatsApp} mono /></Field>
        <Field label="E-mail"><Input value={email} onChange={setEmail} type="email" /></Field>
        <Field label="Who sees it" hint={dir.options.contactClasses.find(k => String(k.class) === cls)?.hint} span={2}><Select value={cls} onChange={setCls}>{dir.options.contactClasses.map(k => <option key={k.class} value={k.class}>{k.label}</option>)}</Select></Field>
        <Field label="Rung first" hint="Primary is rung before secondary; backup last."><Select value={priority} onChange={setPriority}><option value="1">Primary</option><option value="2">Secondary</option><option value="3">Backup</option></Select></Field>
        <Field label="Escalation level" hint="1 is rung first; higher levels when the lower do not answer."><Select value={level} onChange={setLevel}>{[1, 2, 3, 4, 5].map(l => <option key={l} value={l}>{l}</option>)}</Select></Field>
        <Field label="Available from" hint="Empty for always."><Input value={from} onChange={setFrom} mono placeholder="08:00" /></Field>
        <Field label="Until"><Input value={to} onChange={setTo} mono placeholder="17:00" /></Field>
        <Field label="Note" span={2}><Input value={note} onChange={setNote} /></Field>
      </div>
      <Check checked={active} onChange={setActive}>Active — dispatchers are offered this number</Check>
      {error ? <ErrorLine>{error}</ErrorLine> : null}
      <Actions left={<span style={{ fontSize: 11, color: T.subtle }}>{c ? 'Changes land on the audit trail with your name.' : 'New numbers are unverified until somebody rings them. Use “Rang it” when you have.'}</span>}><Btn onClick={onClose}>Cancel</Btn><Btn tone="primary" disabled={busy || !name.trim() || phone.trim().length < 3} onClick={save}>{busy ? 'Saving…' : 'Save'}</Btn></Actions>
    </Modal>
  );
}

/* ================================ shared dialogs ================================ */

function ReasonDialog({ title, what, action, optional, onClose, onConfirm }: { title: string; what: string; action: string; optional?: boolean; onClose: () => void; onConfirm: (reason: string) => Promise<unknown> }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = () => { setBusy(true); setError(null); onConfirm(reason.trim()).catch(caught => setError(errorWords(caught, 'That did not go through.'))).finally(() => setBusy(false)); };
  return (
    <Modal title={title} onClose={onClose} width={440}>
      <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.5, marginBottom: 10 }}>{what}</div>
      <Field label={optional ? 'What you know' : 'Why'} hint={optional ? undefined : 'Goes on the audit trail with your name.'}><Textarea value={reason} onChange={setReason} rows={2} /></Field>
      {error ? <ErrorLine>{error}</ErrorLine> : null}
      <Actions><Btn onClick={onClose}>Cancel</Btn><Btn tone={optional ? 'primary' : 'danger'} disabled={busy || (!optional && !reason.trim())} onClick={go}>{busy ? 'Working…' : action}</Btn></Actions>
    </Modal>
  );
}
