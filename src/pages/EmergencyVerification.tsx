/**
 * The chasing list.
 *
 * <p>Every number in the directory that nobody has rung within ninety days — never rung,
 * due, expired, or reported changed. Public numbers come first, because a stale hotline
 * reaches a citizen and a stale supervisor reaches a dispatcher. The two buttons on each
 * row are the whole job: ring it, and say what happened.</p>
 */
import { useCallback, useEffect, useState } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import { Card, ErrorNote, Loading, PageHeader, Toasts, useToasts } from '../components/ui';
import { emergencyApi, type ContactsDuePage } from '../api/emergency';
import { ContactsTable } from './EmergencyDirectory';
import type { AdminIdentity } from '../api/admin';

export function EmergencyVerification({ identity }: { identity: AdminIdentity }) {
  const { t } = useTheme();
  const { toasts, push } = useToasts();
  const [page, setPage] = useState<ContactsDuePage | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  void identity;

  const load = useCallback(() => {
    Promise.all([emergencyApi.contactsDue(1, 200), emergencyApi.overview()])
      .then(([result, overview]) => { setPage(result); setCanEdit(overview.canEdit); setError(null); })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load the list.'));
  }, []);
  useEffect(load, [load]);

  if (error) return <ErrorNote message={error} />;
  if (!page) return <Loading />;

  return (
    <>
      <PageHeader
        title="Numbers to ring"
        subtitle={page.total === 0
          ? 'Every number in the directory has been rung within ninety days.'
          : `${page.total} ${page.total === 1 ? 'number' : 'numbers'} nobody has confirmed within ninety days. Public ones first.`}
      />
      <Card>
        <ContactsTable
          contacts={page.items}
          canEdit={canEdit}
          onChanged={message => { load(); if (message) push(message); }}
          push={push}
          showPlace
          showUnit
        />
        {page.total > page.items.length ? <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 8 }}>Showing the first {page.items.length}. Ring these and the rest follow.</div> : null}
      </Card>
      <Toasts toasts={toasts} />
    </>
  );
}
