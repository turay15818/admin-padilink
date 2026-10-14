/**
 * The national response directory.
 *
 * <p>Sector → institution → facility → unit → contact, built here and nowhere else. The
 * first phase of the emergency module is this screen: before anybody can report anything,
 * Vacancy has to know every participating institution, each of its stations, the units
 * inside them, the people on duty and the numbers they actually answer — with each number
 * dated, because a number nobody has rung in ninety days is a guess.</p>
 *
 * <p>Every call on this page travels inside the encrypted envelope, reads included. The
 * duty officer's mobile in a facility panel never crosses the wire in clear.</p>
 *
 * <p>The screen is deliberately a workbench, not a wizard. An administrator with a printed
 * list from the police headquarters works down it: institution, then its stations one by
 * one, then the contacts at each. The left column is the list; the right is whatever is
 * open; a station opens over the top so the institution is still there behind it.</p>
 */
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../theme/ThemeProvider';
import {
  Actions, Button, Card, Cell, EmptyState, ErrorNote, Field, Input, Loading, Modal, PageHeader,
  Pill, Row, Table, Textarea, Toasts, fmtDate, useToasts,
} from '../components/ui';
import {
  AVAILABILITY, CONTACT_CLASS, CONTACT_PRIORITY, COVERAGE, FACILITY_KIND, FACILITY_STATUS, GPS_METHOD, HOURS,
  INSTITUTION_STATUS, STATED_BY, VERIFICATION, emergencyApi,
  type CapabilityClaim, type ContactRow, type DirectoryOverview, type FacilityDetail, type FacilityRow,
  type InstitutionDetail, type InstitutionRow, type SaveContact, type SaveFacility, type SaveInstitution, type UnitRow,
} from '../api/emergency';
import type { AdminIdentity } from '../api/admin';

/* ------------------------------------------------------------------ small parts */

function Select({ value, onChange, children, style }: {
  value: string; onChange: (value: string) => void; children: ReactNode; style?: CSSProperties;
}) {
  const { t } = useTheme();
  return (
    <select
      value={value}
      onChange={event => onChange(event.target.value)}
      style={{
        width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10,
        border: `1px solid ${t.borderStrong}`, background: t.surfaceMuted, color: t.text,
        fontSize: 13.5, fontFamily: 'inherit', outline: 'none', ...style,
      }}
    >
      {children}
    </select>
  );
}

function Check({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  const { t } = useTheme();
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: t.text, cursor: 'pointer', marginBottom: 10 }}>
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function Two({ children }: { children: ReactNode }) {
  return <div style={{ display: 'grid', gap: '0 14px', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>{children}</div>;
}

const num = (value: string | null | undefined) => (value === null || value === undefined || value.trim() === '' ? null : Number(value));
const err = (caught: unknown, fallback: string) => (caught instanceof Error ? caught.message : fallback);

function verificationTone(state: number): 'success' | 'warning' | 'danger' | 'neutral' {
  return state === 1 ? 'success' : state === 2 ? 'warning' : state === 3 || state === 4 ? 'danger' : 'neutral';
}

function classTone(cls: number): 'info' | 'neutral' | 'warning' {
  return cls === 1 ? 'info' : cls === 3 || cls === 4 ? 'warning' : 'neutral';
}

/* ------------------------------------------------------------------ the page */

export function EmergencyDirectory({ identity }: { identity: AdminIdentity }) {
  const { t } = useTheme();
  const { toasts, push } = useToasts();
  const [overview, setOverview] = useState<DirectoryOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [sector, setSector] = useState('');
  const [status, setStatus] = useState('');
  const [list, setList] = useState<InstitutionRow[] | null>(null);
  const [total, setTotal] = useState(0);

  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<InstitutionDetail | null>(null);
  const [creating, setCreating] = useState(false);

  const loadOverview = useCallback(() => {
    emergencyApi.overview()
      .then(result => { setOverview(result); setError(null); })
      .catch((caught: unknown) => setError(err(caught, 'Could not load the directory.')));
  }, []);
  useEffect(loadOverview, [loadOverview]);

  const search = useCallback(() => {
    emergencyApi.searchInstitutions({ query: query.trim() || undefined, sectorId: sector || null, status: status ? Number(status) : null, pageSize: 100 })
      .then(page => { setList(page.items); setTotal(page.total); })
      .catch((caught: unknown) => push(err(caught, 'Search failed.'), 'error'));
  }, [query, sector, status, push]);
  useEffect(search, [search]);

  const open = useCallback((id: string) => {
    setOpenId(id);
    emergencyApi.getInstitution(id)
      .then(setDetail)
      .catch((caught: unknown) => push(err(caught, 'Could not open that institution.'), 'error'));
  }, [push]);

  const refresh = useCallback(() => { search(); loadOverview(); if (openId) open(openId); }, [search, loadOverview, openId, open]);

  if (error) return <ErrorNote message={error} />;
  if (!overview) return <Loading />;

  // The server says who may write, from the permission. The identity is only here so the
  // page has the same shape as its neighbours; the permission is the truth.
  const canEdit = overview.canEdit;
  void identity;

  return (
    <>
      <PageHeader
        title="Emergency directory"
        subtitle="Every institution that responds, each of its stations, the units inside them, and the numbers they actually answer."
        action={canEdit ? <Button tone="primary" onClick={() => setCreating(true)}>New institution</Button> : undefined}
      />

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', marginBottom: 16 }}>
        <Stat label="Institutions" value={overview.institutions} detail={`${overview.institutionsVerified} verified`} />
        <Stat label="Stations and facilities" value={overview.facilities} detail={`${overview.facilitiesWithPin} with a pin · ${overview.facilitiesVerified} verified`} />
        <Stat label="Contacts" value={overview.contacts} detail={`${overview.contactsPublic} public`} />
        <Stat
          label="Numbers to ring"
          value={overview.contactsNeedingVerification}
          detail={overview.contactsNeedingVerification ? 'never rung, due, expired or changed' : 'every number is current'}
          tone={overview.contactsNeedingVerification ? 'warning' : 'success'}
          to="/emergency/verification"
        />
      </div>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'minmax(300px, 380px) minmax(0, 1fr)', alignItems: 'start' }}>
        <Card pad={0}>
          <div style={{ padding: 12, borderBottom: `1px solid ${t.border}`, display: 'grid', gap: 8 }}>
            <Input value={query} onChange={setQuery} placeholder="Search by name" onEnter={search} />
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
              <Select value={sector} onChange={setSector}>
                <option value="">Every sector</option>
                {overview.sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
              <Select value={status} onChange={setStatus}>
                <option value="">Not archived</option>
                {Object.entries(INSTITUTION_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
            </div>
          </div>

          {list === null ? <Loading /> : list.length === 0 ? (
            <EmptyState icon="○" title="Nothing here yet" message="Start with the institutions that answer nationally — the police, the ambulance service — then their stations." />
          ) : (
            <div>
              {list.map(row => (
                <button
                  key={row.id}
                  type="button"
                  data-institution={row.id}
                  onClick={() => open(row.id)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    padding: '11px 14px', borderBottom: `1px solid ${t.border}`,
                    background: openId === row.id ? t.brandSoft : 'transparent',
                    borderLeft: `3px solid ${openId === row.id ? t.brand : 'transparent'}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: t.text }}>{row.name}</span>
                    {row.shortName ? <span style={{ fontSize: 11.5, color: t.textSubtle }}>{row.shortName}</span> : null}
                    {row.national ? <Pill tone="info">National</Pill> : null}
                    {row.status !== 2 ? <Pill tone={row.status === 1 ? 'neutral' : 'danger'}>{INSTITUTION_STATUS[row.status]}</Pill> : null}
                  </div>
                  <div style={{ fontSize: 11.5, color: t.textMuted, marginTop: 3 }}>
                    {row.sectorName}{row.typeName ? ` · ${row.typeName}` : ''} · {row.facilities} {row.facilities === 1 ? 'facility' : 'facilities'} · {row.contacts} contacts
                    {row.contactsNeedingVerification ? <span style={{ color: t.warning, fontWeight: 700 }}> · {row.contactsNeedingVerification} to ring</span> : null}
                  </div>
                </button>
              ))}
              <div style={{ padding: '8px 14px', fontSize: 11.5, color: t.textSubtle }}>{total} in the directory</div>
            </div>
          )}
        </Card>

        {openId && detail ? (
          <InstitutionPanel
            key={detail.row.id}
            detail={detail}
            overview={overview}
            canEdit={canEdit}
            onChanged={(next, message) => { setDetail(next); if (message) push(message); search(); loadOverview(); }}
            onArchived={() => { setOpenId(null); setDetail(null); push('Archived.'); refresh(); }}
            push={push}
          />
        ) : openId ? <Loading /> : (
          <Card>
            <div style={{ fontSize: 14, fontWeight: 800, color: t.text }}>Pick an institution</div>
            <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.65, marginTop: 6, maxWidth: 560 }}>
              Or add one. An institution is an organisation that responds — the police, a hospital
              group, the fire force. Its stations, hospitals and offices go under it, and the
              people on duty go under those. Nothing typed here reaches a citizen until the
              contact is marked public and the module is switched on.
            </div>
          </Card>
        )}
      </div>

      {creating ? (
        <InstitutionDialog
          overview={overview}
          onClose={() => setCreating(false)}
          onDone={saved => { setCreating(false); push(`${saved.row.name} created.`); setOpenId(saved.row.id); setDetail(saved); search(); loadOverview(); }}
        />
      ) : null}

      <Toasts toasts={toasts} />
    </>
  );
}

/**
 * The institution's offices as a chart: top-level offices first, each followed by what reports
 * to it, indented. An office whose parent is missing (archived, removed) is shown at the top.
 */
export function asChart(rows: FacilityRow[]): { row: FacilityRow; depth: number }[] {
  const ids = new Set(rows.map(r => r.id));
  const out: { row: FacilityRow; depth: number }[] = [];
  const seen = new Set<string>();
  const walk = (parent: string | null, depth: number) => {
    rows.filter(r => (parent === null ? !r.parentFacilityId || !ids.has(r.parentFacilityId) : r.parentFacilityId === parent) && !seen.has(r.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(r => { seen.add(r.id); out.push({ row: r, depth }); if (depth < 6) walk(r.id, depth + 1); });
  };
  walk(null, 0);
  return out;
}

function Stat({ label, value, detail, tone, to }: { label: string; value: number; detail: string; tone?: 'warning' | 'success'; to?: string }) {
  const { t } = useTheme();
  const colour = tone === 'warning' ? t.warning : tone === 'success' ? t.success : t.text;
  const body = (
    <Card pad={14}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: t.textSubtle, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: colour, fontVariantNumeric: 'tabular-nums', marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: 11.5, color: t.textMuted, marginTop: 2 }}>{detail}</div>
    </Card>
  );
  return to ? <Link to={to} style={{ textDecoration: 'none' }}>{body}</Link> : body;
}

/* ------------------------------------------------------------------ institution */

function InstitutionPanel({ detail, overview, canEdit, onChanged, onArchived, push }: {
  detail: InstitutionDetail;
  overview: DirectoryOverview;
  canEdit: boolean;
  onChanged: (next: InstitutionDetail, message?: string) => void;
  onArchived: () => void;
  push: (message: string, tone?: 'ok' | 'error') => void;
}) {
  const { t } = useTheme();
  const { row } = detail;
  const [tab, setTab] = useState<'facilities' | 'contacts'>('facilities');
  const [editing, setEditing] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [addingFacility, setAddingFacility] = useState(false);
  const [facilityId, setFacilityId] = useState<string | null>(null);
  const [contact, setContact] = useState<ContactRow | 'new' | null>(null);

  const reload = () => emergencyApi.getInstitution(row.id).then(next => onChanged(next)).catch((caught: unknown) => push(err(caught, 'Could not reload.'), 'error'));

  return (
    <Card pad={0}>
      <div style={{ padding: '16px 18px', borderBottom: `1px solid ${t.border}` }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: t.text }}>{row.name}</h2>
              {row.shortName ? <span style={{ fontSize: 12.5, color: t.textSubtle }}>{row.shortName}</span> : null}
              <Pill tone={row.status === 2 ? 'success' : row.status === 1 ? 'neutral' : 'danger'}>{INSTITUTION_STATUS[row.status]}</Pill>
              {row.verified ? <Pill tone="success">Verified</Pill> : <Pill tone="warning">Unverified</Pill>}
              {row.national ? <Pill tone="info">National</Pill> : null}
              {row.government ? <Pill tone="neutral">Government</Pill> : null}
            </div>
            <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 5 }}>
              {row.sectorName}{row.typeName ? ` · ${row.typeName}` : ''}{row.headOfficeText ? ` · ${row.headOfficeText}` : ''}
              {row.publicPhone ? <> · public line <strong style={{ color: t.text }}>{row.publicPhone}</strong></> : null}
            </div>
            {detail.description ? <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 6, lineHeight: 1.6, maxWidth: 640 }}>{detail.description}</div> : null}
            {row.verified && detail.verifiedByName ? (
              <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 6 }}>
                Verified by {detail.verifiedByName}{detail.verifiedAt ? ` on ${fmtDate(detail.verifiedAt)}` : ''}{detail.verificationNote ? ` — ${detail.verificationNote}` : ''}
              </div>
            ) : null}
          </div>
          {canEdit ? (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Link to={`/emergency/institutions/${row.id}`} style={{ textDecoration: 'none' }}><Button size="sm" tone="primary">Open workspace ›</Button></Link>
              <Button size="sm" tone="subtle" onClick={() => setEditing(true)}>Edit</Button>
              <Button size="sm" tone={row.verified ? 'subtle' : 'primary'} onClick={() => setVerifying(true)}>{row.verified ? 'Withdraw verification' : 'Mark verified'}</Button>
              <Button size="sm" tone="danger" onClick={() => setArchiving(true)}>Archive</Button>
            </div>
          ) : null}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, padding: '10px 18px 0' }}>
        {(['facilities', 'contacts'] as const).map(option => (
          <button
            key={option}
            type="button"
            onClick={() => setTab(option)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
              padding: '8px 10px', color: tab === option ? t.brand : t.textMuted,
              borderBottom: `2px solid ${tab === option ? t.brand : 'transparent'}`,
            }}
          >
            {option === 'facilities' ? `Stations and facilities (${detail.facilityRows.length})` : `Institution contacts (${detail.institutionContacts.length})`}
          </button>
        ))}
      </div>

      {tab === 'facilities' ? (
        <div style={{ padding: 18 }}>
          {detail.facilityRows.length === 0 ? (
            <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.6, marginBottom: 12 }}>
              No stations yet. An incident is routed to a station, not to an institution — until
              one exists here, this institution answers for nothing except its national line.
            </div>
          ) : (
            <Table head={['Name', 'Kind', 'District', 'Covers', 'Pin', 'Hours', 'Units', 'Contacts', 'Status']}>
              {asChart(detail.facilityRows).map(({ row: f, depth }) => (
                <Row key={f.id} onClick={() => setFacilityId(f.id)}>
                  <Cell><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, paddingLeft: depth * 18 }}>{depth > 0 ? <span style={{ color: t.textSubtle }}>└</span> : null}<strong>{f.name}</strong>{f.verified ? <Pill tone="success">Verified</Pill> : null}{f.subOffices ? <span style={{ fontSize: 11, color: t.textSubtle, whiteSpace: 'nowrap' }}>{f.subOffices} under it</span> : null}</span></Cell>
                  <Cell>{FACILITY_KIND[f.kind]}</Cell>
                  <Cell>{overview.districts.find(d => d.slug === f.districtSlug)?.name ?? '—'}</Cell>
                  <Cell>{f.coverage === 1 ? `${f.coverageRadiusKm} km` : f.coverage === 2 ? (overview.districts.find(d => d.slug === f.coverageDistrictSlug)?.name ?? 'district') : COVERAGE[f.coverage]}</Cell>
                  <Cell>{f.latitude === null ? <Pill tone="warning">No pin</Pill> : f.gpsVerified ? <Pill tone="success">Surveyed</Pill> : <Pill tone="neutral">{GPS_METHOD[f.gpsMethod]}</Pill>}</Cell>
                  <Cell>{HOURS[f.hours]}</Cell>
                  <Cell>{f.units}</Cell>
                  <Cell>{f.contacts}</Cell>
                  <Cell><Pill tone={f.status === 2 ? 'success' : f.status === 1 ? 'neutral' : 'danger'}>{FACILITY_STATUS[f.status]}</Pill></Cell>
                </Row>
              ))}
            </Table>
          )}
          {canEdit ? <div style={{ marginTop: 12 }}><Button size="sm" tone="primary" onClick={() => setAddingFacility(true)}>Add a station or facility</Button></div> : null}
        </div>
      ) : (
        <div style={{ padding: 18 }}>
          <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.6, marginBottom: 12 }}>
            Numbers held at institution level — the national control room, the head office. A
            station's own numbers go on the station.
          </div>
          <ContactsTable
            contacts={detail.institutionContacts}
            canEdit={canEdit}
            onOpen={setContact}
            onChanged={message => { void reload(); if (message) push(message); }}
            push={push}
          />
          {canEdit ? <div style={{ marginTop: 12 }}><Button size="sm" tone="primary" onClick={() => setContact('new')}>Add a contact</Button></div> : null}
        </div>
      )}

      {editing ? (
        <InstitutionDialog overview={overview} existing={detail} onClose={() => setEditing(false)} onDone={saved => { setEditing(false); onChanged(saved, 'Saved.'); }} />
      ) : null}
      {verifying ? (
        <NoteDialog
          title={row.verified ? `Withdraw verification from ${row.name}` : `Mark ${row.name} as verified`}
          hint={row.verified ? 'Say what was wrong.' : 'Say what you checked — a letter from the institution, a call to the head office, a visit.'}
          verb={row.verified ? 'Withdraw' : 'Mark verified'}
          required={row.verified}
          onClose={() => setVerifying(false)}
          onSave={note => emergencyApi.verifyInstitution(row.id, !row.verified, note).then(next => { setVerifying(false); onChanged(next, row.verified ? 'Verification withdrawn.' : 'Marked verified.'); })}
        />
      ) : null}
      {archiving ? (
        <NoteDialog
          title={`Archive ${row.name}`}
          hint="Every station under it leaves the directory with it. The record stays, archived, and can be brought back."
          verb="Archive"
          required
          danger
          onClose={() => setArchiving(false)}
          onSave={reason => emergencyApi.archiveInstitution(row.id, reason).then(() => { setArchiving(false); onArchived(); })}
        />
      ) : null}
      {addingFacility ? (
        <FacilityDialog overview={overview} institutionId={row.id} siblings={detail.facilityRows} onClose={() => setAddingFacility(false)} onDone={saved => { setAddingFacility(false); setFacilityId(saved.row.id); void reload(); }} />
      ) : null}
      {facilityId ? (
        <FacilityDrawer id={facilityId} overview={overview} canEdit={canEdit} siblings={detail.facilityRows} onClose={() => { setFacilityId(null); void reload(); }} push={push} />
      ) : null}
      {contact ? (
        <ContactDialog
          overview={overview}
          institutionId={row.id}
          existing={contact === 'new' ? null : contact}
          onClose={() => setContact(null)}
          onDone={() => { setContact(null); void reload(); push('Contact saved.'); }}
        />
      ) : null}
    </Card>
  );
}

export function InstitutionDialog({ overview, existing, onClose, onDone }: {
  overview: DirectoryOverview;
  existing?: InstitutionDetail;
  onClose: () => void;
  onDone: (saved: InstitutionDetail) => void;
}) {
  const row = existing?.row;
  const [form, setForm] = useState<SaveInstitution>({
    id: row?.id ?? null, name: row?.name ?? '', shortName: row?.shortName ?? '', sectorId: row?.sectorId ?? overview.sectors[0]?.id ?? '',
    typeId: row?.typeId ?? '', government: row?.government ?? true, national: row?.national ?? false, status: row?.status ?? 1,
    headOfficeText: row?.headOfficeText ?? '', publicPhone: row?.publicPhone ?? '', alternativePhone: existing?.alternativePhone ?? '',
    email: existing?.email ?? '', website: existing?.website ?? '', description: existing?.description ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof SaveInstitution>(key: K, value: SaveInstitution[K]) => setForm(prev => ({ ...prev, [key]: value }));

  const types = useMemo(() => overview.types.filter(type => !type.sectorId || type.sectorId === form.sectorId), [overview.types, form.sectorId]);

  const save = () => {
    setBusy(true); setError(null);
    emergencyApi.saveInstitution({ ...form, typeId: form.typeId || null })
      .then(onDone)
      .catch((caught: unknown) => setError(err(caught, 'That did not save.')))
      .finally(() => setBusy(false));
  };

  return (
    <Modal title={row ? `Edit ${row.name}` : 'New institution'} onClose={onClose} width={620}>
      <Two>
        <Field label="Name"><Input value={form.name} onChange={v => set('name', v)} placeholder="Sierra Leone Police" autoFocus /></Field>
        <Field label="Short name"><Input value={form.shortName ?? ''} onChange={v => set('shortName', v)} placeholder="SLP" /></Field>
      </Two>
      <Two>
        <Field label="Sector">
          <Select value={form.sectorId} onChange={v => set('sectorId', v)}>
            {overview.sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Type">
          <Select value={form.typeId ?? ''} onChange={v => set('typeId', v)}>
            <option value="">—</option>
            {types.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}
          </Select>
        </Field>
      </Two>
      <Two>
        <Field label="Status" hint="Only an active institution reaches a citizen.">
          <Select value={String(form.status)} onChange={v => set('status', Number(v))}>
            {Object.entries(INSTITUTION_STATUS).filter(([v]) => v !== '4').map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </Select>
        </Field>
        <Field label="Head office"><Input value={form.headOfficeText ?? ''} onChange={v => set('headOfficeText', v)} placeholder="Freetown" /></Field>
      </Two>
      <Check checked={form.government} onChange={v => set('government', v)} label="A government institution" />
      <Check checked={form.national} onChange={v => set('national', v)} label="Answers for the whole country — shown to everybody, everywhere, first" />
      <Two>
        <Field label="Public line" hint="The one number a citizen sees on the institution itself."><Input value={form.publicPhone ?? ''} onChange={v => set('publicPhone', v)} placeholder="019" /></Field>
        <Field label="Alternative"><Input value={form.alternativePhone ?? ''} onChange={v => set('alternativePhone', v)} /></Field>
      </Two>
      <Two>
        <Field label="Email"><Input value={form.email ?? ''} onChange={v => set('email', v)} /></Field>
        <Field label="Website"><Input value={form.website ?? ''} onChange={v => set('website', v)} placeholder="https://" /></Field>
      </Two>
      <Field label="Description"><Textarea value={form.description ?? ''} onChange={v => set('description', v)} rows={3} /></Field>
      {error ? <ErrorNote message={error} /> : null}
      <Actions>
        <Button tone="subtle" onClick={onClose}>Cancel</Button>
        <Button tone="primary" disabled={busy || !form.name.trim() || !form.sectorId} onClick={save}>{busy ? 'Saving…' : 'Save'}</Button>
      </Actions>
    </Modal>
  );
}

/* ------------------------------------------------------------------ facility */

export function FacilityDialog({ overview, institutionId, existing, siblings = [], parentId, onClose, onDone }: {
  overview: DirectoryOverview;
  institutionId: string;
  existing?: FacilityDetail;
  /** The institution's other offices, so this one can be made a sub-office of one of them. */
  siblings?: FacilityRow[];
  /** Pre-pick the office a new sub-office reports to. */
  parentId?: string | null;
  onClose: () => void;
  onDone: (saved: FacilityDetail) => void;
}) {
  const r = existing?.row;
  // An office may report to any other office of the institution that is not itself, not already
  // under it, and not already at the third level — the server refuses the rest in words.
  const under = (id: string, seen = new Set<string>()): boolean => { if (seen.has(id)) return false; seen.add(id); return siblings.some(f => f.parentFacilityId === id && (f.id === r?.id || under(f.id, seen))); };
  const depthOf = (id: string | null | undefined, n = 0): number => { if (!id || n > 8) return n; const f = siblings.find(x => x.id === id); return f ? depthOf(f.parentFacilityId, n + 1) : n + 1; };
  const parents = siblings.filter(f => f.id !== r?.id && !under(f.id) && depthOf(f.id) < 3);
  const [form, setForm] = useState<SaveFacility>({
    id: r?.id ?? null, institutionId, name: r?.name ?? '', kind: r?.kind ?? 1, status: r?.status ?? 1, parentFacilityId: r?.parentFacilityId ?? parentId ?? null,
    healthFacilityId: r?.healthFacilityId ?? null, districtSlug: r?.districtSlug ?? '', community: r?.community ?? '',
    address: r?.address ?? '', landmark: r?.landmark ?? '',
    coverage: r?.coverage ?? 2, coverageRadiusKm: r?.coverageRadiusKm ?? null, coverageDistrictSlug: r?.coverageDistrictSlug ?? '',
    coverageNote: existing?.coverageNote ?? '', hours: r?.hours ?? 1, hoursText: r?.hoursText ?? '', holidayNote: existing?.holidayNote ?? '',
    alwaysOnEmergencyUnit: r?.alwaysOnEmergencyUnit ?? false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof SaveFacility>(key: K, value: SaveFacility[K]) => setForm(prev => ({ ...prev, [key]: value }));

  const save = () => {
    setBusy(true); setError(null);
    emergencyApi.saveFacility({ ...form, districtSlug: form.districtSlug || null, coverageDistrictSlug: form.coverageDistrictSlug || null })
      .then(onDone)
      .catch((caught: unknown) => setError(err(caught, 'That did not save.')))
      .finally(() => setBusy(false));
  };

  return (
    <Modal title={r ? `Edit ${r.name}` : 'New station or facility'} onClose={onClose} width={640}>
      <Two>
        <Field label="Name"><Input value={form.name} onChange={v => set('name', v)} placeholder="Lumley Police Station" autoFocus /></Field>
        <Field label="Kind">
          <Select value={String(form.kind)} onChange={v => set('kind', Number(v))}>
            {Object.entries(FACILITY_KIND).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </Select>
        </Field>
      </Two>
      {parents.length > 0 || form.parentFacilityId ? (
        <Field label="Reports to" hint="Where this office sits in the institution's chart: a post under a station, a station under a regional office, a regional office under headquarters. Three levels at most.">
          <Select value={form.parentFacilityId ?? ''} onChange={v => set('parentFacilityId', v || null)}>
            <option value="">Top level — reports to nobody</option>
            {parents.map(f => <option key={f.id} value={f.id}>{f.parentFacilityName ? `${f.parentFacilityName} › ` : ''}{f.name}</option>)}
          </Select>
        </Field>
      ) : null}
      <Two>
        <Field label="District">
          <Select value={form.districtSlug ?? ''} onChange={v => set('districtSlug', v)}>
            <option value="">—</option>
            {overview.districts.map(d => <option key={d.slug} value={d.slug}>{d.name}</option>)}
          </Select>
        </Field>
        <Field label="Community"><Input value={form.community ?? ''} onChange={v => set('community', v)} placeholder="Lumley" /></Field>
      </Two>
      <Two>
        <Field label="Address"><Input value={form.address ?? ''} onChange={v => set('address', v)} /></Field>
        <Field label="Landmark" hint="What a driver would recognise."><Input value={form.landmark ?? ''} onChange={v => set('landmark', v)} placeholder="Opposite the Lumley roundabout" /></Field>
      </Two>

      <div style={{ fontSize: 12.5, fontWeight: 800, margin: '4px 0 8px' }}>What it answers for</div>
      <Two>
        <Field label="Coverage" hint="Never distance alone. A district station answers for its district however far.">
          <Select value={String(form.coverage)} onChange={v => set('coverage', Number(v))}>
            {Object.entries(COVERAGE).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </Select>
        </Field>
        {form.coverage === 1 ? (
          <Field label="Radius, km"><Input type="number" value={form.coverageRadiusKm === null || form.coverageRadiusKm === undefined ? '' : String(form.coverageRadiusKm)} onChange={v => set('coverageRadiusKm', num(v))} /></Field>
        ) : form.coverage === 2 ? (
          <Field label="Which district" hint="Empty means the district above.">
            <Select value={form.coverageDistrictSlug ?? ''} onChange={v => set('coverageDistrictSlug', v)}>
              <option value="">Same as its own</option>
              {overview.districts.map(d => <option key={d.slug} value={d.slug}>{d.name}</option>)}
            </Select>
          </Field>
        ) : form.coverage === 3 ? (
          <Field label="Describe the area"><Input value={form.coverageNote ?? ''} onChange={v => set('coverageNote', v)} placeholder="Until the map exists, in words." /></Field>
        ) : <div />}
      </Two>

      <div style={{ fontSize: 12.5, fontWeight: 800, margin: '4px 0 8px' }}>When it is open</div>
      <Two>
        <Field label="Hours">
          <Select value={String(form.hours)} onChange={v => set('hours', Number(v))}>
            {Object.entries(HOURS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </Select>
        </Field>
        <Field label="In words"><Input value={form.hoursText ?? ''} onChange={v => set('hoursText', v)} placeholder="Mon–Fri 08:00–17:00" /></Field>
      </Two>
      <Check checked={form.alwaysOnEmergencyUnit} onChange={v => set('alwaysOnEmergencyUnit', v)} label="The emergency unit never closes, whatever the public hours say" />
      <Field label="Holiday note"><Input value={form.holidayNote ?? ''} onChange={v => set('holidayNote', v)} /></Field>
      <Field label="Status" hint="Only an active facility reaches a citizen or a dispatcher.">
        <Select value={String(form.status)} onChange={v => set('status', Number(v))}>
          {Object.entries(FACILITY_STATUS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </Select>
      </Field>
      {error ? <ErrorNote message={error} /> : null}
      <Actions>
        <Button tone="subtle" onClick={onClose}>Cancel</Button>
        <Button tone="primary" disabled={busy || !form.name.trim()} onClick={save}>{busy ? 'Saving…' : 'Save'}</Button>
      </Actions>
    </Modal>
  );
}

/**
 * One station, opened over the institution.
 *
 * <p>Five things live here and each has its own tab because each is a different job: what
 * the place is, where it is, what is inside it, who answers, and what it can do. An
 * administrator with a police list works the first two once and the last three for months.</p>
 */
export function FacilityDrawer({ id, overview, canEdit, onClose, push, siblings = [] }: {
  id: string;
  overview: DirectoryOverview;
  /** The institution's other offices, for the "reports to" choice. */
  siblings?: FacilityRow[];
  canEdit: boolean;
  onClose: () => void;
  push: (message: string, tone?: 'ok' | 'error') => void;
}) {
  const { t } = useTheme();
  const [detail, setDetail] = useState<FacilityDetail | null>(null);
  const [tab, setTab] = useState<'pin' | 'units' | 'contacts' | 'capabilities'>('contacts');
  const [editing, setEditing] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [contact, setContact] = useState<ContactRow | 'new' | null>(null);
  const [unit, setUnit] = useState<UnitRow | 'new' | null>(null);

  const load = useCallback(() => {
    emergencyApi.getFacility(id).then(setDetail).catch((caught: unknown) => push(err(caught, 'Could not open that facility.'), 'error'));
  }, [id, push]);
  useEffect(load, [load]);

  if (!detail) return <Modal title="Opening…" onClose={onClose} width={860}><Loading /></Modal>;
  const { row } = detail;

  return (
    <Modal title={row.name} onClose={onClose} width={860}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Pill tone="neutral">{FACILITY_KIND[row.kind]}</Pill>
            <Pill tone={row.status === 2 ? 'success' : row.status === 1 ? 'neutral' : 'danger'}>{FACILITY_STATUS[row.status]}</Pill>
            {row.verified ? <Pill tone="success">Verified</Pill> : <Pill tone="warning">Unverified</Pill>}
            <Pill tone="info">{row.coverage === 1 ? `Covers ${row.coverageRadiusKm} km` : row.coverage === 2 ? `Covers ${overview.districts.find(d => d.slug === row.coverageDistrictSlug)?.name ?? 'its district'}` : COVERAGE[row.coverage]}</Pill>
            <Pill tone="neutral">{HOURS[row.hours]}{row.alwaysOnEmergencyUnit ? ' · emergency unit always on' : ''}</Pill>
          </div>
          <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 6 }}>
            {row.institutionName}
            {row.districtSlug ? ` · ${overview.districts.find(d => d.slug === row.districtSlug)?.name ?? row.districtSlug}` : ''}
            {row.community ? ` · ${row.community}` : ''}{row.address ? ` · ${row.address}` : ''}{row.landmark ? ` · ${row.landmark}` : ''}
          </div>
        </div>
        {canEdit ? (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Button size="sm" tone="subtle" onClick={() => setEditing(true)}>Edit</Button>
            <Button size="sm" tone={row.verified ? 'subtle' : 'primary'} onClick={() => setVerifying(true)}>{row.verified ? 'Withdraw verification' : 'Mark verified'}</Button>
            <Button size="sm" tone="danger" onClick={() => setRemoving(true)}>Remove</Button>
          </div>
        ) : null}
      </div>

      <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${t.border}`, marginBottom: 14 }}>
        {([['contacts', `Contacts (${detail.contactRows.length})`], ['units', `Units (${detail.unitRows.length})`], ['capabilities', `Capabilities (${detail.capabilityRows.length})`], ['pin', row.latitude === null ? 'Pin — none yet' : 'Pin']] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
              padding: '8px 10px', color: tab === key ? t.brand : t.textMuted,
              borderBottom: `2px solid ${tab === key ? t.brand : 'transparent'}`, marginBottom: -1,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'contacts' ? (
        <>
          <ContactsTable contacts={detail.contactRows} canEdit={canEdit} onOpen={setContact} onChanged={message => { load(); if (message) push(message); }} push={push} showUnit />
          {canEdit ? <div style={{ marginTop: 12 }}><Button size="sm" tone="primary" onClick={() => setContact('new')}>Add a contact</Button></div> : null}
        </>
      ) : tab === 'units' ? (
        <>
          {detail.unitRows.length === 0 ? (
            <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.6 }}>No units. A unit is a desk inside the station — Traffic, Family Support, Accident and Emergency — so an incident reaches the right one rather than the front gate.</div>
          ) : (
            <Table head={['Unit', 'What it does', 'Contacts', '']}>
              {detail.unitRows.map(u => (
                <Row key={u.id}>
                  <Cell><strong>{u.name}</strong></Cell>
                  <Cell>{u.description ?? '—'}</Cell>
                  <Cell>{u.contacts}</Cell>
                  <Cell>{canEdit ? <Button size="sm" tone="subtle" onClick={() => setUnit(u)}>Edit</Button> : null}</Cell>
                </Row>
              ))}
            </Table>
          )}
          {canEdit ? <div style={{ marginTop: 12 }}><Button size="sm" tone="primary" onClick={() => setUnit('new')}>Add a unit</Button></div> : null}
        </>
      ) : tab === 'capabilities' ? (
        <CapabilitiesEditor detail={detail} overview={overview} canEdit={canEdit} onSaved={next => { setDetail(next); push('Capabilities saved.'); }} push={push} />
      ) : (
        <PinEditor detail={detail} canEdit={canEdit} onSaved={next => { setDetail(next); push('Pin saved.'); }} />
      )}

      {editing ? <FacilityDialog overview={overview} institutionId={row.institutionId} existing={detail} siblings={siblings} onClose={() => setEditing(false)} onDone={next => { setEditing(false); setDetail(next); push('Saved.'); }} /> : null}
      {verifying ? (
        <NoteDialog
          title={row.verified ? `Withdraw verification from ${row.name}` : `Mark ${row.name} as verified`}
          hint={row.verified ? 'Say what was wrong.' : 'Say what you checked. A verified station is one somebody has confirmed exists, at that address, answering those numbers.'}
          verb={row.verified ? 'Withdraw' : 'Mark verified'}
          required={row.verified}
          onClose={() => setVerifying(false)}
          onSave={note => emergencyApi.verifyFacility(row.id, !row.verified, note).then(next => { setVerifying(false); setDetail(next); })}
        />
      ) : null}
      {removing ? (
        <NoteDialog
          title={`Remove ${row.name}`}
          hint="Every unit and contact under it goes with it. Nothing is hard-deleted; the audit trail keeps the record."
          verb="Remove"
          required
          danger
          onClose={() => setRemoving(false)}
          onSave={reason => emergencyApi.removeFacility(row.id, reason).then(() => { setRemoving(false); push('Removed.'); onClose(); })}
        />
      ) : null}
      {contact ? (
        <ContactDialog
          overview={overview}
          institutionId={row.institutionId}
          facilityId={row.id}
          units={detail.unitRows}
          existing={contact === 'new' ? null : contact}
          onClose={() => setContact(null)}
          onDone={() => { setContact(null); load(); push('Contact saved.'); }}
        />
      ) : null}
      {unit ? (
        <UnitDialog facilityId={row.id} existing={unit === 'new' ? null : unit} onClose={() => setUnit(null)} onDone={next => { setUnit(null); setDetail(next); }} />
      ) : null}
    </Modal>
  );
}

function PinEditor({ detail, canEdit, onSaved }: { detail: FacilityDetail; canEdit: boolean; onSaved: (next: FacilityDetail) => void }) {
  const { t } = useTheme();
  const { row } = detail;
  const [lat, setLat] = useState(row.latitude === null ? '' : String(row.latitude));
  const [lng, setLng] = useState(row.longitude === null ? '' : String(row.longitude));
  const [accuracy, setAccuracy] = useState(detail.accuracyMetres === null ? '' : String(detail.accuracyMetres));
  const [method, setMethod] = useState(String(row.gpsMethod || 2));
  const [verified, setVerified] = useState(row.gpsVerified);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const latitude = Number(lat); const longitude = Number(lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) { setError('Latitude and longitude have to be numbers.'); return; }
    setBusy(true); setError(null);
    emergencyApi.setFacilityGps({ facilityId: row.id, latitude, longitude, accuracyMetres: num(accuracy), method: Number(method), verified })
      .then(onSaved)
      .catch((caught: unknown) => setError(err(caught, 'That did not save.')))
      .finally(() => setBusy(false));
  };

  return (
    <div>
      {row.latitude !== null ? (
        <div style={{ fontSize: 12.5, color: t.textMuted, marginBottom: 12, lineHeight: 1.6 }}>
          Pinned at <strong style={{ color: t.text, fontVariantNumeric: 'tabular-nums' }}>{row.latitude}, {row.longitude}</strong>
          {detail.accuracyMetres !== null ? ` to ${detail.accuracyMetres} m` : ''} · {GPS_METHOD[row.gpsMethod]}
          {detail.gpsCapturedByName ? ` by ${detail.gpsCapturedByName}` : ''}{detail.gpsCapturedAt ? ` on ${fmtDate(detail.gpsCapturedAt)}` : ''}
          {' '}· {row.gpsVerified ? <Pill tone="success">Verified</Pill> : <Pill tone="neutral">Not verified</Pill>}
          {' '}<a href={`https://www.google.com/maps?q=${row.latitude},${row.longitude}`} target="_blank" rel="noreferrer" style={{ color: t.brand }}>Open on a map</a>
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: t.warning, fontWeight: 600, marginBottom: 12 }}>No pin. Without one the directory can say which district this answers for, but not how far away it is.</div>
      )}
      <Two>
        <Field label="Latitude"><Input value={lat} onChange={setLat} placeholder="8.4525" disabled={!canEdit} /></Field>
        <Field label="Longitude"><Input value={lng} onChange={setLng} placeholder="-13.2830" disabled={!canEdit} /></Field>
      </Two>
      <Two>
        <Field label="How it was found" hint="Only a pin somebody stood on can be verified. A map click is a guess about a photograph.">
          <Select value={method} onChange={setMethod}>
            {Object.entries(GPS_METHOD).filter(([v]) => v !== '0').map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </Select>
        </Field>
        <Field label="Accuracy, metres" hint="From the phone that captured it. A hundred or better to count as verified."><Input value={accuracy} onChange={setAccuracy} disabled={!canEdit} /></Field>
      </Two>
      {method === '1' ? <Check checked={verified} onChange={setVerified} label="Somebody stood there with a phone and this is what it said" /> : null}
      {error ? <ErrorNote message={error} /> : null}
      {canEdit ? <Actions><Button tone="primary" disabled={busy || !lat || !lng} onClick={save}>{busy ? 'Saving…' : 'Save the pin'}</Button></Actions> : null}
    </div>
  );
}

function CapabilitiesEditor({ detail, overview, canEdit, onSaved, push }: {
  detail: FacilityDetail; overview: DirectoryOverview; canEdit: boolean;
  onSaved: (next: FacilityDetail) => void; push: (message: string, tone?: 'ok' | 'error') => void;
}) {
  const { t } = useTheme();
  const [claims, setClaims] = useState<Record<string, CapabilityClaim>>(() =>
    Object.fromEntries(detail.capabilityRows.filter(c => !c.unitId).map(c => [c.code, { code: c.code, availability: c.availability, statedBy: c.statedBy, note: c.note }])));
  const [busy, setBusy] = useState(false);

  // Only this sector's capabilities. A police station is offered police work, not maternity;
  // anything already ticked from another sector stays visible so it can be unticked.
  const groups = useMemo(() => {
    const own = detail.row.sectorCode ?? null;
    const ticked = new Set(detail.capabilityRows.map(c => c.code));
    const bySector = new Map<string, typeof overview.capabilities>();
    for (const c of overview.capabilities) {
      if (own && c.sector !== own && !ticked.has(c.code)) continue;
      bySector.set(c.sector, [...(bySector.get(c.sector) ?? []), c]);
    }
    return [...bySector.entries()];
  }, [overview.capabilities, detail.row.sectorCode, detail.capabilityRows]);

  const toggle = (code: string) => setClaims(prev => {
    const next = { ...prev };
    if (next[code]) delete next[code]; else next[code] = { code, availability: 1, statedBy: 1, note: null };
    return next;
  });

  const save = () => {
    setBusy(true);
    emergencyApi.saveCapabilities(detail.row.id, Object.values(claims))
      .then(onSaved)
      .catch((caught: unknown) => push(err(caught, 'That did not save.'), 'error'))
      .finally(() => setBusy(false));
  };

  return (
    <div>
      <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.6, marginBottom: 12 }}>
        What this place can actually handle. Routing uses these. Each tick is a claim with your name and today's date on it.
      </div>
      {groups.map(([sector, items]) => (
        <div key={sector} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: t.textSubtle, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>{sector}</div>
          <div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
            {items.map(c => {
              const claim = claims[c.code];
              return (
                <div key={c.code} data-capability={c.code} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 9, border: `1px solid ${claim ? t.brand : t.border}`, background: claim ? t.brandSoft : 'transparent' }}>
                  <input type="checkbox" checked={Boolean(claim)} disabled={!canEdit} onChange={() => toggle(c.code)} />
                  <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: t.text }}>{c.label}</span>
                  {claim ? (
                    <select
                      value={claim.availability}
                      disabled={!canEdit}
                      onChange={event => setClaims(prev => ({ ...prev, [c.code]: { ...prev[c.code], availability: Number(event.target.value) } }))}
                      style={{ fontSize: 11.5, fontFamily: 'inherit', background: t.surface, color: t.text, border: `1px solid ${t.border}`, borderRadius: 6, padding: '3px 4px' }}
                    >
                      {Object.entries(AVAILABILITY).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                    </select>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {detail.capabilityRows.length > 0 ? (
        <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 4 }}>
          Last stated by {detail.capabilityRows[0].statedByName ?? 'somebody'} on {fmtDate(detail.capabilityRows[0].statedAt)} · {STATED_BY[detail.capabilityRows[0].statedBy]}
        </div>
      ) : null}
      {canEdit ? <Actions><Button tone="primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save capabilities'}</Button></Actions> : null}
    </div>
  );
}

function UnitDialog({ facilityId, existing, onClose, onDone }: { facilityId: string; existing: UnitRow | null; onClose: () => void; onDone: (next: FacilityDetail) => void }) {
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  const save = () => {
    setBusy(true); setError(null);
    emergencyApi.saveUnit({ id: existing?.id ?? null, facilityId, name, description: description || null, sort: existing?.sort ?? 0 })
      .then(onDone).catch((caught: unknown) => setError(err(caught, 'That did not save.'))).finally(() => setBusy(false));
  };

  return (
    <Modal title={existing ? `Edit ${existing.name}` : 'New unit'} onClose={onClose}>
      <Field label="Name"><Input value={name} onChange={setName} placeholder="Family Support" autoFocus onEnter={save} /></Field>
      <Field label="What it does"><Input value={description} onChange={setDescription} placeholder="Domestic violence, child protection" /></Field>
      {error ? <ErrorNote message={error} /> : null}
      <Actions>
        {existing ? <Button tone="danger" onClick={() => setRemoving(true)} style={{ marginRight: 'auto' }}>Remove</Button> : null}
        <Button tone="subtle" onClick={onClose}>Cancel</Button>
        <Button tone="primary" disabled={busy || !name.trim()} onClick={save}>{busy ? 'Saving…' : 'Save'}</Button>
      </Actions>
      {removing && existing ? (
        <NoteDialog title={`Remove ${existing.name}`} hint="Its contacts go with it." verb="Remove" danger onClose={() => setRemoving(false)}
          onSave={reason => emergencyApi.removeUnit(existing.id, reason).then(next => { setRemoving(false); onDone(next); })} />
      ) : null}
    </Modal>
  );
}

/* ------------------------------------------------------------------ contacts */

export function ContactsTable({ contacts, canEdit, onOpen, onChanged, push, showUnit, showPlace }: {
  contacts: ContactRow[];
  canEdit: boolean;
  onOpen?: (contact: ContactRow) => void;
  onChanged: (message?: string) => void;
  push: (message: string, tone?: 'ok' | 'error') => void;
  showUnit?: boolean;
  showPlace?: boolean;
}) {
  const { t } = useTheme();
  const [changing, setChanging] = useState<ContactRow | null>(null);

  if (contacts.length === 0) {
    return <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.6 }}>No contacts. A place with no number is a pin on a map.</div>;
  }

  const rang = (contact: ContactRow) => {
    emergencyApi.verifyContact(contact.id, true)
      .then(() => onChanged(`${contact.name} confirmed for another ninety days.`))
      .catch((caught: unknown) => push(err(caught, 'That did not save.'), 'error'));
  };

  return (
    <>
      <Table head={[...(showPlace ? ['Where'] : []), 'Who', ...(showUnit ? ['Unit'] : []), 'Number', 'Class', 'Verification', '']}>
        {contacts.map(c => (
          <Row key={c.id} onClick={onOpen && canEdit ? () => onOpen(c) : undefined}>
            {showPlace ? <Cell>{c.institutionName}{c.facilityName ? ` · ${c.facilityName}` : ''}</Cell> : null}
            <Cell>
              <strong>{c.name}</strong>{c.position ? <span style={{ color: t.textMuted }}> · {c.position}</span> : null}
              {!c.active ? <> <Pill tone="neutral">Inactive</Pill></> : null}
            </Cell>
            {showUnit ? <Cell>{c.unitName ?? '—'}</Cell> : null}
            <Cell mono>{c.phone}{c.alternativePhone ? <span style={{ color: t.textSubtle }}> / {c.alternativePhone}</span> : null}</Cell>
            <Cell><Pill tone={classTone(c.class)}>{CONTACT_CLASS[c.class]}</Pill>{c.escalationLevel > 1 ? <span style={{ fontSize: 11, color: t.textSubtle }}> L{c.escalationLevel}</span> : null}</Cell>
            <Cell>
              <Pill tone={verificationTone(c.verification)}>{VERIFICATION[c.verification]}</Pill>
              {c.lastVerifiedAt ? <div style={{ fontSize: 11, color: t.textSubtle, marginTop: 2 }}>{fmtDate(c.lastVerifiedAt)}{c.lastVerifiedByName ? ` · ${c.lastVerifiedByName}` : ''}</div> : null}
            </Cell>
            <Cell>
              {canEdit ? (
                <div style={{ display: 'flex', gap: 4 }} onClick={event => event.stopPropagation()}>
                  <Button size="sm" tone="primary" onClick={() => rang(c)} title="You rang it and it is right">Rang it — right</Button>
                  <Button size="sm" tone="subtle" onClick={() => setChanging(c)} title="You rang it and it has changed or is dead">Changed</Button>
                </div>
              ) : null}
            </Cell>
          </Row>
        ))}
      </Table>
      {changing ? (
        <NoteDialog
          title={`${changing.name} — the number has changed`}
          hint="Say what happened: dead line, wrong person, new number given. It stays on the chasing list until somebody edits it and rings the new one."
          verb="Mark changed"
          onClose={() => setChanging(null)}
          onSave={note => emergencyApi.verifyContact(changing.id, false, note).then(() => { setChanging(null); onChanged('Marked as changed.'); })}
        />
      ) : null}
    </>
  );
}

function ContactDialog({ overview, institutionId, facilityId, units, existing, onClose, onDone }: {
  overview: DirectoryOverview;
  institutionId: string;
  facilityId?: string;
  units?: UnitRow[];
  existing: ContactRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTheme();
  const [form, setForm] = useState<SaveContact>({
    id: existing?.id ?? null, institutionId, facilityId: facilityId ?? existing?.facilityId ?? null, unitId: existing?.unitId ?? null,
    name: existing?.name ?? '', position: existing?.position ?? '', phone: existing?.phone ?? '', alternativePhone: existing?.alternativePhone ?? '',
    whatsApp: existing?.whatsApp ?? '', email: existing?.email ?? '', class: existing?.class ?? 2, priority: existing?.priority ?? 1,
    escalationLevel: existing?.escalationLevel ?? 1, availableFrom: existing?.availableFrom ?? '', availableTo: existing?.availableTo ?? '',
    active: existing?.active ?? true, note: existing?.note ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const set = <K extends keyof SaveContact>(key: K, value: SaveContact[K]) => setForm(prev => ({ ...prev, [key]: value }));
  void overview;

  const save = () => {
    setBusy(true); setError(null);
    emergencyApi.saveContact({ ...form, unitId: form.unitId || null, availableFrom: form.availableFrom || null, availableTo: form.availableTo || null })
      .then(onDone).catch((caught: unknown) => setError(err(caught, 'That did not save.'))).finally(() => setBusy(false));
  };

  return (
    <Modal title={existing ? `Edit ${existing.name}` : 'New contact'} onClose={onClose} width={620}>
      <Two>
        <Field label="Who" hint="A person, or a desk — “Duty officer” is fine."><Input value={form.name} onChange={v => set('name', v)} autoFocus /></Field>
        <Field label="Position"><Input value={form.position ?? ''} onChange={v => set('position', v)} placeholder="Station commander" /></Field>
      </Two>
      <Two>
        <Field label="Phone"><Input value={form.phone} onChange={v => set('phone', v)} placeholder="+232 76 000 000" /></Field>
        <Field label="Alternative"><Input value={form.alternativePhone ?? ''} onChange={v => set('alternativePhone', v)} /></Field>
      </Two>
      <Two>
        <Field label="WhatsApp"><Input value={form.whatsApp ?? ''} onChange={v => set('whatsApp', v)} /></Field>
        <Field label="Email"><Input value={form.email ?? ''} onChange={v => set('email', v)} /></Field>
      </Two>
      <Two>
        <Field label="Who may see it" hint="Public reaches citizens. Everything else stays in the console and the dispatch desk.">
          <Select value={String(form.class)} onChange={v => set('class', Number(v))}>
            {Object.entries(CONTACT_CLASS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </Select>
        </Field>
        {units && units.length > 0 ? (
          <Field label="Unit">
            <Select value={form.unitId ?? ''} onChange={v => set('unitId', v || null)}>
              <option value="">The station itself</option>
              {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </Field>
        ) : <div />}
      </Two>
      <Two>
        <Field label="Priority">
          <Select value={String(form.priority)} onChange={v => set('priority', Number(v))}>
            {Object.entries(CONTACT_PRIORITY).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </Select>
        </Field>
        <Field label="Escalation level" hint="1 is rung first."><Input type="number" value={String(form.escalationLevel)} onChange={v => set('escalationLevel', Number(v) || 1)} /></Field>
      </Two>
      <Two>
        <Field label="Available from" hint="24-hour, or empty for always."><Input value={form.availableFrom ?? ''} onChange={v => set('availableFrom', v)} placeholder="08:00" /></Field>
        <Field label="Until"><Input value={form.availableTo ?? ''} onChange={v => set('availableTo', v)} placeholder="17:00" /></Field>
      </Two>
      <Check checked={form.active} onChange={v => set('active', v)} label="Active — rung, and shown if public" />
      <Field label="Note"><Input value={form.note ?? ''} onChange={v => set('note', v)} /></Field>
      {form.class === 1 ? (
        <div style={{ fontSize: 12.5, color: t.warning, fontWeight: 600, margin: '-4px 0 12px' }}>
          Public: every person with the app can see this number once the module is on. Make sure it is the one painted on the wall.
        </div>
      ) : null}
      {existing && existing.phone !== form.phone ? (
        <div style={{ fontSize: 12.5, color: t.textMuted, margin: '-4px 0 12px' }}>The number has changed, so verification starts again from nothing.</div>
      ) : null}
      {error ? <ErrorNote message={error} /> : null}
      <Actions>
        {existing ? <Button tone="danger" onClick={() => setRemoving(true)} style={{ marginRight: 'auto' }}>Remove</Button> : null}
        <Button tone="subtle" onClick={onClose}>Cancel</Button>
        <Button tone="primary" disabled={busy || !form.name.trim() || !form.phone.trim()} onClick={save}>{busy ? 'Saving…' : 'Save'}</Button>
      </Actions>
      {removing && existing ? (
        <NoteDialog title={`Remove ${existing.name}`} hint="Nothing is hard-deleted." verb="Remove" danger onClose={() => setRemoving(false)}
          onSave={reason => emergencyApi.removeContact(existing.id, reason).then(() => { setRemoving(false); onDone(); })} />
      ) : null}
    </Modal>
  );
}

/* ------------------------------------------------------------------ a reason */

export function NoteDialog({ title, hint, verb, required, danger, onClose, onSave }: {
  title: string; hint: string; verb: string; required?: boolean; danger?: boolean;
  onClose: () => void; onSave: (note: string) => Promise<unknown>;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    setBusy(true); setError(null);
    onSave(note.trim()).catch((caught: unknown) => setError(err(caught, 'That did not work.'))).finally(() => setBusy(false));
  };
  return (
    <Modal title={title} onClose={onClose}>
      <Field label={required ? 'Why' : 'Note'} hint={hint}><Textarea value={note} onChange={setNote} rows={3} /></Field>
      {error ? <ErrorNote message={error} /> : null}
      <Actions>
        <Button tone="subtle" onClick={onClose}>Cancel</Button>
        <Button tone={danger ? 'danger' : 'primary'} disabled={busy || (required && !note.trim())} onClick={save}>{busy ? '…' : verb}</Button>
      </Actions>
    </Modal>
  );
}
