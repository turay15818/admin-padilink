/**
 * The bottom bar, arranged.
 *
 * <p>Every screen the phone has is listed on the left; the bar as it will be is drawn on the
 * right, as a phone draws it, and moves as the operator adds, removes, reorders, renames or
 * re-glyphs a tab. Three to five tabs; Home always first. A tab whose feature is off stays in
 * the arrangement but is greyed in the preview and dropped by the phone until the feature
 * returns — the operator never has to rebuild the bar because a module was paused.</p>
 *
 * <p>Saving asks why, because the bar is at the bottom of every screen on every phone.</p>
 */
import { useCallback, useEffect, useState } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import { Actions, Button, Card, ErrorNote, Field, Input, Loading, Modal, PageHeader, Pill, Textarea, Toasts, useToasts } from '../components/ui';
import { adminApi, type AdminIdentity, type NavItem, type NavigationResponse } from '../api/admin';

const err = (caught: unknown, fallback: string) => (caught instanceof Error ? caught.message : fallback);

export function Navigation({ identity }: { identity: AdminIdentity }) {
  const { t } = useTheme();
  const { toasts, push } = useToasts();
  const [data, setData] = useState<NavigationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<NavItem[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState<null | 'save' | 'reset'>(null);
  void identity;

  const load = useCallback(() => {
    adminApi.navigation()
      .then(result => {
        setData(result);
        // Start from what the phone draws now, so an install that has never been arranged
        // opens with the default bar in the editor rather than an empty list.
        setItems(result.arranged ? result.arrangement : result.bar.map(b => ({ key: b.key, label: null, icon: null })));
        setDirty(false);
        setError(null);
      })
      .catch((caught: unknown) => setError(err(caught, 'Could not load the bar.')));
  }, []);
  useEffect(load, [load]);

  if (error) return <ErrorNote message={error} />;
  if (!data) return <Loading />;

  const inBar = new Set(items.map(i => i.key));
  const available = data.destinations.filter(d => !inBar.has(d.key));
  const destination = (key: string) => data.destinations.find(d => d.key === key);
  const change = (next: NavItem[]) => { setItems(next); setDirty(true); };
  const move = (index: number, by: number) => {
    const next = [...items];
    const target = index + by;
    if (target < 1 || target >= next.length || index < 1) return;
    [next[index], next[target]] = [next[target], next[index]];
    change(next);
  };
  const add = (key: string) => { if (items.length < data.max) change([...items, { key, label: null, icon: null }]); };
  const remove = (key: string) => { if (key !== 'discover') change(items.filter(i => i.key !== key)); };
  const edit = (key: string, patch: Partial<NavItem>) => change(items.map(i => (i.key === key ? { ...i, ...patch } : i)));

  const tooFew = items.length < data.min;
  const preview = items.map(i => {
    const d = destination(i.key);
    return { key: i.key, label: i.label || d?.label || i.key, icon: i.icon || d?.icon || 'star', off: d ? !d.featureOn : false };
  });

  return (
    <>
      <PageHeader
        title="The bottom bar"
        subtitle={`Three to five screens, Home first. ${data.arranged ? 'Arranged by an operator.' : 'Not yet arranged — the switches decide.'} A tab whose module is paused is dropped by the phone until it returns.`}
        action={data.canEdit ? (
          <div style={{ display: 'flex', gap: 6 }}>
            {data.arranged ? <Button tone="subtle" onClick={() => setSaving('reset')}>Let the switches decide</Button> : null}
            <Button tone="primary" disabled={!dirty || tooFew} onClick={() => setSaving('save')}>Save the bar</Button>
          </div>
        ) : undefined}
      />

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'minmax(320px, 1.3fr) minmax(280px, 1fr)', alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 12 }}>
          <Card>
            <div style={{ fontSize: 12, fontWeight: 800, color: t.textSubtle, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>In the bar · {items.length} of {data.max}</div>
            {tooFew ? <div style={{ fontSize: 12.5, color: t.warning, fontWeight: 700, marginBottom: 8 }}>Two tabs is a toggle. Add at least {data.min - items.length} more.</div> : null}
            <div style={{ display: 'grid', gap: 8 }}>
              {items.map((item, index) => {
                const d = destination(item.key);
                return (
                  <div key={item.key} data-nav={item.key} style={{ display: 'grid', gridTemplateColumns: '28px 1fr auto', gap: 10, alignItems: 'center', border: `1px solid ${t.border}`, borderRadius: 12, padding: '10px 12px', background: t.surface }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: t.textSubtle, fontVariantNumeric: 'tabular-nums' }}>{index + 1}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: 13.5, color: t.text }}>{d?.label ?? item.key}</strong>
                        {item.key === 'discover' ? <Pill tone="neutral">Always first</Pill> : null}
                        {d && !d.featureOn ? <Pill tone="warning">{d.feature} is off — hidden on phones</Pill> : null}
                        {d?.signedIn ? <Pill tone="neutral">Needs sign-in</Pill> : null}
                      </div>
                      <div style={{ fontSize: 11.5, color: t.textSubtle }}>{d?.description}</div>
                      {data.canEdit ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                          <Input value={item.label ?? ''} onChange={v => edit(item.key, { label: v || null })} placeholder={`Words: ${d?.label ?? ''}`} />
                          <select value={item.icon ?? ''} onChange={e => edit(item.key, { icon: e.target.value || null })} style={{ padding: '8px 10px', borderRadius: 10, border: `1px solid ${t.borderStrong}`, background: t.surfaceMuted, color: t.text, fontFamily: 'inherit', fontSize: 13 }}>
                            <option value="">Glyph: {d?.icon}</option>
                            {data.icons.map(icon => <option key={icon} value={icon}>{icon}</option>)}
                          </select>
                        </div>
                      ) : null}
                    </div>
                    {data.canEdit ? (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <Button size="sm" tone="subtle" disabled={index <= 1} onClick={() => move(index, -1)}>Up</Button>
                        <Button size="sm" tone="subtle" disabled={index === 0 || index >= items.length - 1} onClick={() => move(index, 1)}>Down</Button>
                        <Button size="sm" tone="danger" disabled={item.key === 'discover'} onClick={() => remove(item.key)}>Remove</Button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </Card>

          <Card>
            <div style={{ fontSize: 12, fontWeight: 800, color: t.textSubtle, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Screens the phone has</div>
            <div style={{ display: 'grid', gap: 6 }}>
              {available.map(d => (
                <div key={d.key} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 10px', borderRadius: 10, border: `1px solid ${t.border}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: 13, color: t.text }}>{d.label}</strong>
                      <span style={{ fontSize: 11.5, color: t.textSubtle }}>{d.icon}</span>
                      {!d.featureOn ? <Pill tone="warning">{d.feature} is off</Pill> : null}
                      {d.signedIn ? <Pill tone="neutral">Needs sign-in</Pill> : null}
                    </div>
                    <div style={{ fontSize: 11.5, color: t.textSubtle }}>{d.description}</div>
                  </div>
                  {data.canEdit ? <Button size="sm" tone="subtle" disabled={items.length >= data.max} onClick={() => add(d.key)}>Add</Button> : null}
                </div>
              ))}
              {available.length === 0 ? <div style={{ fontSize: 12.5, color: t.textSubtle }}>Everything is in the bar.</div> : null}
            </div>
          </Card>
        </div>

        <div style={{ position: 'sticky', top: 12 }}>
          <Card>
            <div style={{ fontSize: 12, fontWeight: 800, color: t.textSubtle, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>As a phone draws it</div>
            <PhoneBar tabs={preview} />
            <div style={{ fontSize: 12, color: t.textMuted, marginTop: 10, lineHeight: 1.5 }}>
              {preview.some(p => p.off) ? 'Greyed tabs are in the arrangement but hidden on phones while their module is paused.' : 'What every phone shows at the bottom of every screen, once saved.'}
            </div>
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${t.border}`, fontSize: 12, color: t.textSubtle }}>
              Right now the phone shows: <strong style={{ color: t.text }}>{data.bar.map(b => b.label).join(' · ')}</strong>
            </div>
          </Card>
        </div>
      </div>

      {saving ? (
        <ReasonDialog
          title={saving === 'reset' ? 'Let the switches decide the bar' : 'Save the bar'}
          hint={saving === 'reset' ? 'The arrangement is removed. The bar goes back to the default plus whatever the module switches place.' : 'The bar is at the bottom of every screen on every phone. Say why it is changing; it goes on the record.'}
          busy={false}
          onClose={() => setSaving(null)}
          onSave={reason => {
            const work = saving === 'reset' ? adminApi.resetNavigation(reason) : adminApi.saveNavigation(items, reason);
            work.then(result => { setData(result); setItems(result.arranged ? result.arrangement : result.bar.map(b => ({ key: b.key, label: null, icon: null }))); setDirty(false); setSaving(null); push(saving === 'reset' ? 'The switches decide again.' : 'Saved. Phones pick it up within five minutes.'); })
              .catch((caught: unknown) => push(err(caught, 'That did not save.'), 'error'));
          }}
        />
      ) : null}
      <Toasts toasts={toasts} />
    </>
  );
}

/** A phone's bottom bar, at the phone's proportions, with the glyphs the phone draws. */
export function PhoneBar({ tabs, active = 0 }: { tabs: { key: string; label: string; icon: string; off?: boolean }[]; active?: number }) {
  const { t } = useTheme();
  return (
    <div style={{ background: t.railBg, borderRadius: 24, padding: '14px 10px 12px', maxWidth: 330, margin: '0 auto' }}>
      <div style={{ background: t.surfaceMuted, borderRadius: 16, height: 140, marginBottom: 8 }} />
      <div style={{ background: t.surface, borderRadius: 14, padding: '8px 4px 10px', display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, tabs.length)}, 1fr)`, gap: 2 }}>
        {tabs.map((tab, index) => {
          const color = tab.off ? t.textSubtle : index === active ? t.brand : t.textMuted;
          return (
            <div key={tab.key} style={{ display: 'grid', justifyItems: 'center', gap: 4, opacity: tab.off ? 0.45 : 1 }}>
              <div style={{ height: 3, width: 26, borderRadius: 2, background: index === active ? t.brand : 'transparent' }} />
              <Glyph name={tab.icon} color={color} />
              <span style={{ fontSize: 10.5, fontWeight: index === active ? 700 : 600, color, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tab.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The same closed glyph set the phone draws, as small SVG strokes. */
export function Glyph({ name, color, size = 20 }: { name: string; color: string; size?: number }) {
  const paths: Record<string, string> = {
    home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    alert: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 5v5m0 3h.01',
    cross: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z',
    search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 17l-5-5',
    briefcase: 'M3 8h18v11H3zM9 8V5h6v3M3 13h18',
    calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
    tag: 'M3 12l9-9h9v9l-9 9zm13-6h.01',
    book: 'M4 4h7a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4zm16 0h-7a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h7z',
    chat: 'M4 5h16v11H9l-5 4z',
    person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 4-6 8-6s8 2 8 6',
    radio: 'M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M7 7a7 7 0 0 0 0 10M17 7a7 7 0 0 1 0 10M4 4a11 11 0 0 0 0 16M20 4a11 11 0 0 1 0 16',
    feed: 'M4 4h16v6H4zm0 10h16v6H4z',
    gift: 'M3 9h18v4H3zm2 4h14v8H5zM12 9v12M12 9c-3 0-4-4-2-4s2 4 2 4zm0 0c3 0 4-4 2-4s-2 4-2 4z',
    pin: 'M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11zm0-9a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
    drop: 'M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z',
    chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
    star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9z',
    shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name] ?? paths.star} />
    </svg>
  );
}

function ReasonDialog({ title, hint, busy, onClose, onSave }: { title: string; hint: string; busy: boolean; onClose: () => void; onSave: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  return (
    <Modal title={title} onClose={onClose}>
      <Field label="Why" hint={hint}><Textarea value={reason} onChange={setReason} rows={3} /></Field>
      <Actions>
        <Button tone="subtle" onClick={onClose}>Cancel</Button>
        <Button tone="primary" disabled={busy || reason.trim().length < 3} onClick={() => onSave(reason.trim())}>Save</Button>
      </Actions>
    </Modal>
  );
}
