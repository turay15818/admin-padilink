/**
 * Support chat — the console side of the in-app Help & support conversation.
 *
 * Users write from their phones; each thread lands here in full. Replying posts back
 * into their app (and pushes their phone). This page IS the promise of the mobile
 * screen that says "a real person from the team replies here."
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { adminApi, type SupportChatMessage, type SupportInboxRow } from '../api/admin';
import { useTheme } from '../theme/ThemeProvider';
import { Button, Card, EmptyState, ErrorNote, Loading, PageHeader, Pill, Textarea, timeAgo } from '../components/ui';

export function Support() {
  const { t } = useTheme();
  const [rows, setRows] = useState<SupportInboxRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportChatMessage[] | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const scroller = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try { setRows(await adminApi.supportInbox()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load the support inbox.'); setRows([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const openThread = useCallback(async (threadId: string) => {
    setOpenId(threadId);
    setMessages(null);
    try {
      const thread = await adminApi.supportThread(threadId);
      setMessages(thread.messages);
      requestAnimationFrame(() => { scroller.current?.scrollTo({ top: 999999 }); });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open that conversation.');
      setMessages([]);
    }
  }, []);

  // The console keeps itself fresh: every 8 seconds the inbox refetches, and so does
  // whichever conversation is open — a user's new message (or the assistant's instant
  // reply) walks in on its own. If the admin is reading at the bottom, the thread
  // follows it down; if they scrolled up to reread, nothing yanks them back.
  useEffect(() => {
    const tick = window.setInterval(() => {
      adminApi.supportInbox().then(setRows).catch(() => undefined);
      if (openId) {
        adminApi.supportThread(openId)
          .then((thread) => {
            const el = scroller.current;
            const stick = !!el && el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            setMessages((prev) => (prev === null ? prev : thread.messages));
            if (stick) requestAnimationFrame(() => { scroller.current?.scrollTo({ top: 999999 }); });
          })
          .catch(() => undefined);
      }
    }, 8000);
    return () => window.clearInterval(tick);
  }, [openId]);

  const send = async () => {
    const body = reply.trim();
    if (!body || !openId) return;
    setSending(true);
    try {
      const sent = await adminApi.supportReply(openId, body);
      setMessages((prev) => [...(prev ?? []), sent]);
      setReply('');
      setRows((prev) => (prev ?? []).map((r) => (r.threadId === openId ? { ...r, lastMessage: body, lastFromAdmin: true, lastMessageAt: new Date().toISOString() } : r)));
      requestAnimationFrame(() => { scroller.current?.scrollTo({ top: 999999, behavior: 'smooth' }); });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the reply.');
    } finally { setSending(false); }
  };

  const open = (rows ?? []).find((r) => r.threadId === openId) ?? null;
  const waiting = (rows ?? []).filter((r) => !r.lastFromAdmin).length;

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="Support chat"
        subtitle={`In-app conversations with users. ${waiting > 0 ? `${waiting} waiting on a reply.` : 'Nobody is waiting right now.'}`}
        action={<Button onClick={() => void load()}>Refresh</Button>}
      />
      {error ? <ErrorNote message={error} /> : null}
      {rows === null ? <Loading label="Opening the inbox…" /> : rows.length === 0 ? (
        <EmptyState icon="💬" title="No conversations yet" message="When someone writes from Help & support in the app, it appears here." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 360px) 1fr', gap: 16, alignItems: 'start' }}>
          <Card pad={8}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {rows.map((row) => {
                const active = row.threadId === openId;
                return (
                  <button
                    key={row.threadId}
                    onClick={() => void openThread(row.threadId)}
                    style={{
                      textAlign: 'left', border: 'none', cursor: 'pointer', borderRadius: 12, padding: '10px 12px',
                      background: active ? 'rgba(255,107,44,0.12)' : 'transparent',
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 800, fontSize: 13.5, color: t.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.userName}</span>
                      {!row.lastFromAdmin ? <Pill tone="warning">waiting</Pill> : null}
                    </div>
                    <div style={{ color: t.textMuted, fontSize: 12.5, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.lastFromAdmin ? 'You: ' : ''}{row.lastMessage}
                    </div>
                    <div style={{ color: t.textSubtle, fontSize: 11 }}>{timeAgo(row.lastMessageAt)}</div>
                  </button>
                );
              })}
            </div>
          </Card>
          {open ? (
            <Card pad={0}>
              <div style={{ padding: '14px 18px', borderBottom: `1px solid ${t.border}` }}>
                <div style={{ fontWeight: 800, color: t.text, fontSize: 15 }}>{open.userName}</div>
                {open.userEmail ? <div style={{ color: t.textMuted, fontSize: 12.5 }}>{open.userEmail}</div> : null}
              </div>
              <div ref={scroller} style={{ maxHeight: 480, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {messages === null ? <Loading label="Opening the conversation…" /> : messages.map((m) => (
                  <div key={m.id} style={{ display: 'flex', justifyContent: m.isFromAdmin ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '76%', borderRadius: 14, padding: '9px 13px', fontSize: 13.5, lineHeight: 1.5,
                      background: m.isFromAdmin ? 'rgba(255,107,44,0.14)' : t.surfaceMuted,
                      color: t.text,
                      borderBottomRightRadius: m.isFromAdmin ? 4 : 14, borderBottomLeftRadius: m.isFromAdmin ? 14 : 4,
                    }}>
                      <div style={{ fontSize: 10.5, fontWeight: 800, color: m.isFromAdmin ? '#FF6B2C' : t.textMuted, marginBottom: 2 }}>
                        {m.isFromAdmin ? 'SUPPORT TEAM' : m.senderName} · {timeAgo(m.dateCreated)}
                      </div>
                      {m.body}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ padding: 14, borderTop: `1px solid ${t.border}`, display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <Textarea value={reply} onChange={setReply} placeholder="Write a reply — it lands in their app and pushes their phone…" rows={2} />
                </div>
                <Button onClick={() => void send()} disabled={sending || !reply.trim()}>{sending ? 'Sending…' : 'Reply'}</Button>
              </div>
            </Card>
          ) : (
            <EmptyState icon="👈" title="Open a conversation" message="Pick a thread on the left to read it in full and reply." />
          )}
        </div>
      )}
    </div>
  );
}
