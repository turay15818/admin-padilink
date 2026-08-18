/**
 * The three things every operations screen does the same way: hold a query, show tallies
 * you can click, and page.
 *
 * Written once because three near-identical copies is three chances to forget to reset the
 * page index when a filter changes — which reads to the person using it as "the search is
 * broken", since page four of a two-page result is empty.
 */
import { useCallback, useState } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from './ui';
import type { OpsQuery } from '../api/admin';

export function useOpsQuery(initial: OpsQuery = {}) {
  const [query, setQuery] = useState<OpsQuery>({ pageIndex: 1, pageSize: 25, ...initial });

  const set = useCallback((patch: Partial<OpsQuery>) => {
    setQuery(current => ({ ...current, ...patch }));
  }, []);

  const reset = useCallback(() => {
    setQuery({ pageIndex: 1, pageSize: 25, ...initial });
    // `initial` is a literal at every call site, so it is stable in practice; spelling the
    // dependency out anyway keeps the lint honest.
  }, [initial]);

  return { query, set, reset };
}

export type Tally = {
  label: string;
  value: number;
  /** Clicking the tally filters by this bucket. Omit for a number that is only a number. */
  bucket?: string;
  tone?: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
};

/**
 * Numbers you can click.
 *
 * A count and the filter that produces it are the same idea, and separating them means
 * reading "5 disputed" and then hunting for the control that shows you those five.
 */
export function Tallies({ items, active, onPick }: {
  items: Tally[];
  active: string;
  onPick: (bucket: string) => void;
}) {
  const { t } = useTheme();
  const colour = (tone: Tally['tone']) =>
    tone === 'success' ? t.success
      : tone === 'warning' ? t.warning
      : tone === 'danger' ? t.danger
      : tone === 'info' ? t.info
      : t.text;

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      {items.map(item => {
        const on = item.bucket !== undefined && item.bucket === active;
        const clickable = item.bucket !== undefined;
        return (
          <button
            key={item.label}
            type="button"
            disabled={!clickable}
            onClick={() => clickable && onPick(on ? '' : item.bucket!)}
            style={{
              background: on ? t.brandSoft : t.surface,
              border: `1px solid ${on ? t.brand : t.border}`,
              borderRadius: 12, padding: '11px 15px', minWidth: 128, textAlign: 'left',
              cursor: clickable ? 'pointer' : 'default', fontFamily: 'inherit',
              transition: 'background .15s ease, border-color .15s ease',
            }}
          >
            <div style={{ fontSize: 21, fontWeight: 800, color: colour(item.tone), lineHeight: 1.15 }}>
              {item.value.toLocaleString()}
            </div>
            <div style={{ fontSize: 11.5, color: on ? t.brand : t.textSubtle, fontWeight: 700, marginTop: 2 }}>
              {item.label}
            </div>
          </button>
        );
      })}
    </div>
  );
}

const SIZES = [25, 50, 100];

/**
 * Paging that says where you are in words before it offers numbers.
 *
 * "Showing 26–50 of 312" answers the question people actually have; the buttons are for
 * afterwards. Page numbers are windowed around the current one so a 40-page result does
 * not produce 40 buttons.
 */
export function Pager({ page, noun, onPick, onSize }: {
  page: { totalCount: number; pageIndex: number; pageSize: number };
  noun: string;
  onPick: (pageIndex: number) => void;
  onSize: (pageSize: number) => void;
}) {
  const { t } = useTheme();
  const pages = Math.max(1, Math.ceil(page.totalCount / Math.max(1, page.pageSize)));
  const first = page.totalCount === 0 ? 0 : (page.pageIndex - 1) * page.pageSize + 1;
  const last = Math.min(page.totalCount, page.pageIndex * page.pageSize);

  const window: number[] = [];
  const from = Math.max(1, Math.min(page.pageIndex - 2, pages - 4));
  for (let index = from; index <= Math.min(pages, from + 4); index++) window.push(index);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      marginTop: 12, fontSize: 12.5, color: t.textMuted,
    }}>
      <span>
        Showing {first.toLocaleString()}–{last.toLocaleString()} of {page.totalCount.toLocaleString()} {noun}
      </span>

      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
        {SIZES.map(size => (
          <button
            key={size}
            type="button"
            onClick={() => onSize(size)}
            style={{
              background: size === page.pageSize ? t.brandSoft : 'transparent',
              border: `1px solid ${size === page.pageSize ? t.brand : t.border}`,
              color: size === page.pageSize ? t.brand : t.textMuted,
              borderRadius: 8, padding: '4px 9px', fontSize: 12, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {size}
          </button>
        ))}
      </span>

      {pages > 1 ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Button size="sm" tone="subtle" disabled={page.pageIndex <= 1} onClick={() => onPick(page.pageIndex - 1)}>
            ‹
          </Button>
          {window.map(index => (
            <button
              key={index}
              type="button"
              onClick={() => onPick(index)}
              style={{
                background: index === page.pageIndex ? t.brand : 'transparent',
                border: `1px solid ${index === page.pageIndex ? t.brand : t.border}`,
                color: index === page.pageIndex ? '#FFFFFF' : t.textMuted,
                borderRadius: 8, minWidth: 30, padding: '5px 0', fontSize: 12.5, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {index}
            </button>
          ))}
          <Button size="sm" tone="subtle" disabled={page.pageIndex >= pages} onClick={() => onPick(page.pageIndex + 1)}>
            ›
          </Button>
        </span>
      ) : null}
    </div>
  );
}
