/**
 * Session gate. Nothing renders until the API confirms this token belongs to an
 * administrator — the console never decides that for itself from a stored flag.
 */
import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
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
import { Adverts } from '../pages/Adverts';
import { Account } from '../pages/Account';
import { Team } from '../pages/Team';
import { Bookings, Booking } from '../pages/Bookings';
import { Complaints } from '../pages/Complaints';
import { Support } from '../pages/Support';
import { Messages } from '../pages/Messages';
import { Content } from '../pages/Content';
import { Learn } from '../pages/Learn';
import { Broadcasts } from '../pages/Broadcasts';
import { Governance } from '../pages/Governance';
import { Ledger } from '../pages/Ledger';
import { Reports } from '../pages/Reports';
import { AcceptInvite } from '../pages/AcceptInvite';
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
          <Route path="/bookings" element={<Bookings />} />
          <Route path="/bookings/:bookingId" element={<Booking identity={identity} />} />
          <Route path="/complaints" element={<Complaints identity={identity} />} />
          <Route path="/support" element={<Support />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/content" element={<Content identity={identity} />} />
          <Route path="/learn" element={<Learn identity={identity} />} />
          <Route path="/broadcasts" element={<Broadcasts identity={identity} />} />
          <Route path="/adverts" element={<Adverts />} />
          <Route path="/audit" element={<Audit />} />
          <Route path="/team" element={<Team identity={identity} />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/ledger" element={<Ledger />} />
          <Route path="/settings" element={<Governance identity={identity} />} />
          <Route path="/account" element={<Account identity={identity} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
