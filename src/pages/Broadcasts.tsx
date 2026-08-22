/**
 * Announcements: what was sent, to whom, by whom, and how many it reached.
 *
 * Broadcasting used to go straight to Firebase and write nothing at all, so "what did we
 * send on Tuesday and who decided that" had no answer anywhere. It also emailed everybody
 * every time without saying so. Both are corrected here: every send is a row, and email is
 * a tick rather than a side effect.
 *
 * The number that governs the screen is the preview. Sending is the only action in this
 * console with no undo, so how many people you are about to interrupt is shown before the
 * button is offered — it is the sentence that makes somebody re-read their own wording.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../theme/ThemeProvider';
import {
  Button, Card, Cell, EmptyState, ErrorNote, Field, Input, Loading, Modal, PageHeader,
  Pill, Row, Table, Textarea, Toasts, fmtDateTime, timeAgo, useToasts,
} from '../components/ui';
import { MultiSelect, Select } from '../components/Select';
import { ImageUpload } from '../components/MediaUpload';
import { Pager, Tallies, useOpsQuery } from '../components/Ops';
import {
  adminApi, SEGMENT_FAMILIES, type AdminIdentity, type AdvertScreenOption, type BroadcastPage,
  type BroadcastPreview, type BroadcastSchedule, type ScheduledBroadcast, type Segment,
  type SegmentFamilyKey,
} from '../api/admin';

/** The advert vocabulary, so an operator learns "providers" once. */
const AUDIENCES = [
  { value: '2', label: 'Customers', detail: 'People who book work — everyone who is not a provider or a company' },
  { value: '4', label: 'Providers', detail: 'People who offer work' },
  { value: '8', label: 'Companies', detail: 'Company accounts' },
];

export function Broadcasts({ identity }: { identity: AdminIdentity }) {
  const { t } = useTheme();
  const { toasts, push } = useToasts();
  const [page, setPage] = useState<BroadcastPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [schedule, setSchedule] = useState<BroadcastSchedule | null>(null);
  const [cancelling, setCancelling] = useState<ScheduledBroadcast | null>(null);
  const [managingGroups, setManagingGroups] = useState(false);
  const { query, set } = useOpsQuery();

  const load = useCallback(() => {
    adminApi.broadcasts(query)
      .then(result => { setPage(result); setError(null); })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load announcements.'));

    // Fetched alongside and allowed to fail alone: losing the waiting list must not take the
    // record of what has already gone out with it.
    adminApi.scheduled().then(setSchedule).catch(() => setSchedule(null));
  }, [query]);

  useEffect(() => {
    const timer = setTimeout(load, 240);
    return () => clearTimeout(timer);
  }, [load]);

  if (error) return <ErrorNote message={error} />;
  if (!page) return <Loading />;

  return (
    <>
      <PageHeader
        title="Announcements"
        subtitle="What has gone out to everybody's phone — and who decided it should."
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button tone="subtle" onClick={() => setManagingGroups(true)}>Saved groups</Button>
            <Button
              tone="primary"
              disabled={!identity.canManageUsers}
              onClick={() => setComposing(true)}
            >
              ＋ Write one
            </Button>
          </div>
        }
      />

      <Tallies
        items={[
          { label: 'Sent in 30 days', value: page.sent30d },
          { label: 'People reached', value: page.peopleReached30d, tone: 'info' },
        ]}
        active=""
        onPick={() => undefined}
      />

      {/* What has not happened yet, above what has. A message going out at six tomorrow is the
          thing somebody needs to see before they write another one. */}
      {schedule && schedule.waiting.length > 0 ? (
        <Card style={{ marginTop: 14, borderColor: t.warning, background: t.warningSoft }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14.5, fontWeight: 800, color: t.text }}>Waiting to go out</span>
            <Pill tone="warning">{schedule.waiting.length}</Pill>
          </div>
          <div style={{ fontSize: 12, color: t.textMuted, marginTop: 5, lineHeight: 1.6 }}>
            {schedule.verdict}
          </div>
          <div style={{ marginTop: 12 }}>
            {schedule.waiting.map(item => (
              <div
                key={item.id}
                data-waiting={item.title}
                style={{
                  display: 'flex', gap: 12, alignItems: 'baseline', padding: '9px 0',
                  borderTop: `1px solid ${t.border}`, flexWrap: 'wrap',
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 700, color: t.text, flex: '1 1 200px' }}>
                  {item.title}
                </span>
                <span style={{ fontSize: 12, color: t.textMuted, flex: '1 1 220px' }}>
                  {item.segmentName ?? item.describes}
                </span>
                <span style={{ fontSize: 12, color: t.textSubtle, minWidth: 130, textAlign: 'right' }}>
                  {/* Both, because "in 3 hours" is what a person plans around and the clock time
                      is what they check against. */}
                  {item.minutesAway <= 0 ? 'due now' : `in ${humanWait(item.minutesAway)}`} · {fmtDateTime(item.scheduledFor)}
                </span>
                <span style={{ fontSize: 12, color: t.textSubtle, minWidth: 96, textAlign: 'right' }}>
                  ~{item.reachableNow.toLocaleString()} people
                </span>
                <Button size="sm" tone="subtle" onClick={() => setCancelling(item)}>Call it off</Button>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <div style={{ maxWidth: 380, margin: '14px 0 12px' }}>
        <Input
          value={query.search ?? ''}
          onChange={value => set({ search: value, pageIndex: 1 })}
          placeholder="Heading, wording, or who sent it…"
        />
      </div>

      <Card pad={0}>
        {page.items.length === 0 ? (
          <div style={{ padding: 34 }}>
            <EmptyState
              icon="📣"
              title="Nothing has been announced"
              message="When one goes out, it is recorded here — permanently."
            />
          </div>
        ) : (
          <Table head={['What was said', 'To whom', 'How', 'Reached', 'Opened', 'Sent']}>
            {page.items.map(row => (
              <Row key={row.id}>
                <Cell>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: t.text }}>{row.title}</div>
                  <div style={{ fontSize: 12, color: t.textSubtle, marginTop: 3, maxWidth: 420, lineHeight: 1.5 }}>
                    {row.body.length > 140 ? `${row.body.slice(0, 137)}…` : row.body}
                  </div>
                  {row.failureReason ? (
                    <div style={{ fontSize: 11.5, color: t.warning, marginTop: 4 }}>
                      Some did not go out — {row.failureReason}
                    </div>
                  ) : null}
                </Cell>
                <Cell>
                  <Pill tone="info">{row.segmentName ?? row.audienceLabel}</Pill>
                  {row.segmentName ? (
                    <div style={{ fontSize: 11, color: t.textSubtle, marginTop: 3 }}>saved group</div>
                  ) : null}
                </Cell>
                <Cell>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {row.sendPush ? <Pill tone="neutral">Push</Pill> : null}
                    {row.sendEmail ? <Pill tone="warning">Email</Pill> : null}
                  </div>
                </Cell>
                <Cell>
                  <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>
                    {row.deliveredCount.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 2 }}>
                    of {row.recipientCount.toLocaleString()} addressed
                    {row.emailedCount > 0 ? ` · ${row.emailedCount.toLocaleString()} emailed` : ''}
                  </div>
                </Cell>
                <Cell>
                  {row.sentAt === null ? (
                    <span style={{ fontSize: 12, color: t.textSubtle }}>—</span>
                  ) : (
                    <div data-opened={row.openedCount}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>
                        {row.openedCount.toLocaleString()}
                      </div>
                      <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 2 }}>
                        {/* Against what was DELIVERED, and it says so. Against the audience it
                            would divide by people who never got it. */}
                        {row.openRatePercent === null
                          ? 'nothing was delivered'
                          : `${row.openRatePercent}% of those who got it`}
                      </div>
                    </div>
                  )}
                </Cell>
                <Cell>
                  <div style={{ fontSize: 12.5, color: t.text }}>
                    {row.cancelledAt
                      ? 'Called off'
                      : row.sentAt
                        ? timeAgo(row.sentAt)
                        : row.scheduledFor
                          ? `due ${fmtDateTime(row.scheduledFor)}`
                          : 'Not sent'}
                  </div>
                  {row.cancelledReason ? (
                    <div style={{ fontSize: 11, color: t.textSubtle, marginTop: 2, maxWidth: 200 }}>
                      {row.cancelledReason}
                    </div>
                  ) : null}
                  <Link
                    to={`/users/${row.actorUserId}`}
                    style={{ fontSize: 11.5, color: t.textSubtle, textDecoration: 'none' }}
                  >
                    by {row.actorName}
                  </Link>
                </Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      <Pager
        page={page}
        noun="announcements"
        onPick={pageIndex => set({ pageIndex })}
        onSize={pageSize => set({ pageSize, pageIndex: 1 })}
      />

      {composing ? (
        <Compose
          onClose={() => setComposing(false)}
          onDone={message => { push(message); load(); }}
        />
      ) : null}

      {managingGroups ? (
        <SavedGroups onClose={() => setManagingGroups(false)} onChanged={message => push(message)} />
      ) : null}

      {cancelling ? (
        <CallOff
          item={cancelling}
          onClose={() => setCancelling(null)}
          onDone={message => { push(message); setCancelling(null); load(); }}
        />
      ) : null}

      <Toasts toasts={toasts} />
    </>
  );
}

/**
 * "in 3 hours", not "in 187 minutes".
 *
 * Rounded deliberately: nobody schedules to the minute in their head, and a precise number
 * invites reading it as a promise the sweep cannot make — it runs once a minute.
 */
function humanWait(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 60 * 24) {
    const hours = Math.round(minutes / 60);
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }
  const days = Math.round(minutes / (60 * 24));
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

/**
 * Calling one off before it goes.
 *
 * Only before. The dialog says so plainly, because the instinct after a mistake is to look for
 * an undo, and there isn't one — a notification already on a thousand phones cannot be recalled
 * by anything, and a button that implied otherwise would be the most dangerous thing on this
 * screen.
 */
function CallOff({ item, onClose, onDone }: {
  item: ScheduledBroadcast; onClose: () => void; onDone: (message: string) => void;
}) {
  const { t } = useTheme();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = reason.trim().length >= 3;

  const save = () => {
    if (!ready || busy) return;
    setBusy(true); setError(null);
    adminApi.cancelScheduled(item.id, reason.trim())
      .then(() => onDone(`“${item.title}” will not go out.`))
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'That did not work.'))
      .finally(() => setBusy(false));
  };

  return (
    <Modal title="Call this off?" onClose={onClose} width={460}>
      <p style={{ color: t.textMuted, fontSize: 13, lineHeight: 1.65, marginTop: 0 }}>
        <strong style={{ color: t.text }}>{item.title}</strong> is due{' '}
        {item.minutesAway <= 0 ? 'now' : `in ${humanWait(item.minutesAway)}`}, to about{' '}
        {item.reachableNow.toLocaleString()} people. Calling it off stops it going. It stays on
        the record with your reason against it rather than disappearing.
      </p>
      <Field label="Why?" hint="Somebody will read this later wondering what happened to it.">
        <Textarea value={reason} onChange={setReason} rows={3} placeholder="The date moved." />
      </Field>
      {error ? <ErrorNote message={error} /> : null}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
        <Button tone="subtle" onClick={onClose}>Leave it</Button>
        <Button onClick={save} disabled={!ready || busy}>{busy ? 'Calling off…' : 'Call it off'}</Button>
      </div>
    </Modal>
  );
}

/**
 * The saved audiences.
 *
 * Each one shows how many people it comes to RIGHT NOW, worked out on every read. A saved count
 * would be a number that was true once, sitting beside a name promising it is true today — and
 * the whole reason a group is a definition rather than a list is that the answer moves.
 */
function SavedGroups({ onClose, onChanged }: { onClose: () => void; onChanged: (message: string) => void }) {
  const { t } = useTheme();
  const [groups, setGroups] = useState<Segment[] | null>(null);
  const [editing, setEditing] = useState<Segment | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    adminApi.segments()
      .then(result => { setGroups(result); setError(null); })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load the groups.'));
  }, []);

  useEffect(load, [load]);

  if (editing) {
    return (
      <EditGroup
        group={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onDone={message => { onChanged(message); setEditing(null); load(); }}
      />
    );
  }

  return (
    <Modal title="Saved groups" onClose={onClose} width={620}>
      <p style={{ color: t.textMuted, fontSize: 13, lineHeight: 1.65, marginTop: 0 }}>
        A group is a description, not a list of names. “Providers with no booking in thirty days”
        is worked out again every time you send to it, so somebody who got work yesterday drops
        out on their own.
      </p>

      {error ? <ErrorNote message={error} /> : null}
      {!groups ? <Loading /> : groups.length === 0 ? (
        <EmptyState
          icon="👥"
          title="No saved groups yet"
          message="Save one and it will be waiting the next time you write an announcement."
        />
      ) : (
        <div>
          {groups.map(group => (
            <div
              key={group.id}
              data-group={group.name}
              style={{ padding: '11px 0', borderTop: `1px solid ${t.border}` }}
            >
              <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: t.text, flex: 1, minWidth: 150 }}>
                  {group.name}
                </span>
                <span style={{ fontSize: 13, fontWeight: 800, color: group.reachableNow === 0 ? t.warning : t.text }}>
                  {group.reachableNow.toLocaleString()}
                </span>
                <span style={{ fontSize: 11.5, color: t.textSubtle }}>right now</span>
                <Button size="sm" tone="subtle" onClick={() => setEditing(group)}>Change</Button>
                <Button
                  size="sm"
                  tone="subtle"
                  onClick={() => adminApi.deleteSegment(group.id)
                    .then(() => { onChanged(`“${group.name}” is gone.`); load(); })
                    .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'That did not work.'))}
                >
                  Remove
                </Button>
              </div>
              {/* Generated from the conditions, never typed — so it cannot drift from what the
                  group actually does after somebody edits it. */}
              <div style={{ fontSize: 12, color: t.textMuted, marginTop: 4, lineHeight: 1.55 }}>
                {group.describes}
              </div>
              <div style={{ fontSize: 11, color: t.textSubtle, marginTop: 3 }}>
                by {group.createdByName}
                {group.useCount > 0
                  ? ` · used ${group.useCount} ${group.useCount === 1 ? 'time' : 'times'}, last ${timeAgo(group.lastUsedAt!)}`
                  : ' · never used'}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <Button tone="subtle" onClick={onClose}>Close</Button>
        <Button onClick={() => setEditing('new')}>＋ New group</Button>
      </div>
    </Modal>
  );
}

function EditGroup({ group, onClose, onDone }: {
  group: Segment | null; onClose: () => void; onDone: (message: string) => void;
}) {
  const { t } = useTheme();
  const [name, setName] = useState(group?.name ?? '');
  const [description, setDescription] = useState(group?.description ?? '');
  const [audience, setAudience] = useState(String(group?.audience ?? 4));
  const [city, setCity] = useState(group?.city ?? '');
  const [quiet, setQuiet] = useState(group?.quietForDays ? String(group.quietForDays) : '');
  const [noWork, setNoWork] = useState(group?.noWorkForDays ? String(group.noWorkForDays) : '');
  const [neverBooked, setNeverBooked] = useState(group?.neverBooked ?? false);
  // One piece of state per family, holding the OR-ed bits. Kept as numbers rather than as
  // arrays of booleans because that is exactly what goes over the wire and comes back, so
  // there is no shape to convert and get wrong in one direction only.
  const [profileGaps, setProfileGaps] = useState(group?.profileGaps ?? 0);
  const [signInRisks, setSignInRisks] = useState(group?.signInRisks ?? 0);
  const [riskDays, setRiskDays] = useState(group?.riskWithinDays ? String(group.riskWithinDays) : '');
  const [learnerStates, setLearnerStates] = useState(group?.learnerStates ?? 0);
  const [jobSeekerStates, setJobSeekerStates] = useState(group?.jobSeekerStates ?? 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = name.trim().length > 0;

  const save = () => {
    if (!ready || busy) return;
    setBusy(true); setError(null);
    adminApi.saveSegment({
      name: name.trim(),
      description: description.trim() || null,
      audience: Number(audience),
      city: city.trim() || null,
      quietForDays: quiet.trim() ? Number(quiet) : null,
      noWorkForDays: noWork.trim() ? Number(noWork) : null,
      neverBooked,
      profileGaps,
      signInRisks,
      riskWithinDays: riskDays.trim() ? Number(riskDays) : null,
      learnerStates,
      jobSeekerStates,
    }, group?.id)
      .then(saved => onDone(
        saved.reachableNow === 0
          ? `“${saved.name}” saved — but it comes to nobody right now.`
          : `“${saved.name}” saved. ${saved.reachableNow.toLocaleString()} people right now.`))
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'That did not work.'))
      .finally(() => setBusy(false));
  };

  return (
    <Modal title={group ? 'Change this group' : 'A new group'} onClose={onClose} width={520}>
      <Field label="What to call it" hint="You will be picking it off a list later.">
        <Input value={name} onChange={setName} placeholder="Providers going quiet in Bo" autoFocus />
      </Field>

      <Field label="Why it exists (optional)">
        <Textarea value={description} onChange={setDescription} rows={2}
          placeholder="For the re-engagement message we send on Fridays." />
      </Field>

      <Field label="Who">
        <Select
          value={audience}
          onChange={value => setAudience(value ?? '4')}
          options={[
            { value: '0', label: 'Everybody' },
            { value: '4', label: 'Providers' },
            { value: '2', label: 'Customers' },
            { value: '8', label: 'Companies' },
          ]}
        />
      </Field>

      <Field label="In which town (optional)" hint="Leave empty for everywhere.">
        <Input value={city} onChange={setCity} placeholder="Bo" />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Quiet for at least" hint="Days since they last opened the app.">
          <Input value={quiet} onChange={setQuiet} placeholder="30" />
        </Field>
        <Field label="No booking for at least" hint="Days since a provider last got work.">
          <Input value={noWork} onChange={setNoWork} placeholder="30" />
        </Field>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: t.text, cursor: 'pointer', margin: '4px 0 14px' }}>
        <input type="checkbox" checked={neverBooked} onChange={event => setNeverBooked(event.target.checked)} />
        Only people who have never booked anybody
      </label>

      <Family
        family="profileGaps"
        value={profileGaps}
        onChange={setProfileGaps}
      />

      <Family
        family="signInRisks"
        value={signInRisks}
        onChange={setSignInRisks}
      >
        {signInRisks > 0 ? (
          <Field label="Looking back how far" hint="Days. Thirty if you leave it empty.">
            <Input value={riskDays} onChange={setRiskDays} placeholder="30" />
          </Field>
        ) : null}
      </Family>

      <Family family="learnerStates" value={learnerStates} onChange={setLearnerStates} />
      <Family family="jobSeekerStates" value={jobSeekerStates} onChange={setJobSeekerStates} />

      <div style={{ fontSize: 11.5, color: t.textSubtle, lineHeight: 1.6, marginBottom: 12 }}>
        Every condition narrows it further. Ticking two boxes inside one group means either
        will do; conditions in different groups all have to be true. Somebody has to have a
        device that can receive a notification before any of this applies — a group can never
        reach more people than a plain announcement would.
      </div>

      {error ? <ErrorNote message={error} /> : null}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button tone="subtle" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={!ready || busy}>{busy ? 'Saving…' : 'Save it'}</Button>
      </div>
    </Modal>
  );
}

/**
 * One family of conditions, drawn from the shared definition.
 *
 * Rendered from SEGMENT_FAMILIES rather than written out per family, so a condition added on
 * the server appears here by adding one line to that map — and cannot appear in the resolver
 * and not in the console, which is the drift that makes an operator distrust the screen.
 */
function Family({ family, value, onChange, children }: {
  family: SegmentFamilyKey;
  value: number;
  onChange: (next: number) => void;
  children?: React.ReactNode;
}) {
  const { t } = useTheme();
  const definition = SEGMENT_FAMILIES[family];
  const warn = 'warn' in definition && definition.warn;

  return (
    <div style={{
      // The security family turns amber once it is in use. It is the one audience where the
      // wrong message does real damage, and a border is cheaper than a warning nobody reads.
      border: `1px solid ${warn && value > 0 ? t.warning : t.border}`,
      borderRadius: 10, padding: '11px 13px', marginBottom: 12,
      background: warn && value > 0 ? t.warningSoft : 'transparent',
    }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: t.text, marginBottom: 2 }}>
        {definition.label}
      </div>
      {'hint' in definition && definition.hint ? (
        <div style={{ fontSize: 11.5, color: t.textSubtle, lineHeight: 1.5, marginBottom: 8 }}>
          {definition.hint}
        </div>
      ) : null}

      <div style={{ display: 'grid', gap: 6 }}>
        {definition.options.map(option => {
          const on = (value & option.bit) !== 0;
          return (
            <label
              key={option.bit}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13, color: t.text, cursor: 'pointer' }}
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() => onChange(on ? value & ~option.bit : value | option.bit)}
                style={{ marginTop: 2 }}
              />
              <span>
                {option.label}
                {'hint' in option && option.hint ? (
                  <span style={{ display: 'block', fontSize: 11, color: t.textSubtle, lineHeight: 1.45 }}>
                    {option.hint}
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>

      {children}
    </div>
  );
}

/* ---------------- writing one ---------------- */

function Compose({ onClose, onDone }: { onClose: () => void; onDone: (message: string) => void }) {
  const { t } = useTheme();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audiences, setAudiences] = useState<string[]>([]);
  const [city, setCity] = useState('');
  const [sendPush, setSendPush] = useState(true);
  const [sendEmail, setSendEmail] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [ctaLabel, setCtaLabel] = useState('');
  const [ctaRoute, setCtaRoute] = useState('');
  const [screens, setScreens] = useState<AdvertScreenOption[]>([]);
  const [brief, setBrief] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [draftNote, setDraftNote] = useState<string | null>(null);
  const [preview, setPreview] = useState<BroadcastPreview | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<Segment[]>([]);
  const [segmentId, setSegmentId] = useState<string>('');
  // Held as a local datetime-local string. Converted to an instant only on send, because the
  // operator is thinking in Freetown time and the API thinks in UTC.
  const [when, setWhen] = useState('');

  // Zero means everyone, which is what the flags enum says and what somebody expects when
  // they leave the field alone.
  const audience = audiences.reduce((sum, value) => sum + Number(value), 0);
  const chosenGroup = groups.find(group => group.id === segmentId) ?? null;
  const draft = {
    title: title.trim(),
    body: body.trim(),
    audience,
    city: city.trim() || null,
    segmentId: segmentId || null,
    // Sent as an instant. datetime-local has no zone, so it is read as the operator's own
    // clock — which is what they meant when they typed it.
    scheduledFor: when ? new Date(when).toISOString() : null,
    sendPush,
    sendEmail,
    imageUrl,
    // A button with no destination is a button that does nothing, and a destination with no
    // wording is a button nobody can read. Either half alone is dropped.
    ctaLabel: ctaRoute.trim() ? (ctaLabel.trim() || 'Open') : null,
    ctaRoute: ctaRoute.trim() || null,
  };

  // Re-counted whenever the audience changes, not on a button — the number is the point,
  // and a number you have to ask for is a number nobody looks at.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      adminApi.previewBroadcast({ ...draft, title: 'preview', body: 'preview' })
        .then(result => { if (!cancelled) setPreview(result); })
        .catch(() => { if (!cancelled) setPreview(null); });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audience, city]);

  // The same list the advert composer offers, so "where does this button go" has one
  // answer across the console rather than a free-text box people mistype.
  useEffect(() => {
    adminApi.advertScreens().then(setScreens).catch(() => setScreens([]));
    adminApi.segments().then(setGroups).catch(() => setGroups([]));
  }, []);

  // Writes into the two boxes and stops. Nothing here sends, and the operator has to read
  // what appeared before the send button will even enable — which is the same guard as before,
  // doing double duty.
  const draftIt = () => {
    if (brief.trim().length < 3 || drafting) return;
    setDrafting(true);
    setDraftNote(null);
    adminApi.draft('announcement', brief.trim())
      .then(result => {
        if (result.unavailable) { setDraftNote(result.unavailable); return; }
        if (result.title) setTitle(result.title);
        setBody(result.body);
        setDraftNote('Drafted. Read it before you send it — it has not seen your audience.');
      })
      .catch((caught: unknown) => setDraftNote(caught instanceof Error ? caught.message : 'That did not work.'))
      .finally(() => setDrafting(false));
  };

  // A saved group brings its own count, worked out by the API when it was listed. The plain
  // preview only knows about the audience flags, so it would say the wrong number here.
  const reachable = chosenGroup?.reachableNow ?? preview?.reachable ?? 0;
  const ready = title.trim().length >= 3 && body.trim().length >= 10
    && (sendPush || sendEmail) && reachable > 0;

  const send = () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    adminApi.sendBroadcast(draft)
      .then(result => {
        onDone(result.scheduledFor
          ? `“${result.title}” is set for ${fmtDateTime(result.scheduledFor)}. Nothing has gone out yet.`
          : `Sent to ${result.deliveredCount.toLocaleString()} people.`);
        onClose();
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'That did not work.'))
      .finally(() => { setBusy(false); setConfirming(false); });
  };

  if (confirming) {
    return (
      <Modal
        title={when ? 'Set this to go out later?' : 'Send this to everyone chosen?'}
        onClose={() => setConfirming(false)}
        width={560}
      >
        <div style={{
          background: t.warningSoft, border: `1px solid ${t.warning}`, borderRadius: 11,
          padding: '14px 16px', marginBottom: 16,
        }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: t.text, lineHeight: 1.2 }}>
            {reachable.toLocaleString()} people
          </div>
          <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 4, lineHeight: 1.6 }}>
            {when
              ? `will get this on their phone${sendEmail ? ' and by email' : ''} at `
                + `${fmtDateTime(new Date(when).toISOString())}, give or take a minute. You can call it `
                + 'off any time before then. After it goes, nothing can call it back.'
              : `will get this on their phone${sendEmail ? ' and by email' : ''}. There is no undo, and `
                + 'no way to edit it afterwards.'}
          </div>
          {when && chosenGroup ? (
            <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 7, lineHeight: 1.55 }}>
              That count is who “{chosenGroup.name}” comes to now. The group is worked out again
              when the message goes, so the real number will be whatever it is then.
            </div>
          ) : null}
        </div>

        {/* Both halves, because they are not the same thing. The banner is what interrupts
            somebody; the page is what they read if the banner worked. Reviewing only one of
            them is how an announcement goes out with a headline that makes no sense alone. */}
        <div style={{ display: 'flex', gap: 14, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px', minWidth: 200 }}>
            <PreviewLabel>On the lock screen</PreviewLabel>
            <LockScreenPreview title={title.trim()} body={body.trim()} />
          </div>
          <div style={{ flex: '1 1 220px', minWidth: 200 }}>
            <PreviewLabel>After they tap it</PreviewLabel>
            <PhonePreview
              title={title.trim()}
              body={body.trim()}
              imageUrl={imageUrl}
              ctaLabel={ctaRoute.trim() ? (ctaLabel.trim() || 'Open') : null}
            />
          </div>
        </div>

        {error ? <div style={{ marginBottom: 12 }}><ErrorNote message={error} /></div> : null}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button tone="subtle" onClick={() => setConfirming(false)}>Back to editing</Button>
          <Button tone={when ? 'primary' : 'danger'} disabled={busy} onClick={send}>
            {busy ? (when ? 'Setting it…' : 'Sending…') : when ? 'Set it' : 'Send it'}
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Write an announcement" onClose={onClose} width={560}>
      {/* Above the fields it fills in, so it reads as a starting point rather than a
          replacement for writing something. */}
      <div style={{
        border: `1px dashed ${t.borderStrong}`, borderRadius: 12, padding: '12px 14px', marginBottom: 16,
      }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: t.text, marginBottom: 7 }}>
          Not sure how to word it?
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <Input
              value={brief}
              onChange={setBrief}
              placeholder="Say roughly what you mean — e.g. app down sunday 2am for server move"
              onEnter={draftIt}
            />
          </div>
          <Button tone="subtle" disabled={drafting || brief.trim().length < 3} onClick={draftIt}>
            {drafting ? 'Writing…' : '✦ Draft it'}
          </Button>
        </div>
        {draftNote ? (
          <div style={{ fontSize: 11.5, color: t.textMuted, marginTop: 8, lineHeight: 1.55 }}>{draftNote}</div>
        ) : null}
      </div>

      <Field label="Heading" hint="What shows on the lock screen. Short enough to read at a glance.">
        <Input value={title} onChange={setTitle} placeholder="e.g. Scheduled maintenance on Sunday" />
      </Field>

      <Field label="The message">
        <Textarea
          value={body}
          onChange={setBody}
          placeholder="e.g. The app will be unavailable between 2am and 4am while we move servers."
          rows={4}
        />
      </Field>

      {/* A saved group, if there is one. Offered above the plain audience because picking one
          replaces the whole choice — showing both as equals invites setting them to disagree. */}
      {groups.length > 0 ? (
        <Field
          label="A saved group"
          hint="Optional. Picking one replaces the audience below — it is worked out fresh when the message goes."
        >
          <Select
            value={segmentId}
            onChange={value => setSegmentId(value ?? '')}
            options={groups.map(group => ({
              value: group.id,
              label: `${group.name} — about ${group.reachableNow.toLocaleString()} people`,
            }))}
            placeholder="No — choose the audience below"
            clearable
            clearLabel="No — choose the audience below"
          />
          {chosenGroup ? (
            <div data-chosen-group={chosenGroup.name} style={{
              fontSize: 12, color: t.textMuted, marginTop: 8, lineHeight: 1.6,
              background: t.surfaceMuted, borderRadius: 10, padding: '10px 12px',
            }}>
              {chosenGroup.describes}
            </div>
          ) : null}
        </Field>
      ) : null}

      {!chosenGroup ? (
        <>
          <Field label="Who gets it" hint="Leave empty for everybody.">
            <MultiSelect
              values={audiences}
              onChange={setAudiences}
              options={AUDIENCES}
              placeholder="Everybody"
              summary={values => values.length === 0 ? 'Everybody'
                : AUDIENCES.filter(option => values.includes(option.value)).map(option => option.label).join(' and ')}
            />
          </Field>

          <Field label="Only in one city" hint="Optional. Matches the city on a provider's profile.">
            <Input value={city} onChange={setCity} placeholder="e.g. Bo" />
          </Field>
        </>
      ) : null}

      {/* When. Empty means now, which is what the button already said it meant. */}
      <Field
        label="When to send it"
        hint="Leave empty to send it now. The audience is worked out at the moment it goes, not now."
      >
        <input
          type="datetime-local"
          data-when
          value={when}
          onChange={event => setWhen(event.target.value)}
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 10,
            border: `1px solid ${t.border}`, background: t.surface, color: t.text,
            fontSize: 14, fontFamily: 'inherit', outline: 'none',
          }}
        />
        {when ? (
          <div style={{ fontSize: 12, color: t.textMuted, marginTop: 7, lineHeight: 1.55 }}>
            Nothing goes out until then, and you can call it off any time before it does. Once it
            has gone, nothing can call it back.
          </div>
        ) : null}
      </Field>

      <Field
        label="A picture"
        hint="Optional. Shown on the announcement's page in the app, not in the notification — a lock-screen banner is two lines of text on every phone, and a thumbnail there is unreadable."
      >
        <ImageUpload imageUrl={imageUrl} onChange={setImageUrl} />
      </Field>

      <Field label="A button" hint="Optional. Where the announcement takes them next.">
        <Select
          value={ctaRoute}
          onChange={value => setCtaRoute(value ?? '')}
          options={screens.map(screen => ({ value: screen.key, label: screen.label }))}
          placeholder="Nowhere — just the message"
          clearable
          clearLabel="Nowhere — just the message"
        />
        {ctaRoute ? (
          <div style={{ marginTop: 8 }}>
            <Input value={ctaLabel} onChange={setCtaLabel} placeholder="What the button says — e.g. See the classes" />
          </div>
        ) : null}
      </Field>

      {/* The number, before the button. */}
      <div data-reach={reachable} style={{
        background: reachable === 0 ? t.warningSoft : t.surfaceMuted,
        border: `1px solid ${reachable === 0 ? t.warning : t.border}`,
        borderRadius: 11, padding: '12px 14px', margin: '2px 0 14px',
      }}>
        {chosenGroup ? (
          <>
            <div style={{ fontSize: 19, fontWeight: 800, color: reachable === 0 ? t.warning : t.text }}>
              {chosenGroup.reachableNow.toLocaleString()} people
            </div>
            <div style={{ fontSize: 12, color: t.textMuted, marginTop: 3, lineHeight: 1.55 }}>
              {chosenGroup.describes}
            </div>
            <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 5, lineHeight: 1.55 }}>
              {when
                ? 'That is who the group comes to right now. It is worked out again when the '
                  + 'message actually goes, so this number will have moved by then.'
                : 'Worked out just now. Everyone in it has a device that can receive a notification.'}
            </div>
          </>
        ) : preview === null ? (
          <div style={{ fontSize: 12.5, color: t.textSubtle }}>Counting…</div>
        ) : (
          <>
            <div style={{ fontSize: 19, fontWeight: 800, color: preview.reachable === 0 ? t.warning : t.text }}>
              {preview.reachable.toLocaleString()} of {preview.total.toLocaleString()}
            </div>
            <div style={{ fontSize: 12, color: t.textMuted, marginTop: 3, lineHeight: 1.55 }}>
              {preview.summary}
            </div>
            <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 5, lineHeight: 1.55 }}>
              Reachable means they have a device that can receive it. Everyone else is counted in
              the total and would get nothing.
            </div>
          </>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 16 }}>
        <Channel
          on={sendPush}
          onChange={setSendPush}
          title="Send it to their phone"
          detail="A push notification. This is the one people actually see."
        />
        <Channel
          on={sendEmail}
          onChange={setSendEmail}
          title="Also send it by email"
          detail="Off by default. The old announcement emailed everybody every time without saying so, which is the shortest route to being marked as spam."
        />
      </div>

      {error ? <div style={{ marginBottom: 12 }}><ErrorNote message={error} /></div> : null}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
        {/* A scheduled one HAS an undo, right up until it goes — saying "no undo" there would
            be the wrong warning, and a warning that is wrong once is one nobody reads again. */}
        <span style={{ marginRight: 'auto' }}>
          {when ? <Pill tone="warning">Can be called off until it goes</Pill> : <Pill tone="danger">No undo</Pill>}
        </span>
        <Button tone="subtle" onClick={onClose}>Cancel</Button>
        <Button tone="primary" disabled={!ready} onClick={() => setConfirming(true)}>
          {when ? 'Review and schedule' : 'Review and send'}
        </Button>
      </div>
    </Modal>
  );
}

/* ---------------- what the phone will show ---------------- */

function PreviewLabel({ children }: { children: React.ReactNode }) {
  const { t } = useTheme();
  return (
    <div style={{
      fontSize: 10.5, fontWeight: 800, letterSpacing: 0.7, textTransform: 'uppercase',
      color: t.textSubtle, marginBottom: 7,
    }}>
      {children}
    </div>
  );
}

/**
 * The banner, at the width a phone actually gives it.
 *
 * Deliberately clipped to two lines rather than shown in full: the truncation is the point.
 * An operator who can see their heading being cut mid-word rewrites it, and nobody has ever
 * rewritten a heading because a console showed it complete.
 */
function LockScreenPreview({ title, body }: { title: string; body: string }) {
  const { t } = useTheme();
  return (
    <div style={{
      background: t.surfaceMuted, border: `1px solid ${t.border}`, borderRadius: 14, padding: 11,
    }}>
      <div style={{
        background: t.surface, borderRadius: 11, padding: '9px 11px',
        border: `1px solid ${t.border}`, boxShadow: '0 1px 3px rgba(0,0,0,.08)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{
            width: 14, height: 14, borderRadius: 4, background: t.brand, display: 'inline-block',
          }} />
          <span style={{ fontSize: 9.5, fontWeight: 700, color: t.textSubtle, letterSpacing: 0.3 }}>
            VACANCY · now
          </span>
        </div>
        <div style={{
          fontSize: 12, fontWeight: 800, color: t.text, lineHeight: 1.3,
          overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical',
        }}>
          {title || 'Your heading'}
        </div>
        <div style={{
          fontSize: 11.5, color: t.textMuted, lineHeight: 1.4, marginTop: 2,
          overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}>
          {body || 'Your message'}
        </div>
      </div>
      <div style={{ fontSize: 10.5, color: t.textSubtle, marginTop: 7, lineHeight: 1.5 }}>
        Two lines is all any phone gives you. The rest is on the page.
      </div>
    </div>
  );
}

/** The page behind the tap: picture, the wording in full, and the button. */
function PhonePreview({ title, body, imageUrl, ctaLabel }: {
  title: string; body: string; imageUrl: string | null; ctaLabel: string | null;
}) {
  const { t } = useTheme();
  return (
    <div style={{
      background: t.surfaceMuted, border: `1px solid ${t.border}`, borderRadius: 14, padding: 11,
    }}>
      <div style={{
        background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, overflow: 'hidden',
      }}>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            style={{ display: 'block', width: '100%', height: 96, objectFit: 'cover' }}
          />
        ) : (
          <div style={{
            height: 40, background: t.brand, display: 'flex', alignItems: 'flex-end',
            padding: '0 10px 7px',
          }}>
            <span style={{
              fontSize: 8.5, fontWeight: 800, letterSpacing: 1.1, color: t.brandText,
              textTransform: 'uppercase',
            }}>
              Announcement
            </span>
          </div>
        )}
        <div style={{ padding: '10px 11px 12px' }}>
          <div style={{ fontSize: 9, color: t.textSubtle, letterSpacing: 0.4, textTransform: 'uppercase' }}>
            Today
          </div>
          <div style={{ fontSize: 13, fontWeight: 800, color: t.text, lineHeight: 1.3, marginTop: 3 }}>
            {title || 'Your heading'}
          </div>
          <div style={{ fontSize: 11.5, color: t.textMuted, lineHeight: 1.55, marginTop: 5, whiteSpace: 'pre-wrap' }}>
            {body || 'Your message'}
          </div>
          {ctaLabel ? (
            <div style={{
              marginTop: 10, background: t.brand, color: t.brandText, borderRadius: 8,
              padding: '7px 10px', fontSize: 11, fontWeight: 800, textAlign: 'center',
            }}>
              {ctaLabel}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Channel({ on, onChange, title, detail }: {
  on: boolean; onChange: (value: boolean) => void; title: string; detail: string;
}) {
  const { t } = useTheme();
  return (
    <label style={{
      display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer',
      border: `1px solid ${on ? t.brand : t.border}`, background: on ? t.brandSoft : 'transparent',
      borderRadius: 11, padding: '11px 13px',
    }}>
      <input
        type="checkbox"
        checked={on}
        onChange={event => onChange(event.target.checked)}
        style={{ marginTop: 2, accentColor: t.brand, width: 15, height: 15 }}
      />
      <span>
        <span style={{ fontSize: 13, fontWeight: 700, color: t.text, display: 'block' }}>{title}</span>
        <span style={{ fontSize: 11.5, color: t.textSubtle, lineHeight: 1.55 }}>{detail}</span>
      </span>
    </label>
  );
}
