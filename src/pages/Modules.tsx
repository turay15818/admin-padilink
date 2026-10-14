/**
 * Modules — the parts of Vacancy big enough to be opened or closed as a whole.
 *
 * <p>Two decisions per module, kept apart on purpose. "Switched on" is about the API: off, and
 * every route the module owns refuses. "In the bottom bar" is about the phone: on, and the
 * module takes one of the five slots at the bottom of every screen — which means something
 * else leaves. The screen shows the bar before and after, so the trade is made with the eyes
 * open rather than discovered from a customer.</p>
 *
 * <p>The checklist is checked, not enforced. An operator who reads it and opens the emergency
 * pilot with the fire line still blank has made a decision, and the audit row says so. The
 * console's job is to make sure it was a decision.</p>
 */
import { useCallback, useEffect, useState } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import {
  Actions, Button, Card, ErrorNote, Field, Loading, Modal, PageHeader, Pill, Textarea, Toasts,
  fmtDateTime, useToasts,
} from '../components/ui';
import {
  adminApi, settingsChanged,
  type AdminIdentity, type FeatureRow, type FeaturesResponse, type ModuleRow, type SettingRow,
} from '../api/admin';
import { FeatureDialog, SettingDialog } from './Governance';

/** What the phone calls each tab. Codes the console does not know are shown as they are. */
const TAB_NAMES: Record<string, string> = {
  discover: 'Home',
  providers: 'Providers',
  jobs: 'Jobs',
  bookings: 'Bookings',
  listings: 'Listings',
  health: 'Health',
  emergency: 'Emergency',
};

const tabName = (code: string) => TAB_NAMES[code] ?? code;

export function Modules({ identity }: { identity: AdminIdentity }) {
  const { toasts, push } = useToasts();
  const [data, setData] = useState<FeaturesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [switching, setSwitching] = useState<FeatureRow | null>(null);
  const [placing, setPlacing] = useState<ModuleRow | null>(null);
  const [editing, setEditing] = useState<SettingRow | null>(null);

  const load = useCallback(() => {
    adminApi.features()
      .then(result => { setData(result); setError(null); })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load the modules.'));
  }, []);
  useEffect(load, [load]);

  if (error) return <ErrorNote message={error} />;
  if (!data) return <Loading />;

  const canEdit = data.canEdit && identity.isSuperAdmin;

  return (
    <>
      <PageHeader
        title="Modules"
        subtitle="The parts of Vacancy big enough to be opened or closed as a whole — and whether each has a tab on the phone."
      />

      <BarStrip label="The phone's bottom bar right now" tabs={data.bar} />

      <div style={{
        display: 'grid', gap: 14, marginTop: 16,
        gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
      }}>
        {data.modules.map(module => (
          <ModuleCard
            key={module.code}
            module={module}
            canEdit={canEdit}
            onSwitch={() => setSwitching(module.feature)}
            onPlace={() => setPlacing(module)}
            onEdit={setEditing}
          />
        ))}
      </div>

      {switching ? (
        <FeatureDialog
          feature={switching}
          onClose={() => setSwitching(null)}
          onDone={(result, message) => { setData(result); push(message); settingsChanged(); }}
        />
      ) : null}

      {placing ? (
        <TabDialog
          module={placing}
          onClose={() => setPlacing(null)}
          onDone={(result, message) => { setData(result); push(message); settingsChanged(); }}
        />
      ) : null}

      {editing ? (
        <SettingDialog
          setting={editing}
          onClose={() => setEditing(null)}
          onDone={message => { push(message); load(); settingsChanged(); }}
        />
      ) : null}

      <Toasts toasts={toasts} />
    </>
  );
}

/** Five slots, drawn as the phone draws them, so a change to the bar is seen rather than read. */
function BarStrip({ label, tabs, ghost }: { label: string; tabs: string[]; ghost?: string[] }) {
  const { t } = useTheme();
  return (
    <div>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: t.textSubtle, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 7 }}>
        {label}
      </div>
      <div style={{
        display: 'flex', gap: 6, padding: 6, borderRadius: 14,
        background: t.surface, border: `1px solid ${t.border}`, maxWidth: 520,
      }}>
        {tabs.map(tab => {
          const gone = ghost?.includes(tab);
          return (
            <div
              key={tab}
              data-tab={tab}
              style={{
                flex: 1, textAlign: 'center', padding: '9px 4px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                background: gone ? t.dangerSoft : t.brandSoft,
                color: gone ? t.danger : t.text,
                textDecoration: gone ? 'line-through' : 'none',
              }}
            >
              {tabName(tab)}
            </div>
          );
        })}
        {Array.from({ length: Math.max(0, 5 - tabs.length) }).map((_, index) => (
          <div key={`empty-${index}`} style={{ flex: 1, padding: '9px 4px', borderRadius: 10, border: `1px dashed ${t.border}` }} />
        ))}
      </div>
    </div>
  );
}

function ModuleCard({ module, canEdit, onSwitch, onPlace, onEdit }: {
  module: ModuleRow;
  canEdit: boolean;
  onSwitch: () => void;
  onPlace: () => void;
  onEdit: (setting: SettingRow) => void;
}) {
  const { t } = useTheme();
  const { feature } = module;
  const placed = feature.tab === true;
  const shown = placed && feature.effective;
  const ready = module.checklist.every(check => check.done);

  return (
    <Card pad={0} style={{ borderColor: feature.effective ? t.success : t.border, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '18px 20px 14px', borderBottom: `1px solid ${t.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: t.text }}>{module.label}</h2>
          {feature.effective
            ? <Pill tone="success">On</Pill>
            : feature.on
              ? <Pill tone="warning">Held off by what it needs</Pill>
              : <Pill tone="neutral">Off</Pill>}
          {shown ? <Pill tone="info">In the bar</Pill> : null}
        </div>
        <div style={{ fontSize: 12.5, color: t.textMuted, lineHeight: 1.65, marginTop: 8 }}>
          {module.description}
        </div>
      </div>

      {/* The two decisions, one under the other, each with its consequence beside the button. */}
      <Decision
        title="Switched on"
        detail={feature.effective
          ? `The API answers for its ${feature.paths.length} routes and the apps draw it.`
          : feature.on
            ? `Its switch reads on, but ${feature.needs.map(need => tabName(need)).join(' and ')} is off, so nothing works. Switch that on first.`
            : `Its ${feature.paths.length} routes refuse, and the apps draw nothing for it.`}
        state={feature.on ? 'On' : 'Off'}
        tone={feature.on ? 'primary' : 'subtle'}
        disabled={!canEdit}
        onPress={onSwitch}
      />

      <Decision
        title="In the bottom bar"
        detail={!feature.effective
          ? 'Only while it is switched on. A tab for something that is off is a door to a refusal.'
          : placed
            ? `Takes one of the phone's five slots${module.displaces.length ? '' : '.'}`
            : module.displaces.length
              ? `Placing it drops ${module.displaces.map(tabName).join(' and ')} from the bar. ${module.displaces.length === 1 ? 'It stays' : 'They stay'} one tap from Home.`
              : 'There is a free slot; nothing moves.'}
        state={placed ? 'Placed' : 'Not placed'}
        tone={placed ? 'primary' : 'subtle'}
        disabled={!canEdit || (!feature.effective && !placed)}
        onPress={onPlace}
      />

      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${t.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: t.text }}>Before opening it</span>
          {ready ? <Pill tone="success">Ready</Pill> : <Pill tone="warning">{module.checklist.filter(c => !c.done).length} to do</Pill>}
        </div>
        <div style={{ display: 'grid', gap: 7 }}>
          {module.checklist.map(check => (
            <div key={check.label} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{
                flexShrink: 0, marginTop: 3, width: 10, height: 10, borderRadius: 5,
                background: check.done ? t.success : 'transparent',
                border: `2px solid ${check.done ? t.success : t.warning}`,
              }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: t.text }}>{check.label}</div>
                <div style={{ fontSize: 11.5, color: t.textMuted, lineHeight: 1.5 }}>{check.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {module.settings.length > 0 ? (
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${t.border}` }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: t.text, marginBottom: 10 }}>The numbers on the screen</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {module.settings.map(setting => (
              <div key={setting.key} data-setting={setting.key} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: t.text }}>{setting.label}</div>
                  <div style={{ fontSize: 13, color: setting.value ? t.text : t.textSubtle, fontWeight: setting.value ? 700 : 600, fontVariantNumeric: 'tabular-nums' }}>
                    {setting.value ? (setting.kind === 3 && setting.key.endsWith('.note') ? `“${setting.value}”` : setting.value) : 'Not set'}
                  </div>
                </div>
                <Button size="sm" tone="subtle" disabled={!canEdit} onClick={() => onEdit(setting)}>Change</Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div style={{ padding: '12px 20px', fontSize: 11.5, color: t.textSubtle, lineHeight: 1.5, marginTop: 'auto' }}>
        {feature.changedByName
          ? <>{feature.changedByName}{feature.changedAt ? ` · ${fmtDateTime(feature.changedAt)}` : ''}{feature.changeReason ? ` — ${feature.changeReason}` : ''}</>
          : 'Never changed since it shipped.'}
      </div>
    </Card>
  );
}

function Decision({ title, detail, state, tone, disabled, onPress }: {
  title: string;
  detail: string;
  state: string;
  tone: 'primary' | 'subtle';
  disabled: boolean;
  onPress: () => void;
}) {
  const { t } = useTheme();
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: '14px 20px', borderBottom: `1px solid ${t.border}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: t.text }}>{title}</div>
        <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.55, marginTop: 3 }}>{detail}</div>
      </div>
      <div style={{ flexShrink: 0 }}>
        <Button size="sm" tone={tone} disabled={disabled} onClick={onPress}>{state}</Button>
      </div>
    </div>
  );
}

/**
 * Placing or removing a tab, with the bar shown before and after.
 *
 * <p>The one dialog on this screen that shows a picture. A sentence saying "Listings will
 * leave the bar" is true and forgettable; two rows of five pills with one crossed out is the
 * same fact in the form the operator will recognise on their own phone ten minutes later.</p>
 */
function TabDialog({ module, onClose, onDone }: {
  module: ModuleRow;
  onClose: () => void;
  onDone: (result: FeaturesResponse, message: string) => void;
}) {
  const { t } = useTheme();
  const going = module.feature.tab !== true;
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    setBusy(true);
    setError(null);
    adminApi.setFeatureTab(module.code, going, reason.trim())
      .then(result => {
        onDone(result, going ? `${module.label} is in the bar.` : `${module.label} is out of the bar.`);
        onClose();
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'That did not work.'))
      .finally(() => setBusy(false));
  };

  // Removing shows the bar as it will be without the tab, which the server has not sent —
  // it is the current bar minus this tab plus whatever returns. Close enough to draw from
  // what the default bar holds, and the server's answer replaces it the moment it saves.
  const after = going ? module.barIfPlaced : module.bar.filter(tab => tab !== module.code);

  return (
    <Modal title={going ? `Put ${module.label} in the bottom bar` : `Take ${module.label} out of the bottom bar`} onClose={onClose} width={560}>
      <div style={{ display: 'grid', gap: 14, marginBottom: 14 }}>
        <BarStrip label="Now" tabs={module.bar} ghost={going ? module.displaces : []} />
        <BarStrip label="After" tabs={after} />
      </div>

      {going && module.displaces.length ? (
        <div style={{
          padding: '10px 13px', borderRadius: 10, marginBottom: 14,
          background: t.warningSoft, border: `1px solid ${t.warning}`, fontSize: 12.5, color: t.text, lineHeight: 1.6,
        }}>
          The bar holds five. {module.displaces.map(tabName).join(' and ')} {module.displaces.length === 1 ? 'leaves' : 'leave'} it
          to make room — still one tap from Home, but no longer at the bottom of every screen.
        </div>
      ) : null}

      <Field label="Why" hint="Recorded against the tab. Every person with the app sees this change at the bottom of every screen.">
        <Textarea value={reason} onChange={setReason} rows={3} placeholder={going ? 'Pilot agreed with the ministry; opening the tab for Freetown.' : 'Closing the tab until the next phase.'} />
      </Field>

      {error ? <ErrorNote message={error} /> : null}

      <Actions>
        <Button tone="subtle" onClick={onClose}>Cancel</Button>
        <Button tone={going ? 'primary' : 'danger'} disabled={busy || !reason.trim()} onClick={save}>
          {busy ? 'Saving…' : going ? 'Put it in the bar' : 'Take it out'}
        </Button>
      </Actions>
    </Modal>
  );
}
