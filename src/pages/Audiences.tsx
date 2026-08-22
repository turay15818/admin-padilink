/**
 * Saved audiences, as a screen rather than a modal inside a modal.
 *
 * They shipped reachable only by starting to write an announcement and then clicking through
 * two dialogs — which meant the most considered part of the engine was the part nobody found.
 * Defining who you are talking to is work in its own right, usually done well before there is
 * anything to say, so it gets its own page.
 *
 * The editor itself is the same component the compose flow uses. Not a copy that agrees with
 * it today: the same file, so a condition added to one is a condition added to both.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../theme/ThemeProvider';
import {
  Button, Card, EmptyState, ErrorNote, Input, Loading, PageHeader, Pill, Toasts, timeAgo, useToasts,
} from '../components/ui';
import { Icon } from '../components/Icon';
import { adminApi, SEGMENT_FAMILIES, type Segment, type SegmentFamilyKey } from '../api/admin';

/** Which families a saved audience actually uses. Drawn from the same map the editor renders. */
function familiesInUse(group: Segment): { key: SegmentFamilyKey; chip: string; warn: boolean }[] {
  const keys = Object.keys(SEGMENT_FAMILIES) as SegmentFamilyKey[];
  return keys
    .filter(key => (group[key] as number) > 0)
    .map(key => {
      const definition = SEGMENT_FAMILIES[key];
      return { key, chip: definition.chip, warn: 'warn' in definition && definition.warn === true };
    });
}

export function Audiences() {
  const { t } = useTheme();
  const [groups, setGroups] = useState<Segment[] | null>(null);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const { toasts, push } = useToasts();
  const navigate = useNavigate();
  // The editor is a page now, so "saved" arrives back here in router state rather than as a
  // callback. Cleared immediately: a refresh should not re-announce a save from ten minutes ago.
  const location = useLocation();
  useEffect(() => {
    const saved = (location.state as { saved?: string } | null)?.saved;
    if (!saved) return;
    push(saved);
    navigate('/audiences', { replace: true, state: null });
  }, [location.state, navigate, push]);

  const load = useCallback(() => {
    adminApi.segments()
      .then(result => { setGroups(result); setError(null); })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load the audiences.'));
  }, []);

  useEffect(load, [load]);

  const shown = useMemo(() => {
    if (!groups) return null;
    const needle = filter.trim().toLowerCase();
    if (!needle) return groups;
    return groups.filter(group =>
      group.name.toLowerCase().includes(needle)
      || group.describes.toLowerCase().includes(needle)
      || (group.description ?? '').toLowerCase().includes(needle));
  }, [groups, filter]);

  // The one number worth putting at the top: an audience that comes to nobody is not a saved
  // definition waiting to be used, it is a send that will quietly do nothing.
  const empty = groups?.filter(group => group.reachableNow === 0).length ?? 0;

  const remove = (group: Segment) => {
    setRemoving(group.id);
    adminApi.deleteSegment(group.id)
      .then(() => { push(`“${group.name}” is gone.`); load(); })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'That did not work.'))
      .finally(() => setRemoving(null));
  };

  return (
    <div>
      <PageHeader
        title="Audiences"
        subtitle="Who you are talking to, saved and re-counted every time."
        action={
          <Link to="/audiences/new" style={{ textDecoration: 'none' }}>
            <Button>＋ New audience</Button>
          </Link>
        }
      />

      <Card style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
          <span style={{ color: t.textSubtle, marginTop: 1, flexShrink: 0 }}><Icon name="people" size={17} /></span>
          <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.65 }}>
            An audience is a description, not a list of names. “Providers in Bo with no booking
            in thirty days” is worked out again every time you send to it, so somebody who got
            work yesterday drops out of it on their own — which is why a re-engagement message
            never nags the people it already brought back.
            <div style={{ marginTop: 7 }}>
              Every one of them is also capped by the same thing: somebody has to have a device
              that can receive a notification. An audience can never reach more people than a
              plain announcement would — see <Link to="/notifications" style={{ color: t.brand, fontWeight: 700, textDecoration: 'none' }}>the engine</Link> for
              how far that reaches at all.
            </div>
          </div>
        </div>
      </Card>

      {error ? <ErrorNote message={error} /> : null}

      {!shown ? <Loading /> : (
        <>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 200px', minWidth: 0, maxWidth: 340 }}>
              <Input value={filter} onChange={setFilter} placeholder="Find an audience" />
            </div>
            <span style={{ fontSize: 12, color: t.textSubtle }}>
              {groups!.length} saved
              {empty > 0 ? ` · ${empty} come${empty === 1 ? 's' : ''} to nobody right now` : ''}
            </span>
          </div>

          {shown.length === 0 ? (
            <EmptyState
              icon="👥"
              title={filter.trim() ? 'Nothing matches that' : 'No audiences yet'}
              message={filter.trim()
                ? 'Try part of the name, or what it describes.'
                : 'Save one and it will be waiting the next time you write an announcement.'}
            />
          ) : (
            <div style={{ display: 'grid', gap: 11 }}>
              {shown.map(group => {
                const families = familiesInUse(group);
                return (
                  <Card key={group.id} pad={15}>
                    <div data-audience={group.name} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                        <div style={{ fontSize: 14.5, fontWeight: 800, color: t.text }}>{group.name}</div>
                        {group.description ? (
                          <div style={{ fontSize: 12, color: t.textMuted, marginTop: 3, lineHeight: 1.55 }}>
                            {group.description}
                          </div>
                        ) : null}
                        {/* Generated from the conditions, never typed — so it cannot drift from
                            what the audience actually does after somebody edits it. */}
                        <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 6, lineHeight: 1.6 }}>
                          {group.describes}
                        </div>
                      </div>

                      <div style={{ textAlign: 'right', minWidth: 90, flexShrink: 0 }}>
                        <div style={{
                          fontSize: 26, fontWeight: 800, lineHeight: 1.1,
                          color: group.reachableNow === 0 ? t.warning : t.text,
                        }}>
                          {group.reachableNow.toLocaleString()}
                        </div>
                        <div style={{ fontSize: 11, color: t.textSubtle, marginTop: 3 }}>
                          reachable right now
                        </div>
                      </div>
                    </div>

                    {families.length > 0 ? (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                        {families.map(family => (
                          <Pill key={family.key} tone={family.warn ? 'warning' : 'neutral'}>{family.chip}</Pill>
                        ))}
                      </div>
                    ) : null}

                    <div style={{
                      display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap',
                      marginTop: 12, paddingTop: 11, borderTop: `1px solid ${t.border}`,
                    }}>
                      <span style={{ fontSize: 11.5, color: t.textSubtle, flex: '1 1 180px', minWidth: 0 }}>
                        by {group.createdByName}
                        {group.useCount > 0
                          ? ` · used ${group.useCount} ${group.useCount === 1 ? 'time' : 'times'}, last ${timeAgo(group.lastUsedAt!)}`
                          : ' · never used'}
                      </span>
                      <Link to="/broadcasts" style={{ textDecoration: 'none' }}>
                        <Button size="sm" tone="subtle">Write to them</Button>
                      </Link>
                      <Link to={`/audiences/${group.id}`} style={{ textDecoration: 'none' }}>
                        <Button size="sm" tone="subtle">Change</Button>
                      </Link>
                      <Button
                        size="sm"
                        tone="subtle"
                        disabled={removing === group.id}
                        onClick={() => remove(group)}
                      >
                        {removing === group.id ? 'Removing…' : 'Remove'}
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      <Toasts toasts={toasts} />
    </div>
  );
}
