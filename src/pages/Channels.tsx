/**
 * The WhatsApp number, from this side.
 *
 * THIS SCREEN CANNOT SHOW YOU WHO ASKED WHAT, and that is not a restraint applied here. The
 * tables behind it hold a one-way fingerprint of a number, a kind of question and a timestamp —
 * no phone number, no message. So the promise printed on the public page is kept by there being
 * nothing to fetch, rather than by everybody remembering not to fetch it, and this page is
 * written to say so out loud where an operator will read it.
 *
 * What it is actually for is one question: is the number still working. A day at zero after a
 * week of hundreds means the webhook has stopped — Meta disables a webhook that refuses it, a
 * token expires, a deploy drops an environment variable — and nothing else in this console
 * would say so.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import { Card, EmptyState, ErrorNote, Loading, PageHeader, Pill, Table } from '../components/ui';
import { adminApi, type ChannelOverview } from '../api/admin';

const WINDOWS = [
  { hours: 24, label: 'Today' },
  { hours: 24 * 7, label: '7 days' },
  { hours: 24 * 30, label: '30 days' },
];

export function Channels() {
  const { t } = useTheme();
  const [hours, setHours] = useState(24);
  const [data, setData] = useState<ChannelOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setData(null);
    setError(null);
    adminApi
      .channelOverview(hours)
      .then(setData)
      .catch(caught => setError(caught instanceof Error ? caught.message : 'Could not read the channel.'));
  }, [hours]);

  useEffect(load, [load]);

  return (
    <div>
      <PageHeader
        title="The two numbers"
        subtitle="What people asked WhatsApp and SMS, and whether they answered. Counts only — there is nothing else stored."
        action={
          <div style={{ display: 'flex', gap: 6 }}>
            {WINDOWS.map(window => (
              <button
                key={window.hours}
                type="button"
                onClick={() => setHours(window.hours)}
                style={{
                  background: hours === window.hours ? t.accent : 'transparent',
                  border: `1px solid ${hours === window.hours ? t.accent : t.border}`,
                  borderRadius: 999,
                  color: hours === window.hours ? '#fff' : t.textMuted,
                  cursor: 'pointer',
                  fontSize: 12.5,
                  fontWeight: 700,
                  padding: '6px 13px',
                }}
              >
                {window.label}
              </button>
            ))}
          </div>
        }
      />

      {error ? <ErrorNote message={error} /> : null}
      {!data && !error ? <Loading /> : null}

      {data ? (
        <div style={{ display: 'grid', gap: 14 }}>
          {/* The first thing to know, before any number on the page means anything. Both doors
              side by side because they fail separately: Meta switches off a webhook that keeps
              erroring, and an aggregator stops when an invoice goes unpaid. */}
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
            {(data.channels ?? []).map(channel => (
              <Card key={channel.key}>
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <Pill tone={channel.live ? 'success' : 'warning'}>{channel.live ? 'Live' : 'Off'}</Pill>
                    <span style={{ color: t.text, fontSize: 14, fontWeight: 800 }}>{channel.label}</span>
                    <span style={{ color: t.textMuted, fontSize: 13.5, fontVariantNumeric: 'tabular-nums' }}>
                      {channel.number ?? 'no number set'}
                    </span>
                  </div>
                  <span style={{ color: t.text, fontSize: 20, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                    {channel.asked.toLocaleString()}
                    <span style={{ color: t.textMuted, fontSize: 12.5, fontWeight: 600 }}> messages</span>
                  </span>
                  <span style={{ color: t.textMuted, fontSize: 12.5, lineHeight: 1.55 }}>{channel.note}</span>
                </div>
              </Card>
            ))}
          </div>

          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <Figure label="Both numbers" value={data.asked} note={`messages in the last ${data.hours} hours`} />
            <Figure
              label="Got nothing back"
              value={data.unanswered}
              note="almost all of these are past the hour's limit"
            />
            <Figure label="Asked to be left alone" value={data.silenced} note="all time, until they write again" />
          </div>

          {data.asked === 0 ? (
            <EmptyState
              icon="💬"
              title="Nothing came in"
              message={
                (data.channels ?? []).some(channel => channel.live)
                  ? 'If this was busy yesterday, check the webhook in the Meta console and the aggregator\'s dashboard — a webhook that keeps returning an error gets switched off at the other end, and this is the only place that shows it.'
                  : 'Nothing can arrive until at least one of the numbers is configured.'
              }
            />
          ) : (
            <Card pad={0}>
              <Table head={['What was asked', 'Messages', 'Answered', '']}>
                {data.kinds.map(kind => (
                  <tr key={kind.kind}>
                    <td style={{ color: t.text, fontSize: 13.5, fontWeight: 600 }}>{kind.label}</td>
                    <td style={{ color: t.text, fontSize: 13.5, fontVariantNumeric: 'tabular-nums' }}>{kind.asked}</td>
                    <td style={{ color: t.textMuted, fontSize: 13.5, fontVariantNumeric: 'tabular-nums' }}>
                      {kind.answered}
                    </td>
                    <td style={{ width: 180 }}>
                      <Bar share={data.asked === 0 ? 0 : kind.asked / data.asked} />
                    </td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}

          <Card>
            <div style={{ display: 'grid', gap: 6 }}>
              <span style={{ color: t.text, fontSize: 14, fontWeight: 700 }}>
                There is no screen behind this one.
              </span>
              <span style={{ color: t.textMuted, fontSize: 13, lineHeight: 1.6 }}>
                No phone number and no message is written down. What is kept is a one-way
                fingerprint of the number — enough to count an hour's messages and to honour a
                "stop", and not enough to ring anybody or to reverse into a list of who asked what.
                A table of numbers beside the health codes they looked up would be the worst thing
                in this product, so it is not collected rather than not shown.
              </span>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function Figure({ label, value, note }: { label: string; value: number; note: string }) {
  const { t } = useTheme();
  return (
    <Card>
      <div style={{ display: 'grid', gap: 3 }}>
        <span style={{ color: t.textMuted, fontSize: 11.5, fontWeight: 700, letterSpacing: 0.6 }}>
          {label.toUpperCase()}
        </span>
        <span style={{ color: t.text, fontSize: 26, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
          {value.toLocaleString()}
        </span>
        <span style={{ color: t.textMuted, fontSize: 12, lineHeight: 1.45 }}>{note}</span>
      </div>
    </Card>
  );
}

function Bar({ share }: { share: number }) {
  const { t } = useTheme();
  return (
    <div style={{ background: t.border, borderRadius: 999, height: 6, overflow: 'hidden', width: '100%' }}>
      <div style={{ background: t.accent, height: '100%', width: `${Math.round(share * 100)}%` }} />
    </div>
  );
}
