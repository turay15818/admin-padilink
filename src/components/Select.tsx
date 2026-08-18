/**
 * One dropdown, used everywhere.
 *
 * A native <select> cannot be searched, cannot show a second line of detail, and looks
 * like a different control on every operating system. This one types-to-filter, walks with
 * the arrow keys, closes on Escape, and can load its options from the API as you type —
 * which is the only way a list of every provider on the platform is usable at all.
 *
 * It is deliberately not a combo box: the value is always one of the options. Free text
 * that happens to match nothing is a bug waiting to be filed, not a feature.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import { Spinner } from './ui';

export type Option = {
  value: string;
  label: string;
  /** Second line — a category, a status, a count. Searched along with the label. */
  detail?: string;
  disabled?: boolean;
};

type Props = {
  value: string | null;
  onChange: (value: string) => void;
  /** Fixed options. Leave out when using `load`. */
  options?: Option[];
  /**
   * Async options. Called with the current search text (and once with '' on open), debounced.
   * Use for sets too large to hold — providers, jobs, classes.
   */
  load?: (search: string) => Promise<Option[]>;
  placeholder?: string;
  searchPlaceholder?: string;
  /** Adds a "clear" entry at the top of the list. */
  clearable?: boolean;
  clearLabel?: string;
  disabled?: boolean;
  /** Below this many fixed options the search box is hidden — it would be noise. */
  searchThreshold?: number;
  width?: number | string;
  /** Aligns the popup to the right edge, for controls that sit at the end of a row. */
  align?: 'left' | 'right';
};

export function Select({
  value, onChange, options, load, placeholder = 'Choose…', searchPlaceholder = 'Type to search…',
  clearable = false, clearLabel = 'Any', disabled = false, searchThreshold = 7,
  width = '100%', align = 'left',
}: Props) {
  const { t } = useTheme();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [loaded, setLoaded] = useState<Option[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // The label for a value we were handed but have not loaded yet — so an async Select
  // shows "Freetown Fixers" on arrival rather than a blank box.
  const [resolved, setResolved] = useState<Option | null>(null);

  // Memoised, because `?? []` produces a fresh array every render and would make every
  // useMemo below it recompute on each keystroke of the parent — the exact opposite of
  // what they are for.
  const source = useMemo(() => (load ? (loaded ?? []) : (options ?? [])), [load, loaded, options]);

  const visible = useMemo(() => {
    if (load) return source;   // the server already filtered
    const needle = search.trim().toLowerCase();
    if (!needle) return source;
    return source.filter(option =>
      option.label.toLowerCase().includes(needle) || (option.detail ?? '').toLowerCase().includes(needle));
  }, [source, search, load]);

  const selected = useMemo(
    () => source.find(option => option.value === value) ?? (resolved?.value === value ? resolved : null),
    [source, value, resolved]);

  // ---- async loading, debounced ----
  const runLoad = useCallback((term: string) => {
    if (!load) return;
    setLoading(true);
    load(term)
      .then(result => {
        setLoaded(result);
        // Remember the label of whatever is currently selected, for when the list moves on.
        const match = result.find(option => option.value === value);
        if (match) setResolved(match);
      })
      .catch(() => setLoaded([]))
      .finally(() => setLoading(false));
  }, [load, value]);

  useEffect(() => {
    if (!open || !load) return;
    const timer = window.setTimeout(() => runLoad(search.trim()), search.trim() ? 220 : 0);
    return () => window.clearTimeout(timer);
  }, [open, search, load, runLoad]);

  // ---- outside click and Escape ----
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    // stopPropagation matters: a dialog behind this one is also listening for Escape on
    // `window`, and without this the first press would close the dropdown AND the dialog,
    // throwing away everything typed into it.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setCursor(0);
      window.setTimeout(() => searchRef.current?.focus(), 0);
    } else {
      setSearch('');
    }
  }, [open]);

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const row = listRef.current.children[cursor] as HTMLElement | undefined;
    row?.scrollIntoView({ block: 'nearest' });
  }, [cursor, open]);

  const rows: Option[] = clearable ? [{ value: '', label: clearLabel }, ...visible] : visible;
  const showSearch = Boolean(load) || (options?.length ?? 0) >= searchThreshold;

  const pick = (option: Option) => {
    if (option.disabled) return;
    onChange(option.value);
    setResolved(option.value ? option : null);
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!open && (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown')) {
      event.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); setCursor(index => Math.min(rows.length - 1, index + 1)); }
    if (event.key === 'ArrowUp') { event.preventDefault(); setCursor(index => Math.max(0, index - 1)); }
    if (event.key === 'Enter') { event.preventDefault(); if (rows[cursor]) pick(rows[cursor]); }
    if (event.key === 'Home') { event.preventDefault(); setCursor(0); }
    if (event.key === 'End') { event.preventDefault(); setCursor(rows.length - 1); }
  };

  return (
    <div ref={rootRef} style={{ position: 'relative', width }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(value => !value)}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          width: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 12px', borderRadius: 10, cursor: disabled ? 'default' : 'pointer',
          border: `1px solid ${open ? t.brand : t.borderStrong}`,
          background: t.surfaceMuted, color: selected ? t.text : t.textSubtle,
          fontSize: 13.5, fontFamily: 'inherit', textAlign: 'left',
          boxShadow: open ? `0 0 0 3px ${t.brandSoft}` : 'none',
          opacity: disabled ? 0.6 : 1,
          transition: 'border-color .15s ease, box-shadow .15s ease',
        }}
      >
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected?.label ?? (value ? '…' : placeholder)}
        </span>
        {selected?.detail ? (
          <span style={{ fontSize: 11.5, color: t.textSubtle, flexShrink: 0 }}>{selected.detail}</span>
        ) : null}
        <span style={{
          flexShrink: 0, color: t.textSubtle, fontSize: 10,
          transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .18s ease',
        }}>▼</span>
      </button>

      {open ? (
        <div
          role="listbox"
        // A <label> ancestor (our Field wraps its children in one) forwards clicks inside
        // it to the first control it contains — this dropdown's own trigger button — so
        // picking an option would also re-toggle the dropdown shut. That forwarding is the
        // click's DEFAULT ACTION, not propagation, so preventDefault is what stops it;
        // stopPropagation alone does nothing here because React dispatches its synthetic
        // events from the root, long after the native event has passed the label.
        onClick={event => { event.preventDefault(); event.stopPropagation(); }}
          style={{
            position: 'absolute', top: 'calc(100% + 5px)', zIndex: 60,
            [align === 'right' ? 'right' : 'left']: 0,
            minWidth: '100%', maxWidth: 420,
            background: t.surface, border: `1px solid ${t.borderStrong}`, borderRadius: 12,
            boxShadow: t.shadow, overflow: 'hidden',
          }}
        >
          {showSearch ? (
            <div style={{ padding: 8, borderBottom: `1px solid ${t.border}` }}>
              <input
                ref={searchRef}
                value={search}
                onChange={event => { setSearch(event.target.value); setCursor(0); }}
                onKeyDown={onKeyDown}
                placeholder={searchPlaceholder}
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8,
                  border: `1px solid ${t.border}`, background: t.surfaceMuted, color: t.text,
                  fontSize: 13, fontFamily: 'inherit', outline: 'none',
                }}
              />
            </div>
          ) : null}

          <div ref={listRef} style={{ maxHeight: 268, overflowY: 'auto', padding: 5 }}>
            {loading && rows.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '14px 12px', color: t.textMuted, fontSize: 13 }}>
                <Spinner size={14} /> Searching…
              </div>
            ) : rows.length === 0 ? (
              <div style={{ padding: '14px 12px', color: t.textSubtle, fontSize: 13 }}>
                {search.trim() ? `Nothing matches “${search.trim()}”.` : 'Nothing to choose from yet.'}
              </div>
            ) : (
              rows.map((option, index) => {
                const isSelected = option.value === (value ?? '');
                const isCursor = index === cursor;
                return (
                  <div
                    key={`${option.value}-${index}`}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setCursor(index)}
                    onClick={() => pick(option)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 8,
                      cursor: option.disabled ? 'default' : 'pointer',
                      background: isCursor ? t.surfaceHover : 'transparent',
                      color: option.disabled ? t.textSubtle : t.text,
                      opacity: option.disabled ? 0.55 : 1,
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 13.5, fontWeight: isSelected ? 700 : 500, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {option.label}
                      </span>
                      {option.detail ? (
                        <span style={{ fontSize: 11.5, color: t.textSubtle, display: 'block', marginTop: 1 }}>{option.detail}</span>
                      ) : null}
                    </span>
                    {isSelected ? <span style={{ color: t.brand, fontSize: 13, flexShrink: 0 }}>✓</span> : null}
                  </div>
                );
              })
            )}
          </div>

          {loading && rows.length > 0 ? (
            <div style={{ padding: '6px 12px', borderTop: `1px solid ${t.border}`, fontSize: 11.5, color: t.textSubtle }}>
              Searching…
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Several values from one list. Same behaviour as Select, but picking does not close the
 * popup — choosing four placements should not mean opening the same menu four times.
 */
export function MultiSelect({
  values, onChange, options, placeholder = 'Choose…', disabled = false, width = '100%', summary,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  width?: number | string;
  /** Overrides the "2 selected" summary when a fuller phrase reads better. */
  summary?: (values: string[]) => string;
}) {
  const { t } = useTheme();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    // Same reason as Select: Escape closes this popup, not the dialog holding it.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const needle = search.trim().toLowerCase();
  const visible = needle
    ? options.filter(option => option.label.toLowerCase().includes(needle) || (option.detail ?? '').toLowerCase().includes(needle))
    : options;

  const toggle = (option: Option) => {
    onChange(values.includes(option.value)
      ? values.filter(value => value !== option.value)
      : [...values, option.value]);
  };

  const label = values.length === 0
    ? placeholder
    : summary
      ? summary(values)
      : values.length === 1
        ? (options.find(option => option.value === values[0])?.label ?? '1 selected')
        : `${values.length} selected`;

  return (
    <div ref={rootRef} style={{ position: 'relative', width }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(value => !value)}
        style={{
          width: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 12px', borderRadius: 10, cursor: disabled ? 'default' : 'pointer',
          border: `1px solid ${open ? t.brand : t.borderStrong}`,
          background: t.surfaceMuted, color: values.length ? t.text : t.textSubtle,
          fontSize: 13.5, fontFamily: 'inherit', textAlign: 'left',
          boxShadow: open ? `0 0 0 3px ${t.brandSoft}` : 'none',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <span style={{ flexShrink: 0, color: t.textSubtle, fontSize: 10, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .18s ease' }}>▼</span>
      </button>

      {open ? (
        <div
          role="listbox"
          aria-multiselectable="true"
        // A <label> ancestor (our Field wraps its children in one) forwards clicks inside
        // it to the first control it contains — this dropdown's own trigger button — so
        // picking an option would also re-toggle the dropdown shut. That forwarding is the
        // click's DEFAULT ACTION, not propagation, so preventDefault is what stops it;
        // stopPropagation alone does nothing here because React dispatches its synthetic
        // events from the root, long after the native event has passed the label.
        onClick={event => { event.preventDefault(); event.stopPropagation(); }}
          style={{
          position: 'absolute', top: 'calc(100% + 5px)', left: 0, zIndex: 60, minWidth: '100%', maxWidth: 420,
          background: t.surface, border: `1px solid ${t.borderStrong}`, borderRadius: 12, boxShadow: t.shadow, overflow: 'hidden',
        }}>
          {options.length >= 7 ? (
            <div style={{ padding: 8, borderBottom: `1px solid ${t.border}` }}>
              <input
                autoFocus
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Type to search…"
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8,
                  border: `1px solid ${t.border}`, background: t.surfaceMuted, color: t.text,
                  fontSize: 13, fontFamily: 'inherit', outline: 'none',
                }}
              />
            </div>
          ) : null}
          <div style={{ maxHeight: 268, overflowY: 'auto', padding: 5 }}>
            {visible.length === 0 ? (
              <div style={{ padding: '14px 12px', color: t.textSubtle, fontSize: 13 }}>Nothing matches.</div>
            ) : visible.map(option => {
              const on = values.includes(option.value);
              return (
                <div
                  key={option.value}
                  role="option"
                  aria-selected={on}
                  onClick={() => toggle(option)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 8,
                    cursor: 'pointer', color: t.text,
                  }}
                  onMouseEnter={event => { event.currentTarget.style.background = t.surfaceHover; }}
                  onMouseLeave={event => { event.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{
                    width: 17, height: 17, borderRadius: 5, flexShrink: 0, display: 'grid', placeItems: 'center',
                    border: `1.5px solid ${on ? t.brand : t.borderStrong}`, background: on ? t.brand : 'transparent',
                    color: t.brandText, fontSize: 11, fontWeight: 900,
                  }}>{on ? '✓' : ''}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13.5, display: 'block' }}>{option.label}</span>
                    {option.detail ? <span style={{ fontSize: 11.5, color: t.textSubtle }}>{option.detail}</span> : null}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
