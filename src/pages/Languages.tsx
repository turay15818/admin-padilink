/**
 * The language desk.
 *
 * Nobody on this team can write Temne or Mende well enough to put it in front of somebody
 * signing a work agreement. So the app ships neither - it ships the ABILITY to have them,
 * and this is where somebody who does speak them finishes the job.
 *
 * Two decisions worth knowing about:
 *
 *   Untranslated rows sort to the top. A translator who opens this should land on work, not
 *   on four hundred rows they already did.
 *
 *   Approving is separate from typing, and an empty box cannot be approved. The people who
 *   can write Temne are not necessarily the people who decide what the app says - and an
 *   approved blank would blank the label on a phone rather than fall back to English.
 */
import { useCallback, useEffect, useState } from 'react';
import { adminApi, type LanguageSummary, type PhrasePage, type PhraseRow } from '../api/admin';
import { useTheme } from '../theme/ThemeProvider';
import {
  Button, Card, EmptyState, ErrorNote, Input, Loading, PageHeader, Pill, Toasts, useToasts,
} from '../components/ui';

export function Languages() {
  const { t } = useTheme();
  const { toasts, push } = useToasts();
  const [languages, setLanguages] = useState<LanguageSummary[]>([]);
  const [locale, setLocale] = useState('tem');
  const [page, setPage] = useState<PhrasePage | null>(null);
  const [pageIndex, setPageIndex] = useState(1);
  const [search, setSearch] = useState('');
  const [untranslatedOnly, setUntranslatedOnly] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const loadLanguages = useCallback(async () => {
    try { setLanguages(await adminApi.phraseLanguages()); }
    catch { /* the list below still works; the chips just have no counts */ }
  }, []);

  const loadPage = useCallback(async () => {
    setError(null);
    try { setPage(await adminApi.phrases(locale, search, untranslatedOnly, pageIndex, 50)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load these phrases.'); }
  }, [locale, search, untranslatedOnly, pageIndex]);

  useEffect(() => { void loadLanguages(); }, [loadLanguages]);
  useEffect(() => { void loadPage(); }, [loadPage]);

  const sync = async () => {
    setSyncing(true);
    try {
      const result = await adminApi.phraseSync();
      push(result.added === 0 ? 'Already up to date.' : `${result.added} new phrases added.`);
      await loadLanguages();
      await loadPage();
    } catch (e) {
      push(e instanceof Error ? e.message : 'Sync failed.');
    } finally {
      setSyncing(false);
    }
  };

  const onSaved = (saved: PhraseRow) => {
    setPage(current => current && {
      ...current,
      items: current.items.map(row => (row.id === saved.id ? saved : row)),
    });
    void loadLanguages();
  };

  return (
    <div style={{ padding: 24 }}>
      <Toasts toasts={toasts} />
      <PageHeader
        title="Languages"
        subtitle="Every English string the app can show. Type the translation, approve it, and phones pick it up within half an hour - no app update."
        action={
          <Button tone="ghost" disabled={syncing} onClick={() => void sync()}>
            {syncing ? 'Syncing…' : 'Sync phrases from app'}
          </Button>
        }
      />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {languages.map(language => (
          <button
            key={language.locale}
            onClick={() => { setLocale(language.locale); setPageIndex(1); }}
            style={{
              border: `1px solid ${language.locale === locale ? t.brand : t.borderStrong}`,
              background: language.locale === locale ? t.brand : t.surface,
              color: language.locale === locale ? t.brandText : t.text,
              borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700,
              fontFamily: 'inherit', cursor: 'pointer',
            }}>
            {language.name} · {language.percent}%
          </button>
        ))}
      </div>

      {page ? (
        <Card pad={14} style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ color: t.textMuted, fontSize: 12, marginBottom: 6 }}>
                {page.approved} of {page.total} live on phones · {page.translated} typed
              </div>
              <div style={{ height: 8, borderRadius: 999, background: t.surfaceMuted, overflow: 'hidden' }}>
                <div style={{ height: 8, width: `${Math.max(1, page.percent)}%`, background: t.brand }} />
              </div>
            </div>
            <div style={{ minWidth: 220, flex: 1 }}>
              <Input
                value={search}
                onChange={value => { setSearch(value); setPageIndex(1); }}
                placeholder="Search the English or the translation…"
              />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, color: t.textMuted, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={untranslatedOnly}
                onChange={event => { setUntranslatedOnly(event.target.checked); setPageIndex(1); }}
              />
              Only what still needs doing
            </label>
          </div>
        </Card>
      ) : null}

      {error ? <ErrorNote message={error} /> : null}

      {page === null ? <Loading label="Loading phrases…" /> : page.items.length === 0 ? (
        <EmptyState
          icon="🗣"
          title={page.total === 0 ? 'No phrases yet' : 'Nothing left here'}
          message={
            page.total === 0
              ? 'Press "Sync phrases from app" to pull in every English string the app can show.'
              : 'Every phrase matching this filter has been translated. Untick the filter to review what is already done.'
          }
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {page.items.map(row => (
            <PhraseEditor key={row.id} row={row} onSaved={onSaved} onError={push} />
          ))}
        </div>
      )}

      {page && page.totalPages > 1 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
          <Button size="sm" disabled={pageIndex <= 1} onClick={() => setPageIndex(current => current - 1)}>
            Previous
          </Button>
          <span style={{ color: t.textMuted, fontSize: 13 }}>
            Page {page.pageIndex} of {page.totalPages}
          </span>
          <Button size="sm" disabled={pageIndex >= page.totalPages} onClick={() => setPageIndex(current => current + 1)}>
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function PhraseEditor({
  row, onSaved, onError,
}: {
  row: PhraseRow;
  onSaved: (saved: PhraseRow) => void;
  onError: (message: string) => void;
}) {
  const { t } = useTheme();
  const [text, setText] = useState(row.translatedText ?? '');
  const [saving, setSaving] = useState(false);

  // The row can be replaced under us by a page change or a sync; follow it rather than
  // showing the previous phrase's translation against the new English.
  useEffect(() => { setText(row.translatedText ?? ''); }, [row.id, row.translatedText]);

  const dirty = text.trim() !== (row.translatedText ?? '').trim();

  const save = async (approved: boolean) => {
    setSaving(true);
    try {
      const saved = await adminApi.phraseSave(row.id, text.trim() ? text.trim() : null, approved);
      onSaved(saved);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not save that.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card pad={13}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ color: t.text, fontSize: 13.5, fontWeight: 600, lineHeight: 1.45 }}>
            {row.sourceText}
          </div>
          {row.updatedByName ? (
            <div style={{ color: t.textMuted, fontSize: 11.5, marginTop: 4 }}>
              Last touched by {row.updatedByName}
            </div>
          ) : null}
        </div>
        <div style={{ flex: 1.2, minWidth: 240 }}>
          <Input value={text} onChange={setText} placeholder="Type the translation…" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {row.approved ? <Pill tone="success">Live</Pill> : text.trim() ? <Pill tone="warning">Not live</Pill> : null}
          <Button size="sm" disabled={saving || !dirty} onClick={() => void save(row.approved)}>
            Save
          </Button>
          <Button
            size="sm"
            tone={row.approved ? 'subtle' : 'primary'}
            disabled={saving || !text.trim()}
            title={
              row.approved
                ? 'Take it off phones. The text stays here.'
                : 'Put it on phones. It reaches them within half an hour.'
            }
            onClick={() => void save(!row.approved)}>
            {row.approved ? 'Unpublish' : 'Approve'}
          </Button>
        </div>
      </div>
    </Card>
  );
}
