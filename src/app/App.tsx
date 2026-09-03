/**
 * Session gate. Nothing renders until the API confirms this token belongs to an
 * administrator — the console never decides that for itself from a stored flag.
 */
import { useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Shell } from './Shell';
import { SignIn } from '../pages/SignIn';
import { Overview } from '../pages/Overview';
import { People, Person } from '../pages/People';
import { Growth } from '../pages/Growth';
import { Assistant } from '../pages/Assistant';
import { Demand } from '../pages/Demand';
import { Catalog } from '../pages/Catalog';
import { Audit } from '../pages/Audit';
import { Documents } from '../pages/Documents';
import { Identity } from '../pages/Identity';
import { Vouches } from '../pages/Vouches';
import { Medical } from '../pages/Medical';
import { Facilities } from '../pages/Facilities';
import { Adverts } from '../pages/Adverts';
import { Account } from '../pages/Account';
import { Team } from '../pages/Team';
import { Bookings, Booking } from '../pages/Bookings';
import { Complaints } from '../pages/Complaints';
import { Support } from '../pages/Support';
import { Spotlight } from '../pages/Spotlight';
import { Languages } from '../pages/Languages';
import { Logs } from '../pages/Logs';
import { MissionControl } from '../pages/MissionControl';
import { Threats } from '../pages/Threats';
import { Signals } from '../pages/Signals';
import { Payments } from '../pages/Payments';
import { Ambassadors } from '../pages/Ambassadors';
import { Messages } from '../pages/Messages';
import { Content } from '../pages/Content';
import { Learn } from '../pages/Learn';
import { Broadcasts } from '../pages/Broadcasts';
import { NotificationEnginePage } from '../pages/NotificationEngine';
import { Audiences } from '../pages/Audiences';
import { EditAudience } from '../pages/EditAudience';
import { ComposeBroadcast } from '../pages/ComposeBroadcast';
import { Promos } from '../pages/Promos';
import { Governance } from '../pages/Governance';
import { Ledger } from '../pages/Ledger';
import { Reports } from '../pages/Reports';
import { AcceptInvite } from '../pages/AcceptInvite';
import { NotFound } from '../pages/ErrorPage';
import { Loading } from '../components/ui';
import { adminApi, type AdminIdentity } from '../api/admin';
import { loadSession, onSessionChange } from '../api/client';

export function App() {
  const [identity, setIdentity] = useState<AdminIdentity | null>(null);
  const [checking, setChecking] = useState(true);

  // Re-check on boot, and whenever a 401 clears the session from under us.
  useEffect(() => {
    const verify = () => {
      if (!loadSession()) {
        setIdentity(null);
        setChecking(false);
        return;
      }
      adminApi.me()
        .then(setIdentity)
        .catch(() => setIdentity(null))
        .finally(() => setChecking(false));
    };
    verify();
    return onSessionChange(session => { if (!session) setIdentity(null); });
  }, []);

  // Read before the gate, on purpose. Someone opening an invitation link has no session —
  // that is the whole point of the link — so this one path renders without one.
  const invited = window.location.pathname.match(/^\/invite\/(.+)$/);
  if (invited) return <AcceptInvite token={decodeURIComponent(invited[1])} />;

  if (checking) return <Loading label="Checking your access…" />;
  if (!identity) return <SignIn onSignedIn={setIdentity} />;

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Shell identity={identity} />}>
          <Route path="/" element={<Overview />} />
          <Route path="/assistant" element={<Assistant />} />
          <Route path="/growth" element={<Growth />} />
          <Route path="/demand" element={<Demand />} />
          <Route path="/users" element={<People />} />
          <Route path="/users/:userId" element={<Person identity={identity} />} />
          <Route path="/catalog" element={<Catalog />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/identity" element={<Identity />} />
          <Route path="/vouches" element={<Vouches />} />
          <Route path="/medical" element={<Medical />} />
          <Route path="/facilities" element={<Facilities />} />
          <Route path="/bookings" element={<Bookings />} />
          <Route path="/bookings/:bookingId" element={<Booking identity={identity} />} />
          <Route path="/complaints" element={<Complaints identity={identity} />} />
          <Route path="/support" element={<Support />} />
          <Route path="/spotlight" element={<Spotlight />} />
          <Route path="/languages" element={<Languages />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/mission-control" element={<MissionControl />} />
          <Route path="/threats" element={<Threats />} />
          <Route path="/signals" element={<Signals />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/ambassadors" element={<Ambassadors />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/content" element={<Content identity={identity} />} />
          <Route path="/learn" element={<Learn identity={identity} />} />
          <Route path="/notifications" element={<NotificationEnginePage />} />
          <Route path="/broadcasts" element={<Broadcasts identity={identity} />} />
          <Route path="/audiences" element={<Audiences />} />
          <Route path="/audiences/new" element={<EditAudience />} />
          <Route path="/audiences/:audienceId" element={<EditAudience />} />
          <Route path="/broadcasts/new" element={<ComposeBroadcast />} />
          <Route path="/adverts" element={<Adverts />} />
          <Route path="/promos" element={<Promos />} />
          <Route path="/audit" element={<Audit />} />
          <Route path="/team" element={<Team identity={identity} />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/ledger" element={<Ledger />} />
          <Route path="/settings" element={<Governance identity={identity} />} />
          <Route path="/account" element={<Account identity={identity} />} />
          {/* A page, not a redirect. Sending an unknown URL to the overview means somebody
              following a stale or truncated link lands on a working screen and concludes the
              link was fine and the data has gone — the redirect hides the very mistake it is
              meant to report. */}
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
