/**
 * Is this thing working, and who is leaving.
 *
 * Every other screen in this console counts the present — bookings today, people waiting,
 * disputes open. All true, and none of them answer the only question that decides whether a
 * marketplace lives: do the people who arrive stay. Signups answer it wrongly and
 * convincingly, because signups only ever go up.
 *
 * Three things, in the order somebody would ask them. Where do people fall out. Are the
 * cohorts getting better or worse. Who was using this and stopped.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../theme/ThemeProvider';
import {
  Card, ErrorNote, Loading, PageHeader, Pill, fmtDate,
} from '../components/ui';
import { Select } from '../components/Select';
import { adminApi, type CohortRow, type FunnelStep, type GrowthDashboard } from '../api/admin';

const WINDOWS = [
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '180', label: 'Last 6 months' },
  { value: '365', label: 'Last year' },
];

export function Growth() {
  const { t } = useTheme();
  const [data, setData] = useState<GrowthDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState('90');

  const load = useCallback(() => {
    adminApi.growth(Number(days))
      .then(result => { setData(result); setError(null); })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not work that out.'));
  }, [days]);

  useEffect(load, [load]);

  if (error) return <ErrorNote message={error} />;
  if (!data) return <Loading />;

  return (
    <>
      <PageHeader
        title="Growth"
        subtitle="Where people fall out, whether the cohorts are improving, and who stopped coming."
        action={
          <div style={{ width: 190 }}>
            <Select value={days} onChange={value => setDays(value ?? '90')} options={WINDOWS} />
          </div>
        }
      />

      {/* The three numbers that frame everything below. Active means "opened the app", which
          is a softer measure than the grid uses and is honest about starting recently. */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 12, marginBottom: 16,
      }}>
        <Big label="People on the platform" value={data.totalPeople} />
        <Big label="Opened the app this week" value={data.activeLast7Days} tone="success" />
        <Big label="Opened it this month" value={data.activeLast30Days} tone="info" />
      </div>

      {/* Said out loud rather than left for somebody to discover. A dashboard that overstates
          what it knows is believed exactly once. */}
      <div style={{
        background: t.surfaceMuted, border: `1px solid ${t.border}`, borderRadius: 11,
        padding: '11px 14px', marginBottom: 18, fontSize: 12.5, color: t.textMuted, lineHeight: 1.65,
      }}>
        {data.caveats.note}
      </div>

      {/* ---------------- the funnel ---------------- */}
      <Card>
        <SectionTitle>Where they fall out</SectionTitle>
        <p style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.7, margin: '0 0 16px' }}>
          {data.funnel.verdict}
        </p>

        {data.funnel.steps.map((step, index) => (
          <Step
            key={step.key}
            step={step}
            first={index === 0}
            worst={step.key === data.funnel.worstStepKey}
          />
        ))}
      </Card>

      {/* ---------------- why the stalled ones stalled ---------------- */}
      {data.funnel.stalledCount > 0 ? (
        <Card style={{ marginTop: 14 }}>
          <SectionTitle>
            Why {data.funnel.stalledCount.toLocaleString()} of them never did anything
          </SectionTitle>
          <p style={{ fontSize: 12.5, color: t.textSubtle, lineHeight: 1.65, margin: '0 0 14px' }}>
            Not part of the funnel above — these are three reasons, not three stages, and every
            stalled person is in exactly one of them.
          </p>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12,
          }}>
            {data.funnel.blockers.map(blocker => (
              <div
                key={blocker.key}
                style={{
                  border: `1px solid ${blocker.key === 'stalled_ready' ? t.warning : t.border}`,
                  background: blocker.key === 'stalled_ready' ? t.warningSoft : 'transparent',
                  borderRadius: 11, padding: '13px 15px',
                }}
              >
                <div style={{ fontSize: 24, fontWeight: 800, color: t.text, lineHeight: 1.1 }}>
                  {blocker.count.toLocaleString()}
                  <span style={{ fontSize: 13, color: t.textSubtle, fontWeight: 700, marginLeft: 7 }}>
                    {blocker.percentOfStart}%
                  </span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginTop: 6 }}>
                  {blocker.label}
                </div>
                <div style={{ fontSize: 11.5, color: t.textMuted, marginTop: 5, lineHeight: 1.6 }}>
                  {blocker.detail}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {/* ---------------- the cohort grid ---------------- */}
      <Card style={{ marginTop: 14 }} pad={0}>
        <div style={{ padding: '16px 18px 0' }}>
          <SectionTitle>Do the cohorts get better</SectionTitle>
          <p style={{ fontSize: 12.5, color: t.textSubtle, lineHeight: 1.65, margin: '0 0 4px' }}>
            Each row is a week of signups. Each cell is how many of them did something real in
            that week — booked, posted, applied, listed, joined a class, reviewed. Read down a
            column to see whether newer cohorts hold on better than older ones.
          </p>
        </div>
        <CohortGrid rows={data.cohorts} />
      </Card>

      {/* ---------------- who went quiet ---------------- */}
      <Card style={{ marginTop: 14 }}>
        <SectionTitle>Who was using this and stopped</SectionTitle>
        <p style={{ fontSize: 12.5, color: t.textSubtle, lineHeight: 1.65, margin: '0 0 14px' }}>
          Ordered by how much they did before going quiet, not by how long they have been gone.
          Somebody who made nine bookings and vanished is a different problem from somebody who
          signed up and drifted — and only the first is worth an afternoon.
        </p>

        {data.wentQuiet.length === 0 ? (
          <div style={{ fontSize: 13, color: t.textMuted, padding: '10px 0' }}>
            Nobody who was active has gone quiet for a month. That is the good version of this list.
          </div>
        ) : (
          data.wentQuiet.map(person => (
            <Link
              key={person.userId}
              to={`/users/${person.userId}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
                borderBottom: `1px solid ${t.border}`, textDecoration: 'none',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: t.text }}>{person.name}</div>
                <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 2 }}>
                  {person.email ?? 'no email'} · {person.kind}
                </div>
              </div>
              <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>
                  {person.thingsDone} things
                </div>
                <div style={{ fontSize: 11.5, color: t.warning, marginTop: 2 }}>
                  quiet {person.daysQuiet} days · last {fmtDate(person.lastDidSomethingAt)}
                </div>
              </div>
            </Link>
          ))
        )}
      </Card>

      <div style={{ fontSize: 11, color: t.textSubtle, marginTop: 12, textAlign: 'right' }}>
        worked out in {data.tookMilliseconds}ms
        {data.caveats.appOpensKnownSince
          ? ` · app opens counted since ${fmtDate(data.caveats.appOpensKnownSince)}`
          : ''}
      </div>
    </>
  );
}

/* ---------------- pieces ---------------- */

function SectionTitle({ children }: { children: React.ReactNode }) {
  const { t } = useTheme();
  return (
    <div style={{ fontSize: 15, fontWeight: 800, color: t.text, marginBottom: 8 }}>{children}</div>
  );
}

function Big({ label, value, tone }: { label: string; value: number; tone?: 'success' | 'info' }) {
  const { t } = useTheme();
  const colour = tone === 'success' ? t.success : tone === 'info' ? t.brand : t.text;
  return (
    <div style={{ border: `1px solid ${t.border}`, borderRadius: 12, padding: '13px 15px', background: t.surface }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: colour, lineHeight: 1.1 }}>
        {value.toLocaleString()}
      </div>
      <div style={{ fontSize: 12, color: t.textSubtle, marginTop: 5 }}>{label}</div>
    </div>
  );
}

/**
 * One rung. The bar is the share of the original intake, so the shape of the whole ladder is
 * readable at a glance; the number beside it is the share of the step above, which is the one
 * that says where to go and fix something.
 */
function Step({ step, first, worst }: { step: FunnelStep; first: boolean; worst: boolean }) {
  const { t } = useTheme();
  return (
    <div style={{ marginBottom: 13 }} data-step={step.key}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginBottom: 5, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: t.text }}>{step.label}</span>
        <span data-count={step.count} style={{ fontSize: 13, fontWeight: 800, color: t.text }}>
          {step.count.toLocaleString()}
        </span>
        {first ? null : (
          <span style={{ fontSize: 11.5, color: t.textSubtle }}>
            {step.percentOfPrevious}% of the step above · {step.percentOfStart}% of everyone
          </span>
        )}
        {worst ? <Pill tone="warning">biggest fall</Pill> : null}
      </div>

      <div style={{ height: 10, borderRadius: 6, background: t.surfaceMuted, overflow: 'hidden' }}>
        <div
          style={{
            width: `${Math.max(step.percentOfStart, step.count > 0 ? 2 : 0)}%`,
            height: '100%',
            background: worst ? t.warning : t.brand,
            transition: 'width .3s ease',
          }}
        />
      </div>

      <div style={{ fontSize: 11.5, color: t.textMuted, marginTop: 5, lineHeight: 1.55 }}>
        {step.detail}
      </div>
    </div>
  );
}

/**
 * The triangle.
 *
 * Younger cohorts have fewer cells, and the empty space is left empty rather than filled with
 * zeroes — a zero meaning "that week has not happened yet" and a zero meaning "every one of
 * them left" look identical, and only one of them is a reason to panic.
 */
function CohortGrid({ rows }: { rows: CohortRow[] }) {
  const { t } = useTheme();
  const widest = rows.reduce((most, row) => Math.max(most, row.retainedByWeek.length), 0);

  if (rows.length === 0) {
    return (
      <div style={{ padding: '18px', fontSize: 13, color: t.textMuted }}>
        Nobody has signed up in the last twelve weeks.
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto', padding: '12px 18px 18px' }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 3, fontSize: 12 }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '4px 8px', color: t.textSubtle, fontWeight: 700 }}>
              Signed up
            </th>
            <th style={{ textAlign: 'right', padding: '4px 8px', color: t.textSubtle, fontWeight: 700 }}>
              People
            </th>
            {Array.from({ length: widest }, (_, index) => (
              <th
                key={index}
                style={{ padding: '4px 6px', color: t.textSubtle, fontWeight: 700, minWidth: 42 }}
              >
                {index === 0 ? 'Same week' : `+${index}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.weekStart} data-cohort={row.label}>
              <td style={{ padding: '4px 8px', color: t.text, whiteSpace: 'nowrap' }}>{row.label}</td>
              <td style={{ padding: '4px 8px', color: t.textMuted, textAlign: 'right', fontWeight: 700 }}>
                {row.joined}
              </td>
              {Array.from({ length: widest }, (_, index) => {
                const value = row.retainedByWeek[index];
                if (value === undefined) {
                  return <td key={index} style={{ padding: 0 }} />;
                }
                return (
                  <td key={index} style={{ padding: 0 }}>
                    <div
                      title={`${value}% of ${row.joined} did something`}
                      style={{
                        borderRadius: 6,
                        padding: '7px 4px',
                        textAlign: 'center',
                        fontWeight: 700,
                        // One hue, varying weight. A red-to-green ramp reads as good-and-bad,
                        // and 40% retention is neither until you know what last month was.
                        background: value === 0 ? t.surfaceMuted : withAlpha(t.brand, 0.12 + (value / 100) * 0.72),
                        color: value >= 55 ? t.brandText : value === 0 ? t.textSubtle : t.text,
                      }}
                    >
                      {value}%
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Blends a hex token toward transparency without needing a colour library. */
function withAlpha(hex: string, alpha: number) {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.min(1, Math.max(0, alpha)).toFixed(2)})`;
}
