/**
 * What every screen of the command centre shares: who is signed in, whether the room is
 * live, the district outlines, and a tick that every nudge from the hub advances so a page
 * refetches on hearing it. The hub never carries data — only "something changed".
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { connectEmergencyLive, type LiveHandle } from '../api/emergencyLive';
import { commandApi, type Access, type CommandInstitutionOption, type DistrictShape } from './api';
import { titleCase } from './ui';
import { steadyInterval } from './ticker';

type CommandContext = {
  access: Access;
  /** The institution this desk is standing at. A bound person's own; a national desk's choice. */
  institutionId: string | null;
  institutionName: string | null;
  institutions: CommandInstitutionOption[];
  setInstitution: (id: string | null) => void;
  socket: boolean;
  shapes: DistrictShape[];
  districtName: (slug: string | null | undefined) => string;
  /** Advances on every hub nudge. Put it in a load effect's deps and the page follows the room. */
  tick: number;
  bump: () => void;
  join: (incidentId: string) => void;
  leave: (incidentId: string) => void;
  signOut: () => void;
  clock: Date;
};

const Ctx = createContext<CommandContext | null>(null);

export function CommandProvider({ access, onSignOut, children }: { access: Access; onSignOut: () => void; children: ReactNode }) {
  const [socket, setSocket] = useState(false);
  const [shapes, setShapes] = useState<DistrictShape[]>([]);
  const [tick, setTick] = useState(0);
  const [clock, setClock] = useState(() => new Date());
  const [institutions, setInstitutions] = useState<CommandInstitutionOption[]>([]);
  // A national desk chooses an institution to stand at; the choice survives a reload and can
  // be handed over in the URL (the console's "open command centre" link does exactly that).
  const [chosen, setChosen] = useState<string | null>(() => {
    try {
      const fromUrl = new URLSearchParams(window.location.search).get('institution');
      if (fromUrl) { window.sessionStorage.setItem('vacancy.command.institution', fromUrl); return fromUrl; }
      return window.sessionStorage.getItem('vacancy.command.institution');
    } catch { return null; }
  });
  const hub = useRef<LiveHandle | null>(null);
  const throttle = useRef<number | null>(null);

  const bump = useCallback(() => {
    // A burst of nudges — one incident changing five times in a second — is one refetch.
    if (throttle.current) return;
    throttle.current = window.setTimeout(() => { throttle.current = null; setTick(x => x + 1); }, 400);
  }, []);

  useEffect(() => {
    hub.current = connectEmergencyLive({
      'emergency.queue.changed': bump,
      'emergency.incident.changed': bump,
      'emergency.assignment.changed': bump,
      'emergency.responder.location': bump,
      'emergency.reporter.location': bump,
      'emergency.report.updated': bump,
    }, setSocket);
    return () => { hub.current?.close(); hub.current = null; };
  }, [bump]);

  useEffect(() => { commandApi.shapes().then(s => setShapes(s.districts)).catch(() => setShapes([])); }, []);
  useEffect(() => { commandApi.institutions().then(list => setInstitutions(Array.isArray(list) ? list : [])).catch(() => setInstitutions([])); }, []);
  useEffect(() => { const h = window.setInterval(() => setClock(new Date()), 1000); return () => window.clearInterval(h); }, []);
  // The desk's floor: even with the socket down, nothing is more than a quarter of a minute stale —
  // which is as long as a new report can wait before the room hears of it.
  useEffect(() => steadyInterval(() => setTick(x => x + 1), 15_000), []);

  const institutionId = access.national ? (chosen && institutions.some(i => i.id === chosen) ? chosen : chosen && institutions.length === 0 ? chosen : access.institutionId) : access.institutionId;
  const institutionName = institutions.find(i => i.id === institutionId)?.name ?? (institutionId === access.institutionId ? access.institutionName : null);
  const setInstitution = useCallback((id: string | null) => {
    setChosen(id);
    try { if (id) window.sessionStorage.setItem('vacancy.command.institution', id); else window.sessionStorage.removeItem('vacancy.command.institution'); } catch { /* fine */ }
    setTick(x => x + 1);
  }, []);

  const value = useMemo<CommandContext>(() => ({
    access, socket, shapes, tick, bump, clock, institutionId, institutionName, institutions, setInstitution,
    districtName: slug => shapes.find(s => s.slug === slug)?.name ?? titleCase(slug),
    join: id => hub.current?.join(id),
    leave: id => hub.current?.leave(id),
    signOut: onSignOut,
  }), [access, socket, shapes, tick, bump, clock, onSignOut, institutionId, institutionName, institutions, setInstitution]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCommand(): CommandContext {
  const value = useContext(Ctx);
  if (!value) throw new Error('useCommand must be used inside CommandProvider');
  return value;
}
