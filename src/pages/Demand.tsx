/**
 * Where people asked for something the platform did not have.
 *
 * Every other measure here counts demand that was met — bookings made, jobs filled,
 * applications sent. None of them can tell "nobody in Bo wants a welder" apart from "four
 * people in Bo wanted a welder and we had none", and those two facts call for opposite
 * decisions.
 *
 * This screen is that difference. It is the one that ends a meeting with "recruit welders in
 * Bo" rather than "demand is up 12%".
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../theme/ThemeProvider';
import {
  Card, Cell, EmptyState, ErrorNote, Loading, PageHeader, Pill, Row, Table, fmtDate, timeAgo,
} from '../components/ui';
import { Bars, SplitBar } from '../components/Charts';
import { Select } from '../components/Select';
import { adminApi, type DemandDashboard, type SupplyGap } from '../api/admin';

/**
 * The three ways somebody can ask for a service the platform has not got.
 *
 * Declared once, in this order, and used by the hero, the legend and every row — so the hue
 * that means "a job nobody answered" means that everywhere on the screen. Cycling them per row
 * would make the same colour mean three different things down one column.
 */
const SIGNALS = [
  { key: 'searched', label: 'searched and found nothing', of: (gap: SupplyGap) => gap.peopleLookedFor },
  { key: 'jobs', label: 'jobs nobody answered', of: (gap: SupplyGap) => gap.jobsUnanswered },
  { key: 'bookings', label: 'bookings nobody took', of: (gap: SupplyGap) => gap.bookingsUnanswered },
];

const partsOf = (gap: SupplyGap) =>
  SIGNALS.map(signal => ({ key: signal.key, label: signal.label, value: signal.of(gap) }));

const askedTotal = (gap: SupplyGap) =>
  gap.peopleLookedFor + gap.jobsUnanswered + gap.bookingsUnanswered;

const WINDOWS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];

export function Demand() {
  const { t } = useTheme();
  const [data, setData] = useState<DemandDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState('30');

  const load = useCallback(() => {
    adminApi.demand(Number(days))
      .then(result => { setData(result); setError(null); })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not work that out.'));
  }, [days]);

  useEffect(load, [load]);

  if (error) return <ErrorNote message={error} />;
  if (!data) return <Loading />;

  // The API already ranks the gaps, so the worst one is the first one. Lifted out rather than
  // left as row one of a table: "recruit airport pickup in Freetown" is the whole point of the
  // screen, and a table makes every row look equally worth reading.
  const worst = data.gaps[0] ?? null;

  // Rolled up here rather than asked for separately — it is arithmetic on rows already loaded,
  // and a round trip to add up eight numbers is a round trip nobody should pay for.
  const byCity = Object.values(
    data.gaps.reduce<Record<string, { city: string; asked: number; services: number; noProvider: number }>>(
      (map, gap) => {
        const city = gap.city ?? 'Not stated';
        map[city] ??= { city, asked: 0, services: 0, noProvider: 0 };
        map[city].asked += askedTotal(gap);
        map[city].services += 1;
        if (gap.providersAvailable === 0) map[city].noProvider += 1;
        return map;
      }, {}))
    .sort((a, b) => b.asked - a.asked);

  return (
    <>
      <PageHeader
        title="What people wanted"
        subtitle="Where somebody asked and the platform had nothing — and which provider to go and find."
        action={
          <div style={{ width: 170 }}>
            <Select value={days} onChange={value => setDays(value ?? '30')} options={WINDOWS} />
          </div>
        }
      />

      {data.gaps.length === 0 ? (
        <div style={{
          background: t.surfaceMuted, border: `1px solid ${t.border}`,
          borderRadius: 12, padding: '14px 16px', marginBottom: 18,
          fontSize: 13.5, color: t.text, lineHeight: 1.7,
        }}>
          {data.verdict}
        </div>
      ) : (
        <Headline gap={worst!} verdict={data.verdict} />
      )}

      {/* ---------------- where the demand is ---------------- */}
      {byCity.length > 1 ? (
        <Card style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: t.text, marginBottom: 3 }}>
            Where the gaps are
          </div>
          <div style={{ fontSize: 12, color: t.textSubtle, marginBottom: 14, lineHeight: 1.6 }}>
            Every unmet request added up by place. Recruiting is a thing you do in a town, not in
            a spreadsheet, so this is the first cut of the answer.
          </div>
          <Bars
            primaryLabel="unmet requests"
            rows={byCity.map(city => ({
              label: city.city,
              value: city.asked,
              note: `${city.asked} across ${city.services} ${city.services === 1 ? 'service' : 'services'}`
                + (city.noProvider > 0 ? ` · ${city.noProvider} with nobody at all` : ''),
              tone: city.noProvider > 0 ? t.danger : undefined,
            }))}
          />
        </Card>
      ) : null}

      {/* ---------------- the gaps ---------------- */}
      <Card pad={0}>
        <div style={{ padding: '16px 18px 12px' }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: t.text }}>Where to recruit</div>
          <div style={{ fontSize: 12.5, color: t.textSubtle, marginTop: 5, lineHeight: 1.65 }}>
            A service, a place, and three separate ways people asked for it. Set against how many
            providers actually offer it there.
          </div>
          {/* One legend for every bar in the table below. The hues are fixed across all of them,
              so a colour means the same thing on row one and row twenty. */}
          {data.gaps.length > 0 ? (
            <div data-legend style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 11 }}>
              {SIGNALS.map((signal, index) => (
                <span key={signal.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span data-swatch={signal.key} style={{
                    width: 9, height: 9, borderRadius: 3, background: t.series[index % t.series.length],
                  }} />
                  <span style={{ fontSize: 11.5, color: t.textMuted }}>{signal.label}</span>
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {data.gaps.length === 0 ? (
          <div style={{ padding: 30 }}>
            <EmptyState
              icon="🔍"
              title="Nothing is obviously missing"
              message="Every service people looked for had somebody offering it."
            />
          </div>
        ) : (
          <Table head={['Service', 'Where', 'How they asked', 'Providers', 'What to do']}>
            {data.gaps.map(gap => <GapRow key={`${gap.skill}-${gap.city ?? 'anywhere'}`} gap={gap} />)}
          </Table>
        )}
      </Card>

      {/* ---------------- empty searches ---------------- */}
      <Card style={{ marginTop: 14 }} pad={0}>
        <div style={{ padding: '16px 18px 12px' }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: t.text }}>Searches that found nothing</div>
          <div style={{ fontSize: 12.5, color: t.textSubtle, marginTop: 5, lineHeight: 1.65 }}>
            Ranked by how many <em>people</em> asked, not how many searches happened — one person
            retrying six times is one disappointment, four people asking once is a hole.
            {data.searchesKnownSince
              ? ` ${data.searchesRecorded.toLocaleString()} searches recorded since ${fmtDate(data.searchesKnownSince)}, `
                + `${data.missRatePercent}% of them came back empty.`
              : ' Nothing has been searched for since this started counting.'}
          </div>
        </div>

        {data.missedSearches.length === 0 ? (
          <div style={{ padding: 30 }}>
            <EmptyState
              icon="✓"
              title="Every search found something"
              message={data.searchesKnownSince
                ? 'Nobody has come away empty-handed in this window.'
                : 'This starts filling up as people search.'}
            />
          </div>
        ) : (
          <Table head={['They typed', 'Where', 'People', 'Times', 'Last asked']}>
            {data.missedSearches.map(search => (
              <Row key={`${search.surface}-${search.term}`}>
                <Cell>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: t.text }}>“{search.term}”</span>
                </Cell>
                <Cell><Pill tone="neutral">{search.surface}</Pill></Cell>
                <Cell>
                  <span style={{ fontSize: 14, fontWeight: 800, color: search.people > 2 ? t.warning : t.text }}>
                    {search.people}
                  </span>
                </Cell>
                <Cell><span style={{ fontSize: 13, color: t.textMuted }}>{search.times}</span></Cell>
                <Cell><span style={{ fontSize: 12.5, color: t.textSubtle }}>{timeAgo(search.lastAt)}</span></Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      {/* ---------------- unanswered jobs ---------------- */}
      <Card style={{ marginTop: 14 }} pad={0}>
        <div style={{ padding: '16px 18px 12px' }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: t.text }}>Jobs nobody has answered</div>
          <div style={{ fontSize: 12.5, color: t.textSubtle, marginTop: 5, lineHeight: 1.65 }}>
            Posted more than three days ago with not one application. The strongest signal on this
            screen: somebody wrote out what they needed and then waited.
          </div>
        </div>

        {data.unansweredJobs.length === 0 ? (
          <div style={{ padding: 30 }}>
            <EmptyState icon="✓" title="Every job has had a reply" message="Nothing is sitting unanswered." />
          </div>
        ) : (
          <Table head={['What they asked for', 'Service', 'Where', 'Waiting', 'Who']}>
            {data.unansweredJobs.map(job => (
              <Row key={job.id}>
                <Cell>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: t.text }}>{job.title}</div>
                  <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 2 }}>
                    {job.views} {job.views === 1 ? 'view' : 'views'}, no applications
                  </div>
                </Cell>
                <Cell>
                  <span style={{ fontSize: 12.5, color: t.text }}>{job.skillName ?? 'not stated'}</span>
                </Cell>
                <Cell><span style={{ fontSize: 12.5, color: t.textMuted }}>{job.city ?? '—'}</span></Cell>
                <Cell>
                  <Pill tone={job.daysOpen > 14 ? 'danger' : job.daysOpen > 7 ? 'warning' : 'neutral'}>
                    {job.daysOpen} days
                  </Pill>
                </Cell>
                <Cell>
                  <Link
                    to={`/users/${job.customerUserId}`}
                    style={{ fontSize: 12.5, color: t.text, textDecoration: 'none' }}
                  >
                    {job.customerName}
                  </Link>
                </Cell>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      <div style={{ fontSize: 11, color: t.textSubtle, marginTop: 12, textAlign: 'right' }}>
        worked out in {data.tookMilliseconds}ms
      </div>
    </>
  );
}

/**
 * The one gap worth acting on today, given its own panel.
 *
 * The API already ranks these, so this is row one — lifted out because a table makes every row
 * look equally worth reading, and this screen exists to end a meeting with one sentence.
 * The three ways it was asked for are broken out rather than summed: "eleven requests" tells
 * you the size, "four searched, six posted a job, one tried to book" tells you which lever.
 */
function Headline({ gap, verdict }: { gap: SupplyGap; verdict: string }) {
  const { t } = useTheme();
  const none = gap.providersAvailable === 0;
  const total = askedTotal(gap);

  return (
    <div
      data-headline={gap.skill}
      style={{
        borderRadius: 16, marginBottom: 16, overflow: 'hidden',
        border: `1px solid ${none ? t.danger : t.warning}`,
        // A single soft wash rather than a solid fill: the panel needs to read as the most
        // important thing on the page without shouting over the numbers inside it.
        background: `linear-gradient(135deg, ${none ? t.dangerSoft : t.warningSoft} 0%, ${t.surface} 78%)`,
      }}
    >
      <div style={{ padding: '18px 20px 16px', display: 'flex', gap: 26, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 380px', minWidth: 280 }}>
          <div style={{
            fontSize: 10.5, letterSpacing: 1.4, fontWeight: 800,
            color: none ? t.danger : t.warning, textTransform: 'uppercase', marginBottom: 7,
          }}>
            The clearest gap
          </div>
          <div style={{ fontSize: 25, fontWeight: 800, color: t.text, lineHeight: 1.2, letterSpacing: -0.4 }}>
            {gap.skill}
            <span style={{ color: t.textSubtle, fontWeight: 700 }}> in {gap.city ?? 'no particular place'}</span>
          </div>
          <div style={{ fontSize: 13.5, color: t.textMuted, lineHeight: 1.7, marginTop: 10, maxWidth: 560 }}>
            {verdict}
          </div>
        </div>

        {/* The supply side, as a figure rather than a sentence. Zero is the only number on this
            screen that changes what you do rather than how urgently you do it. */}
        <div style={{
          flexShrink: 0, minWidth: 148, textAlign: 'center', alignSelf: 'center',
          padding: '14px 18px', borderRadius: 14,
          background: t.surface, border: `1px solid ${none ? t.danger : t.border}`,
        }}>
          <div style={{
            fontSize: 40, fontWeight: 800, lineHeight: 1,
            color: none ? t.danger : gap.providersAvailable <= 2 ? t.warning : t.text,
          }}>
            {gap.providersAvailable}
          </div>
          <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 6, lineHeight: 1.45 }}>
            {none ? 'providers offer it there' : gap.providersAvailable === 1 ? 'provider offers it there' : 'providers offer it there'}
          </div>
        </div>
      </div>

      {/* The three ways, spelled out. This is the half the old screen dropped: it printed one
          number where the subtitle promised three, so the reader could see the size of the
          problem and not its shape. */}
      <div style={{
        display: 'flex', gap: 0, flexWrap: 'wrap', borderTop: `1px solid ${t.border}`,
        background: t.surface,
      }}>
        {SIGNALS.map((signal, index) => {
          const value = signal.of(gap);
          return (
            <div
              key={signal.key}
              data-ask={signal.key}
              style={{
                flex: '1 1 150px', padding: '13px 18px',
                borderRight: index < SIGNALS.length - 1 ? `1px solid ${t.border}` : 'none',
                opacity: value === 0 ? 0.45 : 1,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 9, height: 9, borderRadius: 3, flexShrink: 0,
                  background: t.series[index % t.series.length],
                }} />
                <span style={{ fontSize: 20, fontWeight: 800, color: t.text, lineHeight: 1 }}>{value}</span>
              </div>
              <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 6, lineHeight: 1.45 }}>
                {signal.label}
              </div>
            </div>
          );
        })}
        <div style={{
          flex: '1 1 150px', padding: '13px 18px', borderLeft: `1px solid ${t.border}`,
          background: t.surfaceMuted,
        }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: t.text, lineHeight: 1 }}>{total}</div>
          <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 6, lineHeight: 1.45 }}>
            requests in total, none of them met
          </div>
        </div>
      </div>
    </div>
  );
}

function GapRow({ gap }: { gap: SupplyGap }) {
  const { t } = useTheme();
  const parts = partsOf(gap);
  const total = askedTotal(gap);

  return (
    <Row>
      <Cell>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: t.text }} data-gap={gap.skill}>
          {gap.skill}
        </span>
      </Cell>
      <Cell>
        <span style={{ fontSize: 12.5, color: gap.city ? t.text : t.textSubtle }}>
          {gap.city ?? 'anywhere'}
        </span>
      </Cell>
      <Cell>
        {/* The bar and the words together. The bar is for scanning down the column; the words
            are for anybody who cannot use the colours, and for the screenshot somebody pastes
            into a message where the colours mean nothing. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <SplitBar parts={parts} />
          <span style={{ fontSize: 13, fontWeight: 800, color: t.text, minWidth: 20 }}>{total}</span>
        </div>
        <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 4, lineHeight: 1.5, maxWidth: 260 }}>
          {parts.filter(part => part.value > 0).map(part => `${part.value} ${part.label}`).join(' · ')}
        </div>
      </Cell>
      <Cell>
        <Pill tone={gap.providersAvailable === 0 ? 'danger' : gap.providersAvailable <= 2 ? 'warning' : 'neutral'}>
          {gap.providersAvailable}
        </Pill>
      </Cell>
      <Cell>
        <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.6, maxWidth: 320 }}>
          {gap.advice}
        </div>
      </Cell>
    </Row>
  );
}
