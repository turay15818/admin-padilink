/**
 * Pagination that tells you where you are.
 *
 * "Showing 26–50 of 312" answers the question people actually have; a bare row of numbers
 * does not. Page size lives here too, because the first thing anyone does on a long list
 * is ask for more of it at once.
 */
import { useTheme } from '../theme/ThemeProvider';
import { Select } from './Select';

const SIZES = [10, 25, 50, 100];

export function Pagination({
  pageIndex, pageSize, totalCount, onPage, onPageSize, noun = 'result',
}: {
  pageIndex: number;
  pageSize: number;
  totalCount: number;
  onPage: (pageIndex: number) => void;
  onPageSize?: (pageSize: number) => void;
  noun?: string;
}) {
  const { t } = useTheme();
  const pageCount = Math.max(1, Math.ceil(totalCount / Math.max(1, pageSize)));
  const first = totalCount === 0 ? 0 : (pageIndex - 1) * pageSize + 1;
  const last = Math.min(totalCount, pageIndex * pageSize);

  const step = (button: { label: string; to: number; disabled: boolean; title: string }) => (
    <button
      key={button.label}
      type="button"
      title={button.title}
      disabled={button.disabled}
      onClick={() => onPage(button.to)}
      style={{
        minWidth: 34, height: 32, padding: '0 10px', borderRadius: 9, fontFamily: 'inherit',
        fontSize: 13, fontWeight: 700, cursor: button.disabled ? 'default' : 'pointer',
        border: `1px solid ${t.border}`, background: t.surface,
        color: button.disabled ? t.textSubtle : t.text, opacity: button.disabled ? 0.5 : 1,
      }}
    >
      {button.label}
    </button>
  );

  // A window around the current page. Long lists get ellipses rather than 40 buttons.
  const numbers: (number | '…')[] = [];
  const window = 1;
  for (let page = 1; page <= pageCount; page++) {
    if (page === 1 || page === pageCount || Math.abs(page - pageIndex) <= window) {
      numbers.push(page);
    } else if (numbers[numbers.length - 1] !== '…') {
      numbers.push('…');
    }
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14,
      flexWrap: 'wrap', padding: '13px 2px 2px',
    }}>
      <div style={{ fontSize: 12.5, color: t.textMuted }}>
        {totalCount === 0
          ? `No ${noun}s`
          : <>Showing <strong style={{ color: t.text }}>{first}–{last}</strong> of <strong style={{ color: t.text }}>{totalCount.toLocaleString()}</strong> {noun}{totalCount === 1 ? '' : 's'}</>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {onPageSize ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: 12.5, color: t.textSubtle }}>Per page</span>
            <Select
              width={86}
              align="right"
              value={String(pageSize)}
              onChange={value => onPageSize(Number(value))}
              options={SIZES.map(size => ({ value: String(size), label: String(size) }))}
            />
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          {step({ label: '‹', to: pageIndex - 1, disabled: pageIndex <= 1, title: 'Previous page' })}
          {numbers.map((page, index) => page === '…' ? (
            <span key={`gap-${index}`} style={{ color: t.textSubtle, fontSize: 13, padding: '0 2px' }}>…</span>
          ) : (
            <button
              key={page}
              type="button"
              onClick={() => onPage(page)}
              style={{
                minWidth: 34, height: 32, borderRadius: 9, fontFamily: 'inherit', fontSize: 13,
                fontWeight: page === pageIndex ? 800 : 600, cursor: 'pointer',
                border: `1px solid ${page === pageIndex ? t.brand : t.border}`,
                background: page === pageIndex ? t.brand : t.surface,
                color: page === pageIndex ? t.brandText : t.text,
              }}
            >
              {page}
            </button>
          ))}
          {step({ label: '›', to: pageIndex + 1, disabled: pageIndex >= pageCount, title: 'Next page' })}
        </div>
      </div>
    </div>
  );
}
