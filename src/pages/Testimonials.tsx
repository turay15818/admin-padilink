/**
 * Where the best ones get chosen.
 *
 * WHAT THIS SCREEN IS FOR, and the one thing it must never do. People write to us about what
 * Vacancy did for them, and a few of those go on the front page. That is an editorial decision
 * — it is fine to leave a kind message unpublished — but it is NOT a permission. The writer
 * decides whether they may be quoted at all, whether their name goes with it, and whether their
 * face does. This screen can choose among the ones offered; it cannot manufacture one.
 *
 * So the card leads with what the HOMEPAGE would print, not with the account. "A tradesperson ·
 * Electrician · Makeni" is the artefact being judged; the real name sits underneath as
 * provenance. A moderator reading the person instead of the quote is how a thin account with a
 * lovely sentence gets published and a real customer with an awkward one does not.
 *
 * Publishing a quote whose writer has withdrawn is refused by the server. This screen does not
 * show the button at all, so nobody is ever offered an action that would be a breach if it worked.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import {
  Button, Card, EmptyState, ErrorNote, Input, Loading, PageHeader, Pill, Textarea,
  Toasts, fmtDate, timeAgo, useToasts,
} from '../components/ui';
import { adminApi, type AdminTestimonial, type AdminTestimonialPage } from '../api/admin';

type Tab = { key: string; label: string; status?: string; featuredOnly?: boolean };

const TABS: Tab[] = [
  { key: 'waiting', label: 'Waiting', status: 'submitted' },
  { key: 'featured', label: 'On the front page', featuredOnly: true },
  { key: 'published', label: 'Published', status: 'published' },
  { key: 'declined', label: 'Not used', status: 'declined' },
  { key: 'all', label: 'Everything' },
];

export function Testimonials() {
  const { t } = useTheme();
  const { toasts, push } = useToasts();
  const [tab, setTab] = useState<Tab>(TABS[0]);
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const [page, setPage] = useState<AdminTestimonialPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    adminApi.testimonials({ status: tab.status, featuredOnly: tab.featuredOnly, search: applied || undefined, pageSize: 50 })
      .then(setPage)
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Could not load what people have written.');
        setPage(null);
      });
  }, [tab, applied]);
  useEffect(load, [load]);

  const act = async (row: AdminTestimonial, action: 'publish' | 'decline' | 'feature' | 'unfeature') => {
    const note = (notes[row.id] ?? '').trim();
    if (action === 'decline' && !note) {
      // Not shown to the writer — telling somebody their kind words were not good enough is
      // worse than saying nothing. It is here so the next person to open the queue does not
      // re-litigate a decision somebody already made.
      push('Say why. Only this console sees it, and it stops the next person re-reading it.', 'error');
      return;
    }
    setBusy(row.id);
    try {
      await adminApi.moderateTestimonial(row.id, { action, note: note || null });
      push(
        action === 'feature' ? `${row.publicName} is on the front page.`
          : action === 'publish' ? `${row.publicName} can now appear on the site.`
            : action === 'unfeature' ? 'Taken off the front page. It is still published.'
              : 'Left unpublished.',
      );
      setNotes((prev) => ({ ...prev, [row.id]: '' }));
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : 'That did not save.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const rows = page?.items ?? [];

  return (
    <>
      <PageHeader
        title="What people say about us"
        subtitle="Written by people who used Vacancy and offered the words. Choose which go on the front page — you can decline any of them, but you can never publish one its writer has not offered."
        action={page && page.waiting > 0 ? <Pill tone="warning">{page.waiting} waiting</Pill> : undefined}
      />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        {TABS.map((entry) => (
          <Button
            key={entry.key}
            size="sm"
            tone={entry.key === tab.key ? 'primary' : 'subtle'}
            onClick={() => setTab(entry)}
          >
            {entry.label}
            {entry.key === 'waiting' && page && page.waiting > 0 ? ` · ${page.waiting}` : ''}
          </Button>
        ))}
        <div style={{ flex: '1 1 200px', minWidth: 180, maxWidth: 320 }}>
          <Input
            value={search}
            onChange={setSearch}
            onEnter={() => setApplied(search.trim())}
            placeholder="A word in the quote, or who wrote it"
          />
        </div>
        {applied ? <Button size="sm" tone="subtle" onClick={() => { setSearch(''); setApplied(''); }}>Clear</Button> : null}
      </div>

      {error ? <ErrorNote message={error} /> : null}
      {page === null && !error ? <Loading /> : null}
      {page !== null && rows.length === 0 ? (
        <EmptyState
          icon="speech"
          title={tab.key === 'waiting' ? 'Nothing waiting' : 'Nothing here'}
          message={
            tab.key === 'waiting'
              ? 'Everything people have written has been looked at.'
              : 'Nobody matches that filter. The form is on the website and in the app, under "Tell us how it went".'
          }
        />
      ) : null}

      <div style={{ display: 'grid', gap: 14 }}>
        {rows.map((row) => (
          <Card key={row.id}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
              {row.live ? <Pill tone="success">On the site</Pill> : null}
              {row.featured ? <Pill tone="accent">★ Front page</Pill> : null}
              {row.status === 'Submitted' ? <Pill tone="warning">Waiting</Pill> : null}
              {row.status === 'Declined' ? <Pill tone="neutral">Not used</Pill> : null}
              {/*
                The state that changes what the buttons may do. A published quote whose writer
                has since withdrawn stays Published in the table — consent is what gates it — so
                without this the row would read "published" and show nothing on the site.
              */}
              {!row.mayShowPublicly ? <Pill tone="danger">Writer withdrew consent</Pill> : null}
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 12, color: t.textMuted }}>{timeAgo(row.submittedAt)}</span>
            </div>

            {/* ---- the artefact: exactly what a stranger would read ------------- */}
            <div style={{ border: `1px solid ${t.border}`, borderRadius: 14, padding: 16, background: t.surfaceMuted }}>
              <div style={{ color: t.warning, fontSize: 13, letterSpacing: 1 }} aria-label={`${row.rating} out of 5`}>
                {'★'.repeat(row.rating)}{'☆'.repeat(5 - row.rating)}
              </div>
              {row.headline ? (
                <div style={{ fontSize: 15.5, fontWeight: 800, color: t.text, marginTop: 8 }}>{row.headline}</div>
              ) : null}
              <p style={{ fontSize: 14.5, color: t.text, lineHeight: 1.65, margin: '8px 0 0' }}>&ldquo;{row.quote}&rdquo;</p>
              <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginTop: 12 }}>
                {row.publicName}
                <span style={{ fontWeight: 500, color: t.textMuted }}> · {row.publicAttribution}</span>
              </div>
            </div>

            {/* ---- the provenance: who is behind it, and what they have done ---- */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
              <Pill tone="neutral">Account: {row.authorName}</Pill>
              <Pill tone={row.completedBookings > 0 ? 'info' : 'warning'}>
                {row.completedBookings === 0
                  ? 'No completed bookings'
                  : `${row.completedBookings} completed booking${row.completedBookings === 1 ? '' : 's'}`}
              </Pill>
              <Pill tone="neutral">Joined {fmtDate(row.authorJoinedAt)}</Pill>
              <Pill tone={row.mayShowName ? 'neutral' : 'info'}>{row.mayShowName ? 'Name offered' : 'Name withheld'}</Pill>
              <Pill tone={row.mayShowPhoto ? 'neutral' : 'info'}>{row.mayShowPhoto ? 'Photo offered' : 'No photo'}</Pill>
            </div>

            {row.reviewedBy ? (
              <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 10 }}>
                {row.status === 'Declined' ? 'Left by' : 'Decided by'} {row.reviewedBy}
                {row.reviewedAt ? ` · ${fmtDate(row.reviewedAt)}` : ''}
                {row.moderationNote ? ` — “${row.moderationNote}”` : ''}
              </div>
            ) : null}

            <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
              <Textarea
                rows={2}
                placeholder="Why — only this console sees it."
                value={notes[row.id] ?? ''}
                onChange={(value) => setNotes((prev) => ({ ...prev, [row.id]: value }))}
              />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {/*
                  Nothing that would need consent is offered without it. The server refuses these
                  too — this is so nobody is shown a button that would be a breach if it worked.
                */}
                {row.mayShowPublicly && !row.featured ? (
                  <Button tone="primary" onClick={() => act(row, 'feature')} disabled={busy === row.id}>
                    ★ Put it on the front page
                  </Button>
                ) : null}
                {row.mayShowPublicly && row.featured ? (
                  <Button onClick={() => act(row, 'unfeature')} disabled={busy === row.id}>Take off the front page</Button>
                ) : null}
                {row.mayShowPublicly && row.status !== 'Published' ? (
                  <Button onClick={() => act(row, 'publish')} disabled={busy === row.id}>Publish</Button>
                ) : null}
                {row.status !== 'Declined' ? (
                  <Button tone="danger" onClick={() => act(row, 'decline')} disabled={busy === row.id}>Do not use</Button>
                ) : null}
                {!row.mayShowPublicly ? (
                  <span style={{ fontSize: 12.5, color: t.textMuted, alignSelf: 'center' }}>
                    Nothing can be published while the writer has consent turned off.
                  </span>
                ) : null}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {page && page.total > rows.length ? (
        <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 14 }}>
          Showing {rows.length} of {page.total}.
        </div>
      ) : null}
      <Toasts toasts={toasts} />
    </>
  );
}
