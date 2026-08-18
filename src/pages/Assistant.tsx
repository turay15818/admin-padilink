/**
 * The AI half of the console.
 *
 * Led by what to do, not what happened. A briefing that reports "no jobs were finished this
 * week" is describing a problem; "consider suspending this person, three complaints against
 * them were upheld, here is their record" is handing somebody the afternoon's work. The action
 * queue is therefore the first thing on the page and the write-up sits under it.
 *
 * Four things share this screen because they share one rule, and the rule is worth putting
 * on the screen rather than only in the code: every number here was worked out by the
 * database before any model saw it. The model is given finished figures and asked to explain
 * and weigh them. It cannot count, cannot look anything up, and cannot act.
 *
 * So the figures are shown beside the prose everywhere. A briefing you can check without
 * leaving the page is one people keep opening; one you have to take on faith is one they
 * quietly stop reading after the first time it is wrong.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../theme/ThemeProvider';
import { Button, Card, ErrorNote, Input, Loading, PageHeader, Pill, Spinner, timeAgo } from '../components/ui';
import {
  adminApi, type ActionQueue, type AdminAction, type AdminBriefing, type AskAnswer, type Signal,
} from '../api/admin';

/**
 * Morning, afternoon or evening — from the reader's own clock.
 *
 * Deliberately not the server's. The API runs in UTC and this platform is read in Freetown; a
 * greeting computed server-side would say "good morning" at nine in the evening, which is the
 * kind of small wrongness that makes people trust nothing else on the page either.
 */
function partOfDay(now = new Date()) {
  const hour = now.getHours();
  if (hour < 12) return 'This morning';
  if (hour < 17) return 'This afternoon';
  return 'This evening';
}

const EXAMPLES = [
  'How is retention looking?',
  'Which providers should we recruit, and where?',
  'What is waiting for a decision?',
  'Who has stopped using the platform?',
];

export function Assistant() {
  const { t } = useTheme();
  const [brief, setBrief] = useState<AdminBriefing | null>(null);
  const [queue, setQueue] = useState<ActionQueue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Recomputed on every render rather than held in state: somebody who leaves this open over
  // lunch should not be told it is still morning.
  const greeting = partOfDay();

  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  const [askError, setAskError] = useState<string | null>(null);

  const load = useCallback(() => {
    setRefreshing(true);
    adminApi.briefing()
      .then(result => { setBrief(result); setError(null); })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not put that together.'))
      .finally(() => setRefreshing(false));

    // Fetched alongside and allowed to fail alone. The actions are the useful half of this
    // page — losing the write-up must not take them with it, and the reverse is also true.
    adminApi.actions().then(setQueue).catch(() => setQueue(null));
  }, []);

  useEffect(load, [load]);

  const ask = (text: string) => {
    const trimmed = text.trim();
    if (trimmed.length < 3 || asking) return;
    setAsking(true);
    setAskError(null);
    adminApi.ask(trimmed)
      .then(result => { setAnswer(result); setQuestion(''); })
      .catch((caught: unknown) => setAskError(caught instanceof Error ? caught.message : 'That did not work.'))
      .finally(() => setAsking(false));
  };

  if (error) return <ErrorNote message={error} />;
  if (!brief) return <Loading />;

  return (
    <>
      <PageHeader
        title={greeting}
        subtitle="What to do, what changed, and what looks wrong."
        action={
          <Button tone="subtle" disabled={refreshing} onClick={load}>
            {refreshing ? 'Working it out…' : 'Work it out again'}
          </Button>
        }
      />

      {/* ---------------- what to do ---------------- */}
      {queue ? (
        <Card style={{
          background: queue.todayCount > 0 ? t.warningSoft : t.surface,
          borderColor: queue.todayCount > 0 ? t.warning : t.border,
          marginBottom: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: t.text }}>What to do</span>
            {queue.todayCount > 0 ? <Pill tone="danger">{queue.todayCount} today</Pill> : null}
          </div>
          <div style={{ fontSize: 13.5, color: t.textMuted, lineHeight: 1.7, marginTop: 6 }}>
            {queue.verdict}
          </div>
          <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 6, lineHeight: 1.55 }}>
            Every one of these is a rule with a written-down threshold, not an opinion. Nothing
            here has been done — each button opens the ordinary screen, which asks you to confirm
            and records that it was you.
          </div>

          {queue.unavailable ? (
            <div style={{
              marginTop: 12, background: t.surfaceMuted, borderRadius: 10, padding: '10px 13px',
              fontSize: 12.5, color: t.textMuted, lineHeight: 1.6,
            }}>
              {queue.unavailable}
            </div>
          ) : null}

          <div style={{ marginTop: 14 }}>
            {queue.actions.length === 0 ? (
              <div style={{ fontSize: 13, color: t.textMuted, padding: '6px 0' }}>
                Nothing needs a decision. Every queue is clear and nobody has crossed a line.
              </div>
            ) : (
              queue.actions.map(action => <ActionRow key={action.key} action={action} />)
            )}
          </div>
        </Card>
      ) : null}

      {/* ---------------- the headline ---------------- */}
      <Card style={{
        background: brief.signals.some(signal => signal.severity >= 3) ? t.warningSoft : t.surface,
        borderColor: brief.signals.some(signal => signal.severity >= 3) ? t.warning : t.border,
      }}>
        <div style={{ fontSize: 19, fontWeight: 800, color: t.text, lineHeight: 1.4 }}>
          {brief.headline}
        </div>
        <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 8 }}>
          worked out {timeAgo(brief.generatedAt)} · {brief.tookMilliseconds}ms
          {brief.aiWrote ? ' · written up by AI from the figures below' : ''}
        </div>

        {brief.unavailable ? (
          <div style={{
            marginTop: 12, background: t.surfaceMuted, borderRadius: 10, padding: '10px 13px',
            fontSize: 12.5, color: t.textMuted, lineHeight: 1.6,
          }}>
            {brief.unavailable}
          </div>
        ) : null}

        {brief.sections.map(section => (
          <div key={section.heading} style={{ marginTop: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: t.text, marginBottom: 5 }}>
              {section.heading}
            </div>
            <div style={{ fontSize: 13.5, color: t.textMuted, lineHeight: 1.7 }}>{section.body}</div>
            {section.points.length > 0 ? (
              <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                {section.points.map(point => (
                  <li key={point} style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.65, marginBottom: 3 }}>
                    {point}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </Card>

      {/* ---------------- what it was written from ---------------- */}
      <Card style={{ marginTop: 14 }}>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: t.text, marginBottom: 4 }}>
          The figures it was written from
        </div>
        <div style={{ fontSize: 12, color: t.textSubtle, marginBottom: 12, lineHeight: 1.6 }}>
          Worked out by the database, not by the AI. Shown here so anything said above can be
          checked without leaving the page.
        </div>
        {brief.facts.map(fact => (
          <div
            key={fact}
            style={{ fontSize: 13, color: t.text, padding: '7px 0', borderBottom: `1px solid ${t.border}` }}
          >
            {fact}
          </div>
        ))}
      </Card>

      {/* ---------------- the watchdog ---------------- */}
      <Card style={{ marginTop: 14 }}>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: t.text, marginBottom: 4 }}>
          Things that look wrong
        </div>
        <div style={{ fontSize: 12, color: t.textSubtle, marginBottom: 12, lineHeight: 1.6 }}>
          Patterns nobody would have thought to search for — accounts appearing together, reviews
          arriving in a burst, a city that stopped. Every one is found by a query, not by a model.
        </div>

        {brief.signals.length === 0 ? (
          <div style={{ fontSize: 13, color: t.textMuted, padding: '8px 0' }}>
            Nothing stood out. That is the good version of this list.
          </div>
        ) : (
          brief.signals.map(signal => <SignalRow key={signal.key} signal={signal} />)
        )}
      </Card>

      {/* ---------------- ask anything ---------------- */}
      <Card style={{ marginTop: 14 }}>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: t.text, marginBottom: 4 }}>Ask something</div>
        <div style={{ fontSize: 12, color: t.textSubtle, marginBottom: 12, lineHeight: 1.6 }}>
          Answered from live data. The AI picks which question to run and writes the reply, but the
          numbers come from the database and are shown underneath — so a wrong answer is always
          visibly wrong.
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <Input
              value={question}
              onChange={setQuestion}
              placeholder="e.g. Why are bookings down this month?"
              onEnter={() => ask(question)}
            />
          </div>
          <Button tone="primary" disabled={asking || question.trim().length < 3} onClick={() => ask(question)}>
            {asking ? <Spinner size={14} /> : 'Ask'}
          </Button>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
          {EXAMPLES.map(example => (
            <button
              key={example}
              type="button"
              onClick={() => ask(example)}
              disabled={asking}
              style={{
                background: t.surfaceMuted, border: `1px solid ${t.border}`, borderRadius: 999,
                padding: '5px 11px', fontSize: 11.5, color: t.textMuted,
                cursor: asking ? 'default' : 'pointer',
              }}
            >
              {example}
            </button>
          ))}
        </div>

        {askError ? <div style={{ marginTop: 12 }}><ErrorNote message={askError} /></div> : null}

        {answer ? (
          <div style={{ marginTop: 16, borderTop: `1px solid ${t.border}`, paddingTop: 14 }}>
            <div style={{ fontSize: 12, color: t.textSubtle, marginBottom: 6 }}>
              “{answer.question}”
            </div>
            {answer.unavailable ? (
              <div style={{ fontSize: 13, color: t.warning, lineHeight: 1.6 }}>{answer.unavailable}</div>
            ) : null}
            {answer.answer ? (
              <div style={{ fontSize: 14, color: t.text, lineHeight: 1.75 }}>{answer.answer}</div>
            ) : null}

            {answer.figures.length > 0 ? (
              <>
                <div style={{ fontSize: 11.5, color: t.textSubtle, margin: '14px 0 6px', fontWeight: 700 }}>
                  THE FIGURES IT WAS GIVEN
                </div>
                {answer.figures.map(figure => (
                  <div
                    key={figure.label}
                    style={{
                      display: 'flex', gap: 12, padding: '7px 0',
                      borderBottom: `1px solid ${t.border}`, alignItems: 'baseline',
                    }}
                  >
                    <div style={{ flex: 1, fontSize: 12.5, color: t.textMuted }}>{figure.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{figure.value}</div>
                    {figure.link ? (
                      <Link to={figure.link} style={{ fontSize: 11.5, color: t.brand, textDecoration: 'none' }}>
                        open ↗
                      </Link>
                    ) : null}
                  </div>
                ))}
              </>
            ) : null}
          </div>
        ) : null}
      </Card>
    </>
  );
}

/**
 * One thing to do, with its evidence and a way to go and do it.
 *
 * The evidence is above the button and the button says where it goes, not what it does — this
 * screen recommends and the next one decides. A row that said "Suspend" and suspended somebody
 * would be a row that suspends the wrong person the first afternoon somebody is tired.
 */
function ActionRow({ action }: { action: AdminAction }) {
  const { t } = useTheme();
  const tone = action.severity >= 3 ? t.danger : action.severity === 2 ? t.warning : t.textSubtle;

  return (
    <div
      data-action={action.kind}
      style={{
        display: 'flex', gap: 12, padding: '12px 0', borderTop: `1px solid ${t.border}`,
        alignItems: 'flex-start',
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 5, background: tone, marginTop: 7, flexShrink: 0 }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: t.text, lineHeight: 1.45 }}>
          {action.title}
        </div>

        {/* Facts first. Somebody should be able to disagree with the recommendation and still
            trust every number under it. */}
        <ul style={{ margin: '6px 0 0', paddingLeft: 17 }}>
          {action.why.map(why => (
            <li key={why} style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.6, marginBottom: 2 }}>
              {why}
            </li>
          ))}
        </ul>

        {action.note ? (
          <div style={{ fontSize: 12, color: t.textSubtle, marginTop: 6, lineHeight: 1.6, fontStyle: 'italic' }}>
            {action.note}
          </div>
        ) : null}

        {action.suggestedReason ? (
          <div style={{
            marginTop: 8, background: t.surfaceMuted, borderRadius: 9, padding: '8px 11px',
            fontSize: 11.5, color: t.textMuted, lineHeight: 1.55,
          }}>
            <strong style={{ color: t.text }}>Suggested wording:</strong> “{action.suggestedReason}”
          </div>
        ) : null}
      </div>

      <Link
        to={action.route}
        style={{
          flexShrink: 0, fontSize: 12.5, fontWeight: 700, color: t.brand, textDecoration: 'none',
          border: `1px solid ${t.border}`, borderRadius: 9, padding: '7px 12px', whiteSpace: 'nowrap',
        }}
      >
        {action.actionLabel} →
      </Link>
    </div>
  );
}

function SignalRow({ signal }: { signal: Signal }) {
  const { t } = useTheme();
  const tone = signal.severity >= 3 ? t.danger : signal.severity === 2 ? t.warning : t.textSubtle;

  return (
    <div
      data-signal={signal.kind}
      style={{ display: 'flex', gap: 12, padding: '11px 0', borderBottom: `1px solid ${t.border}` }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 5, background: tone, marginTop: 6, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: t.text }}>{signal.title}</div>
        {/* The evidence, before any explanation. Somebody should be able to disbelieve the
            prose and still act on the number. */}
        <div style={{ fontSize: 12, color: t.textMuted, marginTop: 3, lineHeight: 1.6 }}>
          {signal.evidence}
        </div>
        {signal.explanation ? (
          <div style={{ fontSize: 12, color: t.textSubtle, marginTop: 5, lineHeight: 1.6, fontStyle: 'italic' }}>
            {signal.explanation}
          </div>
        ) : null}
      </div>
      <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
        <Pill tone={signal.severity >= 3 ? 'danger' : signal.severity === 2 ? 'warning' : 'neutral'}>
          {signal.severity >= 3 ? 'today' : signal.severity === 2 ? 'look' : 'note'}
        </Pill>
        {signal.link ? (
          <div style={{ marginTop: 5 }}>
            <Link to={signal.link} style={{ fontSize: 11.5, color: t.brand, textDecoration: 'none' }}>
              open ↗
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
