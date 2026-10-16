/**
 * The command centre's door to the API.
 *
 * Every call is sealed — the emergency module's rule is that anything carrying a payload
 * travels inside the encrypted envelope, reads included. The routes are the desk's own
 * (`/secure/emergency/desk/...`): the services scope every answer to the signed-in person's
 * institution and refuse every write from anybody who is not its supervisor, so this file
 * adds no permission of its own. A national administrator sees everybody.
 *
 * Sign-in is the console's two steps with the desk's entitlement, under `/command/session`.
 */
import type { FeatureCollection } from 'geojson';
import { ApiError, config, loadSession, setSession, type Session } from '../api/client';
import { securePost, type AdminDevice } from '../api/secure';
import type {
  AdminChallenge,
} from '../api/admin';
import type {
  AnalyticsExport, AnalyticsReport, AnalyticsRequest,
  AgencyDirectory, AgencyTarget, CapabilityOption, DeskIncident, ReferralOutcome, DeskResources, DispatchQueue, DistrictShapes, EvidenceFile, FleetSummary, InsightsOverview, LivePicture, RouteAsk, RoutePlan, Timing,
  ResponderRow, RosterResponse, SaveResponder, SaveShift, SaveVehicle, VehicleRow,
} from '../api/emergency';

export type {
  AnalyticsExport, AnalyticsReport, AnalyticsRequest, CategoryAnalytics, DispatcherAnalytics, DistrictAnalytics, Finding, HeatCell, Headline, Hotspot, InstitutionAnalytics, MatrixRow, Recommendation, RegionAnalytics, ResponderAnalytics, SituationCount, SourceCount, StationAnalytics, TrendPoint,
  AssignmentRow, CountAndTiming, CoveragePoint, DayPoint, DeskIncident, DeskResources, DispatchQueue, DistrictPoint, DistrictShape, DistrictShapes,
  AgencyDirectory, AgencyOption, AgencyPlace, AgencyRow, AgencyTarget, ReferralOutcome, EvidenceRow, FleetSummary, HourPoint, InsightsOverview, InstitutionPoint, LiveIncident, LivePicture, LiveResponder, OutcomeCount, QueueCard, RouteAsk, RoutePlan, TrailPoint,
  ResponderRow, ResponseLadder, RosterResponse, RouteOption, SaveResponder, SaveShift, SaveVehicle, ShiftRow, Timing, TimelineRow, VehicleRow,
} from '../api/emergency';
export {
  AMBULANCE_LEVEL, ASSIGNMENT_STATUS, CATEGORY, REFERRAL_KIND, REFERRAL_STATUS, ROLE_ON_CASE, DISPATCHER_ROLE, EVIDENCE_KIND, INCIDENT_STATUS, OUTCOME, RESPONDER_ROLE, RESPONDER_STATUS,
  SEVERITY, SEVERITY_WORDS, SOURCE, VEHICLE_KIND, VEHICLE_STATUS, VERIFICATION,
} from '../api/emergency';

const DESK = '/api/v1/secure/emergency';
const AUTH = '/api/v1/command/session';

/** A sealed POST that also ends the session on a 401 — the console's helper leaves that to its caller. */
async function post<T>(path: string, body: unknown): Promise<T> {
  try {
    return await securePost<T>(path, body);
  } catch (caught) {
    if (caught instanceof ApiError && caught.status === 401) setSession(null);
    throw caught;
  }
}

/* ---------- who I am ---------- */

export type Access = {
  isDispatcher: boolean; national: boolean; institutionName: string | null; institutionId: string | null;
  /** 1 dispatcher · 2 supervisor · 3 view only. */
  role: number; name: string; email: string | null; title: string | null; facilityName: string | null; sectorName: string | null; sectorCode: string | null;
  /** 1 station · 2 district command · 3 headquarters · 4 national desk. 0 for no desk. */
  level: number; districtSlug: string | null; districtName: string | null;
  /** Where this person's hand reaches, in words: "Sierra Leone Police · Kenema district". */
  scopeLabel: string | null;
};

/** The ladder, one word per rung. */
export const LEVEL_WORDS: Record<number, string> = { 1: 'Station', 2: 'District command', 3: 'Headquarters', 4: 'National desk' };

export const ROLE_WORDS: Record<number, string> = { 1: 'Dispatcher', 2: 'Supervisor', 3: 'View only' };

type CommandSession = { accessToken: string; expiresAt: string; userId: string; name: string; email: string | null; roles: string[]; isSuperAdmin: boolean };

/** Stores the session, then asks the desk who this is — the app never decides that from the token. */
async function openDesk(auth: CommandSession): Promise<Access> {
  const session: Session = { accessToken: auth.accessToken, refreshToken: null, expiresAt: auth.expiresAt, name: auth.name, email: auth.email };
  setSession(session);
  try {
    const access = await commandApi.access();
    if (!access.isDispatcher) throw new ApiError('This account does not work an emergency desk.', 403);
    return access;
  } catch (caught) {
    setSession(null);
    throw caught;
  }
}

export const authApi = {
  start: (email: string, password: string, device: AdminDevice) => securePost<AdminChallenge>(`${AUTH}/start`, { email, password, device }),
  resend: (challengeId: string) => securePost<AdminChallenge>(`${AUTH}/resend`, { challengeId }),
  /** On success the session is stored and the desk is asked who this is — the app never decides that from the token. */
  async verify(challengeId: string, code: string, device: AdminDevice): Promise<Access> {
    const auth = await securePost<CommandSession>(`${AUTH}/verify`, { challengeId, code, device });
    return openDesk(auth);
  },
  /**
   * Continue with Google: a Firebase ID token goes to the API, which matches the verified e-mail to an
   * account that is already on a desk. No password and no emailed code — Google has done both.
   */
  async google(firebaseIdToken: string, device: AdminDevice): Promise<Access> {
    const auth = await securePost<CommandSession>(`${AUTH}/google`, { firebaseIdToken, device });
    return openDesk(auth);
  },
  signOut() { setSession(null); },
  session: () => loadSession(),
  apiHost: () => config.apiBaseUrl ?? '',
};

/* ---------- the desk ---------- */

export type QueueFilter = { status?: number | null; sector?: string | null; districtSlug?: string | null; includeTraining?: boolean; includeClosed?: boolean; take?: number };

/** Hand over, bring in and take back answer with the case itself; accepting and declining answer with a sentence as well. */
const outcome = (message: string, incident: DeskIncident): ReferralOutcome => ({ message, incident });

export const commandApi = {
  access: () => post<Access>(`${DESK}/desk/access`, {}),
  queue: (body: QueueFilter) => post<DispatchQueue>(`${DESK}/desk/queue`, body),
  incident: (id: string) => post<DeskIncident>(`${DESK}/desk/incident`, { id }),
  /** The way there, from the station, a responder or here, to the pin as it is now. */
  route: (ask: RouteAsk) => post<RoutePlan>(`${DESK}/desk/incident/route`, ask),
  acknowledge: (id: string, note?: string) => post<DeskIncident>(`${DESK}/desk/acknowledge`, { id, note: note ?? null }),
  severity: (id: string, severity: number, reason: string) => post<DeskIncident>(`${DESK}/desk/severity`, { id, severity, reason }),
  note: (id: string, note: string, internal: boolean) => post<DeskIncident>(`${DESK}/desk/note`, { id, note, internal }),
  status: (id: string, status: number, note?: string) => post<DeskIncident>(`${DESK}/desk/status`, { id, status, note: note ?? null }),
  reroute: (id: string, facilityId: string, reason: string, unitId?: string | null) => post<DeskIncident>(`${DESK}/desk/reroute`, { id, facilityId, unitId: unitId ?? null, reason }),
  escalate: (id: string, reason: string) => post<DeskIncident>(`${DESK}/desk/escalate`, { id, reason }),
  duplicate: (id: string, masterId: string, note?: string) => post<DeskIncident>(`${DESK}/desk/duplicate`, { id, masterId, note: note ?? null }),
  close: (id: string, outcome: number, note?: string) => post<DeskIncident>(`${DESK}/desk/close`, { id, outcome, note: note ?? null }),
  location: (body: { id: string; latitude?: number | null; longitude?: number | null; districtSlug?: string | null; community?: string | null; landmark?: string | null; note?: string | null }) =>
    post<DeskIncident>(`${DESK}/desk/location`, body),
  resources: (incidentId: string) => post<DeskResources>(`${DESK}/desk/resources`, { incidentId }),
  assign: (body: { id: string; responderId?: string | null; vehicleId?: string | null; facilityId?: string | null; unitId?: string | null; instructions?: string | null }) =>
    post<DeskIncident>(`${DESK}/desk/assign`, body),
  standDown: (id: string, assignmentId: string, reason: string) => post<DeskIncident>(`${DESK}/desk/standdown`, { id, assignmentId, reason }),
  assignmentStatus: (id: string, assignmentId: string, status: number, note?: string) => post<DeskIncident>(`${DESK}/desk/assignment/status`, { id, assignmentId, status, note: note ?? null }),
  /* the alarm rules */
  alarm: (institutionId?: string | null) => post<AlarmView>(`${DESK}/desk/alarm`, { institutionId: institutionId ?? null }),
  saveAlarm: (settings: AlarmSettings, institutionId?: string | null) => post<AlarmView>(`${DESK}/desk/alarm/save`, { institutionId: institutionId ?? null, settings, reset: false }),
  alarmHistory: (q: AlarmHistoryQuery) => post<AlarmHistory>(`${DESK}/desk/alarm/history`, { institutionId: q.institutionId ?? null, days: q.days, take: q.take ?? 100, onlyUntaken: !!q.onlyUntaken, minLevel: q.minLevel ?? 0 }),
  resetAlarm: (institutionId?: string | null) => post<AlarmView>(`${DESK}/desk/alarm/save`, { institutionId: institutionId ?? null, settings: {}, reset: true }),

  /* more than one agency on a case */
  agencies: (id: string, query?: string) => post<AgencyDirectory>(`${DESK}/desk/agencies`, { id, query: query ?? null }),
  handOver: (body: { id: string; institutionId: string; facilityId?: string | null; reason: string; stayInvolved: boolean }) =>
    post<DeskIncident>(`${DESK}/desk/handover`, { ...body, facilityId: body.facilityId ?? null, unitId: null }).then(incident => outcome('Handed over. You follow it now.', incident)),
  bringIn: (id: string, targets: AgencyTarget[], message?: string) => post<DeskIncident>(`${DESK}/desk/bringin`, { id, targets: targets.map(t => ({ institutionId: t.institutionId, facilityId: t.facilityId ?? null })), message: message ?? null }).then(incident => outcome(targets.length > 1 ? 'Agencies brought in.' : 'Agency brought in.', incident)),
  answerReferral: (id: string, referralId: string, accept: boolean, note?: string) => post<ReferralOutcome>(`${DESK}/desk/referral/answer`, { id, referralId, accept, note: note ?? null }),
  withdrawReferral: (id: string, referralId: string, note?: string) => post<DeskIncident>(`${DESK}/desk/referral/withdraw`, { id, referralId, note: note ?? null }).then(incident => outcome('Taken off the case.', incident)),
  evidence: (incidentId: string, evidenceId: string) => post<EvidenceFile>(`${DESK}/desk/evidence`, { incidentId, evidenceId }),

  /* the report */
  analytics: (body: AnalyticsRequest) => post<AnalyticsReport>(`${DESK}/desk/analytics`, body),
  analyticsExport: (body: AnalyticsRequest) => post<AnalyticsExport>(`${DESK}/desk/analytics/export`, body),

  /* the picture */
  insights: (days: number, institutionId?: string | null) => post<InsightsOverview>(`${DESK}/desk/insights`, { days, institutionId: institutionId ?? null }),
  live: () => post<LivePicture>(`${DESK}/desk/live`, {}),
  fleet: () => post<FleetSummary>(`${DESK}/desk/fleet`, {}),
  shapes: () => post<DistrictShapes>(`${DESK}/desk/shapes`, {}),

  /* the fleet — supervisors write */
  responders: (onDutyOnly = false, institutionId?: string | null) => post<{ responders: ResponderRow[] }>(`${DESK}/desk/fleet/responders`, { onDutyOnly, institutionId: institutionId ?? null }),
  saveResponder: (body: SaveResponder) => post<ResponderRow>(`${DESK}/desk/fleet/responder/save`, body),
  removeResponder: (id: string, reason?: string) => post<boolean>(`${DESK}/desk/fleet/responder/remove`, { id, reason: reason ?? null }),
  vehicles: (institutionId?: string | null) => post<{ vehicles: VehicleRow[] }>(`${DESK}/desk/fleet/vehicles`, { institutionId: institutionId ?? null }),
  saveVehicle: (body: SaveVehicle) => post<VehicleRow>(`${DESK}/desk/fleet/vehicle/save`, body),
  vehicleStatus: (id: string, status: number, note?: string) => post<VehicleRow>(`${DESK}/desk/fleet/vehicle/status`, { id, status, note: note ?? null }),
  removeVehicle: (id: string, reason?: string) => post<boolean>(`${DESK}/desk/fleet/vehicle/remove`, { id, reason: reason ?? null }),

  /* the roster */
  roster: (body: { institutionId?: string | null; facilityId?: string | null; responderId?: string | null; from?: string | null; to?: string | null }) => post<RosterResponse>(`${DESK}/desk/roster`, body),
  saveShift: (body: SaveShift) => post<RosterResponse>(`${DESK}/desk/roster/save`, body),
  removeShift: (id: string, wholeSeries: boolean) => post<RosterResponse>(`${DESK}/desk/roster/remove`, { id, wholeSeries }),

  /* the stations */
  myStations: () => post<{ stations: MyStation[] }>(`${DESK}/station/mine`, {}),
  saveStation: (body: SaveMyStationRequest) => post<MyStation>(`${DESK}/station/save`, body),

  /* the institution's own directory — the institution writes it, Vacancy verifies it */
  directory: (institutionId?: string | null) => post<DeskDirectory>(`${DESK}/desk/directory`, { institutionId: institutionId ?? null }),
  saveProfile: (body: SaveDeskProfile) => post<DeskInstitution>(`${DESK}/desk/directory/profile/save`, body),
  saveOffice: (body: SaveDeskOffice) => post<DeskOffice>(`${DESK}/desk/directory/office/save`, body),
  removeOffice: (id: string, reason: string, institutionId?: string | null) => post<boolean>(`${DESK}/desk/directory/office/remove`, { id, reason, institutionId: institutionId ?? null }),
  saveUnit: (body: SaveDeskUnit) => post<DeskUnit>(`${DESK}/desk/directory/unit/save`, body),
  removeUnit: (id: string, reason: string, institutionId?: string | null) => post<boolean>(`${DESK}/desk/directory/unit/remove`, { id, reason, institutionId: institutionId ?? null }),
  saveContact: (body: SaveDeskContact) => post<DeskContact>(`${DESK}/desk/directory/contact/save`, body),
  verifyContact: (id: string, confirmed: boolean, note?: string | null, institutionId?: string | null) => post<DeskContact>(`${DESK}/desk/directory/contact/verify`, { id, confirmed, note: note ?? null, institutionId: institutionId ?? null }),
  removeContact: (id: string, reason: string, institutionId?: string | null) => post<boolean>(`${DESK}/desk/directory/contact/remove`, { id, reason, institutionId: institutionId ?? null }),
  saveCapabilities: (body: SaveDeskCapabilities) => post<DeskOffice>(`${DESK}/desk/directory/capabilities/save`, body),

  /* the people */
  /** The desks this person may stand at: their own, or every active institution for a national desk. */
  institutions: () => post<CommandInstitutionOption[]>(`${DESK}/desk/institutions`, {}),
  people: (institutionId?: string | null) => post<CommandPeople>(`${DESK}/desk/people`, { institutionId: institutionId ?? null }),
  lookup: (query: string, institutionId?: string | null) => post<CommandLookupResult>(`${DESK}/desk/people/lookup`, { query, institutionId: institutionId ?? null }),
  savePerson: (body: SaveCommandPerson) => post<CommandPersonSaved>(`${DESK}/desk/people/save`, body),
  removePerson: (id: string, reason?: string) => post<boolean>(`${DESK}/desk/people/remove`, { id, reason: reason ?? null }),
  resendSetup: (id: string) => post<CommandPersonSaved>(`${DESK}/desk/people/resend`, { id }),

  /* the ladder: country, district, station */
  hierarchy: (days = 30, institutionId?: string | null) => post<HierarchyOverview>(`${DESK}/desk/hierarchy`, { days, institutionId: institutionId ?? null }),
  hierarchyDistrict: (districtSlug: string, days = 30, institutionId?: string | null) => post<DistrictView>(`${DESK}/desk/hierarchy/district`, { districtSlug, days, institutionId: institutionId ?? null }),
  hierarchyStation: (facilityId: string, days = 30, institutionId?: string | null) => post<StationView>(`${DESK}/desk/hierarchy/station`, { facilityId, days, institutionId: institutionId ?? null }),
  registerStations: (body: RegisterStationsRequest) => post<RegisterStationsResult>(`${DESK}/desk/hierarchy/register`, body),
};

/* ---------- the alarm rules ---------- */

/** 0 silent · 1 chime · 2 urgent call · 3 siren. */
export type AlarmLevelNumber = 0 | 1 | 2 | 3;
export type AlarmSettings = {
  /** P1, P2, P3, P4. */
  bySeverity: number[];
  /** By category number ("4" is fire); no entry follows the severity. */
  byCategory: Record<string, number>;
  /** By situation code ("fire.bush"); beats the category. */
  bySituation: Record<string, number>;
  /** The extra triggers; -1 is "not a trigger". */
  children: number; sensitive: number; unrouted: number; escalated: number; manyPeople: number; manyPeopleFrom: number;
  /** Nobody has taken it for this many minutes: at least this loud. -1 is never. */
  waiting: number; waitingMinutes: number;
  /** Another agency asks this desk to join. */
  asked: number;
  /** While nobody has taken an urgent or siren report: push the phones again every this many minutes. 0 is never. */
  repeatMinutes: number;
  /** Still untaken after this many minutes: tell the headquarters supervisors, once. -1 is never. */
  tellSupervisorsMinutes: number;
};
export type AlarmHistoryRow = {
  incidentId: string; number: string; words: string | null; isSensitive: boolean; severity: number; category: number; districtSlug: string | null;
  level: number; why: string; role: 'lead' | 'asked'; raisedAt: string; takenAt: string | null; takenBy: string | null; secondsToTake: number | null;
  stillWaiting: boolean; neverTaken: boolean; pushes: number; supervisorsToldAt: string | null; status: number;
};
export type AlarmHistorySummary = {
  total: number; siren: number; urgent: number; chime: number; silent: number; taken: number; stillWaiting: number; neverTaken: number; supervisorsTold: number;
  medianSeconds: number | null; slowestTenthSeconds: number | null; longestSeconds: number | null; sirensTakenInAMinute: number; sirensTaken: number;
};
export type AlarmHistory = { scopeName: string; days: number; summary: AlarmHistorySummary; rows: AlarmHistoryRow[] };
export type AlarmHistoryQuery = { institutionId?: string | null; days: number; take?: number; onlyUntaken?: boolean; minLevel?: number };
export type AlarmChoice = { id: number; name: string };
export type AlarmSituation = { code: string; category: number; words: string; severity: number; sensitive: boolean };
export type AlarmView = {
  institutionId: string | null; scopeName: string; settings: AlarmSettings; defaults: AlarmSettings; custom: boolean; canEdit: boolean;
  updatedBy: string | null; updatedAt: string | null; levels: AlarmChoice[]; categories: AlarmChoice[]; situations: AlarmSituation[];
};
export const ALARM_WORDS: Record<number, string> = { 0: 'Silent', 1: 'Chime', 2: 'Urgent call', 3: 'Siren' };

/* ---------- stations ---------- */

export type DistrictChoice = { slug: string; name: string; province: string };
export type StationRow = {
  id: string; institutionId: string; institutionName: string; name: string; kind: number; status: number; parentFacilityId?: string | null; parentFacilityName?: string | null; subOffices?: number;
  districtSlug?: string | null; community?: string | null; address?: string | null; landmark?: string | null;
  latitude?: number | null; longitude?: number | null; gpsVerified: boolean; gpsMethod: number;
  coverage: number; coverageRadiusKm?: number | null; coverageDistrictSlug?: string | null;
  hours: number; hoursText?: string | null; alwaysOnEmergencyUnit: boolean; verified: boolean;
};
export type StationContact = {
  id: string; name: string; position?: string | null; phone: string; alternativePhone?: string | null; whatsApp?: string | null; email?: string | null;
  class: number; priority: number; escalationLevel: number; active: boolean; verification: number;
};
export type StationCapability = { id: string; code: string; label: string; sector: string; availability: number; statedBy: number };
export type StationDetail = {
  row: StationRow; accuracyMetres?: number | null; gpsCapturedAt?: string | null; coverageNote?: string | null; holidayNote?: string | null;
  verifiedAt?: string | null; contactRows: StationContact[]; capabilityRows: StationCapability[];
};
export type MyStation = {
  detail: StationDetail; sectorCode: string; sectorName: string; sectorGlyph?: string | null; sectorTone?: string | null;
  role: number; canEdit: boolean; districts: DistrictChoice[]; kinds: number[]; capabilities: CapabilityOption[];
};
export type MyContact = { id?: string | null; name: string; position?: string | null; phone: string; alternativePhone?: string | null; whatsApp?: string | null; email?: string | null; class: number; remove?: boolean };
export type SaveMyStationRequest = {
  facilityId: string; name: string; kind?: number | null; districtSlug: string; community?: string | null; address?: string | null; landmark?: string | null;
  latitude?: number | null; longitude?: number | null; accuracyMetres?: number | null; pinSource?: number | null;
  coverage?: number | null; coverageRadiusKm?: number | null; coverageDistrictSlug?: string | null; coverageNote?: string | null;
  hours?: number | null; hoursText?: string | null; holidayNote?: string | null; alwaysOnEmergencyUnit?: boolean;
  capabilities?: string[]; contacts?: MyContact[];
};
export const CONTACT_CLASS_WORDS: Record<number, string> = { 1: 'Public — citizens see it', 2: 'Dispatch desk', 3: 'Escalation', 4: 'Supervisor', 5: 'Internal' };
export const COVERAGE_WORDS: Record<number, string> = { 1: 'A radius around the pin', 2: 'The district', 4: 'The whole country' };
export const HOURS_WORDS: Record<number, string> = { 1: 'Always open', 2: 'Fixed hours', 3: 'Emergencies only', 4: 'Temporarily closed' };
export const STATION_KIND: Record<number, string> = { 1: 'Station', 2: 'Office', 3: 'Hospital', 4: 'Clinic', 5: 'Health post', 6: 'Ambulance base', 7: 'Fire station', 8: 'Depot', 9: 'Command centre', 10: 'Other' };

/* ---------- the institution's own directory ---------- */

export type DeskInstitution = {
  id: string; name: string; shortName: string | null; sectorCode: string; sectorName: string; sectorGlyph: string | null; sectorTone: string | null; typeName: string | null;
  government: boolean; national: boolean; status: number; verified: boolean; verifiedAt: string | null;
  headOfficeText: string | null; publicPhone: string | null; alternativePhone: string | null; email: string | null; website: string | null; description: string | null; logoUrl: string | null;
  updatedAt: string | null; updatedBy: string | null;
};
export type DeskOffice = {
  id: string; name: string; kind: number; status: number; parentId: string | null; parentName: string | null; depth: number;
  districtSlug: string | null; districtName: string | null; community: string | null; address: string | null; landmark: string | null;
  latitude: number | null; longitude: number | null; gpsMethod: number; gpsVerified: boolean; gpsCapturedAt: string | null; accuracyMetres: number | null;
  coverage: number; coverageRadiusKm: number | null; coverageDistrictSlug: string | null; coverageNote: string | null;
  hours: number; hoursText: string | null; holidayNote: string | null; alwaysOnEmergencyUnit: boolean; verified: boolean; verifiedAt: string | null;
  units: number; contacts: number; publicContacts: number; capabilities: string[]; people: number; responders: number; vehicles: number; subOffices: number; openIncidents: number;
  manageable: boolean; updatedAt: string | null;
};
export type DeskUnit = { id: string; officeId: string; officeName: string; name: string; description: string | null; sort: number; contacts: number; manageable: boolean };
export type DeskContact = {
  id: string; officeId: string | null; officeName: string | null; unitId: string | null; unitName: string | null; name: string; position: string | null;
  phone: string; alternativePhone: string | null; whatsApp: string | null; email: string | null; class: number; priority: number; escalationLevel: number;
  availableFrom: string | null; availableTo: string | null; active: boolean; verification: number; lastVerifiedAt: string | null; lastVerifiedByName: string | null; nextVerificationDue: string | null; note: string | null;
  manageable: boolean;
};
export type DeskCapability = { id: string; officeId: string; unitId: string | null; code: string; label: string; availability: number; statedBy: number; statedAt: string; note: string | null };
export type DeskAttention = { kind: string; severity: number; title: string; detail: string; officeId: string | null; contactId: string | null };
export type DeskReadinessItem = { label: string; done: boolean; weight: number; hint: string | null };
export type DeskReadiness = { score: number; items: DeskReadinessItem[] };
export type DeskDirectoryOptions = { districts: DistrictChoice[]; kinds: { kind: number; label: string }[]; capabilities: CapabilityOption[]; contactClasses: { class: number; label: string; hint: string }[] };
export type DeskDirectory = {
  institution: DeskInstitution; offices: DeskOffice[]; units: DeskUnit[]; contacts: DeskContact[]; capabilities: DeskCapability[];
  attention: DeskAttention[]; readiness: DeskReadiness; canEdit: boolean; canEditProfile: boolean; managesOfficeId: string | null; managesOfficeName: string | null;
  level: number; managesDistrictSlug: string | null; managesDistrictName: string | null;
  options: DeskDirectoryOptions; asOf: string;
};
export type SaveDeskProfile = { institutionId?: string | null; shortName?: string | null; headOfficeText?: string | null; publicPhone?: string | null; alternativePhone?: string | null; email?: string | null; website?: string | null; description?: string | null; logoUrl?: string | null };
export type SaveDeskOffice = {
  institutionId?: string | null; id?: string | null; parentId?: string | null; name: string; kind: number; status: number;
  districtSlug: string; community?: string | null; address?: string | null; landmark?: string | null;
  latitude?: number | null; longitude?: number | null; accuracyMetres?: number | null; pinSource?: number | null; clearPin?: boolean;
  coverage: number; coverageRadiusKm?: number | null; coverageDistrictSlug?: string | null; coverageNote?: string | null;
  hours: number; hoursText?: string | null; holidayNote?: string | null; alwaysOnEmergencyUnit: boolean;
};
export type SaveDeskUnit = { institutionId?: string | null; id?: string | null; officeId: string; name: string; description?: string | null; sort?: number };
export type SaveDeskContact = {
  institutionId?: string | null; id?: string | null; officeId?: string | null; unitId?: string | null; name: string; position?: string | null; phone: string;
  alternativePhone?: string | null; whatsApp?: string | null; email?: string | null; class: number; priority?: number; escalationLevel?: number;
  availableFrom?: string | null; availableTo?: string | null; active: boolean; note?: string | null;
};
export type SaveDeskCapabilities = { institutionId?: string | null; officeId: string; unitId?: string | null; claims: { code: string; availability: number; note?: string | null }[] };
export const OFFICE_STATUS: Record<number, string> = { 1: 'Draft', 2: 'Active', 3: 'Suspended', 4: 'Closed' };
export const AVAILABILITY_WORDS: Record<number, string> = { 1: 'Available', 2: 'Limited', 3: 'Referral only', 4: 'Not available' };
export const GPS_METHOD: Record<number, string> = { 0: 'unknown', 1: 'surveyed on site', 2: 'placed on the map', 3: 'imported', 4: 'reported' };
export const CLASS_SHORT: Record<number, string> = { 1: 'Public', 2: 'Dispatch', 3: 'Escalation', 4: 'Supervisor', 5: 'Internal', 6: 'After hours' };

/* ---------- people ---------- */

export type CommandPerson = {
  id: string; userId: string; name: string; email: string | null; phone: string | null; facilityId: string | null; facilityName: string | null;
  role: number; title: string | null; active: boolean; awaitingSetup: boolean; lastSeenAt: string | null; addedAt: string; isMe: boolean;
  manageable: boolean; canSignIn: boolean;
  /** 1 station · 2 district command · 3 headquarters. */
  level: number; districtSlug: string | null; districtName: string | null;
};
/** A supervisor is an administrator of whatever rung they are bound to; the others keep their duty. */
export const deskRoleWords = (role: number, facilityId: string | null | undefined, level?: number | null) => {
  const rung = level ?? (facilityId ? 1 : 3);
  return role === 2 ? (rung === 1 ? 'Station administrator' : rung === 2 ? 'District administrator' : 'Head of police administration') : role === 3 ? 'View only' : 'Dispatcher';
};
export type CommandFacilityOption = { id: string; name: string; districtSlug: string | null };
export type CommandInstitutionOption = { id: string; name: string; shortName: string | null; sectorCode: string; sectorName: string; bound: boolean; role: number; oversight?: boolean };
export type CommandLevelOption = { level: number; label: string; hint: string };
export type CommandDistrictOption = { slug: string; name: string; province: string; stations: number; people: number };
export type CommandSuperior = { name: string; title: string | null; level: number; where: string | null };
export type CommandPeople = {
  institutionId: string; institutionName: string; canManage: boolean; facilities: CommandFacilityOption[]; people: CommandPerson[]; managesFacilityId: string | null; managesFacilityName: string | null; commandUrl: string | null;
  level: number; managesDistrictSlug: string | null; managesDistrictName: string | null;
  /** The rungs this person may appoint to. */
  levels: CommandLevelOption[] | null; districts: CommandDistrictOption[] | null;
  /** Who this person answers to — names and titles only. */
  above: CommandSuperior[] | null;
};
export type CommandLookupResult = { found: boolean; userId: string | null; name: string | null; maskedEmail: string | null; maskedPhone: string | null; alreadyOnDesk: boolean; message: string };
export type SaveCommandPerson = {
  id?: string | null; institutionId?: string | null; userId?: string | null;
  newAccount?: { firstName: string; lastName: string; email: string; phone?: string | null } | null;
  facilityId?: string | null; districtSlug?: string | null; role: number; title?: string | null; active: boolean;
};
export type CommandPersonSaved = { person: CommandPerson; accountCreated: boolean; emailSent: boolean; message: string };

/* ---------- words ---------- */

export const errorWords = (caught: unknown, fallback: string) => (caught instanceof Error ? caught.message : fallback);
export const OPEN_STATUSES = [1, 2, 3, 4, 9, 10, 11];
export const RESPONDING_STATUSES = [9, 10, 11];
export const LIVE_ASSIGNMENT = [1, 2, 3, 4, 5];
export const isOpen = (status: number) => OPEN_STATUSES.includes(status);

/**
 * District outlines as GeoJSON, for the map. The API sends rings as [latitude, longitude];
 * GeoJSON wants [longitude, latitude] and closed rings, so it is turned round here, once.
 */
export function shapesAsGeoJson(shapes: { slug: string; name: string; rings: number[][][] }[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: shapes.map(s => {
      const rings = s.rings.map(ring => {
        const out = ring.map(([lat, lng]) => [lng, lat]);
        if (out.length > 0) out.push(out[0]);
        return out;
      });
      return {
        type: 'Feature' as const,
        properties: { slug: s.slug, name: s.name },
        geometry: rings.length === 1
          ? { type: 'Polygon' as const, coordinates: rings }
          : { type: 'MultiPolygon' as const, coordinates: rings.map(r => [r]) },
      };
    }),
  };
}

/* ---------- the ladder ---------- */

export type HierarchyFigures = {
  stations: number; stationsActive: number; stationsWithAdmin: number; stationsStaffed: number; stationsPinned: number;
  people: number; respondersOnDuty: number; responders: number; vehicles: number;
  openNow: number; p1Open: number; unowned: number; reported: number; reportedBefore: number; resolved: number;
  acknowledge: Timing; onScene: Timing;
};
export type DistrictHealth = 'unserved' | 'unstaffed' | 'strained' | 'busy' | 'calm';
export type DistrictRollup = {
  slug: string; name: string; province: string; capital: string; figures: HierarchyFigures; admins: string[];
  health: DistrictHealth; lastReportAt: string | null; canOpen: boolean;
};
export type ProvinceRollup = { name: string; districts: number; stations: number; openNow: number; p1Open: number; reported: number };
export type HierarchyAttention = { kind: string; weight: 'high' | 'medium' | 'low'; text: string; districtSlug: string | null; facilityId: string | null };
export type HierarchyOverview = {
  institutionId: string; institutionName: string; level: number; scopeLabel: string; days: number; asOf: string;
  total: HierarchyFigures; districts: DistrictRollup[]; provinces: ProvinceRollup[]; attention: HierarchyAttention[];
  unplaced: number; canRegister: boolean; homeDistrictSlug: string | null; homeStationId: string | null;
};
export type PersonLine = { id: string; name: string; title: string | null; role: number; level: number; active: boolean; lastSeenAt: string | null; awaitingSetup: boolean };
export type DayCount = { day: string; reported: number; p1: number };
export type CategoryCount = { category: number; name: string; count: number };
export type StationRollup = {
  id: string; name: string; community: string | null; kind: number; status: number; districtSlug: string | null; pinned: boolean; verified: boolean;
  parentId: string | null; parentName: string | null; admins: string[]; people: number; peopleActive: number; lastSeenAt: string | null;
  responders: number; respondersOnDuty: number; vehicles: number; openNow: number; p1Open: number; unowned: number;
  reported: number; reportedBefore: number; resolved: number; acknowledge: Timing; canOpen: boolean;
};
export type DistrictView = {
  district: DistrictRollup; stations: StationRollup[]; team: PersonLine[]; trend: DayCount[]; categories: CategoryCount[]; attention: HierarchyAttention[];
  days: number; asOf: string; canManage: boolean; canRegister: boolean; institutionName: string; institutionId: string;
};
export type StationIncidentLine = { id: string; number: string; severity: number; situation: string; status: number; reportedAt: string; unowned: boolean; minutesToAcknowledge: number | null; escalationLevel: number };
export type StationView = {
  station: StationRollup; districtName: string | null; province: string | null; team: PersonLine[]; recent: StationIncidentLine[]; trend: DayCount[];
  categories: CategoryCount[]; attention: HierarchyAttention[]; above: CommandSuperior[]; days: number; asOf: string; canManage: boolean; institutionName: string; institutionId: string;
};
export type NewStation = { name: string; community?: string | null; latitude?: number | null; longitude?: number | null; adminName?: string | null; adminEmail?: string | null; adminPhone?: string | null };
export type RegisterStationsRequest = { institutionId?: string | null; districtSlug: string; stations: NewStation[]; status: number };
export type RegisteredStation = { name: string; created: boolean; facilityId: string | null; adminBound: boolean; emailSent: boolean; message: string };
export type RegisterStationsResult = { districtSlug: string; districtName: string; created: number; skipped: number; adminsBound: number; rows: RegisteredStation[] };

export const HEALTH_WORDS: Record<DistrictHealth, { label: string; hint: string }> = {
  unserved: { label: 'No station', hint: 'No station is on record in this district.' },
  unstaffed: { label: 'Unstaffed', hint: 'Stations are on record but nobody on a desk can act on a report.' },
  strained: { label: 'Strained', hint: 'Critical reports waiting, or reports that nobody has taken.' },
  busy: { label: 'Busy', hint: 'Open reports, all in hand.' },
  calm: { label: 'Calm', hint: 'Nothing open.' },
};
