/**
 * The notification engine, on one screen.
 *
 * This page exists because the engine shipped without one. Its parts were real — audiences,
 * compose, scheduling, promos, delivery records — but they were scattered behind a renamed
 * nav entry and a modal, and the first thing anybody said about it was that they could not
 * find it. A module you cannot see is a module you did not build.
 *
 * So the screen answers, in order, the six questions somebody opening it actually has:
 * is it running, is it getting through, what does it send, what is breaking, how many
 * people can we physically reach, and what is waiting for me. Everything here reads; there
 * is no button on this page that sends anything to anybody.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../theme/ThemeProvider';
import { Button, Card, ErrorNote, Loading, PageHeader, Pill } from '../components/ui';
import { StackedBars, Stat } from '../components/Charts';
import { Icon, type IconName } from '../components/Icon';
import { adminApi, type EngineFault, type EngineType, type NotificationEngine } from '../api/admin';

const WINDOWS = [7, 14, 30, 90];

export function NotificationEnginePage() {
  const { t } = useTheme();
  const [days, setDays] = useState(14);
  const [engine, setEngine] = useState<NotificationEngine | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback((window: number) => {
    setBusy(true);
    adminApi.notificationEngine(window)
      .then(result => { setEngine(result); setError(null); })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not read the engine.'))
      .finally(() => setBusy(false));
  }, []);

  useEffect(() => { load(days); }, [load, days]);

  if (error && !engine) return <ErrorNote message={error} />;
  if (!engine) return <Loading label="Reading the engine…" />;

  const { funnel, reach, workload } = engine;

  return (
    <div style={{ opacity: busy ? 0.65 : 1, transition: 'opacity .12s' }}>
      <PageHeader
        title="Notification engine"
        subtitle="Everything the platform sends, and whether it arrived."
        action={
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {WINDOWS.map(window => (
              <Button
                key={window}
                size="sm"
                tone={window === days ? 'primary' : 'subtle'}
                onClick={() => setDays(window)}
              >
                {window}d
              </Button>
            ))}
          </div>
        }
      />

      {error ? <ErrorNote message={error} /> : null}

      {/* The verdict, first and largest. Somebody who reads nothing else on this page should
          still leave knowing whether the machine is well. */}
      <Verdict text={engine.verdict} bad={funnel.failed > funnel.written / 10 || funnel.pending > 20} />

      {/* ---- what happened to everything raised ---- */}
      <Section title="Where it went" hint="Five outcomes, exclusive, adding up to the total. Opens are counted separately below because an opened notification is one that arrived — a subset, not a sixth outcome.">
        {/* The total sits apart from the six outcomes rather than in a row with them. It is
            their denominator, not a seventh peer — and a seven-card grid also leaves one
            card stranded on its own line at every width worth designing for. */}
        <Card style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 34, fontWeight: 800, color: t.text, lineHeight: 1 }}>
              {funnel.written.toLocaleString()}
            </span>
            <span style={{ fontSize: 13, color: t.textMuted, flex: '1 1 220px', minWidth: 0, lineHeight: 1.55 }}>
              notifications raised in the last {engine.windowDays} days — one row per person,
              written before anything is handed to Firebase. Everything below is what became of them.
            </span>
          </div>
        </Card>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))', gap: 10 }}>
          <Stat
            label="Reached a phone"
            value={funnel.pushed}
            tone={t.success}
            note={funnel.pushRatePercent === null ? 'Nothing to divide by yet.' : `${funnel.pushRatePercent}% of everything raised.`}
          />
          <Stat label="Muted by the person" value={funnel.muted} note="They turned this kind off. Not a fault." />
          <Stat
            label="Nowhere to send it"
            value={funnel.skipped}
            tone={funnel.skipped > 0 ? t.warning : undefined}
            note="No device token, or Firebase is not configured."
          />
          <Stat
            label="Failed"
            value={funnel.failed}
            tone={funnel.failed > 0 ? t.danger : undefined}
            note="Firebase refused it. This is the only one that is a fault."
          />
          <Stat
            label="Still queued"
            value={funnel.pending}
            tone={funnel.pending > 20 ? t.warning : undefined}
            note="A number that stays high means something stopped running."
          />
        </div>

        {/* Opens, apart from the five. Against what ARRIVED, never against what was raised —
            dividing by people who never received it counts a muted phone as a person who
            chose not to read you. */}
        <div style={{
          display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap',
          marginTop: 10, padding: '12px 16px',
          border: `1px solid ${t.border}`, borderRadius: 12, background: t.surfaceMuted,
        }}>
          <span style={{ fontSize: 24, fontWeight: 800, color: t.series[0], lineHeight: 1 }}>
            {funnel.opened.toLocaleString()}
          </span>
          <span style={{ fontSize: 12.5, color: t.textMuted, flex: '1 1 260px', minWidth: 0, lineHeight: 1.55 }}>
            {funnel.openRatePercent === null
              ? 'opened. Nothing arrived in this window, so there is no rate to give.'
              : `opened — ${funnel.openRatePercent}% of the ${funnel.pushed.toLocaleString()} that arrived. Counted from the inbox, so reading it in the app counts as well as tapping the banner.`}
          </span>
        </div>
      </Section>

      {/* ---- the chart ---- */}
      <Section title="Day by day" hint="Every day in the window, including the quiet ones — a chart that drops empty days draws a flat line through an outage.">
        <Card>
          <StackedBars
            labels={engine.days.map(day => new Date(day.day).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }))}
            series={[
              { key: 'pushed', label: 'Reached a phone', values: engine.days.map(day => day.pushed) },
              { key: 'other', label: 'Muted, skipped or queued', values: engine.days.map(day => Math.max(0, day.written - day.pushed - day.failed)) },
              { key: 'failed', label: 'Failed', values: engine.days.map(day => day.failed) },
            ]}
            footnote="Hover a day for the breakdown."
          />
        </Card>
      </Section>

      {/* ---- reach: the ceiling nobody else shows ---- */}
      <Section
        title="How far it can reach at all"
        hint="Every send report divides by the people it reached. This one divides by everybody, which is the number that tells you whether push is worth writing for."
      >
        <Card>
          <div style={{ display: 'flex', gap: 22, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <div style={{
                fontSize: 40, fontWeight: 800, lineHeight: 1,
                color: reach.percent === null ? t.textSubtle
                  : reach.percent >= 70 ? t.success : reach.percent >= 40 ? t.warning : t.danger,
              }}>
                {reach.percent === null ? '—' : `${reach.percent}%`}
              </div>
              <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 6 }}>
                of active accounts can receive a push
              </div>
            </div>
            <div style={{ flex: '1 1 240px', minWidth: 0 }}>
              <ReachBar reachable={reach.peopleWithDevice} total={reach.activePeople} />
              <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.6, marginTop: 10 }}>
                {reach.note}
              </div>
              <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 6 }}>
                {reach.peopleMutingSomething.toLocaleString()} {reach.peopleMutingSomething === 1 ? 'person has' : 'people have'} turned at least one
                kind of notification off. That is a choice, not a fault — email still reaches them.
              </div>
            </div>
          </div>
        </Card>
      </Section>

      {/* ---- what breaks ---- */}
      <Section title="What is going wrong" hint="Grouped by cause rather than by message — raw errors carry their own counts inside them and group into a list of one.">
        {engine.faults.length === 0 ? (
          <Card>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: t.success, fontSize: 13.5, fontWeight: 700 }}>
              <Icon name="shield" size={17} />
              Nothing has failed in this window.
            </div>
          </Card>
        ) : (
          <Card pad={0}>
            {engine.faults.map((fault, index) => (
              <Fault key={fault.reason} fault={fault} first={index === 0} />
            ))}
          </Card>
        )}
      </Section>

      {/* ---- what it sends ---- */}
      <Section title="What it sends, and what people read" hint="Ranked by volume, not by open rate. A kind nobody opens matters far less when it went to eleven people.">
        {engine.topTypes.length === 0 ? null : (
          <Card pad={0}>
            {engine.topTypes.map(row => <TypeRow key={row.type} row={row} top={engine.topTypes[0].written} />)}
          </Card>
        )}
      </Section>

      {/* ---- what is waiting ---- */}
      <Section title="Waiting for somebody" hint="Each of these is a screen in this module.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: 10 }}>
          <Waiting to="/audiences" icon="people" label="Saved audiences" count={workload.savedAudiences} note="Definitions, re-resolved on every send." />
          <Waiting to="/broadcasts" icon="advert" label="Scheduled to go out" count={workload.scheduled} note="Can still be called off." />
          <Waiting to="/promos" icon="agreement" label="Paid, waiting to be read" count={workload.promosAwaitingReview} urgent={workload.promosAwaitingReview > 0} note="Somebody has paid and is waiting." />
          <Waiting to="/promos" icon="agreement" label="Waiting for payment" count={workload.promosAwaitingPayment} note="Nothing runs until the money lands." />
          <Waiting to="/promos" icon="spark" label="Promos running" count={workload.promosRunning} note="Live right now." />
          <Waiting to="/adverts" icon="advert" label="Adverts running" count={workload.advertsRunning} note="In the rails and the carousel." />
        </div>
      </Section>

      {/* ---- the last few sends ---- */}
      <Section title="The last announcements" hint="Open rate is against what was delivered, never against the audience.">
        {engine.recentSends.length === 0 ? null : (
          <Card pad={0}>
            {engine.recentSends.map(send => (
              <div key={send.id} style={{ padding: '11px 15px', borderTop: `1px solid ${t.border}` }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: t.text, flex: '1 1 160px', minWidth: 0 }}>{send.title}</span>
                  <Pill tone={send.status === 'Sent' ? 'success' : send.status === 'Cancelled' ? 'danger' : 'warning'}>
                    {send.status}
                  </Pill>
                  {send.status === 'Sent' ? (
                    <span style={{ fontSize: 12.5, color: t.textMuted }}>
                      <strong style={{ color: t.text }}>{send.deliveredCount.toLocaleString()}</strong> reached
                      {send.openRatePercent === null ? '' : ` · ${send.openRatePercent}% opened`}
                    </span>
                  ) : null}
                </div>
                <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 3 }}>
                  by {send.actorName}
                  {send.segmentName ? ` · to “${send.segmentName}”` : ''}
                  {send.emailedCount > 0 ? ` · ${send.emailedCount.toLocaleString()} also emailed` : ''}
                </div>
              </div>
            ))}
          </Card>
        )}
        <div style={{ marginTop: 10 }}>
          <Link to="/broadcasts" style={{ fontSize: 12.5, color: t.brand, fontWeight: 700, textDecoration: 'none' }}>
            Write an announcement →
          </Link>
        </div>
      </Section>
    </div>
  );
}

/* ---------------- pieces ---------------- */

function Verdict({ text, bad }: { text: string; bad: boolean }) {
  const { t } = useTheme();
  return (
    <div style={{
      border: `1px solid ${bad ? t.warning : t.border}`,
      background: bad ? t.warningSoft : t.surface,
      borderRadius: 12, padding: '14px 16px', marginBottom: 20,
      display: 'flex', gap: 11, alignItems: 'flex-start',
    }}>
      <span style={{ color: bad ? t.warning : t.success, flexShrink: 0, marginTop: 1 }}>
        <Icon name={bad ? 'warn' : 'pulse'} size={18} />
      </span>
      <span style={{ fontSize: 13.5, color: t.text, lineHeight: 1.6, fontWeight: 600 }}>{text}</span>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  const { t } = useTheme();
  return (
    <section style={{ marginBottom: 26 }}>
      <h2 style={{ fontSize: 14.5, fontWeight: 800, color: t.text, margin: '0 0 3px' }}>{title}</h2>
      {hint ? (
        <p style={{ fontSize: 11.5, color: t.textSubtle, lineHeight: 1.55, margin: '0 0 11px', maxWidth: 640 }}>{hint}</p>
      ) : <div style={{ height: 9 }} />}
      {children}
    </section>
  );
}

/**
 * Reach as a single bar, both halves drawn.
 *
 * The unreachable part is drawn rather than left as whitespace on purpose — a bar that stops
 * short reads as "the rest is coming", and a bar with a visible second half reads as "the rest
 * are people we cannot talk to", which is the fact being reported.
 */
function ReachBar({ reachable, total }: { reachable: number; total: number }) {
  const { t } = useTheme();
  const share = total <= 0 ? 0 : Math.round((reachable / total) * 100);
  return (
    <div>
      <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', background: t.surfaceMuted }}>
        <div style={{ width: `${share}%`, background: t.success }} />
        {/* A two-pixel gap so the two halves are two things rather than one bar with a
            colour change somewhere in the middle. */}
        <div style={{ width: 2, background: t.surface }} />
        <div style={{ flex: 1, background: t.borderStrong }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: t.textSubtle, marginTop: 5 }}>
        <span>{reachable.toLocaleString()} can be reached</span>
        <span>{Math.max(0, total - reachable).toLocaleString()} cannot</span>
      </div>
    </div>
  );
}

function Fault({ fault, first }: { fault: EngineFault; first: boolean }) {
  const { t } = useTheme();
  return (
    <div style={{ padding: '12px 15px', borderTop: first ? 'none' : `1px solid ${t.border}` }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: t.text, minWidth: 44 }}>
          {fault.count.toLocaleString()}
        </span>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: t.text, flex: '1 1 auto', minWidth: 0 }}>{fault.reason}</span>
      </div>
      <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.6, marginTop: 4, paddingLeft: 54 }}>
        {fault.meaning}
      </div>
    </div>
  );
}

function TypeRow({ row, top }: { row: EngineType; top: number }) {
  const { t } = useTheme();
  const share = top <= 0 ? 0 : Math.round((row.written / top) * 100);
  return (
    <div style={{ padding: '10px 15px', borderTop: `1px solid ${t.border}` }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: t.text, flex: '1 1 150px', minWidth: 0 }}>{row.label}</span>
        <span style={{ fontSize: 12.5, color: t.textMuted }}>
          <strong style={{ color: t.text }}>{row.written.toLocaleString()}</strong> raised
        </span>
        <span style={{ fontSize: 12, color: t.textSubtle, minWidth: 86, textAlign: 'right' }}>
          {row.openRatePercent === null ? 'never delivered' : `${row.openRatePercent}% opened`}
        </span>
      </div>
      <div style={{ height: 5, borderRadius: 3, background: t.surfaceMuted, marginTop: 6, overflow: 'hidden' }}>
        <div style={{ width: `${Math.max(2, share)}%`, height: '100%', borderRadius: 3, background: t.series[0] }} />
      </div>
    </div>
  );
}

function Waiting({ to, icon, label, count, note, urgent }: {
  to: string; icon: IconName; label: string; count: number; note: string; urgent?: boolean;
}) {
  const { t } = useTheme();
  return (
    <Link to={to} style={{ textDecoration: 'none' }}>
      <div style={{
        border: `1px solid ${urgent && count > 0 ? t.warning : t.border}`,
        background: urgent && count > 0 ? t.warningSoft : t.surface,
        borderRadius: 12, padding: '13px 15px', height: '100%',
      }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: t.textSubtle }}>
          <Icon name={icon} size={15} />
          <span style={{ fontSize: 11.5, fontWeight: 700 }}>{label}</span>
        </div>
        <div style={{ fontSize: 25, fontWeight: 800, color: t.text, marginTop: 6, lineHeight: 1.1 }}>
          {count.toLocaleString()}
        </div>
        <div style={{ fontSize: 11, color: t.textMuted, marginTop: 5, lineHeight: 1.5 }}>{note}</div>
      </div>
    </Link>
  );
}
