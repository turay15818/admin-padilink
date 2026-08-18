/**
 * The dashboard.
 *
 * Built around one distinction: a total is a fact and a queue is a job. "1,284 users" changes
 * nothing about anybody's morning; "three disputes, the oldest waiting eleven days" does.
 * So the top of this screen is only the queues, only when they are not empty, worst first —
 * and an empty top means there is genuinely nothing waiting, which is worth knowing.
 *
 * Under the queues is the story: is the platform well, what shape was the month, are the two
 * sides in balance, what moved. That order is deliberate — the old version put today's counters
 * first, and on a quiet platform that is a row of zeroes above a chart with three bars in it,
 * which reads as a broken screen rather than a slow week.
 *
 * Two round trips: the queues, which refresh on a timer, and the story, which does not need to.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../theme/ThemeProvider';
import { Button, Card, ErrorNote, Loading, PageHeader, Pill, timeAgo } from '../components/ui';
import { Bars, Dial, Funnel, Stat, StackedBars } from '../components/Charts';
import { adminApi, type AttentionItem, type LiveDashboard, type StoryGap, type SystemStory } from '../api/admin';

export function Overview() {
  const { t } = useTheme();
  const [board, setBoard] = useState<LiveDashboard | null>(null);
  const [story, setStory] = useState<SystemStory | null>(null);
  const [storyError, setStoryError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    adminApi.live()
      .then(result => { setBoard(result); setError(null); })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load the dashboard.'));

    // Fetched alongside, and allowed to fail on its own. The queues are the urgent half of
    // this page; losing the month's shape must not take them down with it.
    //
    // The REASON is kept. The first cut swallowed it and printed "could not be worked out just
    // now" — which is the least useful sentence on the platform: the actual cause was a
    // database one migration behind the code, fixable in ten seconds by anybody who was told.
    adminApi.story()
      .then(result => { setStory(result); setStoryError(null); })
      .catch((caught: unknown) => {
        setStory(null);
        setStoryError(caught instanceof Error ? caught.message : 'The API did not answer.');
      });
  }, []);

  useEffect(() => {
    load();
    // Refreshed on a timer because the whole promise of the screen is that the number of
    // disputes waiting is the number waiting now. A minute is often enough to be true and
    // rare enough that nobody notices it happening.
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  if (error) return <ErrorNote message={error} />;
  if (!board) return <Loading label="Reading the platform…" />;

  const quiet = board.needsAttention.length === 0;

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle={quiet
          ? 'Nothing is waiting on anybody. This is what it looks like when the queues are clear.'
          : 'What needs a person, what is happening now, and which way the week is going.'}
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11.5, color: t.textSubtle }}>
              {timeAgo(board.asOf)} · {board.tookMs}ms
            </span>
            <Button size="sm" tone="subtle" onClick={load}>Refresh</Button>
          </div>
        }
      />

      {/* ---- what needs a person ---- */}
      {quiet ? (
        <Card>
          <div style={{ padding: '18px 4px', textAlign: 'center' }}>
            <div style={{ fontSize: 30, marginBottom: 8 }}>✓</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: t.text, marginBottom: 4 }}>
              Nothing is waiting
            </div>
            <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.65, maxWidth: 440, margin: '0 auto' }}>
              No open disputes, no reports, no documents to check, nobody owed a certificate.
              This box fills up on its own when something needs doing.
            </div>
          </div>
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(268px, 1fr))', gap: 12 }}>
          {board.needsAttention.map(item => <Attention key={item.key} item={item} />)}
        </div>
      )}

      {/* ---- what could not be worked out, and why ---- */}
      {/* First, deliberately. A gap the reader does not know about turns every number below it
          into a number they cannot trust — and the usual cause is fixable in ten seconds. */}
      <Gaps gaps={story?.gaps ?? []} apiError={storyError} />

      {/* ---- is the platform well ---- */}
      {story?.health ? (
        <>
          <h2 style={{ margin: '22px 0 10px', fontSize: 15, fontWeight: 800, color: t.text }}>
            Is it well
          </h2>
          <Card>
            <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ flexShrink: 0 }}>
                <Dial score={story.health.score} band={story.health.band} />
              </div>
              <div style={{ flex: '1 1 420px', minWidth: 280 }}>
                <div style={{ fontSize: 13.5, color: t.textMuted, lineHeight: 1.7, marginBottom: 14 }}>
                  {story.health.verdict}
                </div>
                {/* The parts, always. A score on its own is a number people watch go up and down
                    without ever knowing what to do about it — the readings are the useful half. */}
                {story.health.parts.map(part => (
                  <div
                    key={part.key}
                    data-health={part.key}
                    data-score={part.score}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 0', flexWrap: 'wrap' }}
                  >
                    <span style={{ fontSize: 12.5, color: t.text, width: 148, flexShrink: 0 }}>
                      {part.label}
                    </span>
                    <span style={{ flex: 1, minWidth: 80, height: 7, background: t.surfaceMuted, borderRadius: 4, overflow: 'hidden' }}>
                      <span style={{
                        display: 'block', width: `${Math.max(2, part.score)}%`, height: '100%',
                        borderRadius: 4,
                        background: part.score >= 70 ? t.success : part.score >= 40 ? t.warning : t.danger,
                      }} />
                    </span>
                    <span style={{ fontSize: 11.5, color: t.textMuted, minWidth: 176, textAlign: 'right' }}>
                      {part.reading}
                    </span>
                    {part.route ? (
                      <Link to={part.route} style={{ fontSize: 11, color: t.brand, textDecoration: 'none' }}>
                        open ↗
                      </Link>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </>
      ) : null}

      {/* ---- the month ---- */}
      {story && story.days.length > 0 ? (
        <>
          <h2 style={{ margin: '22px 0 10px', fontSize: 15, fontWeight: 800, color: t.text }}>
            The last thirty days
          </h2>
          <Card>
            <StackedBars
              labels={story.days.map(day => day.day.slice(5))}
              series={[
                { key: 'joined', label: 'people joined', values: story.days.map(day => day.joined) },
                { key: 'booked', label: 'bookings made', values: story.days.map(day => day.booked) },
                { key: 'posted', label: 'jobs and listings', values: story.days.map(day => day.posted) },
                { key: 'completed', label: 'work finished', values: story.days.map(day => day.completed) },
                { key: 'cancelled', label: 'cancelled', values: story.days.map(day => day.cancelled) },
              ]}
              footnote="Hover a day for its breakdown. Every series has its own hue — nothing here is told apart by shade alone."
            />
          </Card>
        </>
      ) : null}

      {/* ---- the two things that decide whether it works ---- */}
      {story && (story.fulfilment || story.places.length > 0) ? (
        <>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
            gap: 14, marginTop: 14, alignItems: 'start',
          }}>
            {story.fulfilment ? (
            <Card>
              <div style={{ fontSize: 14.5, fontWeight: 800, color: t.text, marginBottom: 3 }}>
                What happens after somebody books
              </div>
              <div style={{ fontSize: 12, color: t.textSubtle, marginBottom: 14, lineHeight: 1.6 }}>
                Ninety days. Signups and bookings can both be climbing while the business dies, if
                the bookings are never accepted — this is the only chart that shows that.
              </div>
              <Funnel
                steps={[
                  { label: 'Asked for', value: story.fulfilment.requested },
                  { label: 'Accepted', value: story.fulfilment.accepted },
                  { label: 'Finished', value: story.fulfilment.completed },
                ]}
              />
              <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.7, marginTop: 10 }}>
                {story.fulfilment.verdict}
                {story.fulfilment.medianResponseHours !== null
                  ? ` The middle booking gets its first answer in about ${story.fulfilment.medianResponseHours} hours.`
                  : ''}
              </div>
            </Card>
            ) : null}

            {story.places.length > 0 ? (
            <Card>
              <div style={{ fontSize: 14.5, fontWeight: 800, color: t.text, marginBottom: 3 }}>
                Both sides, by city
              </div>
              <div style={{ fontSize: 12, color: t.textSubtle, marginBottom: 14, lineHeight: 1.6 }}>
                A marketplace fails in two opposite ways, and one number per city cannot tell them
                apart. Same scale for both bars, on purpose.
              </div>
              {story.places.length === 0 ? (
                <div style={{ fontSize: 13, color: t.textSubtle }}>
                  Nothing has been asked for in any city yet.
                </div>
              ) : (
                <Bars
                  primaryLabel="requests"
                  secondaryLabel="providers available"
                  rows={story.places.map(place => ({
                    label: place.city,
                    value: place.demand,
                    secondary: place.providers,
                    note: place.state,
                    tone: place.state === 'nobody to do it' ? t.danger
                      : place.state === 'stretched' || place.state === 'providers with nothing to do'
                        ? t.warning
                        : undefined,
                  }))}
                />
              )}
            </Card>
            ) : null}
          </div>
        </>
      ) : null}

      {/* ---- what moved, and what is happening right now ---- */}
      {/* Always drawn. The right-hand card is the live board, which does not come from the
          story at all — losing the month must never take today's numbers with it. */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: 14, marginTop: 14, alignItems: 'start',
      }}>
        {story && story.movers.length > 0 ? (
            <Card>
              <div style={{ fontSize: 14.5, fontWeight: 800, color: t.text, marginBottom: 3 }}>
                What moved this week
              </div>
              <div style={{ fontSize: 12, color: t.textSubtle, marginBottom: 12, lineHeight: 1.6 }}>
                Biggest changes against the week before, in both directions — a screen that only
                shows growth is one nobody opens when something breaks.
              </div>
              {story.movers.length === 0 ? (
                <div style={{ fontSize: 13, color: t.textSubtle }}>Nothing moved much either way.</div>
              ) : (
                story.movers.map(mover => (
                  <div
                    key={`${mover.kind}-${mover.label}`}
                    data-mover={mover.label}
                    style={{
                      display: 'flex', alignItems: 'baseline', gap: 10, padding: '8px 0',
                      borderBottom: `1px solid ${t.border}`,
                    }}
                  >
                    <span style={{ fontSize: 12.5, color: t.text, flex: 1 }}>{mover.label}</span>
                    <Pill tone="neutral">{mover.kind}</Pill>
                    <span style={{
                      fontSize: 13, fontWeight: 800, minWidth: 46, textAlign: 'right',
                      color: mover.change > 0 ? t.success : t.danger,
                    }}>
                      {mover.change > 0 ? '+' : ''}{mover.change}
                    </span>
                    <span style={{ fontSize: 11.5, color: t.textSubtle, minWidth: 78, textAlign: 'right' }}>
                      {mover.lastWeek} → {mover.thisWeek}
                    </span>
                  </div>
                ))
              )}
            </Card>
        ) : null}

            <Card>
              <div style={{ fontSize: 14.5, fontWeight: 800, color: t.text, marginBottom: 3 }}>
                Right now, and today
              </div>
              <div style={{ fontSize: 12, color: t.textSubtle, marginBottom: 14, lineHeight: 1.6 }}>
                The live numbers. Each one carries the last thirty days beside it, so a zero today
                reads as a quiet Tuesday rather than a dead platform.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                <Stat
                  label="Bookings in flight"
                  value={board.pulse.bookingsInFlight}
                  trend={story?.days.map(day => day.booked)}
                />
                <Stat
                  label="New people today"
                  value={board.pulse.liveTodaySignups}
                  trend={story?.days.map(day => day.joined)}
                />
                <Stat
                  label="Posted today"
                  value={board.pulse.liveTodayPosts}
                  trend={story?.days.map(day => day.posted)}
                />
                <Stat
                  label="Signed in this quarter-hour"
                  value={board.pulse.signedInNow}
                  tone={t.success}
                />
              </div>
              {story ? (
                <div style={{ fontSize: 11, color: t.textSubtle, marginTop: 12, textAlign: 'right' }}>
                  the story took {story.tookMilliseconds}ms
                </div>
              ) : null}
            </Card>
      </div>

      {/* ---- who has been doing what ---- */}
      <div style={{ marginTop: 22 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: t.text }}>Lately, in here</h2>
          <Link to="/audit" style={{ fontSize: 12.5, color: t.brand, fontWeight: 700, textDecoration: 'none' }}>
            Full trail →
          </Link>
        </div>
        <Card pad={0}>
          {board.recentActivity.map((entry, index) => (
            <div
              key={entry.id}
              style={{
                display: 'flex', gap: 12, alignItems: 'baseline', padding: '11px 18px',
                borderBottom: index === board.recentActivity.length - 1 ? 'none' : `1px solid ${t.border}`,
              }}
            >
              <span style={{ fontSize: 12.5, fontWeight: 700, color: t.text, minWidth: 118 }}>
                {entry.actorName}
              </span>
              <span style={{ fontSize: 12.5, color: t.textMuted, flex: 1, lineHeight: 1.5 }}>
                {entry.summary}
              </span>
              {!entry.succeeded ? <Pill tone="danger">refused</Pill> : null}
              {entry.severity === 3 && entry.succeeded ? <Pill tone="warning">sensitive</Pill> : null}
              <span style={{ fontSize: 11.5, color: t.textSubtle, whiteSpace: 'nowrap' }}>
                {timeAgo(entry.at)}
              </span>
            </div>
          ))}
        </Card>
      </div>
    </>
  );
}

/* ---------------- pieces ---------------- */

/**
 * What could not be worked out, and what to do about it.
 *
 * This exists because of a real morning: the health query referenced a column the database did
 * not have yet, the whole story call 500ed, and the Overview replaced every chart with one grey
 * box reading "could not be worked out just now". The screen looked broken. It was one pending
 * migration, and nothing on the page said so.
 *
 * Two rules came out of that. The API works each section out separately, so one bad query costs
 * one section. And whatever went wrong is printed here in words — a reason somebody can act on
 * beats an apology every time, and the reader is the only person who can fix it.
 */
function Gaps({ gaps, apiError }: { gaps: StoryGap[]; apiError: string | null }) {
  const { t } = useTheme();
  if (!apiError && gaps.length === 0) return null;

  const rows = apiError
    ? [{ key: 'all', label: 'The whole picture', reason: apiError }]
    : gaps;

  return (
    <div
      data-gaps={rows.length}
      style={{
        marginTop: 18, padding: '14px 16px', borderRadius: 12,
        background: t.warningSoft, border: `1px solid ${t.warning}`,
      }}
    >
      <div style={{ fontSize: 13.5, fontWeight: 800, color: t.text, marginBottom: 8 }}>
        {rows.length === 1 ? 'One part of this screen is missing' : `${rows.length} parts of this screen are missing`}
      </div>
      {rows.map(gap => (
        <div key={gap.key} data-gap={gap.key} style={{ display: 'flex', gap: 10, padding: '4px 0', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: t.text, minWidth: 190 }}>{gap.label}</span>
          <span style={{ fontSize: 12.5, color: t.textMuted, flex: 1, minWidth: 240, lineHeight: 1.6 }}>
            {gap.reason}
          </span>
        </div>
      ))}
      <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 9, lineHeight: 1.55 }}>
        Everything else on this page is real. Only the parts named above are missing.
      </div>
    </div>
  );
}

function Attention({ item }: { item: AttentionItem }) {
  const { t } = useTheme();
  const colour = item.urgency >= 3 ? t.danger : item.urgency === 2 ? t.warning : t.info;

  return (
    <Link
      to={item.route}
      style={{
        display: 'block', textDecoration: 'none',
        background: t.surface, border: `1px solid ${colour}`, borderRadius: 13,
        padding: '15px 17px', borderLeftWidth: 4,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
        <span style={{ fontSize: 27, fontWeight: 800, color: colour, lineHeight: 1.1 }}>
          {item.count.toLocaleString()}
        </span>
        {item.oldestDays !== null && item.oldestDays > 0 ? (
          <span style={{ fontSize: 11.5, color: t.textSubtle }}>
            oldest {item.oldestDays === 1 ? 'a day' : `${item.oldestDays} days`} ago
          </span>
        ) : null}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginTop: 4, lineHeight: 1.45 }}>
        {item.label}
      </div>
      <div style={{ fontSize: 12.5, color: colour, fontWeight: 700, marginTop: 7 }}>
        {item.action} →
      </div>
    </Link>
  );
}
