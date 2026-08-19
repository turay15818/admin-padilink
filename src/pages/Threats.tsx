/**
 * The threat centre.
 *
 * Five tabs, and the order is the order somebody actually works in: what is happening, what
 * needs a decision, the raw sign-ins behind it, the networks producing it, and the standing
 * rules about them. Nobody arrives at this screen for fun - they arrive because something
 * looked wrong - so the first thing on it is the answer to "is something wrong", in numbers.
 *
 * Two things this screen deliberately cannot show you:
 *
 *   * An email address. Accounts arrive already masked, because the API never stored the
 *     address in the first place. An operator working a support ticket has been given the
 *     address and can recognise it from "mu****@gmail.com"; a copy of this table is not a
 *     mailing list.
 *   * A blocked country by default. Country rules exist, and blocking a whole country from
 *     signing in is almost always the wrong instinct - customers travel and roaming SIMs
 *     geolocate strangely - which is why the scope selector defaults to the admin console.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  adminApi,
  type ActivityDetail, type ActivityPage, type ActivitySubjectRow,
  type LoginAttemptPage, type NetworkRuleRow, type SecurityEventPage, type SecurityEventRow,
  type ThreatNetworkRow, type ThreatOverview,
} from '../api/admin';
import { useTheme } from '../theme/ThemeProvider';
import { Stat } from '../components/Charts';
import { Pagination } from '../components/Pagination';
import {
  Button, Card, Cell, EmptyState, ErrorNote, Field, Input, Loading, Modal, PageHeader, Pill,
  Row, Table, Toasts, fmtDateTime, timeAgo, useToasts,
} from '../components/ui';

type Tab = 'overview' | 'people' | 'alerts' | 'signins' | 'networks' | 'rules';

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  // Second, ahead of the raw feeds. "Who is doing something strange" is the question people
  // come to this screen with; "what requests were made" is how you check the answer.
  { key: 'people', label: 'People' },
  { key: 'alerts', label: 'Alerts' },
  { key: 'signins', label: 'Sign-ins' },
  { key: 'networks', label: 'Networks' },
  { key: 'rules', label: 'Rules' },
];

const RANGES = [
  { hours: 1, label: '1 hour' },
  { hours: 6, label: '6 hours' },
  { hours: 24, label: '24 hours' },
  { hours: 24 * 7, label: '7 days' },
];

/**
 * Severity to colour, in one place.
 *
 * Reserved status colours, never the categorical series - and always beside the word, never
 * instead of it. A row that says "Critical" in red is readable by somebody who cannot see the
 * red; a row that is merely red is not.
 */
function severityTone(severity: number): 'success' | 'info' | 'warning' | 'danger' {
  return severity >= 3 ? 'danger' : severity === 2 ? 'warning' : severity === 1 ? 'info' : 'success';
}

function bandTone(band: string): 'success' | 'info' | 'warning' | 'danger' {
  return band === 'Severe' ? 'danger' : band === 'High' ? 'warning' : band === 'Elevated' ? 'info' : 'success';
}

export function Threats() {
  const { t } = useTheme();
  const [tab, setTab] = useState<Tab>('overview');
  const [hours, setHours] = useState(24);

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="Threat centre"
        subtitle="Who has been knocking, how hard, and what the platform did about it. Rules take effect everywhere within thirty seconds."
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {TABS.map(item => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            style={{
              border: `1px solid ${tab === item.key ? t.brand : t.borderStrong}`,
              background: tab === item.key ? t.brand : t.surface,
              color: tab === item.key ? t.brandText : t.text,
              borderRadius: 10, padding: '8px 16px', fontSize: 13, fontWeight: 700,
              fontFamily: 'inherit', cursor: 'pointer',
            }}>
            {item.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {tab !== 'rules' ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {RANGES.map(range => (
              <button
                key={range.hours}
                onClick={() => setHours(range.hours)}
                style={{
                  border: `1px solid ${hours === range.hours ? t.brand : t.borderStrong}`,
                  background: hours === range.hours ? t.brand : t.surface,
                  color: hours === range.hours ? t.brandText : t.textMuted,
                  borderRadius: 999, padding: '5px 12px', fontSize: 12, fontWeight: 700,
                  fontFamily: 'inherit', cursor: 'pointer',
                }}>
                {range.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {tab === 'overview' ? <Overview hours={hours} /> : null}
      {tab === 'people' ? <People hours={hours} /> : null}
      {tab === 'alerts' ? <Alerts hours={hours} /> : null}
      {tab === 'signins' ? <SignIns hours={hours} /> : null}
      {tab === 'networks' ? <Networks /> : null}
      {tab === 'rules' ? <Rules /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ overview -- */

function Overview({ hours }: { hours: number }) {
  const { t } = useTheme();
  const [data, setData] = useState<ThreatOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    adminApi.threatOverview(hours).then(setData).catch(e =>
      setError(e instanceof Error ? e.message : 'Could not load the threat overview.'));
  }, [hours]);

  const bandRows = useMemo(() => (data?.bands ?? []).map(slice => ({
    label: slice.band,
    value: slice.count,
    tone: slice.band === 'Severe' ? t.danger
      : slice.band === 'High' ? t.warning
      : slice.band === 'Elevated' ? t.info
      : t.success,
  })), [data, t]);

  if (error) return <ErrorNote message={error} />;
  if (!data) return <Loading label="Reading the last few hours…" />;

  const failureRate = data.attempts === 0 ? 0 : Math.round((data.failures / data.attempts) * 100);

  return (
    <>
      {/* Two sections rather than one row of seven: seven auto-fitting tiles leave one
          stranded on its own line at most window widths, which reads as a rendering fault. */}
      <SectionLabel>Sign-ins</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 18 }}>
        <Stat label={`Attempts in the last ${data.hours}h`} value={data.attempts} />
        <Stat
          label="Failed"
          value={data.failures}
          tone={failureRate >= 50 ? t.danger : failureRate >= 25 ? t.warning : undefined}
          note={`${failureRate}% of everything tried`}
        />
        <Stat
          label="Turned away before the password"
          value={data.blocked}
          note="A rule or the throttle refused these outright."
        />
      </div>

      <SectionLabel>Reach and noise</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 18 }}>
        <Stat label="Accounts a failed attempt was aimed at" value={data.distinctAccountsTargeted} />
        <Stat label="Networks seen" value={data.distinctNetworks} />
        <Stat
          label="Alerts waiting"
          value={data.openAlerts}
          tone={data.openAlerts > 0 ? t.warning : undefined}
        />
        <Stat
          label="Critical, unacknowledged"
          value={data.criticalAlerts}
          tone={data.criticalAlerts > 0 ? t.danger : undefined}
        />
      </div>

      {/* Two across rather than auto-fitting three. At three, the fourth card lands alone on a
          row with two thirds of the screen empty beside it, and the tables inside the other
          three lose their right-hand columns off the edge of the card. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: 14 }}>
        <Card>
          <CardTitle>How risky the sign-ins looked</CardTitle>
          {bandRows.every(row => row.value === 0) ? (
            <EmptyState icon="shield" title="Nothing to score" message="No sign-ins in this window." />
          ) : (
            <BandBars rows={bandRows} />
          )}
          <Note>
            Low is an ordinary sign-in on a known device. Severe is scored, recorded and the
            owner is told — it is not refused, because a score is a guess and locking a real
            customer out on a guess is the worse mistake.
          </Note>
        </Card>

        <Card>
          <CardTitle>Networks worth looking at</CardTitle>
          {data.worstNetworks.length === 0 ? (
            <EmptyState icon="shield" title="Nothing above zero" message="No network has earned a score yet." />
          ) : (
            /* Four columns, not five: at this width the fifth fell off the right edge of the
               card - and it was the one saying whether a rule already covers this address,
               which is the column that decides whether there is anything left to do. It is
               now a pill beside the score, where it cannot be pushed off. */
            <Table head={['Address', 'Score', 'Failed / ok', 'Last seen']}>
              {data.worstNetworks.map(row => (
                <Row key={row.ipAddress}>
                  <Cell mono>{row.ipAddress}</Cell>
                  <Cell>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Pill tone={row.score >= 75 ? 'danger' : row.score >= 40 ? 'warning' : 'neutral'}>{row.score}</Pill>
                      {row.hasRule ? <Pill tone="danger">Rule</Pill> : null}
                    </div>
                  </Cell>
                  <Cell>{row.failedLogins.toLocaleString()} / {row.successfulLogins.toLocaleString()}</Cell>
                  <Cell>{timeAgo(row.lastSeenAt)}</Cell>
                </Row>
              ))}
            </Table>
          )}
          <Note>
            The score is a ratio, not a count. An address carrying four thousand successful
            sign-ins and a hundred failures is a mobile carrier, and scores zero.
          </Note>
        </Card>

        <Card>
          <CardTitle>Accounts being aimed at</CardTitle>
          {data.mostTargetedAccounts.length === 0 ? (
            <EmptyState icon="shield" title="Nobody is being targeted" message="No account has a failed attempt in this window." />
          ) : (
            <Table head={['Account', 'Failed attempts', 'Last try']}>
              {data.mostTargetedAccounts.map(row => (
                <Row key={row.accountMasked + row.lastAttemptAt}>
                  <Cell mono>{row.accountMasked}</Cell>
                  <Cell>{row.failures.toLocaleString()}</Cell>
                  <Cell>{timeAgo(row.lastAttemptAt)}</Cell>
                </Row>
              ))}
            </Table>
          )}
        </Card>

        <Card>
          <CardTitle>Latest alerts</CardTitle>
          {data.latestAlerts.length === 0 ? (
            <EmptyState icon="shield" title="Quiet" message="Nothing worth raising in this window." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {data.latestAlerts.map(event => <AlertLine key={event.id} event={event} />)}
            </div>
          )}
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 14, marginTop: 14 }}>
        <Card>
          <CardTitle>Location signal</CardTitle>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Pill tone={data.geoAvailable ? 'success' : 'neutral'}>
              {data.geoAvailable ? 'Country is being reported' : 'No country signal'}
            </Pill>
          </div>
          <Note>{data.geoNote}</Note>
        </Card>
        <Card>
          <CardTitle>What is kept, and for how long</CardTitle>
          <Note>{data.retentionNote}</Note>
          <Note>
            Sign-in attempts never contain an email address — only a hash and a mask — and no
            request body, query string or password has ever been written to any of these tables.
          </Note>
        </Card>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------- people -- */

/**
 * Ranked by the worst hour each subject had, never by their total or their average.
 *
 * A scraper that ran flat out between two and three in the morning and then stopped has a
 * perfectly ordinary daily average. The average is the number that hides it; the worst hour is
 * the number that finds it.
 */
function People({ hours }: { hours: number }) {
  const { t } = useTheme();
  const [page, setPage] = useState<ActivityPage | null>(null);
  const [pageIndex, setPageIndex] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [minScore, setMinScore] = useState(1);
  const [subjectKind, setSubjectKind] = useState<number | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<ActivitySubjectRow | null>(null);
  const [detail, setDetail] = useState<ActivityDetail | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setPage(await adminApi.threatActivity({
        hours, minScore, subjectKind, search: search.trim() || undefined, pageIndex, pageSize,
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the activity.');
    }
  }, [hours, minScore, subjectKind, search, pageIndex, pageSize]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!open) { setDetail(null); return; }
    adminApi.threatActivityDetail(open.subjectKind, open.subjectKey, hours)
      .then(setDetail)
      .catch(() => setDetail(null));
  }, [open, hours]);

  return (
    <>
      <Card style={{ marginBottom: 14 }}>
        {/* Four short chips rather than four long ones: at any sensible column width the long
            labels wrapped, leaving the last chip alone on a second line - which reads as a
            rendering fault rather than as a filter. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
          <Field label="Worst hour scored at least">
            <Chips
              value={minScore}
              options={[
                { value: 0, label: 'Everyone' },
                { value: 1, label: 'Noticed' },
                { value: 25, label: 'Elevated' },
                { value: 50, label: 'High' },
              ]}
              onChange={next => { setMinScore(next ?? 0); setPageIndex(1); }}
            />
          </Field>
          <Field label="Who">
            <Chips
              value={subjectKind}
              options={[
                { value: undefined, label: 'Everyone' },
                { value: 0, label: 'Accounts' },
                { value: 1, label: 'Signed-out' },
              ]}
              onChange={next => { setSubjectKind(next); setPageIndex(1); }}
            />
          </Field>
          <Field label="Name or network">
            <Input value={search} onChange={value => { setSearch(value); setPageIndex(1); }} placeholder="Aminata, or 41.223.19.0/24" />
          </Field>
        </div>
      </Card>

      {error ? <ErrorNote message={error} /> : null}
      {!page ? <Loading label="Reading the roll-up…" /> : page.items.length === 0 ? (
        <EmptyState
          icon="shield"
          title="Nobody stands out"
          message="No account or network did anything in this window that the behaviour rules noticed. The roll-up runs every five minutes."
        />
      ) : (
        <Card pad={0}>
          <Table head={['Who', 'Worst hour', 'Requests', 'What we noticed', 'Signals', 'Last active', '']}>
            {page.items.map(row => (
              <Row key={`${row.subjectKind}:${row.subjectKey}`}>
                <Cell>
                  <strong style={{ fontSize: 13 }}>{row.label}</strong>
                  <SubText>{row.subjectKindLabel}</SubText>
                </Cell>
                <Cell>
                  <Pill tone={bandTone(row.peakBand)}>{row.peakScore} · {row.peakBand}</Pill>
                  {row.peakCadence >= 60 ? <SubText>{`cadence ${row.peakCadence}/100`}</SubText> : null}
                </Cell>
                <Cell>
                  {row.requests.toLocaleString()}
                  <SubText>{`over ${row.hours} hour${row.hours === 1 ? '' : 's'}`}</SubText>
                </Cell>
                <Cell>
                  {row.explained.length === 0 ? (
                    <span style={{ color: t.textSubtle, fontSize: 12 }}>nothing unusual</span>
                  ) : (
                    <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12.5, lineHeight: 1.55 }}>
                      {row.explained.map(line => <li key={line}>{line}</li>)}
                    </ul>
                  )}
                </Cell>
                <Cell>
                  <Signals row={row} />
                </Cell>
                <Cell>{timeAgo(row.lastHourAt)}</Cell>
                <Cell><Button tone="ghost" onClick={() => setOpen(row)}>Open</Button></Cell>
              </Row>
            ))}
          </Table>
          <Pagination
            pageIndex={page.pageIndex}
            pageSize={page.pageSize}
            totalCount={page.totalCount}
            onPage={setPageIndex}
            onPageSize={size => { setPageSize(size); setPageIndex(1); }}
            noun="subject"
          />
        </Card>
      )}

      {open ? (
        <Modal title={open.label} onClose={() => setOpen(null)} width={880}>
          {!detail ? <Loading /> : <ActivityDetailView detail={detail} />}
        </Modal>
      ) : null}
    </>
  );
}

function Signals({ row }: { row: ActivitySubjectRow }) {
  const { t } = useTheme();
  const parts: string[] = [];
  if (row.distinctDetailTargets > 0) parts.push(`${row.distinctDetailTargets.toLocaleString()} different pages`);
  if (row.denials > 0) parts.push(`${row.denials.toLocaleString()} refused`);
  if (row.notFound > 0) parts.push(`${row.notFound.toLocaleString()} not found`);
  if (row.downloads > 0) parts.push(`${row.downloads.toLocaleString()} downloads`);
  if (row.messagesSent > 0) parts.push(`${row.messagesSent.toLocaleString()} messages`);
  if (row.applicationsSent > 0) parts.push(`${row.applicationsSent.toLocaleString()} applications`);
  return (
    <span style={{ fontSize: 12, color: t.textMuted }}>
      {parts.length === 0 ? '—' : parts.join(' · ')}
    </span>
  );
}

function ActivityDetailView({ detail }: { detail: ActivityDetail }) {
  const { t } = useTheme();
  const { subject, hours, recentSignIns, events } = detail;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <Stat label="Worst hour" value={`${subject.peakScore} · ${subject.peakBand}`} />
        <Stat label="Requests in window" value={subject.requests} />
        <Stat label="Different pages opened" value={subject.distinctDetailTargets} />
        <Stat label="Most regular hour" value={`${subject.peakCadence}/100`} note="100 is a metronome" />
      </div>

      {subject.explained.length > 0 ? (
        <Card style={{ background: t.surfaceMuted }}>
          <CardTitle>What the rules noticed</CardTitle>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7, color: t.text }}>
            {subject.explained.map(line => <li key={line}>{line}</li>)}
          </ul>
        </Card>
      ) : null}

      <div>
        <CardTitle>Hour by hour</CardTitle>
        <Table head={['Hour', 'Requests', 'Reads / writes', 'Refused', 'Missing', 'Pages', 'Out', 'Rhythm', 'Score']}>
          {hours.map(hour => (
            <Row key={hour.hourStartedAt}>
              <Cell>{fmtDateTime(hour.hourStartedAt)}</Cell>
              <Cell>{hour.requests.toLocaleString()}</Cell>
              <Cell>{hour.reads.toLocaleString()} / {hour.writes.toLocaleString()}</Cell>
              <Cell>{hour.denials.toLocaleString()}</Cell>
              <Cell>{hour.notFound.toLocaleString()}</Cell>
              <Cell>
                {hour.distinctDetailTargets.toLocaleString()}
                <SubText>{`${hour.detailViews.toLocaleString()} opens`}</SubText>
              </Cell>
              <Cell>
                {(hour.downloads + hour.messagesSent + hour.applicationsSent).toLocaleString()}
                <SubText>{`${hour.downloads} dl · ${hour.messagesSent} msg · ${hour.applicationsSent} app`}</SubText>
              </Cell>
              <Cell>
                {hour.cadence}/100
                <SubText>{hour.medianGapMs > 0 ? `${(hour.medianGapMs / 1000).toFixed(1)}s apart` : '—'}</SubText>
              </Cell>
              <Cell><Pill tone={bandTone(hour.band)}>{hour.behaviourScore}</Pill></Cell>
            </Row>
          ))}
        </Table>
      </div>

      {recentSignIns.length > 0 ? (
        <div>
          <CardTitle>How they got in</CardTitle>
          <Table head={['When', 'How', 'Result', 'Where', 'Risk']}>
            {recentSignIns.map(row => (
              <Row key={row.id}>
                <Cell>{fmtDateTime(row.occurredAt)}</Cell>
                <Cell>{row.method}</Cell>
                <Cell><Pill tone={row.succeeded ? 'success' : 'warning'}>{row.outcomeLabel}</Pill></Cell>
                <Cell mono>{row.ipAddress ?? row.ipPrefix}</Cell>
                <Cell><Pill tone={bandTone(row.riskBand)}>{row.riskScore}</Pill></Cell>
              </Row>
            ))}
          </Table>
        </div>
      ) : null}

      {events.length > 0 ? (
        <div>
          <CardTitle>Security events</CardTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {events.map(event => <AlertLine key={event.id} event={event} />)}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------- alerts -- */

function Alerts({ hours }: { hours: number }) {
  const [page, setPage] = useState<SecurityEventPage | null>(null);
  const [pageIndex, setPageIndex] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [minSeverity, setMinSeverity] = useState<number | undefined>(1);
  const [unacknowledgedOnly, setUnacknowledgedOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toasts, push } = useToasts();

  const load = useCallback(async () => {
    setError(null);
    try {
      setPage(await adminApi.threatEvents({ minSeverity, unacknowledgedOnly, hours, pageIndex, pageSize }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the alerts.');
    }
  }, [minSeverity, unacknowledgedOnly, hours, pageIndex, pageSize]);

  useEffect(() => { void load(); }, [load]);

  const acknowledge = async (event: SecurityEventRow) => {
    try {
      await adminApi.acknowledgeThreatEvent(event.id);
      push('Acknowledged.', 'ok');
      void load();
    } catch (e) {
      push(e instanceof Error ? e.message : 'Could not acknowledge that.', 'error');
    }
  };

  return (
    <>
      <Toasts toasts={toasts} />
      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Chips
            value={minSeverity}
            options={[
              { value: undefined, label: 'Everything' },
              { value: 1, label: 'Notice and up' },
              { value: 2, label: 'Warning and up' },
              { value: 3, label: 'Critical only' },
            ]}
            onChange={next => { setMinSeverity(next); setPageIndex(1); }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={unacknowledgedOnly}
              onChange={event => { setUnacknowledgedOnly(event.target.checked); setPageIndex(1); }}
            />
            Not yet acknowledged
          </label>
        </div>
      </Card>

      {error ? <ErrorNote message={error} /> : null}
      {!page ? <Loading /> : page.items.length === 0 ? (
        <EmptyState icon="shield" title="Nothing here" message="No alerts match those filters in this window." />
      ) : (
        <Card pad={0}>
          <Table head={['When', 'What', 'Who', 'Where', 'Risk', '']}>
            {page.items.map(event => (
              <Row key={event.id}>
                <Cell>{fmtDateTime(event.occurredAt)}</Cell>
                <Cell>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Pill tone={severityTone(event.severity)}>{event.severityLabel}</Pill>
                    <strong style={{ fontSize: 13 }}>{event.title}</strong>
                  </div>
                  {event.detail ? <SubText>{event.detail}</SubText> : null}
                  <SubText>{event.kindLabel}{event.deviceLabel ? ` · ${event.deviceLabel}` : ''}</SubText>
                </Cell>
                <Cell>{event.userName ?? (event.userId ? 'An account' : 'The platform')}</Cell>
                <Cell mono>
                  {event.ipAddress ?? event.ipPrefix}
                  {event.country ? <SubText>{event.country}</SubText> : null}
                </Cell>
                <Cell>{event.riskScore > 0 ? <Pill tone={bandTone(bandOf(event.riskScore))}>{event.riskScore}</Pill> : null}</Cell>
                <Cell>
                  {event.acknowledged ? (
                    <SubText>Seen by {event.acknowledgedBy ?? 'an administrator'}</SubText>
                  ) : (
                    <Button tone="ghost" onClick={() => void acknowledge(event)}>Acknowledge</Button>
                  )}
                </Cell>
              </Row>
            ))}
          </Table>
          <Pagination
            pageIndex={page.pageIndex}
            pageSize={page.pageSize}
            totalCount={page.totalCount}
            onPage={setPageIndex}
            onPageSize={size => { setPageSize(size); setPageIndex(1); }}
            noun="alert"
          />
        </Card>
      )}
    </>
  );
}

function bandOf(score: number): string {
  return score >= 75 ? 'Severe' : score >= 50 ? 'High' : score >= 25 ? 'Elevated' : 'Low';
}

/* ------------------------------------------------------------------ sign-ins -- */

function SignIns({ hours }: { hours: number }) {
  const [page, setPage] = useState<LoginAttemptPage | null>(null);
  const [pageIndex, setPageIndex] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [account, setAccount] = useState('');
  const [ipPrefix, setIpPrefix] = useState('');
  const [succeeded, setSucceeded] = useState<boolean | undefined>(undefined);
  const [minRisk, setMinRisk] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setPage(await adminApi.threatAttempts({
        account: account.trim() || undefined,
        ipPrefix: ipPrefix.trim() || undefined,
        succeeded, minRisk, hours, pageIndex, pageSize,
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the sign-ins.');
    }
  }, [account, ipPrefix, succeeded, minRisk, hours, pageIndex, pageSize]);

  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
          <Field label="Account" hint="Matches the mask — try the first two letters.">
            <Input value={account} onChange={value => { setAccount(value); setPageIndex(1); }} placeholder="mu" />
          </Field>
          <Field label="Address or network">
            <Input value={ipPrefix} onChange={value => { setIpPrefix(value); setPageIndex(1); }} placeholder="41.223.19.0/24" />
          </Field>
          <Field label="Outcome">
            <Chips
              value={succeeded}
              options={[
                { value: undefined, label: 'All' },
                { value: false, label: 'Failed' },
                { value: true, label: 'Succeeded' },
              ]}
              onChange={next => { setSucceeded(next); setPageIndex(1); }}
            />
          </Field>
          <Field label="Minimum risk">
            <Chips
              value={minRisk}
              options={[
                { value: 0, label: 'Any' },
                { value: 25, label: 'Elevated' },
                { value: 50, label: 'High' },
                { value: 75, label: 'Severe' },
              ]}
              onChange={next => { setMinRisk(next ?? 0); setPageIndex(1); }}
            />
          </Field>
        </div>
      </Card>

      {error ? <ErrorNote message={error} /> : null}
      {!page ? <Loading /> : page.items.length === 0 ? (
        <EmptyState icon="shield" title="Nothing matches" message="No sign-in attempts match those filters." />
      ) : (
        <Card pad={0}>
          <Table head={['When', 'Account', 'How', 'Result', 'Where', 'Risk']}>
            {page.items.map(row => (
              <Row key={row.id}>
                <Cell>{fmtDateTime(row.occurredAt)}</Cell>
                <Cell mono>{row.accountMasked}</Cell>
                <Cell>
                  {row.method}
                  {row.clientKind ? <SubText>{row.clientKind}</SubText> : null}
                </Cell>
                <Cell>
                  <Pill tone={row.succeeded ? 'success' : row.outcome === 3 ? 'danger' : 'warning'}>
                    {row.outcomeLabel}
                  </Pill>
                  {row.failureReason ? <SubText>{row.failureReason}</SubText> : null}
                </Cell>
                <Cell mono>
                  {row.ipAddress ?? row.ipPrefix}
                  {row.country ? <SubText>{row.country}</SubText> : null}
                </Cell>
                <Cell>
                  <Pill tone={bandTone(row.riskBand)}>{row.riskScore} · {row.riskBand}</Pill>
                  {row.riskReasons ? <SubText>{row.riskReasons.split(',').join(', ')}</SubText> : null}
                </Cell>
              </Row>
            ))}
          </Table>
          <Pagination
            pageIndex={page.pageIndex}
            pageSize={page.pageSize}
            totalCount={page.totalCount}
            onPage={setPageIndex}
            onPageSize={size => { setPageSize(size); setPageIndex(1); }}
            noun="attempt"
          />
        </Card>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ networks -- */

function Networks() {
  const [rows, setRows] = useState<ThreatNetworkRow[] | null>(null);
  const [minScore, setMinScore] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<ThreatNetworkRow | null>(null);
  const { toasts, push } = useToasts();

  const load = useCallback(async () => {
    setError(null);
    try { setRows(await adminApi.threatNetworks(minScore, 100)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load the networks.'); }
  }, [minScore]);

  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <Toasts toasts={toasts} />
      <Card style={{ marginBottom: 14 }}>
        <Field label="Show addresses scoring at least">
          <Chips
            value={minScore}
            options={[
              { value: 0, label: 'Anything seen' },
              { value: 1, label: 'Above zero' },
              { value: 40, label: '40 — poor' },
              { value: 75, label: '75 — bad' },
            ]}
            onChange={next => setMinScore(next ?? 0)}
          />
        </Field>
      </Card>

      {error ? <ErrorNote message={error} /> : null}
      {!rows ? <Loading /> : rows.length === 0 ? (
        <EmptyState icon="shield" title="Nothing at that level" message="No address has a score that high." />
      ) : (
        <Card pad={0}>
          <Table head={['Address', 'Network', 'Score', 'Failed', 'Succeeded', 'Blocked', 'Last seen', '']}>
            {rows.map(row => (
              <Row key={row.ipAddress}>
                <Cell mono>{row.ipAddress}</Cell>
                <Cell mono>{row.ipPrefix}</Cell>
                <Cell><Pill tone={row.score >= 75 ? 'danger' : row.score >= 40 ? 'warning' : 'neutral'}>{row.score}</Pill></Cell>
                <Cell>{row.failedLogins.toLocaleString()}</Cell>
                <Cell>{row.successfulLogins.toLocaleString()}</Cell>
                <Cell>{row.blockedRequests.toLocaleString()}</Cell>
                <Cell>{timeAgo(row.lastSeenAt)}</Cell>
                <Cell>
                  {row.hasRule
                    ? <Pill tone="danger">Rule in place</Pill>
                    : <Button tone="ghost" onClick={() => setBlocking(row)}>Block…</Button>}
                </Cell>
              </Row>
            ))}
          </Table>
        </Card>
      )}

      {blocking ? (
        <RuleModal
          initial={{
            kind: 1,
            value: blocking.ipPrefix,
            action: 0,
            scope: 0,
            reason: `Scored ${blocking.score}: ${blocking.failedLogins} failed against ${blocking.successfulLogins} successful.`,
            expiresInHours: 24,
          }}
          onClose={() => setBlocking(null)}
          onSaved={message => { setBlocking(null); push(message, 'ok'); void load(); }}
          onError={message => push(message, 'error')}
        />
      ) : null}
    </>
  );
}

/* --------------------------------------------------------------------- rules -- */

type RuleDraft = {
  id?: string;
  kind: number;
  value: string;
  action: number;
  scope: number;
  reason: string;
  expiresInHours: number | null;
};

function Rules() {
  const [rows, setRows] = useState<NetworkRuleRow[] | null>(null);
  const [includeExpired, setIncludeExpired] = useState(false);
  const [editing, setEditing] = useState<RuleDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toasts, push } = useToasts();

  const load = useCallback(async () => {
    setError(null);
    try { setRows(await adminApi.threatRules(includeExpired)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load the rules.'); }
  }, [includeExpired]);

  useEffect(() => { void load(); }, [load]);

  const remove = async (rule: NetworkRuleRow) => {
    try {
      const result = await adminApi.removeThreatRule(rule.id);
      push(result.message, result.succeeded ? 'ok' : 'error');
      void load();
    } catch (e) {
      push(e instanceof Error ? e.message : 'Could not remove that rule.', 'error');
    }
  };

  return (
    <>
      <Toasts toasts={toasts} />
      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button onClick={() => setEditing({ kind: 1, value: '', action: 0, scope: 0, reason: '', expiresInHours: 24 })}>
            New rule
          </Button>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, cursor: 'pointer' }}>
            <input type="checkbox" checked={includeExpired} onChange={event => setIncludeExpired(event.target.checked)} />
            Include expired
          </label>
          <div style={{ flex: 1 }} />
          <SubText>An always-allow rule beats a block, always — that is the way back out of a mistake.</SubText>
        </div>
      </Card>

      {error ? <ErrorNote message={error} /> : null}
      {!rows ? <Loading /> : rows.length === 0 ? (
        <EmptyState
          icon="shield"
          title="No rules"
          message="Nothing is being blocked or allowed by hand. The throttle and the risk engine still work without any of these."
        />
      ) : (
        <Card pad={0}>
          <Table head={['Match', 'Does what', 'Where', 'Why', 'Fired', 'Until', '']}>
            {rows.map(rule => (
              <Row key={rule.id}>
                <Cell mono>
                  {rule.value}
                  <SubText>{rule.kindLabel}</SubText>
                </Cell>
                <Cell>
                  <Pill tone={rule.action === 0 ? 'danger' : rule.action === 1 ? 'success' : 'warning'}>
                    {rule.actionLabel}
                  </Pill>
                </Cell>
                <Cell>{rule.scopeLabel}</Cell>
                <Cell>
                  {rule.reason}
                  <SubText>{rule.autoCreated ? 'Added automatically' : `By ${rule.createdByName ?? 'an administrator'}`}</SubText>
                </Cell>
                <Cell>
                  {rule.hitCount.toLocaleString()}
                  {rule.lastHitAt ? <SubText>{timeAgo(rule.lastHitAt)}</SubText> : null}
                </Cell>
                <Cell>
                  {rule.expiresAt ? fmtDateTime(rule.expiresAt) : 'Never'}
                  {rule.expired ? <SubText>Expired — no longer applied</SubText> : null}
                </Cell>
                <Cell>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Button tone="ghost" onClick={() => setEditing({
                      id: rule.id, kind: rule.kind, value: rule.value, action: rule.action,
                      scope: rule.scope, reason: rule.reason, expiresInHours: null,
                    })}>Edit</Button>
                    <Button tone="danger" onClick={() => void remove(rule)}>Remove</Button>
                  </div>
                </Cell>
              </Row>
            ))}
          </Table>
        </Card>
      )}

      {editing ? (
        <RuleModal
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={message => { setEditing(null); push(message, 'ok'); void load(); }}
          onError={message => push(message, 'error')}
        />
      ) : null}
    </>
  );
}

function RuleModal({ initial, onClose, onSaved, onError }: {
  initial: RuleDraft;
  onClose: () => void;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [draft, setDraft] = useState<RuleDraft>(initial);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const result = await adminApi.saveThreatRule({
        id: draft.id,
        kind: draft.kind,
        value: draft.value,
        action: draft.action,
        scope: draft.scope,
        reason: draft.reason,
        expiresInHours: draft.expiresInHours,
      });
      if (result.succeeded) onSaved(result.message);
      else onError(result.message);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not save that rule.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={draft.id ? 'Edit rule' : 'New rule'} onClose={onClose} width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Match on">
          <Chips
            value={draft.kind}
            options={[
              { value: 0, label: 'One address' },
              { value: 1, label: 'A range' },
              { value: 2, label: 'A country' },
              { value: 3, label: 'A user agent' },
            ]}
            onChange={next => setDraft({ ...draft, kind: next ?? 1 })}
          />
        </Field>
        <Field
          label="Value"
          hint={draft.kind === 2 ? 'Two-letter country code, like SL.'
            : draft.kind === 3 ? 'Any part of the user agent string, lowercased.'
            : 'An address like 41.223.19.7, or a range like 41.223.0.0/16.'}>
          <Input value={draft.value} onChange={value => setDraft({ ...draft, value })} />
        </Field>
        <Field label="Does what">
          <Chips
            value={draft.action}
            options={[
              { value: 0, label: 'Block' },
              { value: 1, label: 'Always allow' },
              { value: 2, label: 'Watch' },
            ]}
            onChange={next => setDraft({ ...draft, action: next ?? 0 })}
          />
        </Field>
        <Field
          label="Where it applies"
          hint="Blocking a country from the whole API is almost always wrong — customers travel. Blocking it from the console rarely is.">
          <Chips
            value={draft.scope}
            options={[
              { value: 0, label: 'Everything' },
              { value: 1, label: 'Sign-in only' },
              { value: 2, label: 'Admin console only' },
            ]}
            onChange={next => setDraft({ ...draft, scope: next ?? 0 })}
          />
        </Field>
        <Field label="Why" hint="Required. An unexplained rule is one nobody will dare remove in six months.">
          <Input value={draft.reason} onChange={reason => setDraft({ ...draft, reason })} />
        </Field>
        <Field label="Expires after" hint="Most blocks should not be permanent, and nobody remembers to remove them.">
          <Chips
            value={draft.expiresInHours}
            options={[
              { value: 1, label: '1 hour' },
              { value: 24, label: '1 day' },
              { value: 24 * 7, label: '1 week' },
              { value: null, label: 'Never' },
            ]}
            onChange={next => setDraft({ ...draft, expiresInHours: next ?? null })}
          />
        </Field>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button tone="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void save()} disabled={saving || !draft.value.trim() || !draft.reason.trim()}>
            {saving ? 'Saving…' : 'Save rule'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------- pieces -- */

function Chips<T>({ value, options, onChange }: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const { t } = useTheme();
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map(option => {
        const active = option.value === value;
        return (
          <button
            key={option.label}
            onClick={() => onChange(option.value)}
            style={{
              border: `1px solid ${active ? t.brand : t.borderStrong}`,
              background: active ? t.brand : t.surface,
              color: active ? t.brandText : t.textMuted,
              borderRadius: 999, padding: '5px 12px', fontSize: 12, fontWeight: 700,
              fontFamily: 'inherit', cursor: 'pointer',
            }}>
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Four states, not four magnitudes.
 *
 * The shared Bars component draws every row in one hue, which is right for "the ten busiest
 * endpoints" and wrong here: these four are a severity scale, and severity is what the reserved
 * status colours are for. The word is printed beside the bar in every case, so the ranking is
 * still readable to somebody who cannot tell the green from the red - colour is carrying
 * emphasis here, never the meaning.
 */
function BandBars({ rows }: { rows: { label: string; value: number; tone: string }[] }) {
  const { t } = useTheme();
  const top = Math.max(1, ...rows.map(row => row.value));

  return (
    <div>
      {rows.map(row => (
        <div key={row.label} data-band={row.label} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
            <span style={{ fontSize: 12.5, color: t.text, fontWeight: 600 }}>{row.label}</span>
            <span style={{ fontSize: 11.5, color: t.textMuted }}>{row.value.toLocaleString()}</span>
          </div>
          <div style={{ height: 9, borderRadius: 4, background: t.surfaceMuted, overflow: 'hidden' }}>
            <div style={{
              width: `${Math.max(2, (row.value / top) * 100)}%`, height: '100%',
              background: row.tone, borderRadius: 4,
            }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function AlertLine({ event }: { event: SecurityEventRow }) {
  const { t } = useTheme();
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <Pill tone={severityTone(event.severity)}>{event.severityLabel}</Pill>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{event.title}</div>
        <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 2 }}>
          {timeAgo(event.occurredAt)}
          {event.userName ? ` · ${event.userName}` : ''}
          {event.ipPrefix ? ` · ${event.ipPrefix}` : ''}
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: string }) {
  const { t } = useTheme();
  return (
    <div style={{
      fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase',
      color: t.textSubtle, marginBottom: 8,
    }}>
      {children}
    </div>
  );
}

function CardTitle({ children }: { children: string }) {
  const { t } = useTheme();
  return <div style={{ fontSize: 13.5, fontWeight: 700, color: t.text, marginBottom: 12 }}>{children}</div>;
}

function Note({ children }: { children: string }) {
  const { t } = useTheme();
  return <div style={{ fontSize: 11.5, color: t.textMuted, marginTop: 10, lineHeight: 1.6 }}>{children}</div>;
}

// ReactNode, not string. Two call sites pass a value and a conditional suffix as separate
// children, which is an array - and the string-only signature made that a type error rather
// than the ordinary JSX it looks like.
function SubText({ children }: { children: ReactNode }) {
  const { t } = useTheme();
  return <div style={{ fontSize: 11, color: t.textSubtle, marginTop: 2 }}>{children}</div>;
}
