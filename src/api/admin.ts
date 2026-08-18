/** The admin console's wire contract — mirrors ApiVacancy.Application/Admin/DTOs. */
import { ApiError, apiRequest, config, loadSession, setSession, type Session } from './client';
import { securePost, type AdminDevice } from './secure';

const BASE = '/api/v1/secure/admin/console';
const DASHBOARD = '/api/v1/secure/admin/dashboard';
const ADVERTS = '/api/v1/secure/admin/adverts';
const AUTH = '/api/v1/admin/session';
const CONTACT = '/api/v1/secure/admin/contact-messages';

/** One message from the website's contact form. Mirrors ContactMessageResponse. */
export type ContactMessage = {
  id: string;
  name: string;
  email: string;
  phoneNumber: string | null;
  subject: string;
  message: string;
  source: string;
  /** False when the notification email could not be sent — the console is then the only record. */
  emailDelivered: boolean;
  handledAt: string | null;
  handlingNote: string | null;
  dateCreated: string;
};

export type ContactMessagePage = {
  items: ContactMessage[];
  totalCount: number;
  unhandledCount: number;
  totalPages: number;
  pageIndex: number;
  pageSize: number;
};
const id = encodeURIComponent;

export type AdminIdentity = {
  userId: string;
  name: string;
  email: string | null;
  roles: string[];
  permissions: string[];
  canManageUsers: boolean;
  canManageCatalog: boolean;
  canManageBookings: boolean;
  canManageContent: boolean;
  isSuperAdmin: boolean;
};

export type AuditEntry = {
  id: string;
  actorUserId: string;
  actorName: string;
  actorEmail: string | null;
  action: string;
  actionLabel: string;
  entityType: string;
  entityId: string | null;
  entityLabel: string | null;
  summary: string;
  reason: string | null;
  changesJson: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  severity: number;
  severityLabel: string;
  succeeded: boolean;
  failureReason: string | null;
  at: string;
};

export type AuditPage = {
  items: AuditEntry[];
  totalCount: number;
  pageIndex: number;
  pageSize: number;
  knownActions: string[];
};

export type ConsoleSummary = {
  totalUsers: number; activeUsers: number; suspendedUsers: number; blockedUsers: number;
  newUsers7d: number; newUsers30d: number; providers: number; companies: number;
  categories: number; skills: number;
  adminActions24h: number; sensitiveActions7d: number; failedAdminAttempts7d: number;
  recentActivity: AuditEntry[];
  signupTrend: { day: string; count: number }[];
};

export type AdminUserRow = {
  id: string; name: string; email?: string | null;
  userType: number; userTypeName: string;
  status: number; statusName: string;
  emailVerified: boolean; dateCreated: string;
};

export type AdminUserSearch = { items: AdminUserRow[]; totalCount: number; pageIndex: number; pageSize: number };

export type AdminUserDetail = {
  id: string; name: string; email: string | null; phoneNumber: string | null;
  userType: number; userTypeName: string;
  status: number; statusName: string;
  emailVerified: boolean; phoneVerified: boolean; active: boolean;
  dateCreated: string; lastUpdated: string | null;
  roles: string[];
  bookingsAsCustomer: number; bookingsAsProvider: number; jobsPosted: number;
  classesTaught: number; certificatesEarned: number;
  hasProviderProfile: boolean; providerBusinessName: string | null; providerVerified: boolean;
  recentActivity: AuditEntry[];
  /**
   * Whether this account can sign in to the console. The password action and the
   * force-sign-out action both hang off it, and the API decides it from the person's
   * permissions — the console never works it out from a user type, which is how the
   * reset list came to be missing every ordinary administrator.
   */
  isConsoleUser?: boolean;
  openSessions?: number;
  lastSignInAt?: string | null;
};


/* ---------- day-to-day operations ---------- */

export type OpsQuery = {
  search?: string;
  status?: number;
  bucket?: string;
  from?: string;
  to?: string;
  sort?: string;
  pageIndex?: number;
  pageSize?: number;
};

export type BookingRow = {
  id: string; reference: string | null;
  customerUserId: string; customerName: string;
  providerProfileId: string; providerUserId: string; providerName: string;
  skillName: string;
  status: number; statusName: string;
  bookingDate: string; scheduledStartAt: string | null;
  agreedAmount: number | null; quotedAmount: number | null; currencyCode: string;
  hasOpenDispute: boolean; noShowReported: boolean;
  dateCreated: string;
};

export type BookingPage = {
  items: BookingRow[]; totalCount: number; pageIndex: number; pageSize: number;
  pendingCount: number; activeCount: number; completedCount: number;
  cancelledCount: number; disputedCount: number;
};

export type TimelineEntry = { at: string; label: string; detail: string | null };

export type BookingDetail = {
  row: BookingRow;
  description: string | null;
  quoteNote: string | null;
  cancellationReason: string | null;
  cancelledByUserId: string | null;
  cancelledByName: string | null;
  customerEmail: string | null; customerPhone: string | null;
  providerEmail: string | null; providerPhone: string | null;
  quoteAccepted: boolean;
  proofCount: number;
  hasAgreement: boolean; agreementFullySigned: boolean;
  timeline: TimelineEntry[];
  disputes: CaseRow[];
};

export type CaseRow = {
  id: string; kind: 'report' | 'dispute';
  raisedByUserId: string; raisedByName: string; raisedByEmail: string | null;
  reason: number; reasonName: string; details: string | null;
  status: number; statusName: string;
  targetLabel: string; targetType: string; targetId: string | null; targetRoute: string | null;
  resolution: string | null;
  handledByUserId: string | null; handledByName: string | null; handledAt: string | null;
  dateCreated: string;
};

export type CasePage = {
  items: CaseRow[]; totalCount: number; pageIndex: number; pageSize: number;
  openCount: number; underReviewCount: number; resolvedCount: number; dismissedCount: number;
};

export type ContentRow = {
  id: string; kind: 'job' | 'listing';
  title: string; summary: string | null; slug: string;
  ownerUserId: string; ownerName: string; ownerEmail: string | null;
  status: number; statusName: string;
  category: string | null;
  amount: number | null; currencyCode: string;
  city: string | null; province: string | null;
  imagePath: string | null;
  viewCount: number; responseCount: number; openReportCount: number;
  removed: boolean; removedReason: string | null; removedByName: string | null; removedAt: string | null;
  expiresAt: string | null; dateCreated: string;
};

export type ContentPage = {
  items: ContentRow[]; totalCount: number; pageIndex: number; pageSize: number;
  liveCount: number; removedCount: number; flaggedCount: number; otherCount: number;
};

export type OpsSummary = {
  bookingsPending: number; bookingsActive: number;
  bookingsCompleted30d: number; bookingsCancelled30d: number;
  disputesOpen: number; reportsOpen: number;
  jobsLive: number; jobsRemoved: number;
  listingsLive: number; listingsRemoved: number;
  contentFlagged: number;
};




/* ---------- the dashboard ---------- */

export type AttentionItem = {
  key: string; label: string; count: number;
  action: string; route: string; urgency: number; oldestDays: number | null;
};

export type Pulse = {
  bookingsInFlight: number; signedInNow: number; classesRunning: number; advertsLive: number;
  liveTodaySignups: number; liveTodayBookings: number; liveTodayPosts: number;
};

export type Movement = { label: string; last7: number; previous7: number; percentChange: number | null };

export type TrendPoint = { day: string; signups: number; bookings: number; posts: number };

export type LiveDashboard = {
  needsAttention: AttentionItem[];
  pulse: Pulse;
  movement: Movement[];
  trend: TrendPoint[];
  recentActivity: { id: string; actorName: string; action: string; summary: string; severity: number; succeeded: boolean; at: string }[];
  tookMs: number;
  asOf: string;
};

/* ---------- who may do what, and what the platform is doing ---------- */

export type PermissionRow = {
  slug: string; area: string; label: string; description: string | null;
  companyScoped: boolean; granted: boolean; isDefault: boolean;
};

export type RoleRow = {
  id: string; name: string; description: string | null;
  companyScoped: boolean;
  peopleHolding: number; permissionCount: number;
  configured: boolean; configuredAt: string | null; configuredBy: string | null;
  protected: boolean;
};

export type RoleDetail = { row: RoleRow; permissions: PermissionRow[] };

export type RolesResponse = { roles: RoleRow[]; areas: string[]; canEdit: boolean };

export type SettingRow = {
  key: string; group: string; label: string; description: string;
  kind: number; value: string; default: string; isDefault: boolean;
  consequential: boolean;
  changedByName: string | null; changeReason: string | null; changedAt: string | null;
};

export type SettingsResponse = { settings: SettingRow[]; groups: string[]; canEdit: boolean };

export type ExportKind = {
  key: string; label: string; description: string;
  personal: boolean; estimatedRows: number;
};

export type ExportsResponse = { kinds: ExportKind[] };

/* ---------- learn, certificates and announcements ---------- */

export type ClassRow = {
  id: string; title: string; skillName: string | null;
  instructorUserId: string; instructorName: string; instructorEmail: string | null;
  status: number; statusName: string;
  mode: number; modeLabel: string;
  level: number; levelLabel: string;
  city: string | null;
  feeAmount: number | null; currency: string; capacity: number;
  enrolledCount: number; pendingCount: number; lessonCount: number;
  certificateOffered: boolean; certificatesIssued: number; certificatesMissing: number;
  startDate: string | null; endDate: string | null; applicationsCloseAt: string | null;
  dateCreated: string;
};

export type ClassPage = {
  items: ClassRow[]; totalCount: number; pageIndex: number; pageSize: number;
  draftCount: number; openCount: number; runningCount: number;
  completedCount: number; cancelledCount: number; missingCertificates: number;
};

export type CertificateRow = {
  id: string; certificateNumber: string;
  studentUserId: string; studentName: string; studentEmail: string | null;
  classId: string; classTitle: string; instructorName: string; skillName: string | null;
  lessonsCompleted: number; lessonCount: number; quizAveragePercent: number | null;
  issuedOn: string;
  revoked: boolean; revokedReason: string | null; revokedByName: string | null; revokedAt: string | null;
  verifyPath: string;
};

export type CertificatePage = {
  items: CertificateRow[]; totalCount: number; pageIndex: number; pageSize: number;
  validCount: number; revokedCount: number;
};

export type ReissueResult = {
  classId: string; classTitle: string;
  issued: number; alreadyHad: number; failed: number; message: string;
};

export type BroadcastRow = {
  id: string; title: string; body: string;
  audience: number; audienceLabel: string; city: string | null;
  sendPush: boolean; sendEmail: boolean;
  imageUrl: string | null;
  ctaLabel: string | null; ctaRoute: string | null;
  actorUserId: string; actorName: string;
  recipientCount: number; deliveredCount: number; emailedCount: number;
  sentAt: string | null; failureReason: string | null; dateCreated: string;
  /** Set with sentAt still null means it is waiting to go. */
  scheduledFor: string | null;
  cancelledAt: string | null; cancelledReason: string | null;
  segmentName: string | null;
  /** People, not opens. One person who opened it four times read it once. */
  openedCount: number;
  /** Against what was delivered, never against the audience. */
  openRatePercent: number | null;
};

export type BroadcastPage = {
  items: BroadcastRow[]; totalCount: number; pageIndex: number; pageSize: number;
  sent30d: number; peopleReached30d: number;
};

export type BroadcastDraft = {
  title: string; body: string; audience: number; city?: string | null;
  sendPush: boolean; sendEmail: boolean;
  imageUrl?: string | null;
  ctaLabel?: string | null; ctaRoute?: string | null;
  /** Send to a saved group instead. Overrides audience and city. */
  segmentId?: string | null;
  /** ISO instant. Null sends now; the audience is resolved when it actually goes. */
  scheduledFor?: string | null;
};

export type BroadcastMedia = {
  url: string; contentType: string; sizeBytes: number; fileName: string;
};

export type BroadcastPreview = {
  reachable: number; total: number; audienceLabel: string; summary: string;
};


/* ---------- growth, demand, and one person ---------- */

export type FunnelStep = {
  key: string; label: string; detail: string;
  count: number; percentOfStart: number; percentOfPrevious: number;
};

export type GrowthFunnel = {
  windowDays: number;
  steps: FunnelStep[];
  /** Not part of the funnel — why the people who never got past step one did not. */
  blockers: FunnelStep[];
  stalledCount: number;
  worstStepKey: string | null;
  verdict: string;
};

export type CohortRow = {
  weekStart: string; label: string; joined: number;
  /** [0] is the signup week, so it doubles as the activation rate. Shorter for younger cohorts. */
  retainedByWeek: number[];
};

export type GrowthPoint = { day: string; signedUp: number; didSomething: number; cameBack: number };

export type QuietPerson = {
  userId: string; name: string; email: string | null; kind: string;
  thingsDone: number; lastDidSomethingAt: string; daysQuiet: number;
};

export type GrowthDashboard = {
  funnel: GrowthFunnel;
  cohorts: CohortRow[];
  trend: GrowthPoint[];
  wentQuiet: QuietPerson[];
  activeLast7Days: number; activeLast30Days: number; totalPeople: number;
  caveats: { appOpensKnownSince: string | null; actionsAreRetroactive: boolean; note: string };
  tookMilliseconds: number;
};

export type MissedSearch = {
  term: string; surface: string; times: number; people: number; lastAt: string;
};

export type SupplyGap = {
  skillId: string | null; skill: string; city: string | null;
  peopleLookedFor: number; jobsUnanswered: number; bookingsUnanswered: number;
  providersAvailable: number; score: number; advice: string;
};

export type UnansweredJob = {
  id: string; title: string; skillName: string | null; city: string | null;
  customerUserId: string; customerName: string; postedAt: string; daysOpen: number; views: number;
};

export type DemandDashboard = {
  gaps: SupplyGap[];
  missedSearches: MissedSearch[];
  unansweredJobs: UnansweredJob[];
  searchesRecorded: number; searchesWithNothing: number; missRatePercent: number;
  searchesKnownSince: string | null;
  verdict: string;
  tookMilliseconds: number;
};

export type PersonThing = {
  id: string; kind: string; title: string; status: string;
  tone: 'green' | 'amber' | 'red' | 'grey';
  detail: string | null; at: string; link: string | null;
};

export type PersonDevice = {
  name: string; model: string | null; operatingSystem: string | null; appVersion: string | null;
  canReceiveNotifications: boolean; lastSeenAt: string | null;
};

export type PersonEvent = {
  at: string; kind: string; title: string; detail: string | null;
  tone: 'green' | 'amber' | 'red' | 'grey';
};

export type PersonStanding = {
  lastActiveAt: string | null; daysSinceActive: number | null;
  thingsDone: number; completed: number; cancelled: number;
  complaintsAgainst: number; complaintsRaised: number;
  rating: number | null; reviewCount: number;
  summary: string;
};

export type PersonFile = {
  person: AdminUserDetail;
  standing: PersonStanding;
  bookings: PersonThing[];
  posted: PersonThing[];
  learning: PersonThing[];
  documents: PersonThing[];
  complaints: PersonThing[];
  devices: PersonDevice[];
  timeline: PersonEvent[];
  tookMilliseconds: number;
};

/* ---------- setting somebody up by hand ---------- */

export type ProviderSetup = {
  businessName?: string | null; professionalTitle?: string | null; bio?: string | null;
  city?: string | null; province?: string | null; address?: string | null;
  yearsOfExperience?: number | null; hourlyRate?: number | null; minimumServiceCharge?: number | null;
  skillIds: string[]; available: boolean;
};

export type CompanySetup = {
  companyName?: string | null; registrationNumber?: string | null;
  city?: string | null; address?: string | null;
};

/** Note what is absent: there is no password. That is the design, not an oversight. */
export type CreateUserDraft = {
  firstName: string; lastName: string; email: string; phoneNumber?: string | null;
  userType: number; role: string;
  provider?: ProviderSetup | null; company?: CompanySetup | null;
  note?: string | null; sendEmail: boolean;
};

export type CreatedUser = {
  userId: string; name: string; email: string; role: string;
  providerProfileCreated: boolean; emailSent: boolean;
  setupLinkExpiresAt: string; message: string;
};

export type PendingSetup = {
  id: string; userId: string; name: string; email: string; createdByName: string;
  sentAt: string; sendCount: number; expiresAt: string; expired: boolean;
};

/* ---------- the AI half ---------- */

export type Signal = {
  key: string; kind: string; title: string; evidence: string;
  severity: number; count: number; link: string | null; explanation: string | null;
};

export type BriefingSection = { heading: string; body: string; points: string[] };

export type AdminBriefing = {
  generatedAt: string; aiWrote: boolean; headline: string;
  sections: BriefingSection[]; signals: Signal[]; facts: string[];
  unavailable: string | null; tookMilliseconds: number;
};

export type AskFigure = { label: string; value: string; link: string | null };

export type AskAnswer = {
  question: string; intent: string; answer: string; figures: AskFigure[];
  aiWrote: boolean; unavailable: string | null; tookMilliseconds: number;
};

export type CaseTriage = {
  caseId: string; kind: string; summary: string;
  whatTheEvidenceShows: string[]; whatIsMissing: string[];
  recommendation: string; reasoning: string; confidence: string;
  aiWrote: boolean; unavailable: string | null;
};

export type Draft = {
  kind: string; title: string | null; body: string;
  aiWrote: boolean; unavailable: string | null; editable: boolean;
};

/* ---------- the system story ---------- */

export type HealthPart = {
  key: string; label: string; score: number; reading: string; detail: string; route: string | null;
};

export type Health = { score: number; band: string; verdict: string; parts: HealthPart[] };

export type DayPoint = {
  day: string; joined: number; booked: number; posted: number; completed: number; cancelled: number;
};

export type Fulfilment = {
  requested: number; accepted: number; completed: number; cancelled: number; expired: number;
  acceptedPercent: number; completedPercent: number;
  medianResponseHours: number | null; verdict: string;
};

export type PlaceBalance = {
  city: string; demand: number; providers: number; unanswered: number;
  loadPerProvider: number; state: string;
};

export type Mover = {
  label: string; kind: string; thisWeek: number; lastWeek: number;
  change: number; percentChange: number | null;
};

/** A section that could not be worked out, and why — in words a person can act on. */
export type StoryGap = { key: string; label: string; reason: string };

export type SystemStory = {
  health: Health | null; days: DayPoint[]; fulfilment: Fulfilment | null;
  places: PlaceBalance[]; movers: Mover[]; tookMilliseconds: number;
  gaps: StoryGap[];
};

/* ---------- the action queue ---------- */

export type AdminAction = {
  key: string; kind: string; title: string; subject: string; subjectId: string | null;
  why: string[]; severity: number; count: number;
  route: string; actionLabel: string; suggestedReason: string | null; note: string | null;
};

export type ActionQueue = {
  actions: AdminAction[]; todayCount: number; verdict: string;
  aiRanked: boolean; unavailable: string | null; tookMilliseconds: number;
};

/* ---------- saved audiences, scheduling, and whether it landed ---------- */

export type Segment = {
  id: string; name: string; description: string | null;
  audience: number; city: string | null;
  quietForDays: number | null; noWorkForDays: number | null;
  skillId: string | null; skillName: string | null; neverBooked: boolean;
  describes: string; reachableNow: number;
  createdByName: string; createdAt: string; lastUsedAt: string | null; useCount: number;
};

export type ScheduledBroadcast = {
  id: string; title: string; body: string; scheduledFor: string; minutesAway: number;
  segmentName: string | null; describes: string; reachableNow: number;
  sendPush: boolean; sendEmail: boolean; actorName: string;
};

export type BroadcastSchedule = { waiting: ScheduledBroadcast[]; verdict: string };

export type BroadcastReach = {
  openedCount: number; deliveredCount: number; openRatePercent: number | null;
  firstOpenedAt: string | null; lastOpenedAt: string | null;
};

/* ---------- money owed ---------- */

export type FeeCharge = {
  id: string; bookingId: string; bookingReference: string;
  providerProfileId: string; providerName: string; providerPhone: string | null;
  skillName: string; city: string | null;
  bookingAmount: number; ratePercent: number; amountOwed: number; currencyCode: string;
  workFinishedAt: string; backfilled: boolean;
  state: 'owed' | 'settled' | 'waived';
  overdue: boolean; daysOutstanding: number;
  settledAt: string | null; settledAmount: number | null;
  settlementReference: string | null; settledByName: string | null;
  waivedAt: string | null; waivedReason: string | null; waivedByName: string | null;
  note: string | null;
};

export type ProviderBalance = {
  providerProfileId: string; providerName: string; phone: string | null; city: string | null;
  jobsCharged: number; totalOwed: number; totalSettled: number; outstanding: number;
  waived: number; overdueCount: number; oldestUnsettledDays: number | null; currencyCode: string;
};

export type LedgerTotals = {
  raised: number; settled: number; outstanding: number; waived: number; overdue: number;
  chargeCount: number; overdueCount: number; providersOwing: number; currencyCode: string;
  currentRatePercent: number; graceDays: number; unraised: number;
};

export type LedgerPage = {
  items: FeeCharge[]; totalCount: number; pageIndex: number; pageSize: number;
  totals: LedgerTotals; worstOffenders: ProviderBalance[]; moneyNotice: string;
};

/* ---------- the admin team ---------- */

export type AdminTeamMember = {
  id: string; name: string; email: string | null;
  userType: number; userTypeName: string;
  roles: string[];
  isSuperAdmin: boolean; isConsoleUser: boolean;
  status: number; statusName: string;
  lastSignInAt: string | null;
  openSessions: number;
  invitedByName: string | null;
  dateCreated: string;
};

export type AdminInvite = {
  id: string; email: string; name: string | null;
  roles: string[];
  invitedByName: string | null;
  sentAt: string; expiresAt: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  statusLabel: string;
  acceptedAt: string | null; revokedAt: string | null;
};

export type AdminTeam = {
  members: AdminTeamMember[];
  invites: AdminInvite[];
  canManage: boolean;
  myUserId: string;
  grantableRoles: string[];
};

/** What someone opening an invitation link is allowed to know before they accept. */
export type AdminInviteBrief = {
  valid: boolean;
  email: string | null;
  name: string | null;
  invitedByName: string | null;
  expiresAt: string | null;
  needsPassword: boolean;
  message: string;
};

export type AdminSkill = {
  id: string; categoryId: string; categoryName: string; name: string;
  description: string | null; active: boolean; providerCount: number; dateCreated: string;
};

export type AdminCategory = {
  id: string; name: string; description: string | null; iconUrl: string | null;
  active: boolean; skillCount: number; dateCreated: string; skills: AdminSkill[];
};

/** 2 active · 3 suspended · 4 blocked — matches AccountStatus on the server. */
export const AccountStatus = { Active: 2, Suspended: 3, Blocked: 4 } as const;

/* ---------- paged catalogue ---------- */

export type CatalogQuery = {
  search?: string;
  categoryId?: string;
  status?: string;
  sort?: string;
  pageIndex?: number;
  pageSize?: number;
};

export type CategoryPage = {
  items: AdminCategory[];
  totalCount: number; pageIndex: number; pageSize: number;
  activeCount: number; retiredCount: number; totalSkills: number;
};

export type SkillPage = {
  items: AdminSkill[];
  totalCount: number; pageIndex: number; pageSize: number;
  activeCount: number; retiredCount: number;
};

/* ---------- uploaded documents ---------- */

export type AdminDocument = {
  id: string;
  ownerUserId: string; ownerName: string; ownerEmail: string | null;
  ownerType: number; ownerTypeName: string;
  documentTypeId: string; documentTypeName: string;
  fileName: string; fileUrl: string; contentType: string; fileSize: number;
  status: number; statusName: string;
  rejectionReason: string | null;
  dateCreated: string; dateUpdated: string | null; decidedBy: string | null;
  extractedFullName: string | null;
  extractedDocumentNumber: string | null;
  extractedDateOfBirth: string | null;
  extractedExpiryDate: string | null;
  confidenceScore: number | null;
  scanIsExpired: boolean | null;
  scanIsReadable: boolean | null;
  ownerIsProvider: boolean;
  providerVerificationStatus: string | null;
  ownerDocumentCount: number;
  ownerApprovedCount: number;
};

export type DocumentPage = {
  items: AdminDocument[];
  totalCount: number; pageIndex: number; pageSize: number;
  awaitingCount: number; approvedCount: number; rejectedCount: number;
};

/** 1 pending · 2 scanning · 3 scanned · 4 approved · 5 rejected · 6 expired. */
export const DocumentStatus = {
  Pending: 1, Scanning: 2, Scanned: 3, Approved: 4, Rejected: 5, Expired: 6,
} as const;

/* ---------- adverts ---------- */

export type Advert = {
  id: string;
  kicker: string | null; title: string; body: string | null; meta: string | null;
  imageUrl: string | null; ctaLabel: string | null;
  mediaType: number; mediaTypeName: string; videoUrl: string | null;
  tone: number; toneName: string;
  targetType: number; targetTypeName: string;
  targetEntityId: string | null; targetRoute: string | null; targetUrl: string | null; targetLabel: string | null;
  targetCity: string | null;
  placements: number; placementNames: string[];
  audience: number; audienceNames: string[];
  startsAt: string | null; endsAt: string | null;
  priority: number; active: boolean; live: boolean; statusLabel: string;
  impressionCount: number; clickCount: number; clickRate: number;
  lastShownAt: string | null;
  lastPushedAt: string | null; pushCount: number;
  seenCount: number; tappedCount: number; canPush: boolean;
  dateCreated: string;
};

export type AdvertPage = {
  items: Advert[];
  totalCount: number; pageIndex: number; pageSize: number;
  liveCount: number; scheduledCount: number; endedCount: number;
};

export type AdvertWrite = {
  kicker?: string | null;
  title: string;
  body?: string | null;
  meta?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  ctaLabel?: string | null;
  tone: number;
  targetType: number;
  targetEntityId?: string | null;
  targetRoute?: string | null;
  targetUrl?: string | null;
  targetCity?: string | null;
  placements: string[];
  audience: string[];
  startsAt?: string | null;
  endsAt?: string | null;
  priority: number;
  active: boolean;
};

export type AdvertTargetOption = { id: string; label: string; detail: string | null };
export type AdvertScreenOption = { key: string; label: string };

/** Mirrors AdvertTone / AdvertTargetType on the server. */
export const AdvertTone = { Primary: 1, Secondary: 2, Verified: 3, Dark: 4 } as const;
export const AdvertTargetType = {
  None: 1, Provider: 2, Skill: 3, Category: 4, TrainingClass: 5, JobPost: 6, Screen: 7, ExternalUrl: 8,
} as const;

export const PLACEMENTS = [
  { value: 'MobilePromoRail', label: 'Mobile — promo rail', detail: 'The snap-scrolling rail on Discover' },
  { value: 'MobileHero', label: 'Mobile — hero carousel', detail: 'Full width, top of Discover' },
  { value: 'MobilePopup', label: 'Mobile — full-screen popup', detail: 'Interrupts, once per person. The only one you can push.' },
  { value: 'WebDiscover', label: 'Web — Discover', detail: 'The in-app home page' },
  { value: 'WebLanding', label: 'Web — landing page', detail: 'Seen before anyone signs in' },
];

/** Mirrors AdvertMediaType on the server. */
export const AdvertMediaType = { None: 1, Image: 2, Video: 3 } as const;

export type AdvertMedia = { url: string; mediaType: string; contentType: string; sizeBytes: number; fileName: string };

export type AdvertPush = {
  advertId: string; title: string; recipients: number;
  audience: string; pushedAt: string; message: string;
};

export const AUDIENCES = [
  { value: 'SignedOut', label: 'Signed out', detail: 'Visitors who have not joined' },
  { value: 'Customers', label: 'Customers', detail: 'Signed-in people who book work' },
  { value: 'Providers', label: 'Providers', detail: 'People who offer work' },
  { value: 'Companies', label: 'Companies', detail: 'Company accounts' },
];

function queryString(filters: Record<string, unknown>) {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && `${value}`.trim() !== '') query.set(key, String(value));
  });
  return query.toString();
}

/* ---------- two-step sign-in ---------- */

/**
 * Step one's answer. Note what is NOT here: no token, no user id, no roles. Knowing the
 * password gets you a countdown and a code in an inbox you must already control.
 */
export type AdminChallenge = {
  challengeId: string;
  maskedEmail: string;
  expiresAt: string;
  resendAvailableAt: string;
  codeLength: number;
  deviceLabel: string;
  /** False the first time this browser is seen. The screen says so, loudly. */
  recognisedDevice: boolean;
};

/** Step two's answer — the only response in the whole flow that can reach the API. */
type AdminSessionResponse = {
  accessToken: string;
  expiresAt: string;
  userId: string;
  name: string;
  email: string | null;
  roles: string[];
  isSuperAdmin: boolean;
};

/**
 * A setting was just saved somewhere.
 *
 * The console's frame shows a band while the platform is closed, and it polls. Polling alone
 * means the operator who just closed the platform sits looking at a screen that has not caught
 * up yet — for up to a minute, at the exact moment they most need to see that it worked. This
 * is the nudge that closes that gap; the poll stays, for the case where somebody else did it.
 *
 * A window event rather than shared state because the two places involved are the settings
 * screen and the shell, and threading a store between them would be more machinery than the
 * one fact deserves.
 */
export const SETTINGS_CHANGED = 'vacancy.settings.changed';

export function settingsChanged() {
  window.dispatchEvent(new Event(SETTINGS_CHANGED));
}

/** What the platform tells anybody who asks, signed in or not. */
export type PlatformStatus = {
  maintenance: boolean;
  message: string | null;
  signupsAllowed: boolean;
  providerSignupsAllowed: boolean;
};

export type SupportInboxRow = {
  threadId: string; userId: string; userName: string; userEmail?: string | null;
  lastMessage: string; lastFromAdmin: boolean; lastMessageAt: string;
};

export type SupportChatMessage = {
  id: string; isFromAdmin: boolean; senderName: string; body: string; dateCreated: string;
};

export type SupportChatThread = { threadId: string; messages: SupportChatMessage[] };

export const adminApi = {
  // ---- support chat ----
  supportInbox() {
    return apiRequest<SupportInboxRow[]>(`${DASHBOARD}/support`);
  },
  supportThread(threadId: string) {
    return apiRequest<SupportChatThread>(`${DASHBOARD}/support/${id(threadId)}`);
  },
  supportReply(threadId: string, body: string) {
    return apiRequest<SupportChatMessage>(`${DASHBOARD}/support/${id(threadId)}/reply`, { method: 'POST', body: { body } });
  },

  /** Every contact-form message, newest first. */
  async contactMessages(query: { search?: string; unhandledOnly?: boolean; pageIndex?: number; pageSize?: number } = {}): Promise<ContactMessagePage> {
    const params = new URLSearchParams();
    if (query.search) params.set('Search', query.search);
    if (query.unhandledOnly) params.set('UnhandledOnly', 'true');
    params.set('PageIndex', String(query.pageIndex ?? 1));
    params.set('PageSize', String(query.pageSize ?? 50));
    return apiRequest<ContactMessagePage>(`${CONTACT}?${params.toString()}`);
  },

  /** Toggle whether a message has been dealt with, with an optional internal note. */
  async handleContactMessage(messageId: string, body: { note?: string }): Promise<ContactMessage> {
    // No auth flag: this client attaches the session unless a call opts out with
    // `anonymous`, which only sign-in does.
    return apiRequest<ContactMessage>(`${CONTACT}/${id(messageId)}/handle`, { method: 'POST', body });
  },

  /**
   * Is the platform open — the same anonymous endpoint the phone app asks.
   *
   * Read by the console so that a maintenance mode somebody switched on last night and
   * forgot is impossible to miss. Deliberately the public endpoint rather than a new admin
   * one: if the console showed a different answer from the one the apps are getting, the
   * banner would be reassuring rather than true.
   */
  platformStatus() {
    return apiRequest<PlatformStatus>('/api/v1/platform/status', { anonymous: true });
  },

  /**
   * Password + console entitlement. Both are checked before a code is sent, and an
   * unknown address fails exactly like a wrong password so the screen cannot be used
   * to find out who has an account here.
   */
  start(email: string, password: string, device: AdminDevice) {
    return securePost<AdminChallenge>(`${AUTH}/start`, { email, password, device });
  },

  /**
   * The second factor. On success the session is stored and the identity re-fetched from
   * the API — the console never decides for itself that a token belongs to an administrator.
   */
  async verify(challengeId: string, code: string, device: AdminDevice): Promise<AdminIdentity> {
    const auth = await securePost<AdminSessionResponse>(`${AUTH}/verify`, { challengeId, code, device });

    const session: Session = {
      accessToken: auth.accessToken,
      refreshToken: null,   // the console is short-lived by design: no silent renewal
      expiresAt: auth.expiresAt,
      name: auth.name,
      email: auth.email,
    };
    setSession(session);

    try {
      return await adminApi.me();
    } catch (error) {
      setSession(null);   // entitlement vanished between the two steps — leave no token behind
      throw error;
    }
  },

  /** A fresh code on the same challenge. The cool-down is enforced server-side too. */
  resend(challengeId: string) {
    return securePost<AdminChallenge>(`${AUTH}/resend`, { challengeId });
  },

  me() {
    return apiRequest<AdminIdentity>(`${BASE}/me`);
  },

  summary() {
    return apiRequest<ConsoleSummary>(`${BASE}/summary`);
  },

  // ---- accounts ----
  users(search: string, pageIndex = 1, pageSize = 25) {
    const query = new URLSearchParams({ pageIndex: String(pageIndex), pageSize: String(pageSize) });
    if (search.trim()) query.set('search', search.trim());
    return apiRequest<AdminUserSearch>(`${DASHBOARD}/users?${query}`);
  },

  user(userId: string) {
    return apiRequest<AdminUserDetail>(`${BASE}/users/${id(userId)}`);
  },

  setUserStatus(userId: string, status: number, reason: string | null) {
    return apiRequest<AdminUserDetail>(`${BASE}/users/${id(userId)}/status`,
      { method: 'POST', body: { status, reason } });
  },

  setUserRoles(userId: string, roles: string[], reason: string | null) {
    return apiRequest<AdminUserDetail>(`${BASE}/users/${id(userId)}/roles`,
      { method: 'POST', body: { roles, reason } });
  },

  // ---- service catalogue ----
  catalog(includeArchived: boolean) {
    return apiRequest<AdminCategory[]>(`${BASE}/catalog?includeArchived=${includeArchived}`);
  },

  createCategory(body: { name: string; description?: string | null; iconUrl?: string | null }) {
    return apiRequest<AdminCategory>(`${BASE}/catalog/categories`, { method: 'POST', body });
  },

  updateCategory(categoryId: string, body: { name: string; description?: string | null; iconUrl?: string | null }) {
    return apiRequest<AdminCategory>(`${BASE}/catalog/categories/${id(categoryId)}`, { method: 'PUT', body });
  },

  setCategoryActive(categoryId: string, active: boolean, reason?: string | null) {
    return apiRequest<AdminCategory>(`${BASE}/catalog/categories/${id(categoryId)}/active`,
      { method: 'POST', body: { active, reason } });
  },

  createSkill(body: { categoryId: string; name: string; description?: string | null }) {
    return apiRequest<AdminSkill>(`${BASE}/catalog/skills`, { method: 'POST', body });
  },

  updateSkill(skillId: string, body: { categoryId: string; name: string; description?: string | null }) {
    return apiRequest<AdminSkill>(`${BASE}/catalog/skills/${id(skillId)}`, { method: 'PUT', body });
  },

  setSkillActive(skillId: string, active: boolean, reason?: string | null) {
    return apiRequest<AdminSkill>(`${BASE}/catalog/skills/${id(skillId)}/active`,
      { method: 'POST', body: { active, reason } });
  },

  /** Categories, searched and paged by the API — not by this browser. */
  categoryPage(query: CatalogQuery) {
    return apiRequest<CategoryPage>(`${BASE}/catalog/category-search?${queryString(query)}`);
  },

  skillPage(query: CatalogQuery) {
    return apiRequest<SkillPage>(`${BASE}/catalog/skill-search?${queryString(query)}`);
  },

  // ---- uploaded documents ----
  documents(query: {
    search?: string; status?: string; documentTypeId?: string; ownerType?: string;
    sort?: string; pageIndex?: number; pageSize?: number;
  }) {
    return apiRequest<DocumentPage>(`${BASE}/documents?${queryString(query)}`);
  },

  document(documentId: string) {
    return apiRequest<AdminDocument>(`${BASE}/documents/${id(documentId)}`);
  },

  decideDocument(documentId: string, body: {
    approved: boolean; reason?: string | null; alsoVerifyProvider?: boolean; silent?: boolean;
  }) {
    return apiRequest<AdminDocument>(`${BASE}/documents/${id(documentId)}/decision`, { method: 'POST', body });
  },

  // ---- passwords (encrypted in transit, administrators only) ----
  changeMyPassword(currentPassword: string, newPassword: string) {
    return securePost<{ message: string }>(`${BASE}/me/password`, { currentPassword, newPassword });
  },

  resetPassword(userId: string, body: { newPassword: string; reason: string; notifyByEmail: boolean }) {
    return securePost<{ message: string }>(`${BASE}/users/${id(userId)}/password`, body);
  },




  /** The whole dashboard in one call — the API answers it in one round trip. */
  live() {
    return apiRequest<LiveDashboard>(`${BASE}/live`);
  },

  // ---- who may do what, and what the platform is doing ----
  roles() {
    return apiRequest<RolesResponse>(`${BASE}/roles`);
  },

  role(roleId: string) {
    return apiRequest<RoleDetail>(`${BASE}/roles/${id(roleId)}`);
  },

  setRolePermissions(roleId: string, slugs: string[], reason: string) {
    return apiRequest<RoleDetail>(`${BASE}/roles/${id(roleId)}/permissions`,
      { method: 'POST', body: { slugs, reason } });
  },

  settings() {
    return apiRequest<SettingsResponse>(`${BASE}/settings`);
  },

  setSetting(key: string, value: string, reason?: string | null) {
    return apiRequest<SettingRow>(`${BASE}/settings`,
      { method: 'POST', body: { key, value, reason: reason ?? null } });
  },

  exportKinds() {
    return apiRequest<ExportsResponse>(`${BASE}/exports`);
  },

  /**
   * Fetch a CSV and hand it to the browser.
   *
   * Not `apiRequest`, because the answer is a file rather than the usual envelope — and the
   * token has to travel, so a plain link would answer 401. The blob is revoked afterwards;
   * leaving it alive holds a whole export in memory for the life of the tab.
   */
  async downloadExport(kind: string, range: { from?: string; to?: string } = {}) {
    const session = loadSession();
    const query = new URLSearchParams();
    if (range.from) query.set('from', range.from);
    if (range.to) query.set('to', range.to);

    const response = await fetch(`${config.apiBaseUrl}${BASE}/exports/${id(kind)}?${query}`, {
      headers: session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {},
    });
    if (!response.ok) {
      throw new ApiError(
        response.status === 401 ? 'Your session expired — sign in again.' : `That export failed (${response.status}).`,
        response.status);
    }

    const blob = await response.blob();
    const name = /filename="?([^";]+)"?/.exec(response.headers.get('content-disposition') ?? '')?.[1]
      ?? `vacancy-${kind}.csv`;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    return { name, bytes: blob.size };
  },

  // ---- learn, certificates and announcements ----
  classes(query: OpsQuery) {
    return apiRequest<ClassPage>(`${BASE}/classes?${queryString(query)}`);
  },

  cancelClass(classId: string, reason: string) {
    return apiRequest<ClassRow>(`${BASE}/classes/${id(classId)}/cancel`, { method: 'POST', body: { reason } });
  },

  /** Issue the certificates a finished class still owes. Safe to press twice. */
  reissueCertificates(classId: string) {
    return apiRequest<ReissueResult>(`${BASE}/classes/${id(classId)}/certificates`, { method: 'POST', body: {} });
  },

  certificates(query: OpsQuery) {
    return apiRequest<CertificatePage>(`${BASE}/certificates?${queryString(query)}`);
  },

  revokeCertificate(certificateId: string, body: { revoked: boolean; reason?: string | null; silent?: boolean }) {
    return apiRequest<CertificateRow>(`${BASE}/certificates/${id(certificateId)}/revoke`, { method: 'POST', body });
  },

  broadcasts(query: OpsQuery) {
    return apiRequest<BroadcastPage>(`${BASE}/broadcasts?${queryString(query)}`);
  },

  /** How many people this would actually reach, before anything is sent. */
  previewBroadcast(draft: BroadcastDraft) {
    return apiRequest<BroadcastPreview>(`${BASE}/broadcasts/preview`, { method: 'POST', body: draft });
  },

  sendBroadcast(draft: BroadcastDraft) {
    return apiRequest<BroadcastRow>(`${BASE}/broadcasts`, { method: 'POST', body: draft });
  },

  /** The picture an announcement carries. Multipart, like the advert media upload. */
  async uploadBroadcastImage(file: File): Promise<BroadcastMedia> {
    const form = new FormData();
    form.append('file', file);
    return apiRequest<BroadcastMedia>(`${BASE}/broadcasts/media`, { method: 'POST', body: form });
  },

  /**
   * The certificate document, as a blob URL the console can show in place.
   *
   * Not a plain link: the endpoint needs the bearer token, and an <img>/<iframe> src cannot
   * carry one. Fetched here and handed back as an object URL, which the caller revokes when
   * the viewer closes. Withdrawn certificates answer too — the public download refuses them,
   * and the reviewer deciding about a withdrawal is exactly who needs to see one.
   */
  async certificateFileUrl(certificateId: string): Promise<{ url: string; revoke: () => void }> {
    const session = loadSession();
    const response = await fetch(`${config.apiBaseUrl}${BASE}/certificates/${id(certificateId)}/file`, {
      headers: session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {},
    });
    if (!response.ok) {
      throw new ApiError(
        response.status === 401 ? 'Your session expired — sign in again.'
          : response.status === 404 ? 'That certificate could not be found.'
          : `The certificate would not open (${response.status}).`,
        response.status);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    return { url, revoke: () => URL.revokeObjectURL(url) };
  },

  // ---- day-to-day operations ----
  bookings(query: OpsQuery) {
    return apiRequest<BookingPage>(`${BASE}/bookings?${queryString(query)}`);
  },

  booking(bookingId: string) {
    return apiRequest<BookingDetail>(`${BASE}/bookings/${id(bookingId)}`);
  },

  cancelBooking(bookingId: string, reason: string) {
    return apiRequest<BookingDetail>(`${BASE}/bookings/${id(bookingId)}/cancel`,
      { method: 'POST', body: { reason } });
  },

  /** kind is 'report' or 'dispute' — one queue, two vocabularies. */
  cases(kind: 'report' | 'dispute', query: OpsQuery) {
    return apiRequest<CasePage>(`${BASE}/cases/${kind}?${queryString(query)}`);
  },

  /** Pick a case up so two people do not work it at once. Decides nothing. */
  claimCase(kind: 'report' | 'dispute', caseId: string, status: 1 | 2, note?: string) {
    return apiRequest<CaseRow>(`${BASE}/cases/${kind}/${id(caseId)}/claim`,
      { method: 'POST', body: { status, note: note ?? null } });
  },

  decideCase(kind: 'report' | 'dispute', caseId: string, status: 3 | 4, resolution: string) {
    return apiRequest<CaseRow>(`${BASE}/cases/${kind}/${id(caseId)}/decision`,
      { method: 'POST', body: { status, resolution } });
  },

  content(kind: 'job' | 'listing', query: OpsQuery) {
    return apiRequest<ContentPage>(`${BASE}/content/${kind}?${queryString(query)}`);
  },

  takedown(kind: 'job' | 'listing', contentId: string, body: { removed: boolean; reason?: string | null; silent?: boolean }) {
    return apiRequest<ContentRow>(`${BASE}/content/${kind}/${id(contentId)}/takedown`,
      { method: 'POST', body });
  },

  operations() {
    return apiRequest<OpsSummary>(`${BASE}/operations`);
  },

  // ---- the admin team ----
  team(search = '') {
    const query = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
    return apiRequest<AdminTeam>(`${BASE}/team${query}`);
  },

  /**
   * Invite someone into the console. The password is never chosen here — the invitation
   * carries a one-time link and they set their own, so no administrator ever knows
   * another's password from the moment the account begins.
   */
  invite(body: { email: string; name?: string | null; roles: string[]; note?: string | null }) {
    return apiRequest<AdminInvite>(`${BASE}/team/invites`, { method: 'POST', body });
  },

  resendInvite(inviteId: string) {
    return apiRequest<AdminInvite>(`${BASE}/team/invites/${id(inviteId)}/resend`, { method: 'POST', body: {} });
  },

  revokeInvite(inviteId: string, reason: string | null) {
    return apiRequest<AdminInvite>(`${BASE}/team/invites/${id(inviteId)}`,
      { method: 'DELETE', body: { reason } });
  },

  /** Takes the console away without touching the person's ordinary account. */
  revokeAdminAccess(userId: string, reason: string) {
    return apiRequest<AdminTeamMember>(`${BASE}/team/${id(userId)}/access`,
      { method: 'DELETE', body: { reason } });
  },

  /** Ends every live session for this account, on every device, immediately. */
  forceSignOut(userId: string, reason: string) {
    return apiRequest<{ sessionsEnded: number; devicesCleared: number; message: string }>(
      `${BASE}/team/${id(userId)}/sessions`, { method: 'DELETE', body: { reason } });
  },

  // ---- accepting an invitation (no session yet) ----
  inviteBrief(token: string) {
    return apiRequest<AdminInviteBrief>(`${AUTH}/invite/${encodeURIComponent(token)}`);
  },

  acceptInvite(token: string, name: string, password: string) {
    return securePost<{ message: string; email: string }>(`${AUTH}/invite/${encodeURIComponent(token)}/accept`,
      { name, password });
  },

  // ---- adverts ----
  adverts(query: {
    search?: string; placement?: string; status?: string; sort?: string;
    pageIndex?: number; pageSize?: number;
  }) {
    return apiRequest<AdvertPage>(`${ADVERTS}?${queryString(query)}`);
  },

  advert(advertId: string) {
    return apiRequest<Advert>(`${ADVERTS}/${id(advertId)}`);
  },

  createAdvert(body: AdvertWrite) {
    return apiRequest<Advert>(ADVERTS, { method: 'POST', body });
  },

  updateAdvert(advertId: string, body: AdvertWrite) {
    return apiRequest<Advert>(`${ADVERTS}/${id(advertId)}`, { method: 'PUT', body });
  },

  setAdvertActive(advertId: string, active: boolean, reason?: string | null) {
    return apiRequest<Advert>(`${ADVERTS}/${id(advertId)}/active`, { method: 'POST', body: { active, reason } });
  },

  removeAdvert(advertId: string, reason: string) {
    return apiRequest<boolean>(`${ADVERTS}/${id(advertId)}?reason=${encodeURIComponent(reason)}`, { method: 'DELETE' });
  },

  advertTargets(targetType: string, search: string) {
    return apiRequest<AdvertTargetOption[]>(`${ADVERTS}/targets?${queryString({ targetType, search, take: 25 })}`);
  },

  advertScreens() {
    return apiRequest<AdvertScreenOption[]>(`${ADVERTS}/screens`);
  },

  /**
   * Upload the image or video. Multipart rather than JSON, so a 30MB video is not
   * base64-inflated by a third on the way up.
   */
  async uploadAdvertMedia(file: File): Promise<AdvertMedia> {
    const form = new FormData();
    form.append('file', file);
    return apiRequest<AdvertMedia>(`${ADVERTS}/media`, { method: 'POST', body: form });
  },

  /** Send it to phones. Popup placement only — the API refuses anything else. */
  pushAdvert(advertId: string) {
    return apiRequest<AdvertPush>(`${ADVERTS}/${id(advertId)}/push`, { method: 'POST' });
  },

  /** Is it working — the funnel, the cohorts, and who went quiet. */
  growth(days = 90) {
    return apiRequest<GrowthDashboard>(`${BASE}/growth?days=${days}`);
  },

  /** Where people asked for something we did not have. */
  demand(days = 30) {
    return apiRequest<DemandDashboard>(`${BASE}/demand?days=${days}`);
  },

  /** Everything about one person, in one call. */
  personFile(userId: string) {
    return apiRequest<PersonFile>(`${BASE}/users/${id(userId)}/file`);
  },

  /** Set somebody up by hand. No password crosses this call in either direction. */
  createUser(draft: CreateUserDraft) {
    return apiRequest<CreatedUser>(`${BASE}/users`, { method: 'POST', body: draft });
  },

  /** Send the setup link again. The previous one stops working. */
  resendSetup(userId: string) {
    return apiRequest<CreatedUser>(`${BASE}/users/${id(userId)}/setup-link`, { method: 'POST' });
  },

  pendingSetups() {
    return apiRequest<PendingSetup[]>(`${BASE}/users/pending-setup`);
  },

  // ---- the AI half ----
  briefing() {
    return apiRequest<AdminBriefing>(`${BASE}/ai/briefing`);
  },

  ask(question: string) {
    return apiRequest<AskAnswer>(`${BASE}/ai/ask`, { method: 'POST', body: { question } });
  },

  triage(kind: string, caseId: string) {
    return apiRequest<CaseTriage>(`${BASE}/ai/triage/${id(kind)}/${id(caseId)}`, { method: 'POST' });
  },

  draft(kind: string, brief: string, tone = 'plain') {
    return apiRequest<Draft>(`${BASE}/ai/draft`, { method: 'POST', body: { kind, brief, tone } });
  },

  /** The whole platform in one answer — what Overview is drawn from. */
  story() {
    return apiRequest<SystemStory>(`${BASE}/story`);
  },

  /** What to do, why, and where. */
  segments() {
    return apiRequest<Segment[]>(`${BASE}/segments`);
  },

  saveSegment(body: Record<string, unknown>, segmentId?: string) {
    return segmentId
      ? apiRequest<Segment>(`${BASE}/segments/${segmentId}`, { method: 'PUT', body })
      : apiRequest<Segment>(`${BASE}/segments`, { method: 'POST', body });
  },

  deleteSegment(segmentId: string) {
    return apiRequest<boolean>(`${BASE}/segments/${segmentId}`, { method: 'DELETE' });
  },

  scheduled() {
    return apiRequest<BroadcastSchedule>(`${BASE}/broadcasts/scheduled`);
  },

  /** Only before it goes. Nothing calls back a notification already on a thousand phones. */
  cancelScheduled(broadcastId: string, reason: string) {
    return securePost<boolean>(`${BASE}/broadcasts/${broadcastId}/cancel`, { reason });
  },

  broadcastReach(broadcastId: string) {
    return apiRequest<BroadcastReach>(`${BASE}/broadcasts/${broadcastId}/reach`);
  },

  ledger(query: Record<string, string | number | undefined> = {}) {
    return apiRequest<LedgerPage>(`${BASE}/ledger?${queryString(query)}`);
  },

  ledgerBackfill() {
    return apiRequest<{ raised: number; amountRaised: number; ratePercent: number; message: string }>(
      `${BASE}/ledger/backfill`, { method: 'POST' });
  },

  /** Records a payment that happened somewhere else. Encrypted like every other write. */
  settleFee(chargeId: string, reference: string, amount: number | null, note: string | null) {
    return securePost<{ chargeId: string; state: string; message: string }>(
      `${BASE}/ledger/${chargeId}/settle`, { reference, amount, note });
  },

  waiveFee(chargeId: string, reason: string) {
    return securePost<{ chargeId: string; state: string; message: string }>(
      `${BASE}/ledger/${chargeId}/waive`, { reason });
  },

  actions() {
    return apiRequest<ActionQueue>(`${BASE}/actions`);
  },

  // ---- audit ----
  audit(filters: {
    search?: string; action?: string; actorUserId?: string; entityId?: string;
    severity?: number; from?: string; to?: string; pageIndex?: number; pageSize?: number;
  }) {
    return apiRequest<AuditPage>(`${BASE}/audit?${queryString(filters)}`);
  },
};
