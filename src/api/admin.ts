/** The admin console's wire contract — mirrors ApiVacancy.Application/Admin/DTOs. */
import { ApiError, apiRequest, config, loadSession, setSession, type Session } from './client';
import { securePost, type AdminDevice } from './secure';

const BASE = '/api/v1/secure/admin/console';
const DASHBOARD = '/api/v1/secure/admin/dashboard';
const ADVERTS = '/api/v1/secure/admin/adverts';
const AUTH = '/api/v1/admin/session';
const CONTACT = '/api/v1/secure/admin/contact-messages';
const THREATS = '/api/v1/secure/admin/threats';

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
  // Flags. Within a family they are OR — any ticked condition qualifies somebody. Families
  // are AND with each other, the same as every condition above them.
  profileGaps: number;
  signInRisks: number;
  riskWithinDays: number | null;
  learnerStates: number;
  learnerSkillId: string | null;
  learnerSkillName: string | null;
  jobSeekerStates: number;
  describes: string; reachableNow: number;
  createdByName: string; createdAt: string; lastUsedAt: string | null; useCount: number;
};

/**
 * The four condition families, with the words an operator reads.
 *
 * The bit values are the server's enums and the labels are the console's — kept side by side
 * so a new condition is added once. `warn` marks the one family whose audience must never be
 * sent a promotion: somebody who has just had a suspicious sign-in is owed a "was this you?",
 * not an offer.
 *
 * `chip` is the same family in two or three words. The editor has room for a sentence; a pill
 * on a card does not, and a pill cannot wrap — so a family summarised only by its `label`
 * pushes the whole page sideways on a narrow window.
 */
export const SEGMENT_FAMILIES = {
  profileGaps: {
    label: 'Providers who have not finished setting up',
    chip: 'Unfinished profile',
    hint: 'Any ticked gap is enough. Only ever applies to people who have a provider profile.',
    options: [
      { bit: 1, label: 'No skills listed', hint: 'Invisible in search until they add one.' },
      { bit: 2, label: 'No photo' },
      { bit: 4, label: 'No bio' },
      { bit: 8, label: 'No approved document', hint: 'Pending and rejected both count as missing.' },
      { bit: 16, label: 'Not verified' },
    ],
  },
  signInRisks: {
    label: 'Accounts with a sign-in worth asking about',
    chip: 'Sign-in risk',
    hint: 'Read from the security journal. Send these a “was this you?” — never a promotion.',
    warn: true,
    options: [
      { bit: 1, label: 'From a new device' },
      { bit: 2, label: 'From a new network or country' },
      { bit: 4, label: 'Too far from the last sign-in' },
      { bit: 8, label: 'After repeated failures' },
      { bit: 16, label: 'At an unusual hour' },
    ],
  },
  learnerStates: {
    label: 'Padi Academy',
    chip: 'Academy',
    hint: 'Optionally narrowed to one subject below.',
    options: [
      { bit: 1, label: 'Started a course', hint: 'At least one lesson done, not finished.' },
      { bit: 2, label: 'Finished a course' },
      { bit: 4, label: 'Gave up on one', hint: 'Started, then quiet for two weeks.' },
    ],
  },
  jobSeekerStates: {
    label: 'Looking for work',
    chip: 'Looking for work',
    options: [
      { bit: 1, label: 'Applied and never been picked' },
      { bit: 2, label: 'Never applied for anything' },
      { bit: 4, label: 'Never finished signing up' },
      { bit: 8, label: 'No work near them in their trade', hint: 'A demand problem before it is an audience.' },
    ],
  },
} as const;

export type SegmentFamilyKey = keyof typeof SEGMENT_FAMILIES;

/** Somebody paying to be seen. The order, not the advert it becomes. */
export type Promo = {
  id: string;
  subject: number; subjectId: string | null;
  headline: string; body: string | null; imageUrl: string | null; ctaLabel: string | null;
  tier: number; tierName: string;
  audience: number; targetCity: string | null; durationDays: number;
  priceAmount: number; currencyCode: string; pointsCost: number;
  paymentMethod: number;
  /** 1 draft · 2 awaiting payment · 3 pending review · 4 running · 5 rejected · 6 finished · 7 cancelled */
  status: number; statusName: string; nextStep: string;
  rejectionReason: string | null;
  startsAt: string | null; endsAt: string | null; paidAt: string | null;
  ownerName: string; ownerUserId: string; dateCreated: string;
  impressions: number; clicks: number;
};

export const PROMO_STATUS = {
  draft: 1, awaitingPayment: 2, pendingReview: 3, running: 4,
  rejected: 5, finished: 6, cancelled: 7,
} as const;

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

/* ---------- the engine's own health ---------- */

/**
 * What the sending machine actually did, as opposed to what it was asked to do.
 *
 * Every state below is exclusive and they add up to `written`, so a screen that renders them
 * can be checked against itself. Rates are nullable on purpose — "0%" and "there was nothing
 * to divide by" look identical and mean opposite things.
 */
export type EngineFunnel = {
  written: number; pushed: number; opened: number;
  muted: number; skipped: number; failed: number; pending: number;
  pushRatePercent: number | null; openRatePercent: number | null;
};

export type EngineDay = { day: string; written: number; pushed: number; opened: number; failed: number };

export type EngineType = {
  type: string; label: string; written: number; pushed: number; opened: number;
  openRatePercent: number | null;
};

export type EngineFault = { reason: string; count: number; meaning: string; lastSeen: string };

export type EngineReach = {
  peopleWithDevice: number; activePeople: number; percent: number | null;
  peopleMutingSomething: number; note: string;
};

export type EngineWorkload = {
  savedAudiences: number; scheduled: number;
  promosAwaitingPayment: number; promosAwaitingReview: number; promosRunning: number;
  advertsRunning: number;
};

export type EngineSend = {
  id: string; title: string; sentAt: string | null; actorName: string; segmentName: string | null;
  recipientCount: number; deliveredCount: number; emailedCount: number;
  openedCount: number; openRatePercent: number | null; status: string;
};

export type NotificationEngine = {
  funnel: EngineFunnel;
  days: EngineDay[];
  topTypes: EngineType[];
  faults: EngineFault[];
  reach: EngineReach;
  workload: EngineWorkload;
  recentSends: EngineSend[];
  windowDays: number;
  verdict: string;
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

/* ---------- Vacancy Health: medical credentials ---------- */

/** The demo directory's ledger: how many stage actors are live, and what a seed or wipe just did. */
/** One facility as the desk sees it — everything a person needs to decide. */
export type AdminFacilityRow = {
  id: string;
  name: string;
  alsoKnownAs?: string | null;
  kind: string;
  ownership: string;
  level: string;
  status: string;
  city?: string | null;
  province?: string | null;
  area?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  phone?: string | null;
  emergencyPhone?: string | null;
  ambulancePhone?: string | null;
  open24Hours: boolean;
  hasEmergency: boolean;
  freeCareForMothersAndUnder5s: boolean;
  verified: boolean;
  confirmedAt?: string | null;
  /** "Checked 3 weeks ago", "Nobody has checked this". The reviewer's own prompt. */
  freshness: string;
  isStale: boolean;
  sourceNote?: string | null;
  serviceCount: number;
  openReports: number;
  claimPending: boolean;
  claimedByName?: string | null;
  claimedByEmail?: string | null;
  claimedAt?: string | null;
};

export type AdminFacilityList = {
  items: AdminFacilityRow[];
  totalCount: number;
  drafts: number;
  unverified: number;
  stale: number;
  openReports: number;
  pendingClaims: number;
};

export type AdminFacilityReport = {
  id: string;
  facilityId: string;
  facilityName: string;
  kind: string;
  kindLabel: string;
  what: string;
  status: string;
  reportedByName?: string | null;
  reportedAt: string;
  reviewedAt?: string | null;
  reviewNote?: string | null;
};

export type ImportFacilitiesResult = {
  dryRun: boolean;
  added: number;
  updated: number;
  skipped: number;
  notes: string[];
  rules: string[];
};

export type DemoHealthStatus = {
  demoProfessionals: number;
  seededNow: number;
  removedRows: number;
};

export type MedicalReviewRow = {
  id: string;
  providerProfileId: string;
  providerName: string;
  city: string | null;
  profession: number;
  professionLabel: string;
  specialtyText: string | null;
  licenseNumber: string;
  licensingBody: string;
  documentUrl: string;
  supportingDocumentUrl: string | null;
  status: number;
  submittedAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
  reviewedByName: string | null;
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

export type AmbassadorRow = {
  userId: string; name: string; email?: string | null; phoneNumber?: string | null;
  code?: string | null; invited: number; invitedProviders: number;
  invitedLast30Days: number; lastInviteAt?: string | null; joinedAt: string;
};

export type AmbassadorsPage = {
  rows: AmbassadorRow[]; totalAttributedSignups: number;
  attributedLast30Days: number; activeReferrers: number;
};

export type AdminPaymentRow = {
  id: string; bookingId: string; providerName: string; customerName: string;
  customerPhone?: string | null; amount: number; currencyCode: string;
  status: number; statusName: string; method: number; payToNumber?: string | null;
  customerMarkedPaidAt?: string | null; customerReference?: string | null;
  providerConfirmedAt?: string | null; disputedAt?: string | null; disputeNote?: string | null;
  dateCreated: string;
};

export type AdminPaymentsPage = {
  rows: AdminPaymentRow[]; disputedCount: number; awaitingCount: number;
  settledTotal: number; notice: string;
};

export type DependencyStatus = { name: string; state: number; latencyMs: number; detail: string };

export type GoldenSignals = {
  requests: number; requestsPerMinute: number; errors: number; errorRatePercent: number;
  medianMs: number; p95Ms: number; p99Ms: number; slowRequests: number;
  cpuPercent: number; workingSetMb: number; threadPoolQueue: number;
  dbConnections: number; dbMaxConnections: number;
};

export type ServiceObjective = {
  name: string; description: string; targetPercent: number; actualPercent: number;
  budgetRemainingPercent: number; goodEvents: number; totalEvents: number; breaching: boolean;
};

export type Anomaly = {
  metric: string; summary: string; current: number; typicalForThisHour: number;
  sigma: number; severity: number;
};

export type TableHealth = { name: string; size: string; sequentialScans: number; indexScans: number; liveRows: number; deadRows: number };
export type IndexHealth = { name: string; table: string; size: string };
export type SlowStatement = { statement: string; calls: number; totalMs: number; meanMs: number };

export type DatabaseHealth = {
  cacheHitPercent: number; connections: number; maxConnections: number;
  rollbackPercent: number; deadlocks: number; tempBytes: number;
  longestTransactionSeconds: number; databaseSize: string; deadTuples: number;
  largestTables: TableHealth[]; unusedIndexes: IndexHealth[];
  /** Null when pg_stat_statements is not installed — not the same as "no slow queries". */
  slowStatements: SlowStatement[] | null;
  note: string | null;
};

export type Recommendation = { title: string; detail: string; area: string; priority: number; evidence: string };
export type AiAnalysis = { available: boolean; headline: string; recommendations: Recommendation[]; generatedAt: string; unavailable: string | null };

export type OpsPoint = { at: string; requests: number; errors: number; p95Ms: number; cpuPercent: number; workingSetMb: number; threadPoolQueue: number };

export type MissionControl = {
  generatedAt: string;
  windowHours: number;
  /** 0 healthy, 1 degraded, 2 down. */
  overallState: number;
  headline: string;
  uptimeSeconds: number;
  signals: GoldenSignals;
  dependencies: DependencyStatus[];
  objectives: ServiceObjective[];
  anomalies: Anomaly[];
  database: DatabaseHealth;
  series: OpsPoint[];
  topEndpoints: EndpointStat[];
  droppedLogRows: number;
};

export type LogRow = {
  id: string;
  correlationId: string;
  occurredAt: string;
  method: string;
  path: string;
  routeTemplate: string | null;
  statusCode: number;
  durationMs: number;
  isSlow: boolean;
  /** 0 information, 1 warning, 2 error. */
  level: number;
  userId: string | null;
  userName: string | null;
  ipAddress: string | null;
  exceptionType: string | null;
  exceptionMessage: string | null;
};

export type LogPage = {
  items: LogRow[];
  totalCount: number;
  pageIndex: number;
  pageSize: number;
  totalPages: number;
};

export type LogDetail = {
  row: LogRow;
  exceptionStack: string | null;
  userAgent: string | null;
  /** Everything else that carried the same correlation id, in order. */
  sameCorrelation: LogRow[];
};

export type EndpointStat = {
  routeTemplate: string;
  method: string;
  requests: number;
  errors: number;
  errorRate: number;
  medianMs: number;
  p95Ms: number;
  maxMs: number;
  /** requests x median. What decides where an afternoon is worth spending. */
  totalMs: number;
};

export type TrafficPoint = { hour: string; requests: number; errors: number; slow: number };

export type LogOverview = {
  hours: number;
  requests: number;
  errors: number;
  slow: number;
  errorRate: number;
  medianMs: number;
  p95Ms: number;
  /** Non-zero means the log queue overflowed and these numbers are incomplete. */
  droppedRows: number;
  slowestEndpoints: EndpointStat[];
  mostErrors: EndpointStat[];
  traffic: TrafficPoint[];
};

export type ClientErrorRow = {
  id: string;
  platform: string;
  appVersion: string | null;
  deviceInfo: string | null;
  screen: string | null;
  message: string;
  stack: string | null;
  correlationId: string | null;
  userId: string | null;
  userName: string | null;
  occurredAt: string;
  acknowledged: boolean;
  occurrences: number;
};

export type ClientErrorPage = {
  items: ClientErrorRow[];
  totalCount: number;
  pageIndex: number;
  pageSize: number;
  totalPages: number;
};

/** A customer standing, as the app shows it to a provider. */
export type CustomerStanding = {
  customerUserId: string;
  customerName: string;
  label: string;
  summary: string;
  completedBookings: number;
  cancelledLate: number;
  noShowsReported: number;
  ratingCount: number;
  rating: number | null;
  ratingVisible: boolean;
  signals: string[];
};

/**
 * One rating with the note attached.
 *
 * The note is visible here and NOWHERE else in the product - not to the customer, not to
 * another provider. That is what makes it honest enough to settle a dispute on.
 */
export type AdminCustomerRating = {
  id: string;
  providerName: string;
  bookingId: string;
  rating: number;
  showedUp: boolean;
  paidAsAgreed: boolean;
  respectful: boolean;
  note: string | null;
  voided: boolean;
  voidReason: string | null;
  dateCreated: string;
};

export type AdminCustomerStanding = {
  standing: CustomerStanding;
  ratings: AdminCustomerRating[];
};

/** One language, how many rows it has, how many are translated, and how many are live. */
export type LanguageSummary = {
  locale: string;
  name: string;
  total: number;
  translated: number;
  approved: number;
  percent: number;
};

/** One English string and what somebody made of it. */
export type PhraseRow = {
  id: string;
  phraseKey: string;
  sourceText: string;
  translatedText: string | null;
  approved: boolean;
  updatedByName: string | null;
  dateUpdated: string | null;
};

export type PhrasePage = {
  locale: string;
  name: string;
  total: number;
  translated: number;
  approved: number;
  percent: number;
  pageIndex: number;
  pageSize: number;
  totalPages: number;
  items: PhraseRow[];
};

export type SpotlightRow = {
  id: string; kind: string; targetId: string;
  headline: string | null; tagline: string | null; badge: string | null;
  sortOrder: number; enabled: boolean;
  startsAt: string | null; endsAt: string | null; liveNow: boolean;
  targetTitle: string; targetSubtitle: string | null; targetImageUrl: string | null;
  dateCreated: string;
};

export type SpotlightTarget = { id: string; title: string; subtitle: string | null; imageUrl: string | null };

export type SpotlightUpsert = {
  kind: string; targetId: string; headline?: string | null; tagline?: string | null; badge?: string | null;
  sortOrder: number; startsAt?: string | null; endsAt?: string | null; enabled: boolean;
};

export type SupportInboxRow = {
  threadId: string; userId: string; userName: string; userEmail?: string | null;
  lastMessage: string; lastFromAdmin: boolean; lastMessageAt: string;
};

export type SupportChatMessage = {
  id: string; isFromAdmin: boolean; senderName: string; body: string; dateCreated: string;
};

export type SupportChatThread = { threadId: string; messages: SupportChatMessage[] };

// ---- the threat centre --------------------------------------------------------------------
//
// Mirrors ApiPadiLink.Application/Security/DTOs. Note what is NOT in these types: there is no
// email address anywhere, because the API never stored one — accounts arrive already masked.

export type ThreatBandSlice = { band: string; count: number };

export type ThreatNetworkRow = {
  ipAddress: string;
  ipPrefix: string;
  score: number;
  failedLogins: number;
  successfulLogins: number;
  blockedRequests: number;
  country: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  hasRule: boolean;
  notes: string | null;
};

export type ThreatAccountRow = {
  accountMasked: string;
  userId: string | null;
  failures: number;
  lastAttemptAt: string;
};

export type SecurityEventRow = {
  id: string;
  occurredAt: string;
  kind: number;
  kindLabel: string;
  severity: number;
  severityLabel: string;
  title: string;
  detail: string | null;
  userId: string | null;
  userName: string | null;
  ipAddress: string | null;
  ipPrefix: string;
  country: string | null;
  deviceLabel: string | null;
  userAgent: string | null;
  riskScore: number;
  acknowledged: boolean;
  acknowledgedBy: string | null;
  correlationId: string | null;
  visibleToUser: boolean;
};

export type SecurityEventPage = {
  items: SecurityEventRow[];
  totalCount: number;
  pageIndex: number;
  pageSize: number;
  totalPages: number;
};

export type LoginAttemptRow = {
  id: string;
  occurredAt: string;
  accountMasked: string;
  userId: string | null;
  succeeded: boolean;
  failureReason: string | null;
  method: string;
  ipAddress: string | null;
  ipPrefix: string;
  country: string | null;
  clientKind: string | null;
  riskScore: number;
  riskBand: string;
  riskReasons: string | null;
  outcome: number;
  outcomeLabel: string;
};

export type LoginAttemptPage = {
  items: LoginAttemptRow[];
  totalCount: number;
  pageIndex: number;
  pageSize: number;
  totalPages: number;
};

export type ThreatOverview = {
  hours: number;
  attempts: number;
  failures: number;
  blocked: number;
  distinctAccountsTargeted: number;
  distinctNetworks: number;
  bands: ThreatBandSlice[];
  openAlerts: number;
  criticalAlerts: number;
  activeRules: number;
  automaticRules: number;
  worstNetworks: ThreatNetworkRow[];
  mostTargetedAccounts: ThreatAccountRow[];
  latestAlerts: SecurityEventRow[];
  geoAvailable: boolean;
  geoNote: string;
  retentionNote: string;
};

export type NetworkRuleRow = {
  id: string;
  kind: number;
  kindLabel: string;
  value: string;
  action: number;
  actionLabel: string;
  scope: number;
  scopeLabel: string;
  reason: string;
  expiresAt: string | null;
  expired: boolean;
  autoCreated: boolean;
  hitCount: number;
  lastHitAt: string | null;
  createdByName: string | null;
  dateCreated: string;
};

export type SecurityActionResult = { succeeded: boolean; message: string };

/** Who is doing what — rolled up from the request log, one row per subject per hour. */
export type ActivitySubjectRow = {
  subjectKind: number;
  subjectKindLabel: string;
  subjectKey: string;
  userId: string | null;
  label: string;
  hours: number;
  requests: number;
  peakScore: number;
  peakBand: string;
  reasons: string | null;
  explained: string[];
  denials: number;
  notFound: number;
  downloads: number;
  messagesSent: number;
  applicationsSent: number;
  distinctDetailTargets: number;
  peakCadence: number;
  firstHourAt: string;
  lastHourAt: string;
};

export type ActivityPage = {
  items: ActivitySubjectRow[];
  totalCount: number;
  pageIndex: number;
  pageSize: number;
  totalPages: number;
};

export type ActivityHourRow = {
  hourStartedAt: string;
  requests: number;
  reads: number;
  writes: number;
  failures: number;
  denials: number;
  notFound: number;
  serverErrors: number;
  slowRequests: number;
  distinctRoutes: number;
  detailViews: number;
  distinctDetailTargets: number;
  downloads: number;
  messagesSent: number;
  applicationsSent: number;
  searchRequests: number;
  distinctNetworks: number;
  distinctDevices: number;
  distinctAccounts: number;
  medianGapMs: number;
  cadence: number;
  behaviourScore: number;
  band: string;
  explained: string[];
};

export type ActivityDetail = {
  subject: ActivitySubjectRow;
  hours: ActivityHourRow[];
  recentSignIns: LoginAttemptRow[];
  events: SecurityEventRow[];
};

/**
 * One identity case, as a reviewer sees it.
 *
 * The two URLs are the point. This queue used to exist and be undrainable: a name that did
 * not match set somebody UnderReview and kept no document, so a reviewer opened a case and
 * saw a name and nothing else. A review queue you cannot review is worse than none — it
 * looks like diligence and is not.
 */
export type IdentityCase = {
  id: string;
  userId: string;
  personName: string;
  documentName?: string | null;
  nameMatched: boolean;
  faceMatched: boolean;
  faceConfidence: number;
  doubt: string;
  doubtLabel: string;
  documentExpiresAt?: string | null;
  raisedAt: string;
  documentUrl?: string | null;
  selfieUrl?: string | null;
};

/**
 * One vouch a machine would not verify alone, as a reviewer sees it. The two URLs are the
 * evidence; the doubt is the machine's own reading of what did not line up.
 */
/**
 * One thing the nightly sweep noticed: the same ID on two accounts, one phone on six, a
 * customer reviewing one provider five times in a month, two people reviewing each other,
 * a medical skill with no licence, a price four times everyone else's. A signal is a
 * question, never a verdict — the evidence is attached so a person can answer it.
 */
export type TrustSignal = {
  id: string;
  /** 1 shared ID · 2 shared device · 3 review cluster · 4 mutual reviews · 5 unbacked medical claim · 6 price outlier */
  kind: number;
  kindLabel: string;
  /** 1 low · 2 medium · 3 high */
  severity: number;
  severityLabel: string;
  /** 1 open · 2 dismissed · 3 actioned */
  status: number;
  statusLabel: string;
  userId?: string | null;
  userName?: string | null;
  summary: string;
  /** The accounts, reviews or listings behind it, as the sweep found them. */
  evidenceJson: string;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
  handledAt?: string | null;
  handlingNote?: string | null;
};

export type TrustSignalSweep = { open: number; written: number; updated: number; sweptAt: string };

export type VouchCase = {
  id: string;
  providerName: string;
  kind: number;
  kindLabel: string;
  fullName: string;
  relationship: string;
  organisation?: string | null;
  idName?: string | null;
  nameMatched: boolean;
  faceMatched: boolean;
  faceConfidence: number;
  doubt: string;
  doubtLabel: string;
  idExpiresAt?: string | null;
  raisedAt: string;
  photoUrl?: string | null;
  documentUrl?: string | null;
};

export const adminApi = {
  // ---- who is bringing people in ----
  ambassadors() {
    return apiRequest<AmbassadorsPage>(`${DASHBOARD}/ambassadors`);
  },
  // ---- the money loop (read-only) ----
  payments(state: string) {
    return apiRequest<AdminPaymentsPage>(`${DASHBOARD}/payments?state=${id(state)}`);
  },
  // ---- the Discover stage ----
  spotlights() {
    return apiRequest<SpotlightRow[]>(`${DASHBOARD}/spotlights`);
  },
  spotlightSearch(kind: string, q: string) {
    return apiRequest<SpotlightTarget[]>(`${DASHBOARD}/spotlights/search?kind=${id(kind)}&q=${id(q)}`);
  },
  spotlightCreate(body: SpotlightUpsert) {
    return apiRequest<SpotlightRow>(`${DASHBOARD}/spotlights`, { method: 'POST', body });
  },
  spotlightUpdate(spotlightId: string, body: SpotlightUpsert) {
    return apiRequest<SpotlightRow>(`${DASHBOARD}/spotlights/${id(spotlightId)}`, { method: 'PUT', body });
  },
  spotlightDelete(spotlightId: string) {
    return apiRequest<boolean>(`${DASHBOARD}/spotlights/${id(spotlightId)}`, { method: 'DELETE' });
  },
  // ---- mission control ----
  missionControl(hours: number) {
    return apiRequest<MissionControl>(`${DASHBOARD}/mission-control?hours=${hours}`);
  },
  missionControlAnalysis(hours: number) {
    return apiRequest<AiAnalysis>(`${DASHBOARD}/mission-control/analysis?hours=${hours}`);
  },
  // ---- the logs ----
  logOverview(hours: number) {
    return apiRequest<LogOverview>(`${DASHBOARD}/logs/overview?hours=${hours}`);
  },
  logs(params: {
    search?: string; minLevel?: number; statusCode?: number; slowOnly?: boolean;
    userId?: string; correlationId?: string; hours?: number; pageIndex?: number; pageSize?: number;
  }) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '' && value !== false) {
        query.append(key, String(value));
      }
    });
    return apiRequest<LogPage>(`${DASHBOARD}/logs?${query.toString()}`);
  },
  logDetail(logId: string) {
    return apiRequest<LogDetail>(`${DASHBOARD}/logs/${id(logId)}`);
  },
  clientErrors(unacknowledgedOnly: boolean, pageIndex: number, pageSize: number) {
    return apiRequest<ClientErrorPage>(`${DASHBOARD}/client-errors?unacknowledgedOnly=${unacknowledgedOnly}&pageIndex=${pageIndex}&pageSize=${pageSize}`);
  },
  acknowledgeClientError(reportId: string) {
    return apiRequest<boolean>(`${DASHBOARD}/client-errors/${id(reportId)}/acknowledge`, { method: 'POST' });
  },
  // ---- the appeal ----
  customerStanding(userId: string) {
    return apiRequest<AdminCustomerStanding>(`${DASHBOARD}/users/${id(userId)}/customer-standing`);
  },
  voidCustomerRating(ratingId: string, reason: string) {
    return apiRequest<boolean>(`${DASHBOARD}/customer-ratings/${id(ratingId)}/void`, {
      method: 'POST',
      body: { reason },
    });
  },
  // ---- the language desk ----
  //
  // Nobody on the team writes Temne or Mende. These endpoints exist so somebody who does can
  // finish the job from a browser, and phones pick it up without a release.
  phraseLanguages() {
    return apiRequest<LanguageSummary[]>(`${DASHBOARD}/phrases`);
  },
  phrases(locale: string, q: string, untranslatedOnly: boolean, pageIndex: number, pageSize: number) {
    const query = `q=${id(q)}&untranslatedOnly=${untranslatedOnly}&pageIndex=${pageIndex}&pageSize=${pageSize}`;
    return apiRequest<PhrasePage>(`${DASHBOARD}/phrases/${id(locale)}?${query}`);
  },
  phraseSave(phraseId: string, translatedText: string | null, approved: boolean) {
    return apiRequest<PhraseRow>(`${DASHBOARD}/phrases/${id(phraseId)}`, {
      method: 'PUT',
      body: { translatedText, approved },
    });
  },
  phraseSync() {
    return apiRequest<{ added: number; total: number }>(`${DASHBOARD}/phrases/sync`, { method: 'POST' });
  },
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

  // ---- vouches: guarantors and recommenders the machine would not verify alone ----
  /** What watches the room: the sweep's signals, open by default. Needs ManageUsers. */
  trustSignals(openOnly = true) {
    return apiRequest<TrustSignal[]>(`/api/v1/secure/trust-signals?openOnly=${openOnly ? 'true' : 'false'}`);
  },
  sweepTrustSignals() {
    return apiRequest<TrustSignalSweep>('/api/v1/secure/trust-signals/sweep', { method: 'POST' });
  },
  /** 2 dismissed (reopens by itself if the signal grows) · 3 actioned. */
  handleTrustSignal(signalId: string, body: { status: 2 | 3; note?: string | null }) {
    return apiRequest<TrustSignal>(`/api/v1/secure/trust-signals/${id(signalId)}`, { method: 'POST', body });
  },
  vouchQueue() {
    return apiRequest<VouchCase[]>(`/api/v1/secure/vouch-review?origin=${encodeURIComponent(config.apiBaseUrl ?? "")}`);
  },
  decideVouch(vouchId: string, body: { approve: boolean; note?: string | null }) {
    return apiRequest<VouchCase>(`/api/v1/secure/vouch-review/${id(vouchId)}/decide`, { method: 'POST', body });
  },
  // ---- identity: the cases a machine would not decide alone ----
  identityQueue() {
    return apiRequest<IdentityCase[]>(`/api/v1/secure/identity-review?origin=${encodeURIComponent(config.apiBaseUrl ?? "")}`);
  },

  decideIdentity(checkId: string, body: { approve: boolean; note?: string | null }) {
    return apiRequest<IdentityCase>(`/api/v1/secure/identity-review/${id(checkId)}/decide`, { method: 'POST', body });
  },

  // ---- Vacancy Health: the medical verification desk ----
  medicalQueue(pendingOnly: boolean) {
    return apiRequest<MedicalReviewRow[]>(`${BASE}/medical-credentials?pendingOnly=${pendingOnly}`);
  },

  decideMedical(credentialId: string, body: { approve: boolean; note?: string | null }) {
    return apiRequest<MedicalReviewRow>(`${BASE}/medical-credentials/${id(credentialId)}/decide`, { method: 'POST', body });
  },

  // ---- the demo cast: seeded for the showroom, struck in one call for going live ----
  demoHealthStatus() {
    return apiRequest<DemoHealthStatus>(`${BASE}/demo/health`);
  },

  demoHealthSeed() {
    return apiRequest<DemoHealthStatus>(`${BASE}/demo/health/seed`, { method: 'POST' });
  },

  demoHealthClear() {
    return apiRequest<DemoHealthStatus>(`${BASE}/demo/health/clear`, { method: 'POST' });
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
  notificationEngine(days?: number) {
    return apiRequest<NotificationEngine>(`${BASE}/notification-engine${days ? `?days=${days}` : ''}`);
  },

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

  /* ---------- promos: people paying to be seen ---------- */

  promoQueue() {
    return apiRequest<Promo[]>(`/api/v1/secure/promos/queue`);
  },

  markPromoPaid(promoId: string, reference: string) {
    return apiRequest<Promo>(`/api/v1/secure/promos/${promoId}/paid`, {
      method: 'POST', body: { reference },
    });
  },

  approvePromo(promoId: string) {
    return apiRequest<Promo>(`/api/v1/secure/promos/${promoId}/approve`, { method: 'POST' });
  },

  rejectPromo(promoId: string, reason: string) {
    return apiRequest<Promo>(`/api/v1/secure/promos/${promoId}/reject`, {
      method: 'POST', body: { reason },
    });
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

  // ---- the threat centre ----
  threatOverview(hours: number) {
    return apiRequest<ThreatOverview>(`${THREATS}/overview?hours=${hours}`);
  },
  threatEvents(filters: {
    minSeverity?: number; kind?: number; userId?: string; ipPrefix?: string;
    unacknowledgedOnly?: boolean; hours?: number; pageIndex?: number; pageSize?: number;
  }) {
    return apiRequest<SecurityEventPage>(`${THREATS}/events?${queryString(filters)}`);
  },
  acknowledgeThreatEvent(eventId: string) {
    return apiRequest<string>(`${THREATS}/events/${id(eventId)}/acknowledge`, { method: 'POST' });
  },
  threatAttempts(filters: {
    account?: string; ipPrefix?: string; succeeded?: boolean; userId?: string;
    minRisk?: number; hours?: number; pageIndex?: number; pageSize?: number;
  }) {
    return apiRequest<LoginAttemptPage>(`${THREATS}/attempts?${queryString(filters)}`);
  },
  threatNetworks(minScore: number, take: number) {
    return apiRequest<ThreatNetworkRow[]>(`${THREATS}/networks?minScore=${minScore}&take=${take}`);
  },
  threatRules(includeExpired: boolean) {
    return apiRequest<NetworkRuleRow[]>(`${THREATS}/rules?includeExpired=${includeExpired}`);
  },
  saveThreatRule(body: {
    id?: string; kind: number; value: string; action: number; scope: number;
    reason: string; expiresInHours?: number | null;
  }) {
    return apiRequest<SecurityActionResult>(`${THREATS}/rules`, { method: 'POST', body });
  },
  removeThreatRule(ruleId: string) {
    return apiRequest<SecurityActionResult>(`${THREATS}/rules/${id(ruleId)}`, { method: 'DELETE' });
  },
  threatActivity(filters: {
    hours?: number; minScore?: number; subjectKind?: number; search?: string;
    pageIndex?: number; pageSize?: number;
  }) {
    return apiRequest<ActivityPage>(`${THREATS}/activity?${queryString(filters)}`);
  },
  threatActivityDetail(subjectKind: number, subjectKey: string, hours: number) {
    // NOT encodeURIComponent: a network subject key is a CIDR and the API route is a catch-all,
    // so the slash has to survive as a slash. The value is a hash or a CIDR — never free text.
    return apiRequest<ActivityDetail>(`${THREATS}/activity/${subjectKind}/${subjectKey}?hours=${hours}`);
  },

  // ---- Vacancy Health: the facility desk ----
  //
  // Every screen in the app prints "checked three weeks ago by our team". This is where a
  // person makes that sentence true, and `confirmFacility` is the only call in the platform
  // that writes a checked-on date.

  facilityQueue(params: { search?: string; status?: string; needsAttention?: boolean; skip?: number; take?: number } = {}) {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.status) query.set('status', params.status);
    query.set('needsAttention', String(params.needsAttention ?? true));
    query.set('skip', String(params.skip ?? 0));
    query.set('take', String(params.take ?? 25));
    return apiRequest<AdminFacilityList>(`${BASE}/facilities?${query.toString()}`);
  },

  confirmFacility(facilityId: string, body: { verified: boolean; note?: string | null }) {
    return apiRequest<AdminFacilityRow>(`${BASE}/facilities/${id(facilityId)}/confirm`, { method: 'POST', body });
  },

  setFacilityStatus(facilityId: string, body: { status: string; note?: string | null; mergeIntoFacilityId?: string | null }) {
    return apiRequest<AdminFacilityRow>(`${BASE}/facilities/${id(facilityId)}/status`, { method: 'POST', body });
  },

  answerFacilityClaim(facilityId: string, body: { approve: boolean; note?: string | null }) {
    return apiRequest<AdminFacilityRow>(`${BASE}/facilities/${id(facilityId)}/claim`, { method: 'POST', body });
  },

  editFacility(facilityId: string, body: Partial<AdminFacilityRow>) {
    return apiRequest<AdminFacilityRow>(`${BASE}/facilities/${id(facilityId)}`, { method: 'PUT', body });
  },

  importFacilities(body: { source: string; rows: unknown[]; dryRun: boolean }) {
    return apiRequest<ImportFacilitiesResult>(`${BASE}/facilities/import`, { method: 'POST', body });
  },

  facilityReports(openOnly: boolean) {
    return apiRequest<AdminFacilityReport[]>(`${BASE}/facilities/reports?openOnly=${openOnly}&take=100`);
  },

  resolveFacilityReport(reportId: string, body: { acted: boolean; note: string }) {
    return apiRequest<string>(`${BASE}/facilities/reports/${id(reportId)}/resolve`, { method: 'POST', body });
  },
};
