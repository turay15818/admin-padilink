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
  adminApi, type AdvertScreenOption, type BroadcastPreview, type Segment,
} from '../api/admin';

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
    ctaRoute: ctaRoute.trim() || null,
  };

  // Re-counted whenever the audience changes, not on a button — the number is the point,
  // and a number you have to ask for is a number nobody looks at.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      adminApi.previewBroadcast({ ...draft, title: 'preview', body: 'preview' })
        .then(result => { if (!cancelled) setPreview(result); })
        .catch(() => { if (!cancelled) setPreview(null); });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audience, city]);

  // The same list the advert composer offers, so "where does this button go" has one
  // answer across the console rather than a free-text box people mistype.
  useEffect(() => {
    adminApi.advertScreens().then(setScreens).catch(() => setScreens([]));
    adminApi.segments().then(setGroups).catch(() => setGroups([]));
  }, []);

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
  const reachable = chosenGroup?.reachableNow ?? preview?.reachable ?? 0;
  const ready = title.trim().length >= 3 && body.trim().length >= 10
    && (sendPush || sendEmail) && reachable > 0;

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
              ? `will get this on their phone${sendEmail ? ' and by email' : ''} at `
                + `${fmtDateTime(new Date(when).toISOString())}, give or take a minute. You can call it `
                + 'off any time before then. After it goes, nothing can call it back.'
              : `will get this on their phone${sendEmail ? ' and by email' : ''}. There is no undo, and `
                + 'no way to edit it afterwards.'}
          </div>
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
                {chosenGroup.reachableNow.toLocaleString()} people
              </div>
              <div style={{ fontSize: 12, color: t.textMuted, marginTop: 3, lineHeight: 1.55 }}>
                {chosenGroup.describes}
              </div>
              <div style={{ fontSize: 11.5, color: t.textSubtle, marginTop: 5, lineHeight: 1.55 }}>
                {when
                  ? 'That is who the group comes to right now. It is worked out again when the '
                    + 'message actually goes, so this number will have moved by then.'
                  : 'Worked out just now. Everyone in it has a device that can receive a notification.'}
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
                Reachable means they have a device that can receive it. Everyone else is counted in
                the total and would get nothing.
              </div>
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
          <Button tone="subtle" onClick={onClose}>Cancel</Button>
          <Button tone="primary" disabled={!ready} onClick={() => setConfirming(true)}>
            {when ? 'Review and schedule' : 'Review and send'}
          </Button>
        </>
      }
    >
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
          options={screens.map(screen => ({ value: screen.key, label: screen.label }))}
          placeholder="Nowhere — just the message"
          clearable
          clearLabel="Nowhere — just the message"
        />
        {ctaRoute ? (
          <div style={{ marginTop: 8 }}>
            <Input value={ctaLabel} onChange={setCtaLabel} placeholder="What the button says — e.g. See the classes" />
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
