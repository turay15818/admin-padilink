/**
 * Writing an announcement — a page, because it is work.
 *
 * This lived in a 560px modal with an 86vh cap. Eleven fields, a reach counter, two channel
 * toggles, a date picker and two phone previews shared one scrolling column, and the previews
 * were below the fold: the thing that shows what thousands of people are about to receive was
 * the part you had to scroll to find.
 *
 * Now the previews sit in their own column and stay put while the fields are filled in, the
 * reach counter sits with them, and Send is pinned to the bottom of the window rather than at
 * the end of a scroll.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../theme/ThemeProvider';
import {
  Button, ErrorNote, Field, Input, Modal, Pill, Textarea, fmtDateTime,
} from '../components/ui';
import { MultiSelect, Select } from '../components/Select';
import { ImageUpload } from '../components/MediaUpload';
import { FormPage, AsidePanel } from '../components/FormPage';
import { EditGroup } from '../components/Audience';
import {
  adminApi, type AdvertScreenOption, type BroadcastPreview, type BroadcastTemplate, type Segment,
} from '../api/admin';
import { DISTRICTS, districtName } from '../lib/districts';

/** A trade, as the picker shows it. Loaded once; the taxonomy is a few hundred rows. */
type SkillOption = { id: string; name: string };
const SMS_PART = 160;
const SMS_MAX = 320;
/** The route the app opens for "search for a trade": the providers screen, narrowed to one skill and, when aimed, one district. */
const SEARCH_ROUTE = 'search';

/** The advert vocabulary, so an operator learns "providers" once. */
const AUDIENCES = [
  { value: '2', label: 'Customers', detail: 'People who book work — everyone who is not a provider or a company' },
  { value: '4', label: 'Providers', detail: 'People who offer work' },
  { value: '8', label: 'Companies', detail: 'Company accounts' },
];

export function ComposeBroadcast() {
  const navigate = useNavigate();
  return (
    <Compose
      onClose={() => navigate('/broadcasts')}
      onDone={message => navigate('/broadcasts', { state: { sent: message } })}
    />
  );
}


function Compose({ onClose, onDone }: { onClose: () => void; onDone: (message: string) => void }) {
  const { t } = useTheme();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audiences, setAudiences] = useState<string[]>([]);
  const [city, setCity] = useState('');
  const [sendPush, setSendPush] = useState(true);
  const [sendEmail, setSendEmail] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [ctaLabel, setCtaLabel] = useState('');
  const [ctaRoute, setCtaRoute] = useState('');
  const [screens, setScreens] = useState<AdvertScreenOption[]>([]);
  const [brief, setBrief] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [draftNote, setDraftNote] = useState<string | null>(null);
  const [preview, setPreview] = useState<BroadcastPreview | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<Segment[]>([]);
  const [makingGroup, setMakingGroup] = useState(false);
  const [segmentId, setSegmentId] = useState<string>('');
  // Held as a local datetime-local string. Converted to an instant only on send, because the
  // operator is thinking in Freetown time and the API thinks in UTC.
  const [when, setWhen] = useState('');
  // Campaigns: the inbox subject, the text channel, where they are and what they looked for.
  const [subject, setSubject] = useState('');
  const [sendSms, setSendSms] = useState(false);
  const [smsText, setSmsText] = useState('');
  const [districtSlug, setDistrictSlug] = useState('');
  const [interestSkillId, setInterestSkillId] = useState('');
  const [interestDays, setInterestDays] = useState('');
  const [skills, setSkills] = useState<SkillOption[]>([]);
  const [searchSkill, setSearchSkill] = useState('');
  const [templates, setTemplates] = useState<BroadcastTemplate[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [testing, setTesting] = useState(false);
  const [testNote, setTestNote] = useState<string | null>(null);

  // Zero means everyone, which is what the flags enum says and what somebody expects when
  // they leave the field alone.
  const audience = audiences.reduce((sum, value) => sum + Number(value), 0);
  const chosenGroup = groups.find(group => group.id === segmentId) ?? null;
  const draft = {
    title: title.trim(),
    body: body.trim(),
    audience,
    city: city.trim() || null,
    segmentId: segmentId || null,
    // Sent as an instant. datetime-local has no zone, so it is read as the operator's own
    // clock — which is what they meant when they typed it.
    scheduledFor: when ? new Date(when).toISOString() : null,
    sendPush,
    sendEmail,
    imageUrl,
    // A button with no destination is a button that does nothing, and a destination with no
    // wording is a button nobody can read. Either half alone is dropped.
    ctaLabel: ctaRoute.trim() ? (ctaLabel.trim() || 'Open') : null,
    // "Search for a trade" is a route with the trade (and the district, when aimed) in it, so
    // the button lands on the right list rather than on a blank search.
    ctaRoute: ctaRoute === SEARCH_ROUTE
      ? (searchSkill ? `providers?skill=${encodeURIComponent(skills.find(k => k.id === searchSkill)?.name ?? '')}${districtSlug ? `&district=${districtSlug}` : ''}` : null)
      : (ctaRoute.trim() || null),
    subject: subject.trim() || null,
    sendSms,
    smsText: smsText.trim() || null,
    districtSlug: districtSlug || null,
    interestSkillId: interestSkillId || null,
    interestWithinDays: interestDays.trim() ? Number(interestDays) : null,
  };
  const smsPreview = (smsText.trim() || `${title.trim()}: ${body.trim()}`).replace(/\s+/g, ' ');
  const smsLength = Math.min(SMS_MAX, smsPreview.length + ' - Vacancy'.length);
  const smsParts = Math.max(1, Math.ceil(smsLength / SMS_PART));

  // Re-counted whenever the audience changes, not on a button — the number is the point,
  // and a number you have to ask for is a number nobody looks at.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      adminApi.previewBroadcast({ ...draft, title: title.trim() || 'preview', body: body.trim() || 'preview' })
        .then(result => { if (!cancelled) setPreview(result); })
        .catch(() => { if (!cancelled) setPreview(null); });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audience, city, segmentId, districtSlug, interestSkillId, interestDays, sendPush, sendEmail, sendSms, smsText]);

  // The same list the advert composer offers, so "where does this button go" has one
  // answer across the console rather than a free-text box people mistype.
  useEffect(() => {
    adminApi.advertScreens().then(setScreens).catch(() => setScreens([]));
    adminApi.segments().then(setGroups).catch(() => setGroups([]));
    adminApi.skillPage({ pageSize: 200, status: 'active', sort: 'name' }).then(page => setSkills(page.items.map(k => ({ id: k.id, name: k.name })))).catch(() => setSkills([]));
    adminApi.broadcastTemplates().then(setTemplates).catch(() => setTemplates([]));
  }, []);

  /** Start from a saved message: every field the template carries, the rest left alone. */
  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const tpl = templates.find(x => x.id === id);
    if (!tpl) return;
    setTitle(tpl.title); setSubject(tpl.subject ?? ''); setBody(tpl.body); setSmsText(tpl.smsText ?? '');
    setAudiences(['2', '4', '8'].filter(bit => (tpl.audience & Number(bit)) !== 0));
    setCity(tpl.city ?? ''); setDistrictSlug(tpl.districtSlug ?? '');
    setInterestSkillId(tpl.interestSkillId ?? ''); setInterestDays(tpl.interestWithinDays ? String(tpl.interestWithinDays) : '');
    setSegmentId(tpl.segmentId ?? '');
    setSendPush(tpl.sendPush); setSendEmail(tpl.sendEmail); setSendSms(tpl.sendSms);
    setImageUrl(tpl.imageUrl); setCtaLabel(tpl.ctaLabel ?? '');
    if (tpl.ctaRoute?.startsWith('providers?skill=')) {
      const name = decodeURIComponent(tpl.ctaRoute.slice('providers?skill='.length).split('&')[0]);
      setCtaRoute(SEARCH_ROUTE); setSearchSkill(skills.find(k => k.name === name)?.id ?? '');
    } else { setCtaRoute(tpl.ctaRoute ?? ''); }
  };

  const saveTemplate = () => {
    if (!templateName.trim() || savingTemplate) return;
    setSavingTemplate(true); setError(null);
    adminApi.saveBroadcastTemplate({
      name: templateName.trim(), title: draft.title, subject: draft.subject, body: draft.body, smsText: draft.smsText,
      audience, city: draft.city, districtSlug: draft.districtSlug, interestSkillId: draft.interestSkillId, interestWithinDays: draft.interestWithinDays,
      segmentId: draft.segmentId, sendPush, sendEmail, sendSms, imageUrl, ctaLabel: draft.ctaLabel, ctaRoute: draft.ctaRoute,
    })
      .then(saved => { setTemplates(list => [saved, ...list.filter(x => x.id !== saved.id)]); setTemplateId(saved.id); setTemplateName(''); setTestNote(`Saved as the template “${saved.name}”.`); })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'That did not save.'))
      .finally(() => setSavingTemplate(false));
  };

  /** The lock screen, seen by one person before a thousand. */
  const sendTest = () => {
    if (testing || title.trim().length < 3 || body.trim().length < 10) return;
    setTesting(true); setTestNote(null);
    adminApi.testBroadcast(draft)
      .then(result => setTestNote(result.message))
      .catch((caught: unknown) => setTestNote(caught instanceof Error ? caught.message : 'The test did not go.'))
      .finally(() => setTesting(false));
  };

  // Writes into the two boxes and stops. Nothing here sends, and the operator has to read
  // what appeared before the send button will even enable — which is the same guard as before,
  // doing double duty.
  const draftIt = () => {
    if (brief.trim().length < 3 || drafting) return;
    setDrafting(true);
    setDraftNote(null);
    adminApi.draft('announcement', brief.trim())
      .then(result => {
        if (result.unavailable) { setDraftNote(result.unavailable); return; }
        if (result.title) setTitle(result.title);
        setBody(result.body);
        setDraftNote('Drafted. Read it before you send it — it has not seen your audience.');
      })
      .catch((caught: unknown) => setDraftNote(caught instanceof Error ? caught.message : 'That did not work.'))
      .finally(() => setDrafting(false));
  };

  // A saved group brings its own count, worked out by the API when it was listed. The plain
  // preview only knows about the audience flags, so it would say the wrong number here.
  // The preview now understands saved groups and channels too, so it is the number whenever
  // it has answered; the group's own count is the fallback while it is still counting.
  const reachable = preview?.reachable ?? chosenGroup?.reachableNow ?? 0;
  const ready = title.trim().length >= 3 && body.trim().length >= 10
    && (sendPush || sendEmail || sendSms) && reachable > 0
    && (ctaRoute !== SEARCH_ROUTE || Boolean(searchSkill));

  const send = () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    adminApi.sendBroadcast(draft)
      .then(result => {
        onDone(result.scheduledFor
          ? `“${result.title}” is set for ${fmtDateTime(result.scheduledFor)}. Nothing has gone out yet.`
          : `Sent to ${result.deliveredCount.toLocaleString()} people.`);
        onClose();
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'That did not work.'))
      .finally(() => { setBusy(false); setConfirming(false); });
  };

  if (confirming) {
    return (
      <Modal
        title={when ? 'Set this to go out later?' : 'Send this to everyone chosen?'}
        onClose={() => setConfirming(false)}
        width={560}
      >
        <div style={{
          background: t.warningSoft, border: `1px solid ${t.warning}`, borderRadius: 11,
          padding: '14px 16px', marginBottom: 16,
        }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: t.text, lineHeight: 1.2 }}>
            {reachable.toLocaleString()} people
          </div>
          <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 4, lineHeight: 1.6 }}>
            {when
              ? `will get this ${channelWords(sendPush, sendEmail, sendSms)} at `
                + `${fmtDateTime(new Date(when).toISOString())}, give or take a minute. You can call it `
                + 'off any time before then. After it goes, nothing can call it back.'
              : `will get this ${channelWords(sendPush, sendEmail, sendSms)}. There is no undo, and `
                + 'no way to edit it afterwards.'}
          </div>
          {preview ? (
            <div style={{ fontSize: 12, color: t.textMuted, marginTop: 6, lineHeight: 1.55 }}>
              {[sendPush ? `${preview.byPush.toLocaleString()} by push` : null, sendEmail ? `${preview.byEmail.toLocaleString()} by e-mail` : null, sendSms ? `${preview.bySms.toLocaleString()} by text — ${preview.smsParts.toLocaleString()} billed part${preview.smsParts === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ')}
            </div>
          ) : null}
          {when && chosenGroup ? (
            <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 7, lineHeight: 1.55 }}>
              That count is who “{chosenGroup.name}” comes to now. The group is worked out again
              when the message goes, so the real number will be whatever it is then.
            </div>
          ) : null}
        </div>

        {/* Both halves, because they are not the same thing. The banner is what interrupts
            somebody; the page is what they read if the banner worked. Reviewing only one of
            them is how an announcement goes out with a headline that makes no sense alone. */}
        <div style={{ display: 'flex', gap: 14, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 220px', minWidth: 200 }}>
            <PreviewLabel>On the lock screen</PreviewLabel>
            <LockScreenPreview title={title.trim()} body={body.trim()} />
          </div>
          <div style={{ flex: '1 1 220px', minWidth: 200 }}>
            <PreviewLabel>After they tap it</PreviewLabel>
            <PhonePreview
              title={title.trim()}
              body={body.trim()}
              imageUrl={imageUrl}
              ctaLabel={ctaRoute.trim() ? (ctaLabel.trim() || 'Open') : null}
            />
          </div>
        </div>

        {error ? <div style={{ marginBottom: 12 }}><ErrorNote message={error} /></div> : null}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button tone="subtle" onClick={() => setConfirming(false)}>Back to editing</Button>
          <Button tone={when ? 'primary' : 'danger'} disabled={busy} onClick={send}>
            {busy ? (when ? 'Setting it…' : 'Sending…') : when ? 'Set it' : 'Send it'}
          </Button>
        </div>
      </Modal>
    );
  }

  // The number that governs the decision, so it belongs beside the preview rather than
  // three-quarters of the way down the form somebody is filling in.
  const reachPanel = (
<div data-reach={reachable} style={{
          background: reachable === 0 ? t.warningSoft : t.surfaceMuted,
          border: `1px solid ${reachable === 0 ? t.warning : t.border}`,
          borderRadius: 11, padding: '12px 14px', margin: '2px 0 14px',
        }}>
          {chosenGroup ? (
            <>
              <div style={{ fontSize: 19, fontWeight: 800, color: reachable === 0 ? t.warning : t.text }}>
                {reachable.toLocaleString()} people
              </div>
              <div style={{ fontSize: 12, color: t.textMuted, marginTop: 3, lineHeight: 1.55 }}>
                {chosenGroup.describes}
              </div>
              <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 5, lineHeight: 1.55 }}>
                {when
                  ? 'That is who the group comes to right now. It is worked out again when the '
                    + 'message actually goes, so this number will have moved by then.'
                  : 'Worked out just now, for the channels you chose.'}
                {preview ? ` ${[sendPush ? `${preview.byPush.toLocaleString()} by push` : null, sendEmail ? `${preview.byEmail.toLocaleString()} by e-mail` : null, sendSms ? `${preview.bySms.toLocaleString()} by text` : null].filter(Boolean).join(' · ')}.` : ''}
              </div>
            </>
          ) : preview === null ? (
            <div style={{ fontSize: 12.5, color: t.textSubtle }}>Counting…</div>
          ) : (
            <>
              <div style={{ fontSize: 19, fontWeight: 800, color: preview.reachable === 0 ? t.warning : t.text }}>
                {preview.reachable.toLocaleString()} of {preview.total.toLocaleString()}
              </div>
              <div style={{ fontSize: 12, color: t.textMuted, marginTop: 3, lineHeight: 1.55 }}>
                {preview.summary}
              </div>
              <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 5, lineHeight: 1.55 }}>
                Reachable means at least one channel you chose can get to them: a phone that takes a push, a verified e-mail address, or a phone number for a text.
              </div>
              {sendSms && preview.bySms > 0 ? (
                <div style={{ fontSize: 11.5, color: t.warning, marginTop: 5, lineHeight: 1.55 }}>
                  {preview.smsParts.toLocaleString()} text-message part{preview.smsParts === 1 ? '' : 's'} will be billed.
                </div>
              ) : null}
            </>
          )}
        </div>
  );

  return (
    <FormPage
      backTo="/broadcasts"
      backLabel="Announcements"
      title="Write an announcement"
      subtitle="It goes to every phone in the audience you choose. There is no undo once it has gone — which is why the count and the preview are beside you the whole way down."
      aside={
        <>
          <AsidePanel label="Who this reaches">{reachPanel}</AsidePanel>
          <AsidePanel label="On the lock screen">
            <LockScreenPreview title={title.trim()} body={body.trim()} />
          </AsidePanel>
          <AsidePanel label="After they tap it">
            <PhonePreview
              title={title.trim()}
              body={body.trim()}
              imageUrl={imageUrl}
              ctaLabel={ctaLabel.trim()}
            />
          </AsidePanel>
          {sendSms ? (
            <AsidePanel label="As a text message">
              <SmsPreview text={smsPreview} />
            </AsidePanel>
          ) : null}
        </>
      }
      footer={
        <>
          {/* A scheduled one HAS an undo, right up until it goes — saying "no undo" there
              would be the wrong warning, and a warning that is wrong once is one nobody
              reads again. */}
          <span style={{ marginRight: 'auto' }}>
            {when ? <Pill tone="warning">Can be called off until it goes</Pill> : <Pill tone="danger">No undo</Pill>}
          </span>
          <Button tone="subtle" disabled={testing || title.trim().length < 3 || body.trim().length < 10} onClick={sendTest}>
            {testing ? 'Sending you a test…' : 'Send me a test'}
          </Button>
          <Button tone="subtle" onClick={onClose}>Cancel</Button>
          <Button tone="primary" disabled={!ready} onClick={() => setConfirming(true)}>
            {when ? 'Review and schedule' : 'Review and send'}
          </Button>
        </>
      }
    >
      {/* Start from something that worked. A message that goes out every generator season is
          written once and kept; the form fills in and the operator changes the date. */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 260px' }}>
          <Field label="Start from a saved message" hint={templates.length === 0 ? 'None saved yet. Fill the form in and save it as one below.' : 'Optional. Fills every field in; change what you like.'}>
            <Select
              value={templateId}
              onChange={value => applyTemplate(value ?? '')}
              options={templates.map(tpl => ({ value: tpl.id, label: `${tpl.name}${tpl.useCount ? ` — used ${tpl.useCount}×` : ''}` }))}
              placeholder="Write a new one"
              clearable
              clearLabel="Write a new one"
              disabled={templates.length === 0}
            />
          </Field>
        </div>
        <div style={{ flex: '1 1 260px' }}>
          <Field label="Save this as a message to reuse" hint="Everything on this form, under a name.">
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}><Input value={templateName} onChange={setTemplateName} placeholder="e.g. Generator season" onEnter={saveTemplate} /></div>
              <Button tone="subtle" disabled={savingTemplate || !templateName.trim() || title.trim().length < 3 || body.trim().length < 10} onClick={saveTemplate}>{savingTemplate ? 'Saving…' : 'Save'}</Button>
            </div>
          </Field>
        </div>
      </div>
      {testNote ? (
        <div data-test-note style={{ fontSize: 12.5, color: t.text, background: t.surfaceMuted, border: `1px solid ${t.border}`, borderRadius: 10, padding: '9px 12px', marginBottom: 14, lineHeight: 1.55 }}>{testNote}</div>
      ) : null}
      {/* Above the fields it fills in, so it reads as a starting point rather than a
          replacement for writing something. */}
      <div style={{
        border: `1px dashed ${t.borderStrong}`, borderRadius: 12, padding: '12px 14px', marginBottom: 16,
      }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: t.text, marginBottom: 7 }}>
          Not sure how to word it?
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <Input
              value={brief}
              onChange={setBrief}
              placeholder="Say roughly what you mean — e.g. app down sunday 2am for server move"
              onEnter={draftIt}
            />
          </div>
          <Button tone="subtle" disabled={drafting || brief.trim().length < 3} onClick={draftIt}>
            {drafting ? 'Writing…' : '✦ Draft it'}
          </Button>
        </div>
        {draftNote ? (
          <div style={{ fontSize: 11.5, color: t.textMuted, marginTop: 8, lineHeight: 1.55 }}>{draftNote}</div>
        ) : null}
      </div>

      <Field label="Heading" hint="What shows on the lock screen. Short enough to read at a glance.">
        <Input value={title} onChange={setTitle} placeholder="e.g. Scheduled maintenance on Sunday" />
      </Field>

      {sendEmail ? (
        <Field label="E-mail subject" hint="Optional. The inbox has room for a sentence where the lock screen has room for five words. Empty uses the heading.">
          <Input value={subject} onChange={setSubject} placeholder="e.g. Need a generator repaired before the rains? Here is who to call" />
        </Field>
      ) : null}

      <Field label="The message">
        <Textarea
          value={body}
          onChange={setBody}
          placeholder="e.g. The app will be unavailable between 2am and 4am while we move servers."
          rows={4}
        />
      </Field>

      {/* A saved audience, if there is one. Offered above the plain audience because picking
          one replaces the whole choice — showing both as equals invites setting them to
          disagree. Managed on the Audiences page; one can still be made from here because
          leaving to do it would throw away a half-written announcement. */}
      {groups.length > 0 ? (
        <Field
          label="A saved audience"
          hint="Optional. Picking one replaces the audience below — it is worked out fresh when the message goes."
        >
          <Select
            value={segmentId}
            onChange={value => setSegmentId(value ?? '')}
            options={groups.map(group => ({
              value: group.id,
              label: `${group.name} — about ${group.reachableNow.toLocaleString()} people`,
            }))}
            placeholder="No — choose the audience below"
            clearable
            clearLabel="No — choose the audience below"
          />
          {chosenGroup ? (
            <div data-chosen-group={chosenGroup.name} style={{
              fontSize: 12, color: t.textMuted, marginTop: 8, lineHeight: 1.6,
              background: t.surfaceMuted, borderRadius: 10, padding: '10px 12px',
            }}>
              {chosenGroup.describes}
            </div>
          ) : null}
          <div style={{ marginTop: 8 }}>
            <Button size="sm" tone="subtle" onClick={() => setMakingGroup(true)}>＋ New audience</Button>
          </div>
        </Field>
      ) : null}

      {makingGroup ? (
        <EditGroup
          group={null}
          onClose={() => setMakingGroup(false)}
          onDone={() => {
            setMakingGroup(false);
            // Re-read rather than push the saved one into state: the list carries a count the
            // API worked out, and inventing one here would be a number nobody computed.
            adminApi.segments().then(setGroups).catch(() => undefined);
          }}
        />
      ) : null}

      {!chosenGroup ? (
        <>
          <Field label="Who gets it" hint="Leave empty for everybody.">
            <MultiSelect
              values={audiences}
              onChange={setAudiences}
              options={AUDIENCES}
              placeholder="Everybody"
              summary={values => values.length === 0 ? 'Everybody'
                : AUDIENCES.filter(option => values.includes(option.value)).map(option => option.label).join(' and ')}
            />
          </Field>

          <Field label="Only in one city" hint="Optional. Matches the city on a provider's profile.">
            <Input value={city} onChange={setCity} placeholder="e.g. Bo" />
          </Field>
        </>
      ) : null}

      {/* Aiming. Two ways the plain audience could not: where the person actually is, by the
          position the app last reported, and what they actually did lately. "Need a generator
          repaired?" to the people who were looking for one this month, in the district where
          the rains are — not to everybody. Works on top of a saved group too. */}
      <div style={{ border: `1px solid ${t.border}`, borderRadius: 12, padding: '12px 14px', marginBottom: 16, background: t.surfaceMuted }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: t.text, marginBottom: 2 }}>Aim it</div>
        <div style={{ fontSize: 11.5, color: t.textSubtle, marginBottom: 10, lineHeight: 1.5 }}>Optional. Each one narrows the audience further{chosenGroup ? ', on top of the saved group' : ''}. The count beside you moves as you choose.</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="In one district" hint="By where the person last was, as the app reported it — customers included, not only providers with a town on their profile.">
            <Select
              value={districtSlug}
              onChange={value => setDistrictSlug(value ?? '')}
              options={DISTRICTS.map(d => ({ value: d.slug, label: d.name }))}
              placeholder="Everywhere"
              clearable
              clearLabel="Everywhere"
            />
          </Field>
          <Field label="Who looked for a trade lately" hint="Searched for it, looked at somebody who does it, booked one, or posted a job asking for it.">
            <Select
              value={interestSkillId}
              onChange={value => setInterestSkillId(value ?? '')}
              options={skills.map(k => ({ value: k.id, label: k.name }))}
              placeholder="Anybody"
              clearable
              clearLabel="Anybody"
              searchPlaceholder="Type a trade…"
            />
          </Field>
        </div>
        {interestSkillId ? (
          <Field label="Looking back how far" hint="Days. Thirty if you leave it empty.">
            <Input value={interestDays} onChange={setInterestDays} placeholder="30" />
          </Field>
        ) : null}
      </div>

      {/* When. Empty means now, which is what the button already said it meant. */}
      <Field
        label="When to send it"
        hint="Leave empty to send it now. The audience is worked out at the moment it goes, not now."
      >
        <input
          type="datetime-local"
          data-when
          value={when}
          onChange={event => setWhen(event.target.value)}
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 10,
            border: `1px solid ${t.border}`, background: t.surface, color: t.text,
            fontSize: 14, fontFamily: 'inherit', outline: 'none',
          }}
        />
        {when ? (
          <div style={{ fontSize: 12, color: t.textMuted, marginTop: 7, lineHeight: 1.55 }}>
            Nothing goes out until then, and you can call it off any time before it does. Once it
            has gone, nothing can call it back.
          </div>
        ) : null}
      </Field>

      <Field
        label="A picture"
        hint="Optional. Shown on the announcement's page in the app, not in the notification — a lock-screen banner is two lines of text on every phone, and a thumbnail there is unreadable."
      >
        <ImageUpload imageUrl={imageUrl} onChange={setImageUrl} />
      </Field>

      <Field label="A button" hint="Optional. Where the announcement takes them next.">
        <Select
          value={ctaRoute}
          onChange={value => setCtaRoute(value ?? '')}
          options={[{ value: SEARCH_ROUTE, label: 'Search for a trade — providers who do one thing, near them' }, ...screens.map(screen => ({ value: screen.key, label: screen.label }))]}
          placeholder="Nowhere — just the message"
          clearable
          clearLabel="Nowhere — just the message"
        />
        {ctaRoute === SEARCH_ROUTE ? (
          <div style={{ marginTop: 8 }}>
            <Select
              value={searchSkill || interestSkillId}
              onChange={value => setSearchSkill(value ?? '')}
              options={skills.map(k => ({ value: k.id, label: k.name }))}
              placeholder="Which trade the button searches for"
              searchPlaceholder="Type a trade…"
            />
            <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 6, lineHeight: 1.5 }}>
              Opens the providers list already narrowed to that trade{districtSlug ? ` in ${districtName(districtSlug)}` : ''}.
            </div>
          </div>
        ) : null}
        {ctaRoute ? (
          <div style={{ marginTop: 8 }}>
            <Input value={ctaLabel} onChange={setCtaLabel} placeholder="What the button says — e.g. Find a generator repairer" />
          </div>
        ) : null}
      </Field>

      {/* The number, before the button. */}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 16 }}>
        <Channel
          on={sendPush}
          onChange={setSendPush}
          title="Send it to their phone"
          detail="A push notification. This is the one people actually see."
        />
        <Channel
          on={sendEmail}
          onChange={setSendEmail}
          title="Also send it by email"
          detail="Off by default. The old announcement emailed everybody every time without saying so, which is the shortest route to being marked as spam."
        />
        <Channel
          on={sendSms}
          onChange={setSendSms}
          title="Also send it as a text message"
          detail="Reaches a phone with no app and no data. Billed per 160-character part, so it is a decision — the count beside you says how many parts."
        />
        {sendSms ? (
          <Field label="The text message" hint={`Optional. Written for 160 characters; empty sends the heading and message cut to fit. “ - Vacancy” is added. ${smsLength} of ${SMS_MAX} · ${smsParts} part${smsParts === 1 ? '' : 's'}.`}>
            <Textarea value={smsText} onChange={value => setSmsText(value.slice(0, SMS_MAX - 10))} rows={2} placeholder={`${title.trim() || 'Heading'}: ${body.trim().slice(0, 100) || 'the message'}`} />
          </Field>
        ) : null}
      </div>

      {error ? <div style={{ marginBottom: 12 }}><ErrorNote message={error} /></div> : null}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
        {/* A scheduled one HAS an undo, right up until it goes — saying "no undo" there would
            be the wrong warning, and a warning that is wrong once is one nobody reads again. */}
        <span style={{ marginRight: 'auto' }}>
          {when ? <Pill tone="warning">Can be called off until it goes</Pill> : <Pill tone="danger">No undo</Pill>}
        </span>
        <Button tone="subtle" onClick={onClose}>Cancel</Button>
        <Button tone="primary" disabled={!ready} onClick={() => setConfirming(true)}>
          {when ? 'Review and schedule' : 'Review and send'}
        </Button>
      </div>
    </FormPage>
  );
}

/* ---------------- what the phone will show ---------------- */

function PreviewLabel({ children }: { children: React.ReactNode }) {
  const { t } = useTheme();
  return (
    <div style={{
      fontSize: 10.5, fontWeight: 800, letterSpacing: 0.7, textTransform: 'uppercase',
      color: t.textSubtle, marginBottom: 7,
    }}>
      {children}
    </div>
  );
}

/**
 * The banner, at the width a phone actually gives it.
 *
 * Deliberately clipped to two lines rather than shown in full: the truncation is the point.
 * An operator who can see their heading being cut mid-word rewrites it, and nobody has ever
 * rewritten a heading because a console showed it complete.
 */
function LockScreenPreview({ title, body }: { title: string; body: string }) {
  const { t } = useTheme();
  return (
    <div style={{
      background: t.surfaceMuted, border: `1px solid ${t.border}`, borderRadius: 14, padding: 11,
    }}>
      <div style={{
        background: t.surface, borderRadius: 11, padding: '9px 11px',
        border: `1px solid ${t.border}`, boxShadow: '0 1px 3px rgba(0,0,0,.08)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{
            width: 14, height: 14, borderRadius: 4, background: t.brand, display: 'inline-block',
          }} />
          <span style={{ fontSize: 9.5, fontWeight: 700, color: t.textSubtle, letterSpacing: 0.3 }}>
            VACANCY · now
          </span>
        </div>
        <div style={{
          fontSize: 12, fontWeight: 800, color: t.text, lineHeight: 1.3,
          overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical',
        }}>
          {title || 'Your heading'}
        </div>
        <div style={{
          fontSize: 11.5, color: t.textMuted, lineHeight: 1.4, marginTop: 2,
          overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}>
          {body || 'Your message'}
        </div>
      </div>
      <div style={{ fontSize: 10.5, color: t.textSubtle, marginTop: 7, lineHeight: 1.5 }}>
        Two lines is all any phone gives you. The rest is on the page.
      </div>
    </div>
  );
}

/** The page behind the tap: picture, the wording in full, and the button. */
function PhonePreview({ title, body, imageUrl, ctaLabel }: {
  title: string; body: string; imageUrl: string | null; ctaLabel: string | null;
}) {
  const { t } = useTheme();
  return (
    <div style={{
      background: t.surfaceMuted, border: `1px solid ${t.border}`, borderRadius: 14, padding: 11,
    }}>
      <div style={{
        background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, overflow: 'hidden',
      }}>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            style={{ display: 'block', width: '100%', height: 96, objectFit: 'cover' }}
          />
        ) : (
          <div style={{
            height: 40, background: t.brand, display: 'flex', alignItems: 'flex-end',
            padding: '0 10px 7px',
          }}>
            <span style={{
              fontSize: 8.5, fontWeight: 800, letterSpacing: 1.1, color: t.brandText,
              textTransform: 'uppercase',
            }}>
              Announcement
            </span>
          </div>
        )}
        <div style={{ padding: '10px 11px 12px' }}>
          <div style={{ fontSize: 9, color: t.textSubtle, letterSpacing: 0.4, textTransform: 'uppercase' }}>
            Today
          </div>
          <div style={{ fontSize: 13, fontWeight: 800, color: t.text, lineHeight: 1.3, marginTop: 3 }}>
            {title || 'Your heading'}
          </div>
          <div style={{ fontSize: 11.5, color: t.textMuted, lineHeight: 1.55, marginTop: 5, whiteSpace: 'pre-wrap' }}>
            {body || 'Your message'}
          </div>
          {ctaLabel ? (
            <div style={{
              marginTop: 10, background: t.brand, color: t.brandText, borderRadius: 8,
              padding: '7px 10px', fontSize: 11, fontWeight: 800, textAlign: 'center',
            }}>
              {ctaLabel}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function channelWords(push: boolean, email: boolean, sms: boolean) {
  const parts = [push ? 'on their phone' : null, email ? 'by e-mail' : null, sms ? 'as a text message' : null].filter(Boolean) as string[];
  return parts.length === 0 ? 'nowhere' : parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** The text, as a phone shows it: no heading, no picture, no button — what is written is all there is. */
function SmsPreview({ text }: { text: string }) {
  const { t } = useTheme();
  const shown = text.length > SMS_MAX - 10 ? text.slice(0, SMS_MAX - 11) + '…' : text;
  return (
    <div style={{ background: t.surfaceMuted, border: `1px solid ${t.border}`, borderRadius: 14, padding: 11 }}>
      <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 14, padding: '9px 12px', fontSize: 12.5, color: t.text, lineHeight: 1.45, fontFamily: 'inherit', whiteSpace: 'pre-wrap' }}>
        {shown || 'Your message'} - Vacancy
      </div>
      <div style={{ fontSize: 10.5, color: t.textSubtle, marginTop: 7, lineHeight: 1.5 }}>No heading, no picture, no button. The words are all there is, and every 160 characters is a billed part.</div>
    </div>
  );
}

function Channel({ on, onChange, title, detail }: {
  on: boolean; onChange: (value: boolean) => void; title: string; detail: string;
}) {
  const { t } = useTheme();
  return (
    <label style={{
      display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer',
      border: `1px solid ${on ? t.brand : t.border}`, background: on ? t.brandSoft : 'transparent',
      borderRadius: 11, padding: '11px 13px',
    }}>
      <input
        type="checkbox"
        checked={on}
        onChange={event => onChange(event.target.checked)}
        style={{ marginTop: 2, accentColor: t.brand, width: 15, height: 15 }}
      />
      <span>
        <span style={{ fontSize: 13, fontWeight: 700, color: t.text, display: 'block' }}>{title}</span>
        <span style={{ fontSize: 11.5, color: t.textSubtle, lineHeight: 1.55 }}>{detail}</span>
      </span>
    </label>
  );
}
