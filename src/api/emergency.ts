/**
 * The national response directory — every call inside the encrypted envelope.
 *
 * <p>Reads as well as writes. The envelope wraps a request body and the response to it, and a
 * GET has no body; so a directory of duty officers' mobiles is asked for with a small sealed
 * query and answered inside the same envelope. Nothing on this file's wire is plain JSON.</p>
 *
 * <p>The routes live under the console prefix, not the emergency one, so the directory can be
 * built while the module is still switched off — the first phase happens before the tab.</p>
 */
import { securePost } from './secure';

const BASE = '/api/v1/secure/admin/console/emergency';

/* ---------- taxonomy ---------- */

export type SectorRow = {
  id: string; code: string; name: string; description: string | null; sort: number; active: boolean; institutions: number;
  glyph: string; tone: string; tagline: string | null; hotline: string | null; hotlineLabel: string | null;
};
export const SECTOR_GLYPHS = ['shield', 'cross', 'flame', 'wave', 'car', 'bolt', 'anchor', 'people', 'phone', 'alert'] as const;
export const SECTOR_TONES = ['navy', 'red', 'orange', 'teal', 'blue', 'amber', 'green', 'purple', 'grey'] as const;
export type InstitutionTypeRow = { id: string; code: string; name: string; sectorId: string | null; sectorName: string | null; sort: number; active: boolean };
export type CapabilityOption = { code: string; sector: string; label: string };
export type DistrictOption = { slug: string; name: string; province: string };

export type DirectoryOverview = {
  institutions: number; institutionsVerified: number;
  facilities: number; facilitiesWithPin: number; facilitiesVerified: number;
  contacts: number; contactsPublic: number; contactsNeedingVerification: number;
  sectors: SectorRow[]; types: InstitutionTypeRow[]; capabilities: CapabilityOption[]; districts: DistrictOption[];
  canEdit: boolean;
};

/* ---------- institutions ---------- */

export type InstitutionRow = {
  id: string; name: string; shortName: string | null;
  sectorId: string; sectorName: string; typeId: string | null; typeName: string | null;
  government: boolean; national: boolean; status: number; verified: boolean;
  publicPhone: string | null; headOfficeText: string | null;
  facilities: number; contacts: number; contactsNeedingVerification: number;
  updatedAt: string | null;
};

export type InstitutionPage = { items: InstitutionRow[]; total: number; page: number; pageSize: number };

export type SaveInstitution = {
  id?: string | null; name: string; shortName?: string | null; sectorId: string; typeId?: string | null;
  government: boolean; national: boolean; status: number;
  headOfficePlaceId?: string | null; headOfficeText?: string | null;
  publicPhone?: string | null; alternativePhone?: string | null; email?: string | null; website?: string | null;
  description?: string | null; logoUrl?: string | null;
};

export type InstitutionDetail = {
  row: InstitutionRow;
  alternativePhone: string | null; email: string | null; website: string | null; description: string | null; logoUrl: string | null;
  headOfficePlaceId: string | null;
  verifiedAt: string | null; verifiedByName: string | null; verificationNote: string | null;
  facilityRows: FacilityRow[];
  institutionContacts: ContactRow[];
};

/* ---------- facilities ---------- */

export type FacilityRow = {
  id: string; institutionId: string; institutionName: string; name: string; kind: number; status: number;
  districtSlug: string | null; community: string | null; address: string | null; landmark: string | null;
  latitude: number | null; longitude: number | null; gpsVerified: boolean; gpsMethod: number;
  coverage: number; coverageRadiusKm: number | null; coverageDistrictSlug: string | null;
  hours: number; hoursText: string | null; alwaysOnEmergencyUnit: boolean; verified: boolean;
  healthFacilityId: string | null; units: number; contacts: number; capabilities: number;
  /** The institution's sector code — the console offers only this sector's capabilities. */
  sectorCode?: string | null;
  /** The office this one reports to, when it is a sub-office: a station under a regional office, a post under a station. */
  parentFacilityId?: string | null; parentFacilityName?: string | null;
  /** How many offices report to this one, directly. */
  subOffices?: number;
};

export type SaveFacility = {
  id?: string | null; institutionId: string; name: string; kind: number; status: number;
  /** Make this a sub-office of another office in the same institution. Empty means top level. */
  parentFacilityId?: string | null;
  healthFacilityId?: string | null; placeId?: string | null; districtSlug?: string | null;
  community?: string | null; address?: string | null; landmark?: string | null;
  coverage: number; coverageRadiusKm?: number | null; coverageDistrictSlug?: string | null; coverageNote?: string | null;
  hours: number; hoursText?: string | null; holidayNote?: string | null; alwaysOnEmergencyUnit: boolean;
};

export type FacilityDetail = {
  row: FacilityRow;
  placeId: string | null; placePath: string | null;
  accuracyMetres: number | null; gpsCapturedAt: string | null; gpsCapturedByName: string | null;
  coverageNote: string | null; holidayNote: string | null;
  verifiedAt: string | null; verifiedByName: string | null; verificationNote: string | null;
  unitRows: UnitRow[]; contactRows: ContactRow[]; capabilityRows: CapabilityRow[];
};

export type UnitRow = { id: string; facilityId: string; name: string; description: string | null; sort: number; contacts: number };

/* ---------- contacts ---------- */

export type ContactRow = {
  id: string; institutionId: string; institutionName: string;
  facilityId: string | null; facilityName: string | null; unitId: string | null; unitName: string | null;
  name: string; position: string | null; phone: string; alternativePhone: string | null; whatsApp: string | null; email: string | null;
  class: number; priority: number; escalationLevel: number; availableFrom: string | null; availableTo: string | null; active: boolean;
  verification: number; lastVerifiedAt: string | null; lastVerifiedByName: string | null; nextVerificationDue: string | null;
  note: string | null;
};

export type SaveContact = {
  id?: string | null; institutionId: string; facilityId?: string | null; unitId?: string | null;
  name: string; position?: string | null; phone: string; alternativePhone?: string | null; whatsApp?: string | null; email?: string | null;
  class: number; priority: number; escalationLevel: number; availableFrom?: string | null; availableTo?: string | null;
  active: boolean; note?: string | null;
};

export type ContactsDuePage = { items: ContactRow[]; total: number; page: number; pageSize: number };

/* ---------- capabilities ---------- */

export type CapabilityRow = {
  id: string; facilityId: string; unitId: string | null; code: string; label: string; sector: string;
  availability: number; statedBy: number; statedAt: string; statedByName: string | null; note: string | null;
};

export type CapabilityClaim = { code: string; availability: number; statedBy: number; note?: string | null };

/* ---------- words ---------- */

export const CONTACT_CLASS: Record<number, string> = { 1: 'Public', 2: 'Dispatch', 3: 'Escalation', 4: 'Supervisor', 5: 'Internal', 6: 'After hours' };
export const CONTACT_PRIORITY: Record<number, string> = { 1: 'Primary', 2: 'Secondary', 3: 'Backup' };
export const VERIFICATION: Record<number, string> = { 0: 'Never rung', 1: 'Verified', 2: 'Due', 3: 'Expired', 4: 'Changed' };
export const INSTITUTION_STATUS: Record<number, string> = { 1: 'Draft', 2: 'Active', 3: 'Suspended', 4: 'Archived' };
export const FACILITY_STATUS: Record<number, string> = { 1: 'Draft', 2: 'Active', 3: 'Suspended', 4: 'Closed' };
export const FACILITY_KIND: Record<number, string> = {
  1: 'Station', 2: 'Office', 3: 'Hospital', 4: 'Clinic', 5: 'Health post', 6: 'Ambulance base', 7: 'Fire station', 8: 'Depot', 9: 'Command centre', 10: 'Other',
};
export const COVERAGE: Record<number, string> = { 1: 'Radius', 2: 'District', 3: 'Custom area', 4: 'National' };
export const HOURS: Record<number, string> = { 1: 'Always open', 2: 'Fixed hours', 3: 'Emergency only', 4: 'Temporarily closed' };
export const GPS_METHOD: Record<number, string> = { 0: 'Unknown', 1: 'Surveyed', 2: 'Map', 3: 'Imported', 4: 'Reported' };
export const AVAILABILITY: Record<number, string> = { 1: 'Available', 2: 'Limited', 3: 'Referral only', 4: 'Not available' };
export const STATED_BY: Record<number, string> = { 1: 'Our team', 2: 'The institution', 3: 'Public record' };

/* ---------- the calls ---------- */

export type SampleSummary = { institutions: number; facilities: number; contacts: number };

/** A registration code: issued for one category, redeemed by a station's own people from the app. */
export type RegistrationRow = { id: string; personName: string; personPhone: string | null; institutionName: string; facilityId: string; facilityName: string; facilityVerified: boolean; registeredAt: string };
export type RegistrationCodeRow = {
  id: string; code: string; sectorId: string; sectorCode: string; sectorName: string; institutionId: string | null; institutionName: string | null;
  label: string | null; grant: number; maxUses: number; uses: number; expiresAt: string | null; active: boolean; usable: boolean; note: string | null;
  issuedByName: string | null; issuedAt: string; registrations: RegistrationRow[];
};
/** A sentence a reporter can pick — the console's own list, per category. */
export type SituationRow = { id: string; code: string; sectorId: string; sectorCode: string; sectorName: string; words: string; severity: number; capability: string | null; alsoSectorCode: string | null; sensitive: boolean; sort: number; active: boolean };
export type SaveSituation = { id?: string | null; sectorId: string; code?: string | null; words: string; severity: number; capability?: string | null; alsoSectorCode?: string | null; sensitive: boolean; sort: number; active: boolean };
export const SEVERITY_WORDS: Record<number, string> = { 1: 'Critical', 2: 'Serious', 3: 'Urgent', 4: 'Low', 5: 'Information' };

export type IssueCode = { sectorId: string; institutionId?: string | null; label?: string | null; grant?: number; maxUses?: number; expiresInDays?: number | null; note?: string | null };

export const emergencyApi = {
  overview: () => securePost<DirectoryOverview>(`${BASE}/overview`, {}),
  saveSector: (body: Partial<SectorRow> & { name: string; code: string }) => securePost<SectorRow>(`${BASE}/sectors/save`, body),
  removeSector: (body: SectorRow) => securePost<SectorRow>(`${BASE}/sectors/save`, { ...body, active: false }),
  /** Sample places: thirty per category to look at, and one call to remove every one of them. */
  sampleStatus: () => securePost<SampleSummary>(`${BASE}/sample/status`, {}),
  sampleSeed: () => securePost<SampleSummary>(`${BASE}/sample/seed`, {}),
  samplePurge: () => securePost<SampleSummary>(`${BASE}/sample/purge`, {}),
  situations: (sectorId?: string | null) => securePost<SituationRow[]>(`${BASE}/situations`, { sectorId: sectorId ?? null, includeHidden: true }),
  saveSituation: (body: SaveSituation) => securePost<SituationRow>(`${BASE}/situations/save`, body),
  codes: (sectorId?: string | null, includeSpent = false) => securePost<{ codes: RegistrationCodeRow[] }>(`${BASE}/codes`, { sectorId: sectorId ?? null, includeSpent }),
  issueCode: (body: IssueCode) => securePost<RegistrationCodeRow>(`${BASE}/codes/issue`, body),
  revokeCode: (id: string, reason?: string | null) => securePost<RegistrationCodeRow>(`${BASE}/codes/revoke`, { id, reason: reason ?? null }),
  saveType: (body: Partial<InstitutionTypeRow> & { name: string; code: string }) => securePost<InstitutionTypeRow>(`${BASE}/types/save`, body),

  searchInstitutions: (body: { query?: string; sectorId?: string | null; status?: number | null; page?: number; pageSize?: number }) =>
    securePost<InstitutionPage>(`${BASE}/institutions/search`, body),
  getInstitution: (id: string) => securePost<InstitutionDetail>(`${BASE}/institutions/get`, { id }),
  saveInstitution: (body: SaveInstitution) => securePost<InstitutionDetail>(`${BASE}/institutions/save`, body),
  verifyInstitution: (institutionId: string, verified: boolean, note?: string) =>
    securePost<InstitutionDetail>(`${BASE}/institutions/verify`, { institutionId, verified, note: note ?? null }),
  archiveInstitution: (id: string, reason: string) => securePost<boolean>(`${BASE}/institutions/archive`, { id, reason }),

  getFacility: (id: string) => securePost<FacilityDetail>(`${BASE}/facilities/get`, { id }),
  saveFacility: (body: SaveFacility) => securePost<FacilityDetail>(`${BASE}/facilities/save`, body),
  setFacilityGps: (body: { facilityId: string; latitude: number; longitude: number; accuracyMetres?: number | null; method: number; verified: boolean }) =>
    securePost<FacilityDetail>(`${BASE}/facilities/gps`, body),
  verifyFacility: (facilityId: string, verified: boolean, note?: string) =>
    securePost<FacilityDetail>(`${BASE}/facilities/verify`, { facilityId, verified, note: note ?? null }),
  removeFacility: (id: string, reason: string) => securePost<boolean>(`${BASE}/facilities/remove`, { id, reason }),

  saveUnit: (body: { id?: string | null; facilityId: string; name: string; description?: string | null; sort?: number }) =>
    securePost<FacilityDetail>(`${BASE}/units/save`, body),
  removeUnit: (id: string, reason?: string) => securePost<FacilityDetail>(`${BASE}/units/remove`, { id, reason: reason ?? null }),

  saveContact: (body: SaveContact) => securePost<ContactRow>(`${BASE}/contacts/save`, body),
  verifyContact: (contactId: string, confirmed: boolean, note?: string) =>
    securePost<ContactRow>(`${BASE}/contacts/verify`, { contactId, confirmed, note: note ?? null }),
  removeContact: (id: string, reason?: string) => securePost<boolean>(`${BASE}/contacts/remove`, { id, reason: reason ?? null }),
  contactsDue: (page = 1, pageSize = 50) => securePost<ContactsDuePage>(`${BASE}/contacts/due`, { page, pageSize }),

  saveCapabilities: (facilityId: string, claims: CapabilityClaim[], unitId?: string | null) =>
    securePost<FacilityDetail>(`${BASE}/capabilities/save`, { facilityId, unitId: unitId ?? null, claims }),

  /** An institution's desk, as its own supervisor would manage it — the same service, the institution named. */
  people: (institutionId: string) => securePost<InstitutionPeople>(`${BASE}/people`, { institutionId }),
  peopleLookup: (institutionId: string, query: string) => securePost<PersonLookup>(`${BASE}/people/lookup`, { institutionId, query }),
  savePerson: (body: SavePerson) => securePost<PersonSaved>(`${BASE}/people/save`, body),
  removePerson: (id: string, reason?: string) => securePost<boolean>(`${BASE}/people/remove`, { id, reason: reason ?? null }),
  resendSetup: (id: string) => securePost<PersonSaved>(`${BASE}/people/resend`, { id }),
};

/* =============================== reporting and the desk =============================== */

const DESK = '/api/v1/secure/emergency';

export type TimelineRow = { at: string; kind: number; message: string; actorName: string | null; internal: boolean };

export type QueueCard = {
  id: string; number: string; category: number; situationWords: string; severity: number; status: number;
  isSensitive: boolean; isTraining: boolean; sectorCode: string; districtSlug: string | null; community: string | null;
  landmark: string | null; hasPin: boolean; reportedAt: string; ageMinutes: number;
  facilityName: string | null; institutionName: string | null; dispatcherName: string | null; unowned: boolean;
  escalationLevel: number; peopleAffected: number | null;
};

export type DispatchQueue = { cards: QueueCard[]; desk: string; national: boolean; unowned: number; p1Open: number; asOf: string };

export type EscalationContact = { level: number; name: string; position: string | null; phone: string; alternativePhone: string | null; class: number; verification: number };
export type RouteOption = { facilityId: string; facilityName: string; institutionName: string; covers: boolean; hasCapability: boolean; distanceKm: number | null; because: string };

export type DeskIncident = {
  card: QueueCard; situationCode: string; alsoSectorCode: string | null; requiredCapability: string | null;
  description: string | null; childrenInvolved: boolean | null; reporterName: string | null; callbackPhone: string; reporterHasAccount: boolean; source: number;
  latitude: number | null; longitude: number | null; accuracyMetres: number | null; locatedAt: string | null; locationSource: number; locationNote: string | null;
  institutionId: string | null; facilityId: string | null; unitId: string | null; unitName: string | null; routedAt: string | null; routedBecause: string | null;
  dispatcherUserId: string | null; acknowledgedAt: string | null; inProgressAt: string | null; escalatedAt: string | null; resolvedAt: string | null; closedAt: string | null;
  outcome: number | null; outcomeNote: string | null; masterIncidentNumber: string | null;
  timeline: TimelineRow[]; escalationLadder: EscalationContact[]; possibleDuplicates: QueueCard[]; routeOptions: RouteOption[]; canAct: boolean;
  assignments: AssignmentRow[] | null;
  /** What the reporter attached: rows. The bytes come one at a time through `desk/evidence`, sealed. Phase 5. */
  evidence?: EvidenceRow[] | null;
  /** The reporter asked to stay unnamed; name and number are empty on purpose. */
  anonymous?: boolean;
  /** The station the reporter chose themselves, when they did. */
  requestedFacility?: string | null;
  /** The reporter's phone is sending its position as they move; `latitude`/`longitude` above are the latest. Phase 6. */
  following?: boolean;
  followSince?: string | null;
  followLastAt?: string | null;
  followMoves?: number;
  /** Where the report was first made, once the pin has moved. */
  originLatitude?: number | null;
  originLongitude?: number | null;
  /** The trail, oldest first. Null when this desk may not see where. */
  trail?: TrailPoint[] | null;
  headingDegrees?: number | null;
  speedMps?: number | null;
  /** The responsible station's own pin, for the route from it. */
  facilityLatitude?: number | null;
  facilityLongitude?: number | null;
  distanceFromFacilityKm?: number | null;
};

export type TrailPoint = { latitude: number; longitude: number; accuracyMetres: number | null; at: string };

/** The way there: a road when one could be asked, a straight line that says so otherwise. */
export type RoutePlan = {
  fromLabel: string; fromLatitude: number; fromLongitude: number; toLatitude: number; toLongitude: number;
  distanceKm: number; durationMinutes: number; straight: boolean;
  /** [latitude, longitude] pairs, start to end. */
  points: number[][];
  navigationUrl: string; asOf: string; following: boolean; provider: string;
};
export type RouteAsk = { id: string; fromFacilityId?: string | null; fromAssignmentId?: string | null; fromLatitude?: number | null; fromLongitude?: number | null };

export type EvidenceRow = { id: string; kind: number; fileName: string; contentType: string; bytes: number; caption: string | null; addedAt: string; fromReporter: boolean; openCount: number };
export type EvidenceFile = { id: string; fileName: string; contentType: string; bytes: number; base64: string };
export const EVIDENCE_KIND: Record<number, string> = { 1: 'Photo', 2: 'Video', 3: 'Recording', 4: 'Document' };

export type DeskAccess = { isDispatcher: boolean; national: boolean; institutionName: string | null; institutionId: string | null; role: number };

export type DispatcherRow = {
  id: string; userId: string; name: string; email: string | null; phone: string | null;
  institutionId: string; institutionName: string; facilityId: string | null; facilityName: string | null;
  role: number; title: string | null; active: boolean; lastSeenAt: string | null;
};

/* ---------- an institution's desk, as people ---------- */

export type DeskPerson = {
  id: string; userId: string; name: string; email: string | null; phone: string | null; facilityId: string | null; facilityName: string | null;
  role: number; title: string | null; active: boolean; awaitingSetup: boolean; lastSeenAt: string | null; addedAt: string; isMe: boolean;
  /** Whether the person asking may change this row — a station supervisor reaches only their own subtree. */
  manageable: boolean;
  /** False when the account has no e-mail: no sign-in code can reach them, so no command centre. */
  canSignIn: boolean;
};
export type InstitutionPeople = {
  institutionId: string; institutionName: string; canManage: boolean; facilities: { id: string; name: string; districtSlug: string | null }[]; people: DeskPerson[];
  managesFacilityId: string | null; managesFacilityName: string | null; commandUrl: string | null;
};
/**
 * What a desk role is called, given where the binding sits. A supervisor of the whole
 * institution is its administrator — they profile everybody else; a supervisor of one
 * station runs that station's desk and the offices under it.
 */
export const deskRoleWords = (role: number, facilityId: string | null | undefined) => (role === 2 ? (facilityId ? 'Station supervisor' : 'Institution admin') : role === 3 ? 'View only' : 'Dispatcher');
export type PersonLookup = { found: boolean; userId: string | null; name: string | null; maskedEmail: string | null; maskedPhone: string | null; alreadyOnDesk: boolean; message: string };
export type SavePerson = {
  id?: string | null; institutionId: string; userId?: string | null;
  newAccount?: { firstName: string; lastName: string; email: string; phone?: string | null } | null;
  facilityId?: string | null; role: number; title?: string | null; active: boolean;
};
export type PersonSaved = { person: DeskPerson; accountCreated: boolean; emailSent: boolean; message: string };

export const SEVERITY: Record<number, string> = { 1: 'P1 critical', 2: 'P2 serious', 3: 'P3 urgent', 4: 'P4 low', 5: 'Information' };
export const INCIDENT_STATUS: Record<number, string> = { 1: 'New', 2: 'Acknowledged', 3: 'Being handled', 4: 'Escalated', 5: 'Resolved', 6: 'Closed', 7: 'Cancelled', 8: 'Duplicate', 9: 'Somebody sent', 10: 'On the way', 11: 'On scene' };
export const OUTCOME: Record<number, string> = { 1: 'Resolved', 2: 'Mistaken report', 3: 'Duplicate', 4: 'Unable to verify', 5: 'Malicious', 6: 'Training', 7: 'Referred elsewhere', 8: 'Cancelled' };
export const CATEGORY: Record<number, string> = { 1: 'Medical', 2: 'Accident', 3: 'Police and security', 4: 'Fire', 5: 'Disaster', 6: 'Other' };
export const DISPATCHER_ROLE: Record<number, string> = { 1: 'Dispatcher', 2: 'Supervisor', 3: 'View only' };
export const SOURCE: Record<number, string> = { 1: 'App', 2: 'Web', 3: 'WhatsApp', 4: 'SMS', 5: 'Call centre', 6: 'Dispatcher', 9: 'Other' };

export const deskApi = {
  access: () => securePost<DeskAccess>(`${DESK}/desk/access`, {}),
  queue: (body: { status?: number | null; sector?: string | null; districtSlug?: string | null; includeTraining?: boolean; includeClosed?: boolean; take?: number }) =>
    securePost<DispatchQueue>(`${DESK}/desk/queue`, body),
  incident: (id: string) => securePost<DeskIncident>(`${DESK}/desk/incident`, { id }),
  acknowledge: (id: string, note?: string) => securePost<DeskIncident>(`${DESK}/desk/acknowledge`, { id, note: note ?? null }),
  severity: (id: string, severity: number, reason: string) => securePost<DeskIncident>(`${DESK}/desk/severity`, { id, severity, reason }),
  note: (id: string, note: string, internal: boolean) => securePost<DeskIncident>(`${DESK}/desk/note`, { id, note, internal }),
  status: (id: string, status: number, note?: string) => securePost<DeskIncident>(`${DESK}/desk/status`, { id, status, note: note ?? null }),
  reroute: (id: string, facilityId: string, reason: string, unitId?: string | null) => securePost<DeskIncident>(`${DESK}/desk/reroute`, { id, facilityId, unitId: unitId ?? null, reason }),
  escalate: (id: string, reason: string) => securePost<DeskIncident>(`${DESK}/desk/escalate`, { id, reason }),
  duplicate: (id: string, masterId: string, note?: string) => securePost<DeskIncident>(`${DESK}/desk/duplicate`, { id, masterId, note: note ?? null }),
  close: (id: string, outcome: number, note?: string) => securePost<DeskIncident>(`${DESK}/desk/close`, { id, outcome, note: note ?? null }),
  location: (body: { id: string; latitude?: number | null; longitude?: number | null; districtSlug?: string | null; community?: string | null; landmark?: string | null; note?: string | null }) =>
    securePost<DeskIncident>(`${DESK}/desk/location`, body),

  dispatchers: (institutionId?: string | null) => securePost<{ dispatchers: DispatcherRow[] }>(`${BASE}/dispatchers/search`, { institutionId: institutionId ?? null }),
  saveDispatcher: (body: { id?: string | null; userLookup?: string | null; userId?: string | null; institutionId: string; facilityId?: string | null; role: number; title?: string | null; active: boolean }) =>
    securePost<DispatcherRow>(`${BASE}/dispatchers/save`, body),
  removeDispatcher: (id: string, reason?: string) => securePost<boolean>(`${BASE}/dispatchers/remove`, { id, reason: reason ?? null }),
};

/* =============================== phase 3: dispatch =============================== */

export type ResponderOption = {
  id: string; name: string; role: number; status: number; skills: string[]; hasCapability: boolean; distanceKm: number | null;
  locationAgeMinutes: number | null; because: string; phone: string | null; institutionName: string; facilityName: string | null; unitName: string | null;
  free: boolean; withinRadius: boolean;
};
export type VehicleOption = {
  id: string; callSign: string; kind: number; registration: string | null; status: number; ambulanceLevel: number; capacity: number;
  institutionName: string; facilityName: string | null; unitName: string | null; free: boolean; inspectionDue: boolean; locationAgeMinutes: number | null;
};
export type AssistanceOption = { facilityId: string; facilityName: string; institutionName: string; sectorCode: string; covers: boolean; distanceKm: number | null; because: string };
export type DeskResources = { responders: ResponderOption[]; vehicles: VehicleOption[]; assistance: AssistanceOption[]; requiredCapability: string | null; asOf: string };

export type AssignmentRow = {
  id: string; incidentId: string; incidentNumber: string; institutionId: string; institutionName: string; facilityName: string | null; unitName: string | null;
  responderId: string | null; responderName: string | null; responderRole: number | null; responderPhone: string | null;
  vehicleId: string | null; vehicleCallSign: string | null; vehicleKind: number | null;
  status: number; assignedAt: string; acceptedAt: string | null; enRouteAt: string | null; onSceneAt: string | null; transportingAt: string | null; endedAt: string | null;
  assignedByName: string | null; instructions: string | null; endNote: string | null; isLead: boolean;
  latitude: number | null; longitude: number | null; locationAgeMinutes: number | null; distanceKm: number | null;
};

export type ResponderRow = {
  id: string; userId: string; name: string; email: string | null; phone: string | null;
  institutionId: string; institutionName: string; facilityId: string | null; facilityName: string | null; unitId: string | null; unitName: string | null;
  employeeNumber: string | null; role: number; skills: string[]; certification: string | null; certificationExpiresOn: string | null;
  verified: boolean; verifiedAt: string | null; status: number; statusChangedAt: string; shareLocation: boolean; locationAgeMinutes: number | null;
  responseRadiusKm: number; notes: string | null; active: boolean; lastSeenAt: string | null; openAssignments: number;
};
export type SaveResponder = {
  id?: string | null; userLookup?: string | null; userId?: string | null; institutionId: string; facilityId?: string | null; unitId?: string | null;
  employeeNumber?: string | null; role: number; skills?: string[]; certification?: string | null; certificationExpiresOn?: string | null;
  phone?: string | null; verified: boolean; responseRadiusKm: number; notes?: string | null; active: boolean;
};
export type VehicleRow = {
  id: string; institutionId: string; institutionName: string; facilityId: string | null; facilityName: string | null; unitId: string | null; unitName: string | null;
  kind: number; registration: string | null; callSign: string; capacity: number; ambulanceLevel: number; equipment: string | null;
  status: number; statusChangedAt: string; gpsEnabled: boolean; locationAgeMinutes: number | null;
  lastInspectionOn: string | null; nextInspectionOn: string | null; inspectionDue: boolean; notes: string | null; active: boolean; openAssignments: number;
};
export type SaveVehicle = {
  id?: string | null; institutionId: string; facilityId?: string | null; unitId?: string | null; kind: number; registration?: string | null; callSign: string;
  capacity: number; ambulanceLevel: number; equipment?: string | null; gpsEnabled: boolean; lastInspectionOn?: string | null; nextInspectionOn?: string | null;
  notes?: string | null; active: boolean;
};
export type EscalationRuleRow = {
  id: string; institutionId: string | null; institutionName: string | null; sectorCode: string | null; severity: number | null; name: string;
  trigger: number; afterMinutes: number; action: number; level: number; approvedBy: string; approvedOn: string | null; active: boolean;
  timesFired: number; lastFiredAt: string | null;
};
export type SaveEscalationRule = {
  id?: string | null; institutionId?: string | null; sectorCode?: string | null; severity?: number | null; name: string; trigger: number;
  afterMinutes: number; action: number; level: number; approvedBy: string; approvedOn?: string | null; active: boolean;
};
export type FleetSummary = { responders: number; onDuty: number; free: number; vehicles: number; vehiclesFree: number; rules: number; openAssignments: number; rosteredNow: number; rosteredNotOn: number };

/* ---------------- rosters: "on duty" as a schedule ---------------- */

/** One shift. Times are UTC ISO strings — Sierra Leone is UTC all year, so they read as they are. */
export type ShiftRow = {
  id: string; institutionId: string; institutionName: string; facilityId: string | null; facilityName: string | null;
  responderId: string; responderName: string; responderRole: number; responderStatus: number;
  startsAt: string; endsAt: string; label: string | null; note: string | null; seriesId: string | null; confirmed: boolean;
  startedAt: string | null; endedAt: string | null;
  /** past · now · next · later */
  when: 'past' | 'now' | 'next' | 'later';
};
export type RosterResponse = { from: string; to: string; shifts: ShiftRow[]; rosteredNow: number; rosteredNotOn: number };
export type SaveShift = { id?: string | null; institutionId: string; facilityId?: string | null; responderId: string; startsAt: string; endsAt: string; label?: string | null; note?: string | null; repeatWeeks?: number };

export const RESPONDER_ROLE: Record<number, string> = { 1: 'Paramedic', 2: 'Nurse', 3: 'Doctor', 4: 'Driver', 5: 'Officer', 6: 'Firefighter', 7: 'Rescue', 8: 'Volunteer', 9: 'Other' };
export const RESPONDER_STATUS: Record<number, string> = { 1: 'Off duty', 2: 'Available', 3: 'Assigned', 4: 'On the way', 5: 'On scene', 6: 'Transporting', 7: 'Busy', 8: 'Unavailable' };
export const VEHICLE_KIND: Record<number, string> = { 1: 'Ambulance', 2: 'Fire engine', 3: 'Rescue', 4: 'Patrol', 5: 'Motorbike', 6: 'Boat', 7: 'Truck', 8: 'Other' };
export const VEHICLE_STATUS: Record<number, string> = { 1: 'Available', 2: 'Assigned', 3: 'On the way', 4: 'On scene', 5: 'Transporting', 6: 'Maintenance', 7: 'Out of service' };
export const AMBULANCE_LEVEL: Record<number, string> = { 0: 'Not an ambulance', 1: 'Basic — transport and first aid', 2: 'Advanced — oxygen and monitoring', 3: 'Critical — ventilator and clinician' };
export const ASSIGNMENT_STATUS: Record<number, string> = { 1: 'Sent', 2: 'Accepted', 3: 'On the way', 4: 'On scene', 5: 'Transporting', 6: 'Finished', 7: 'Declined', 8: 'Stood down' };
export const ESCALATION_TRIGGER: Record<number, string> = { 1: 'Nobody has acknowledged it', 2: 'Nothing is being done', 3: 'Nobody has been sent', 4: 'Nobody has arrived', 5: 'Still not resolved' };
export const ESCALATION_ACTION: Record<number, string> = { 1: 'Tell the supervisors', 2: 'Raise the level and tell the supervisors', 3: 'Raise the level and tell Vacancy too' };

export const dispatchApi = {
  resources: (incidentId: string) => securePost<DeskResources>(`${DESK}/desk/resources`, { incidentId }),
  assign: (body: { id: string; responderId?: string | null; vehicleId?: string | null; facilityId?: string | null; unitId?: string | null; instructions?: string | null }) =>
    securePost<DeskIncident>(`${DESK}/desk/assign`, body),
  standDown: (id: string, assignmentId: string, reason: string) => securePost<DeskIncident>(`${DESK}/desk/standdown`, { id, assignmentId, reason }),
  /** One attached file, base64, sealed on the way out. The read is counted; the reporter can see it. */
  evidence: (incidentId: string, evidenceId: string) => securePost<EvidenceFile>(`${DESK}/desk/evidence`, { incidentId, evidenceId }),
  assignmentStatus: (id: string, assignmentId: string, status: number, note?: string) =>
    securePost<DeskIncident>(`${DESK}/desk/assignment/status`, { id, assignmentId, status, note: note ?? null }),
};

export const fleetApi = {
  summary: () => securePost<FleetSummary>(`${BASE}/fleet/summary`, {}),
  responders: (institutionId?: string | null, onDutyOnly = false) => securePost<{ responders: ResponderRow[] }>(`${BASE}/responders/search`, { institutionId: institutionId ?? null, onDutyOnly }),
  saveResponder: (body: SaveResponder) => securePost<ResponderRow>(`${BASE}/responders/save`, body),
  removeResponder: (id: string, reason?: string) => securePost<boolean>(`${BASE}/responders/remove`, { id, reason: reason ?? null }),
  vehicles: (institutionId?: string | null) => securePost<{ vehicles: VehicleRow[] }>(`${BASE}/vehicles/search`, { institutionId: institutionId ?? null }),
  saveVehicle: (body: SaveVehicle) => securePost<VehicleRow>(`${BASE}/vehicles/save`, body),
  vehicleStatus: (id: string, status: number, note?: string) => securePost<VehicleRow>(`${BASE}/vehicles/status`, { id, status, note: note ?? null }),
  removeVehicle: (id: string, reason?: string) => securePost<boolean>(`${BASE}/vehicles/remove`, { id, reason: reason ?? null }),
  rules: (institutionId?: string | null) => securePost<{ rules: EscalationRuleRow[] }>(`${BASE}/escalation/search`, { institutionId: institutionId ?? null }),
  saveRule: (body: SaveEscalationRule) => securePost<EscalationRuleRow>(`${BASE}/escalation/save`, body),
  removeRule: (id: string, reason?: string) => securePost<boolean>(`${BASE}/escalation/remove`, { id, reason: reason ?? null }),
  roster: (body: { institutionId?: string | null; facilityId?: string | null; responderId?: string | null; from?: string | null; to?: string | null }) => securePost<RosterResponse>(`${BASE}/roster`, body),
  saveShift: (body: SaveShift) => securePost<RosterResponse>(`${BASE}/roster/save`, body),
  removeShift: (id: string, wholeSeries: boolean) => securePost<RosterResponse>(`${BASE}/roster/remove`, { id, wholeSeries }),
};

/* =============================== phase 4: command =============================== */

export type Timing = { medianMinutes: number | null; p90Minutes: number | null; count: number };
export type ResponseLadder = { toAcknowledge: Timing; toAssign: Timing; toEnRoute: Timing; toScene: Timing; toResolve: Timing };
export type CountAndTiming = { key: string; label: string; count: number; toAcknowledge: Timing; toScene: Timing };
export type DayPoint = { day: string; reported: number; resolved: number; critical: number };
export type HourPoint = { hour: number; reported: number };
/** Of what was reported in a week, how much found a station to answer it. */
export type CoveragePoint = { week: string; reported: number; found: number };

/** One district drawn: rings of [latitude, longitude], with its capital as the label anchor. */
export type DistrictShape = { slug: string; name: string; province: string; capital: string; latitude: number; longitude: number; rings: number[][][] };
export type DistrictShapes = { districts: DistrictShape[]; source: string; note: string };

export type DistrictPoint = {
  slug: string; name: string; latitude: number; longitude: number; reported: number; openNow: number; unrouted: number;
  toAcknowledge: Timing; toScene: Timing; worstOpenSeverity: number | null;
};
export type InstitutionPoint = {
  id: string; name: string; sectorCode: string; reported: number; openNow: number; unownedNow: number; toAcknowledge: Timing; toScene: Timing;
  assignmentsMade: number; declined: number; escalationsFired: number; respondersOnDuty: number;
};
export type RuleFired = { ruleId: string; name: string; institutionName: string | null; fired: number };
export type OutcomeCount = { outcome: number; label: string; count: number };
export type InsightsOverview = {
  days: number; from: string; to: string; scope: string; national: boolean;
  reported: number; reportedBefore: number; resolved: number; openNow: number; unownedNow: number; respondingNow: number; critical: number; unrouted: number;
  ladder: ResponseLadder; ladderBefore: ResponseLadder;
  bySeverity: CountAndTiming[]; byCategory: CountAndTiming[]; bySector: CountAndTiming[]; byDay: DayPoint[]; byHour: HourPoint[];
  byDistrict: DistrictPoint[]; byInstitution: InstitutionPoint[];
  /** Found-a-station share by week (Monday-dated), in the current scope. */
  coverage: CoveragePoint[];
  outcomes: OutcomeCount[];
  assignmentsMade: number; assignmentsDeclined: number; assignmentsStoodDown: number; toAccept: Timing; escalationsFired: number; rulesFired: RuleFired[];
  respondersOnDuty: number; respondersFree: number; vehiclesFree: number; asOf: string;
};
export type LiveIncident = {
  id: string; number: string; severity: number; status: number; category: number; situationWords: string; isSensitive: boolean; districtSlug: string | null;
  latitude: number | null; longitude: number | null; ageMinutes: number; facilityName: string | null; institutionName: string | null; unowned: boolean; responding: number; escalationLevel: number;
};
export type LiveResponder = { id: string; name: string; role: number; status: number; institutionName: string; latitude: number; longitude: number; ageMinutes: number; onIncidentNumber: string | null };
export type LiveFleet = { institutionName: string; respondersOnDuty: number; respondersFree: number; vehiclesFree: number; vehiclesOut: number };
export type LivePicture = { incidents: LiveIncident[]; responders: LiveResponder[]; fleet: LiveFleet[]; districts: DistrictPoint[]; scope: string; national: boolean; asOf: string };

/* =============================== phase 6: the report =============================== */

export type AnalyticsRequest = {
  from?: string | null; to?: string | null; days?: number; granularity?: 'day' | 'week' | 'month' | null;
  institutionId?: string | null; facilityId?: string | null; sectorCode?: string | null; districtSlug?: string | null; category?: number | null; severity?: number | null; compare?: boolean;
};
export type AnalyticsWindow = { from: string; to: string; days: number; granularity: 'day' | 'week' | 'month'; compareFrom: string | null; compareTo: string | null; scope: string; national: boolean; filters: string };
export type Headline = {
  reported: number; reportedBefore: number; resolved: number; resolvedBefore: number; critical: number; criticalBefore: number; serious: number;
  unrouted: number; unroutedBefore: number; stillOpen: number; duplicates: number; mistakenOrMalicious: number; referred: number;
  peopleAffected: number; childrenInvolved: number; anonymous: number; withPin: number; withEvidence: number;
  assignmentsMade: number; assignmentsDeclined: number; assignmentsStoodDown: number; escalations: number; escalationsBefore: number;
  ladder: ResponseLadder; ladderBefore: ResponseLadder; toAccept: Timing;
  acknowledgedWithinTenPct: number | null; acknowledgedWithinTenPctBefore: number | null; onSceneWithinThirtyPct: number | null; onSceneWithinThirtyPctBefore: number | null;
};
export type TrendPoint = { bucket: string; start: string; reported: number; resolved: number; critical: number; serious: number; unrouted: number; assignments: number; escalations: number; medianAckMinutes: number | null; medianSceneMinutes: number | null; medianResolveMinutes: number | null };
export type HeatCell = { weekday: number; hour: number; reported: number; critical: number; medianAckMinutes: number | null };
export type DistrictAnalytics = { slug: string; name: string; latitude: number; longitude: number; reported: number; reportedBefore: number; critical: number; unrouted: number; resolved: number; stillOpen: number; medianAckMinutes: number | null; medianSceneMinutes: number | null; bySeverity: number[]; byCategory: number[]; topSituation: string | null };
export type Hotspot = { latitude: number; longitude: number; reported: number; critical: number; districtSlug: string | null; place: string | null; topCategory: string | null };
export type StationAnalytics = { facilityId: string; name: string; institutionName: string; districtSlug: string | null; reported: number; reportedBefore: number; critical: number; resolved: number; stillOpen: number; unowned: number; medianAckMinutes: number | null; medianSceneMinutes: number | null; assignments: number; declined: number; escalations: number; acknowledgedWithinTenPct: number | null };
export type ResponderAnalytics = { responderId: string; name: string; role: number; institutionName: string; facilityName: string | null; assigned: number; accepted: number; declined: number; completed: number; stoodDown: number; medianAcceptMinutes: number | null; medianEnRouteMinutes: number | null; medianOnSceneMinutes: number | null; lastAssignedAt: string | null };
export type DispatcherAnalytics = { userId: string; name: string; institutionName: string | null; acknowledged: number; resolved: number; closed: number; sent: number; escalated: number; medianAckMinutes: number | null; acknowledgedWithinTenPct: number | null; lastActiveAt: string | null };
export type CategoryAnalytics = { category: number; label: string; reported: number; reportedBefore: number; critical: number; resolved: number; unrouted: number; medianAckMinutes: number | null; medianSceneMinutes: number | null; outcomes: OutcomeCount[] };
export type SourceCount = { source: number; label: string; count: number; before: number };
export type SituationCount = { code: string; words: string; category: number; count: number; critical: number; medianAckMinutes: number | null };
export type Finding = { kind: string; text: string; figure: string | null; tone: 'good' | 'neutral' | 'warn' | 'bad' };
export type AnalyticsReport = {
  window: AnalyticsWindow; headline: Headline; series: TrendPoint[]; seriesBefore: TrendPoint[]; heatmap: HeatCell[]; districts: DistrictAnalytics[]; hotspots: Hotspot[];
  stations: StationAnalytics[]; responders: ResponderAnalytics[]; dispatchers: DispatcherAnalytics[]; categories: CategoryAnalytics[]; bySeverity: CountAndTiming[];
  outcomes: OutcomeCount[]; sources: SourceCount[]; situations: SituationCount[]; rulesFired: RuleFired[]; findings: Finding[]; asOf: string;
};
export type AnalyticsExport = { fileName: string; csv: string; rows: number };

export const analyticsApi = {
  report: (body: AnalyticsRequest) => securePost<AnalyticsReport>(`${BASE}/analytics`, body),
  export: (body: AnalyticsRequest) => securePost<AnalyticsExport>(`${BASE}/analytics/export`, body),
};

export const commandApi = {
  overview: (body: { days: number; institutionId?: string | null; sectorCode?: string | null; districtSlug?: string | null }) => securePost<InsightsOverview>(`${BASE}/insights/overview`, body),
  live: () => securePost<LivePicture>(`${BASE}/insights/live`, {}),
  /** The district outlines the country picture is drawn on. Static; fetched once per session. */
  shapes: () => securePost<DistrictShapes>(`${BASE}/shapes`, {}),
};
