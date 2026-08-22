/**
 * The audience editor, shared by every screen that needs one.
 *
 * It used to live inside the announcements page, which made saved audiences something you
 * could only reach by starting to write a message — the single most-flagged thing about the
 * notification engine when it shipped. The definition moved here so the Audiences page and
 * the compose modal are demonstrably the same editor rather than two that agree today.
 */
import type React from 'react';
import { useState } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import { Button, ErrorNote, Field, Input, Modal, Textarea } from './ui';
import { Select } from './Select';
import { adminApi, SEGMENT_FAMILIES, type Segment, type SegmentFamilyKey } from '../api/admin';

export function EditGroup({ group, onClose, onDone }: {
  group: Segment | null; onClose: () => void; onDone: (message: string) => void;
}) {
  const { t } = useTheme();
  const [name, setName] = useState(group?.name ?? '');
  const [description, setDescription] = useState(group?.description ?? '');
  const [audience, setAudience] = useState(String(group?.audience ?? 4));
  const [city, setCity] = useState(group?.city ?? '');
  const [quiet, setQuiet] = useState(group?.quietForDays ? String(group.quietForDays) : '');
  const [noWork, setNoWork] = useState(group?.noWorkForDays ? String(group.noWorkForDays) : '');
  const [neverBooked, setNeverBooked] = useState(group?.neverBooked ?? false);
  // One piece of state per family, holding the OR-ed bits. Kept as numbers rather than as
  // arrays of booleans because that is exactly what goes over the wire and comes back, so
  // there is no shape to convert and get wrong in one direction only.
  const [profileGaps, setProfileGaps] = useState(group?.profileGaps ?? 0);
  const [signInRisks, setSignInRisks] = useState(group?.signInRisks ?? 0);
  const [riskDays, setRiskDays] = useState(group?.riskWithinDays ? String(group.riskWithinDays) : '');
  const [learnerStates, setLearnerStates] = useState(group?.learnerStates ?? 0);
  const [jobSeekerStates, setJobSeekerStates] = useState(group?.jobSeekerStates ?? 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      .then(saved => onDone(
        saved.reachableNow === 0
          ? `“${saved.name}” saved — but it comes to nobody right now.`
          : `“${saved.name}” saved. ${saved.reachableNow.toLocaleString()} people right now.`))
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'That did not work.'))
      .finally(() => setBusy(false));
  };

  return (
    <Modal title={group ? 'Change this group' : 'A new group'} onClose={onClose} width={520}>
      <Field label="What to call it" hint="You will be picking it off a list later.">
        <Input value={name} onChange={setName} placeholder="Providers going quiet in Bo" autoFocus />
      </Field>

      <Field label="Why it exists (optional)">
        <Textarea value={description} onChange={setDescription} rows={2}
          placeholder="For the re-engagement message we send on Fridays." />
      </Field>

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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Quiet for at least" hint="Days since they last opened the app.">
          <Input value={quiet} onChange={setQuiet} placeholder="30" />
        </Field>
        <Field label="No booking for at least" hint="Days since a provider last got work.">
          <Input value={noWork} onChange={setNoWork} placeholder="30" />
        </Field>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: t.text, cursor: 'pointer', margin: '4px 0 14px' }}>
        <input type="checkbox" checked={neverBooked} onChange={event => setNeverBooked(event.target.checked)} />
        Only people who have never booked anybody
      </label>

      <Family
        family="profileGaps"
        value={profileGaps}
        onChange={setProfileGaps}
      />

      <Family
        family="signInRisks"
        value={signInRisks}
        onChange={setSignInRisks}
      >
        {signInRisks > 0 ? (
          <Field label="Looking back how far" hint="Days. Thirty if you leave it empty.">
            <Input value={riskDays} onChange={setRiskDays} placeholder="30" />
          </Field>
        ) : null}
      </Family>

      <Family family="learnerStates" value={learnerStates} onChange={setLearnerStates} />
      <Family family="jobSeekerStates" value={jobSeekerStates} onChange={setJobSeekerStates} />

      <div style={{ fontSize: 11.5, color: t.textSubtle, lineHeight: 1.6, marginBottom: 12 }}>
        Every condition narrows it further. Ticking two boxes inside one group means either
        will do; conditions in different groups all have to be true. Somebody has to have a
        device that can receive a notification before any of this applies — a group can never
        reach more people than a plain announcement would.
      </div>

      {error ? <ErrorNote message={error} /> : null}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button tone="subtle" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={!ready || busy}>{busy ? 'Saving…' : 'Save it'}</Button>
      </div>
    </Modal>
  );
}

/**
 * One family of conditions, drawn from the shared definition.
 *
 * Rendered from SEGMENT_FAMILIES rather than written out per family, so a condition added on
 * the server appears here by adding one line to that map — and cannot appear in the resolver
 * and not in the console, which is the drift that makes an operator distrust the screen.
 */
export function Family({ family, value, onChange, children }: {
  family: SegmentFamilyKey;
  value: number;
  onChange: (next: number) => void;
  children?: React.ReactNode;
}) {
  const { t } = useTheme();
  const definition = SEGMENT_FAMILIES[family];
  const warn = 'warn' in definition && definition.warn;

  return (
    <div style={{
      // The security family turns amber once it is in use. It is the one audience where the
      // wrong message does real damage, and a border is cheaper than a warning nobody reads.
      border: `1px solid ${warn && value > 0 ? t.warning : t.border}`,
      borderRadius: 10, padding: '11px 13px', marginBottom: 12,
      background: warn && value > 0 ? t.warningSoft : 'transparent',
    }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: t.text, marginBottom: 2 }}>
        {definition.label}
      </div>
      {'hint' in definition && definition.hint ? (
        <div style={{ fontSize: 11.5, color: t.textSubtle, lineHeight: 1.5, marginBottom: 8 }}>
          {definition.hint}
        </div>
      ) : null}

      <div style={{ display: 'grid', gap: 6 }}>
        {definition.options.map(option => {
          const on = (value & option.bit) !== 0;
          return (
            <label
              key={option.bit}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13, color: t.text, cursor: 'pointer' }}
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() => onChange(on ? value & ~option.bit : value | option.bit)}
                style={{ marginTop: 2 }}
              />
              <span>
                {option.label}
                {'hint' in option && option.hint ? (
                  <span style={{ display: 'block', fontSize: 11, color: t.textSubtle, lineHeight: 1.45 }}>
                    {option.hint}
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>

      {children}
    </div>
  );
}
