/**
 * The emergency hub, spoken by hand.
 *
 * The SignalR JSON protocol over a raw WebSocket is small enough that a client library is
 * not worth its weight here: a handshake line, then one JSON record per message, each ended
 * by 0x1e. Every message from the server is a nudge — an id and a moment — never the data;
 * the page fetches through the encrypted API on hearing it, which applies the same
 * visibility rules as always. If the socket drops, the desk's polling carries on, and this
 * reconnects with backoff.
 */
import { config, loadSession } from './client';

const SEP = '\x1e';
type Handler = (payload: unknown) => void;

export type LiveHandle = { close: () => void; join: (incidentId: string) => void; leave: (incidentId: string) => void };

export function connectEmergencyLive(handlers: Record<string, Handler>, onState?: (up: boolean) => void): LiveHandle {
  let socket: WebSocket | null = null;
  let closed = false;
  let attempt = 0;
  let timer: number | null = null;
  const joined = new Set<string>();

  const send = (record: object) => {
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(record) + SEP);
  };

  const open = () => {
    const token = loadSession()?.accessToken;
    const base = config.apiBaseUrl;
    if (closed || !token || !base) return;
    const url = `${base.replace(/^http/, 'ws')}/hubs/emergency?access_token=${encodeURIComponent(token)}`;
    let ready = false;
    try {
      socket = new WebSocket(url);
    } catch {
      retry();
      return;
    }
    socket.onopen = () => { socket?.send(JSON.stringify({ protocol: 'json', version: 1 }) + SEP); };
    socket.onmessage = event => {
      const text = typeof event.data === 'string' ? event.data : '';
      for (const raw of text.split(SEP)) {
        if (!raw) continue;
        let record: { type?: number; target?: string; arguments?: unknown[]; error?: string };
        try { record = JSON.parse(raw) as typeof record; } catch { continue; }
        if (!ready) {
          // The handshake answer is `{}` on success.
          ready = !record.error;
          if (ready) { attempt = 0; onState?.(true); for (const id of joined) send({ type: 1, target: 'JoinIncident', arguments: [id] }); }
          continue;
        }
        if (record.type === 6) { send({ type: 6 }); continue; }
        if (record.type === 1 && record.target && handlers[record.target]) handlers[record.target](record.arguments?.[0]);
      }
    };
    socket.onclose = () => { onState?.(false); retry(); };
    socket.onerror = () => { /* onclose follows */ };
  };

  const retry = () => {
    if (closed) return;
    attempt += 1;
    const wait = Math.min(30_000, 1_000 * 2 ** Math.min(attempt, 5));
    timer = window.setTimeout(open, wait);
  };

  open();
  return {
    close: () => { closed = true; if (timer) window.clearTimeout(timer); try { socket?.close(); } catch { /* gone */ } },
    join: id => { joined.add(id); send({ type: 1, target: 'JoinIncident', arguments: [id] }); },
    leave: id => { joined.delete(id); send({ type: 1, target: 'LeaveIncident', arguments: [id] }); },
  };
}
