/**
 * Contact-form messages.
 *
 * Every message the website receives lands here, in full — the console is the record, and the
 * email is only a notification. That is why a message whose email failed still appears, with
 * a marker saying nobody was told: it is the case where reading this page is the only way
 * anyone finds out.
 *
 * "Handled" toggles rather than latching. A one-way flag is a flag people stop using the
 * first time they press it by mistake.
 */
import { useCallback, useEffect, useState } from 'react';
import { adminApi, type ContactMessage } from '../api/admin';

const ORANGE = '#FF6B2C';

export function Messages() {
  const [items, setItems] = useState<ContactMessage[]>([]);
  const [unhandled, setUnhandled] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [unhandledOnly, setUnhandledOnly] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await adminApi.contactMessages({ search: search.trim() || undefined, unhandledOnly, pageIndex: 1, pageSize: 50 });
      setItems(page.items);
      setUnhandled(page.unhandledCount);
      setTotal(page.totalCount);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load messages.');
    } finally {
      setLoading(false);
    }
  }, [search, unhandledOnly]);

  useEffect(() => { void load(); }, [load]);

  const toggleHandled = async (m: ContactMessage) => {
    try {
      const updated = await adminApi.handleContactMessage(m.id, {});
      setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      setUnhandled((n) => (updated.handledAt ? Math.max(0, n - 1) : n + 1));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update that message.');
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Messages</h1>
        <span style={{ color: '#8496AC', fontSize: 14 }}>
          {total} total{unhandled > 0 ? ` · ${unhandled} waiting` : ''}
        </span>
      </div>
      <p style={{ color: '#8496AC', fontSize: 14, marginTop: 4, marginBottom: 18 }}>
        Everything sent through the contact form on the website.
      </p>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email or message…"
          style={{ flex: 1, minWidth: 240, padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.04)', color: 'inherit', fontSize: 14 }}
        />
        <button
          onClick={() => setUnhandledOnly((v) => !v)}
          style={{ padding: '10px 16px', borderRadius: 999, cursor: 'pointer', fontWeight: 700, fontSize: 13.5, border: `1px solid ${unhandledOnly ? ORANGE : 'rgba(255,255,255,.16)'}`, background: unhandledOnly ? 'rgba(255,107,44,.14)' : 'transparent', color: unhandledOnly ? ORANGE : 'inherit' }}
        >
          Waiting only
        </button>
      </div>

      {error ? <div style={{ padding: 12, borderRadius: 10, background: 'rgba(239,68,68,.12)', color: '#fca5a5', marginBottom: 14 }}>{error}</div> : null}
      {loading ? <div style={{ color: '#8496AC', padding: 20 }}>Loading…</div> : null}
      {!loading && items.length === 0 ? <div style={{ color: '#8496AC', padding: 20 }}>No messages yet.</div> : null}

      <div style={{ display: 'grid', gap: 10 }}>
        {items.map((m) => {
          const isOpen = open === m.id;
          return (
            <div key={m.id} style={{ border: '1px solid rgba(255,255,255,.10)', borderRadius: 14, padding: 16, background: 'rgba(255,255,255,.02)' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{m.subject}</div>
                  <div style={{ color: '#8496AC', fontSize: 13, marginTop: 3 }}>
                    {m.name} · <a href={`mailto:${m.email}`} style={{ color: '#6FA0DC' }}>{m.email}</a>
                    {m.phoneNumber ? ` · ${m.phoneNumber}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {/* The row that matters: nobody was emailed about this one. */}
                  {!m.emailDelivered ? (
                    <span title="The notification email did not go out — this page is the only place it appeared."
                      style={{ fontSize: 11.5, fontWeight: 800, padding: '4px 9px', borderRadius: 999, background: 'rgba(245,181,68,.14)', color: '#F5B547' }}>
                      not emailed
                    </span>
                  ) : null}
                  <span style={{ fontSize: 12, color: '#8496AC' }}>{new Date(m.dateCreated).toLocaleString()}</span>
                  <button
                    onClick={() => void toggleHandled(m)}
                    style={{ padding: '7px 13px', borderRadius: 999, cursor: 'pointer', fontWeight: 700, fontSize: 12.5, border: `1px solid ${m.handledAt ? 'rgba(69,199,154,.5)' : 'rgba(255,255,255,.16)'}`, background: m.handledAt ? 'rgba(69,199,154,.14)' : 'transparent', color: m.handledAt ? '#45C79A' : 'inherit' }}
                  >
                    {m.handledAt ? 'Handled' : 'Mark handled'}
                  </button>
                </div>
              </div>

              <div
                onClick={() => setOpen(isOpen ? null : m.id)}
                style={{ marginTop: 10, color: '#B7C6DA', fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap', cursor: 'pointer',
                         display: isOpen ? 'block' : '-webkit-box', WebkitLineClamp: isOpen ? undefined : 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
              >
                {m.message}
              </div>
              {m.handlingNote ? (
                <div style={{ marginTop: 8, fontSize: 12.5, color: '#8496AC' }}>Note: {m.handlingNote}</div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
