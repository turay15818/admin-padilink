/**
 * Defining an audience — a page, because it decides who gets interrupted.
 *
 * This was a modal opened from inside another modal: Announcements → Saved groups → Change.
 * Two dialogs deep is where a feature goes to be undiscovered, and it showed — the four
 * condition families were the most considered part of the notification engine and the first
 * thing anybody said about it was that they could not find it.
 *
 * On a page the conditions get room to breathe, and the count they produce sits beside them
 * and moves as they are ticked, which is the whole point of the screen: you are not filling
 * in a form, you are aiming at people.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTheme } from '../theme/ThemeProvider';
import {
  Button, ErrorNote, Field, Input, Loading, Textarea, timeAgo,
} from '../components/ui';
import { Select } from '../components/Select';
import { FormPage, AsidePanel, FormSection } from '../components/FormPage';
import { Family } from '../components/Audience';
import { adminApi, type Segment } from '../api/admin';

export function EditAudience() {
  const { t } = useTheme();
  const navigate = useNavigate();
  const { audienceId } = useParams();
  const isNew = !audienceId || audienceId === 'new';

  const [group, setGroup] = useState<Segment | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [audience, setAudience] = useState('4');
  const [city, setCity] = useState('');
  const [quiet, setQuiet] = useState('');
  const [noWork, setNoWork] = useState('');
  const [neverBooked, setNeverBooked] = useState(false);
  // One piece of state per family, holding the OR-ed bits. Numbers rather than arrays of
  // booleans because that is exactly what goes over the wire and comes back, so there is no
  // shape to convert and get wrong in one direction only.
  const [profileGaps, setProfileGaps] = useState(0);
  const [signInRisks, setSignInRisks] = useState(0);
  const [riskDays, setRiskDays] = useState('');
  const [learnerStates, setLearnerStates] = useState(0);
  const [jobSeekerStates, setJobSeekerStates] = useState(0);
  const [busy, setBusy] = useState(false);

  // An existing audience is fetched from the list rather than trusted from router state:
  // arriving by a pasted URL has to work exactly as arriving by a click does.
  useEffect(() => {
    if (isNew) return;
    adminApi.segments()
      .then(all => {
        const found = all.find(row => row.id === audienceId) ?? null;
        if (!found) { setError('That audience no longer exists.'); return; }
        setGroup(found);
        setName(found.name);
        setDescription(found.description ?? '');
        setAudience(String(found.audience));
        setCity(found.city ?? '');
        setQuiet(found.quietForDays ? String(found.quietForDays) : '');
        setNoWork(found.noWorkForDays ? String(found.noWorkForDays) : '');
        setNeverBooked(found.neverBooked);
        setProfileGaps(found.profileGaps);
        setSignInRisks(found.signInRisks);
        setRiskDays(found.riskWithinDays ? String(found.riskWithinDays) : '');
        setLearnerStates(found.learnerStates);
        setJobSeekerStates(found.jobSeekerStates);
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load that audience.'))
      .finally(() => setLoading(false));
  }, [audienceId, isNew]);

  const ready = name.trim().length > 0;

  const save = () => {
    if (!ready || busy) return;
    setBusy(true); setError(null);
    adminApi.saveSegment({
      name: name.trim(),
      description: description.trim() || null,
      audience: Number(audience),
      city: city.trim() || null,
      quietForDays: quiet.trim() ? Number(quiet) : null,
      noWorkForDays: noWork.trim() ? Number(noWork) : null,
      neverBooked,
      profileGaps,
      signInRisks,
      riskWithinDays: riskDays.trim() ? Number(riskDays) : null,
      learnerStates,
      jobSeekerStates,
    }, group?.id)
      .then(saved => navigate('/audiences', {
        state: {
          saved: saved.reachableNow === 0
            ? `“${saved.name}” saved — but it comes to nobody right now.`
            : `“${saved.name}” saved. ${saved.reachableNow.toLocaleString()} people right now.`,
        },
      }))
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'That did not work.'))
      .finally(() => setBusy(false));
  };

  if (loading) return <Loading label="Reading that audience…" />;

  return (
    <FormPage
      backTo="/audiences"
      backLabel="Audiences"
      title={group ? 'Change this audience' : 'A new audience'}
      subtitle="A description, not a list of names. It is worked out again every time you send to it, so somebody who got work yesterday drops out of it on their own."
      aside={
        <>
          <AsidePanel label="What this comes to">
            {group ? (
              <>
                <div style={{
                  fontSize: 30, fontWeight: 800, lineHeight: 1.1,
                  color: group.reachableNow === 0 ? t.warning : t.text,
                }}>
                  {group.reachableNow.toLocaleString()}
                </div>
                <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 4 }}>
                  reachable when this page loaded
                </div>
                <div style={{ fontSize: 12, color: t.textMuted, marginTop: 10, lineHeight: 1.6 }}>
                  {group.describes}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.6 }}>
                The count appears once this is saved. Nothing is sent by saving an audience —
                it is a definition, and it sits waiting until an announcement names it.
              </div>
            )}
          </AsidePanel>

          <AsidePanel label="How the conditions combine">
            <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.65 }}>
              Ticking two boxes inside one group means <strong style={{ color: t.text }}>either will do</strong>.
              Conditions in different groups <strong style={{ color: t.text }}>all have to be true</strong>.
              <div style={{ marginTop: 9 }}>
                Everybody in it also has to have a device that can receive a notification, so an
                audience can never reach more people than a plain announcement would.
              </div>
            </div>
          </AsidePanel>

          {group ? (
            <AsidePanel label="History">
              <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.6 }}>
                Made by {group.createdByName}.
                <div style={{ marginTop: 5 }}>
                  {group.useCount > 0
                    ? `Used ${group.useCount} ${group.useCount === 1 ? 'time' : 'times'}, last ${timeAgo(group.lastUsedAt!)}.`
                    : 'Never used.'}
                </div>
              </div>
            </AsidePanel>
          ) : null}
        </>
      }
      footer={
        <>
          <Button tone="subtle" onClick={() => navigate('/audiences')}>Cancel</Button>
          <Button onClick={save} disabled={!ready || busy}>{busy ? 'Saving…' : 'Save it'}</Button>
        </>
      }
    >
      {error ? <div style={{ marginBottom: 14 }}><ErrorNote message={error} /></div> : null}

      <FormSection title="What to call it" hint="You will be picking it off a list when you write an announcement.">
        <Field label="Name">
          <Input value={name} onChange={setName} placeholder="Providers going quiet in Bo" autoFocus />
        </Field>
        <Field label="Why it exists (optional)">
          <Textarea value={description} onChange={setDescription} rows={2}
            placeholder="For the re-engagement message we send on Fridays." />
        </Field>
      </FormSection>

      <FormSection title="Who, and where" hint="The broad strokes. Everything under this narrows it further.">
        <Field label="Who">
          <Select
            value={audience}
            onChange={value => setAudience(value ?? '4')}
            options={[
              { value: '0', label: 'Everybody' },
              { value: '4', label: 'Providers' },
              { value: '2', label: 'Customers' },
              { value: '8', label: 'Companies' },
            ]}
          />
        </Field>
        <Field label="In which town (optional)" hint="Leave empty for everywhere.">
          <Input value={city} onChange={setCity} placeholder="Bo" />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: 12 }}>
          <Field label="Quiet for at least" hint="Days since they last opened the app.">
            <Input value={quiet} onChange={setQuiet} placeholder="30" />
          </Field>
          <Field label="No booking for at least" hint="Days since a provider last got work.">
            <Input value={noWork} onChange={setNoWork} placeholder="30" />
          </Field>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: t.text, cursor: 'pointer', marginTop: 4 }}>
          <input type="checkbox" checked={neverBooked} onChange={event => setNeverBooked(event.target.checked)} />
          Only people who have never booked anybody
        </label>
      </FormSection>

      <FormSection
        title="The four conditions"
        hint="Each one narrows the audience further. These are the same definitions the resolver uses on the server — a condition added there appears here."
      >
        <Family family="profileGaps" value={profileGaps} onChange={setProfileGaps} />
        <Family family="signInRisks" value={signInRisks} onChange={setSignInRisks}>
          {signInRisks > 0 ? (
            <Field label="Looking back how far" hint="Days. Thirty if you leave it empty.">
              <Input value={riskDays} onChange={setRiskDays} placeholder="30" />
            </Field>
          ) : null}
        </Family>
        <Family family="learnerStates" value={learnerStates} onChange={setLearnerStates} />
        <Family family="jobSeekerStates" value={jobSeekerStates} onChange={setJobSeekerStates} />
      </FormSection>
    </FormPage>
  );
}
