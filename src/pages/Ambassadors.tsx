/**
 * Ambassadors — who is actually bringing people in.
 *
 * This page only became possible once invites were attributed properly: before, a code had
 * to be typed in by hand after signup, so the numbers here would have been near zero and
 * would have said nothing about who was doing the work.
 *
 * "Providers brought" is separated from the headline count deliberately. Somebody who signs
 * up thirty customers has done something useful; somebody who signs up thirty providers has
 * built you a market, and those are not the same contribution.
 */
import { useCallback, useEffect, useState } from 'react';
import { adminApi, type AmbassadorsPage } from '../api/admin';
import { useTheme } from '../theme/ThemeProvider';
import { Button, Card, EmptyState, ErrorNote, Loading, PageHeader, Pill, fmtDate, timeAgo } from '../components/ui';

export function Ambassadors() {
  const { t } = useTheme();
  const [data, setData] = useState<AmbassadorsPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try { setData(await adminApi.ambassadors()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load ambassadors.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="Ambassadors"
        subtitle={
          data
            ? `${data.totalAttributedSignups} signups credited to somebody · ${data.attributedLast30Days} in the last 30 days · ${data.activeReferrers} people still bringing others.`
            : 'Everyone whose invite brought somebody onto the platform.'
        }
        action={<Button onClick={() => void load()}>Refresh</Button>}
      />
      {error ? <ErrorNote message={error} /> : null}

      {data === null ? <Loading label="Counting…" /> : data.rows.length === 0 ? (
        <EmptyState
          icon="🌱"
          title="Nobody has been credited yet"
          message="Invites are credited automatically when somebody joins through a shared link. If this stays empty after people start sharing, the link is not carrying the code."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {data.rows.map((row, index) => (
            <Card key={row.userId} pad={14}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 17, flexShrink: 0,
                  background: index < 3 ? 'rgba(255,107,44,0.16)' : t.surfaceMuted,
                  color: index < 3 ? '#FF6B2C' : t.textMuted,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 900, fontSize: 13,
                }}>
                  {index + 1}
                </div>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, color: t.text, fontSize: 14 }}>{row.name}</span>
                    {row.code ? <Pill tone="neutral">{row.code}</Pill> : null}
                    {row.invitedLast30Days > 0 ? <Pill tone="success">active</Pill> : <Pill tone="neutral">quiet</Pill>}
                  </div>
                  <div style={{ color: t.textMuted, fontSize: 12.5, marginTop: 2 }}>
                    {row.email ?? ''}{row.email && row.phoneNumber ? ' · ' : ''}{row.phoneNumber ?? ''}
                  </div>
                  <div style={{ color: t.textSubtle, fontSize: 11.5, marginTop: 2 }}>
                    joined {fmtDate(row.joinedAt)}
                    {row.lastInviteAt ? ` · last invite ${timeAgo(row.lastInviteAt)}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 18, flexShrink: 0 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 900, fontSize: 19, color: t.text }}>{row.invited}</div>
                    <div style={{ color: t.textSubtle, fontSize: 11 }}>brought in</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 900, fontSize: 19, color: row.invitedProviders > 0 ? '#2E9E6B' : t.textMuted }}>{row.invitedProviders}</div>
                    <div style={{ color: t.textSubtle, fontSize: 11 }}>became providers</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 900, fontSize: 19, color: t.text }}>{row.invitedLast30Days}</div>
                    <div style={{ color: t.textSubtle, fontSize: 11 }}>last 30 days</div>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
