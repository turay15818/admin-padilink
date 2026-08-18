/**
 * Services: the categories and skills the whole marketplace is built on.
 *
 * Two views of one catalogue — services in a sortable table, categories in a grid — both
 * searched, filtered, sorted and paged by the API. The browser holds one page and knows
 * how many there are; it never pretends to search a list it only partly downloaded.
 *
 * Nothing is ever deleted here. A skill with providers attached is still referenced by
 * their profiles and by past bookings, so deletion would tear holes in history; retiring
 * hides it from new work and can be undone.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../theme/ThemeProvider';
import {
  Button, Card, EmptyState, ErrorNote, Field, Input, Loading, Modal, PageHeader, Pill,
  Spinner, Textarea, Toasts, useToasts,
} from '../components/ui';
import { Select } from '../components/Select';
import { Pagination } from '../components/Pagination';
import {
  adminApi, type AdminCategory, type AdminSkill, type CategoryPage, type SkillPage,
} from '../api/admin';

type CategoryDraft = { id?: string; name: string; description: string; iconUrl: string };
type SkillDraft = { id?: string; categoryId: string; name: string; description: string };
type Tab = 'services' | 'categories';

const STATUS_OPTIONS = [
  { value: '', label: 'Active and retired' },
  { value: 'active', label: 'Active only' },
  { value: 'retired', label: 'Retired only' },
];

const SKILL_SORTS = [
  { value: 'name', label: 'Name (A–Z)' },
  { value: '-name', label: 'Name (Z–A)' },
  { value: '-usage', label: 'Most used' },
  { value: 'usage', label: 'Least used' },
  { value: '-created', label: 'Newest first' },
  { value: 'created', label: 'Oldest first' },
];

const CATEGORY_SORTS = [
  { value: 'name', label: 'Name (A–Z)' },
  { value: '-name', label: 'Name (Z–A)' },
  { value: '-usage', label: 'Most services' },
  { value: '-created', label: 'Newest first' },
];

export function Catalog() {
  const { t } = useTheme();
  const { toasts, push } = useToasts();

  const [tab, setTab] = useState<Tab>('services');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [sort, setSort] = useState('name');
  const [pageIndex, setPageIndex] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [skills, setSkills] = useState<SkillPage | null>(null);
  const [categories, setCategories] = useState<CategoryPage | null>(null);
  const [allCategories, setAllCategories] = useState<AdminCategory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft | null>(null);
  const [skillDraft, setSkillDraft] = useState<SkillDraft | null>(null);
  const [retiring, setRetiring] = useState<{ kind: 'category' | 'skill'; id: string; name: string; count: number } | null>(null);
  const [retireReason, setRetireReason] = useState('');

  // Typing should not fire a request per keystroke, and it should not lag either.
  useEffect(() => {
    const timer = window.setTimeout(() => { setDebounced(search.trim()); setPageIndex(1); }, 260);
    return () => window.clearTimeout(timer);
  }, [search]);

  // The category filter and the "which category?" picker both need the full list, which is
  // small by nature — a marketplace has tens of categories, not thousands.
  const loadCategoryList = useCallback(() => {
    adminApi.catalog(true)
      .then(setAllCategories)
      .catch(() => setAllCategories([]));
  }, []);
  useEffect(loadCategoryList, [loadCategoryList]);

  const query = useMemo(() => ({
    search: debounced || undefined,
    status: status || undefined,
    sort,
    pageIndex,
    pageSize,
    categoryId: tab === 'services' && categoryId ? categoryId : undefined,
  }), [debounced, status, sort, pageIndex, pageSize, categoryId, tab]);

  // Guards against a slow early request overwriting a fast later one.
  const requestSeq = useRef(0);

  const load = useCallback(() => {
    const mine = ++requestSeq.current;
    setLoading(true);
    const work = tab === 'services' ? adminApi.skillPage(query) : adminApi.categoryPage(query);
    work
      .then(result => {
        if (mine !== requestSeq.current) return;
        if (tab === 'services') setSkills(result as SkillPage);
        else setCategories(result as CategoryPage);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (mine !== requestSeq.current) return;
        setError(caught instanceof Error ? caught.message : 'Could not load the catalogue.');
      })
      .finally(() => { if (mine === requestSeq.current) setLoading(false); });
  }, [tab, query]);
  useEffect(load, [load]);

  const run = (work: Promise<unknown>, done: string) => {
    setBusy(true);
    work
      .then(() => {
        push(done);
        load();
        loadCategoryList();
        setCategoryDraft(null);
        setSkillDraft(null);
        setRetiring(null);
        setRetireReason('');
      })
      .catch((caught: unknown) => push(caught instanceof Error ? caught.message : 'That did not work.', 'error'))
      .finally(() => setBusy(false));
  };

  const saveCategory = () => {
    if (!categoryDraft) return;
    const body = {
      name: categoryDraft.name.trim(),
      description: categoryDraft.description.trim() || null,
      iconUrl: categoryDraft.iconUrl.trim() || null,
    };
    run(categoryDraft.id ? adminApi.updateCategory(categoryDraft.id, body) : adminApi.createCategory(body),
      categoryDraft.id ? 'Category updated.' : 'Category created.');
  };

  const saveSkill = () => {
    if (!skillDraft) return;
    const body = {
      categoryId: skillDraft.categoryId,
      name: skillDraft.name.trim(),
      description: skillDraft.description.trim() || null,
    };
    run(skillDraft.id ? adminApi.updateSkill(skillDraft.id, body) : adminApi.createSkill(body),
      skillDraft.id ? 'Service updated.' : 'Service added.');
  };

  const confirmRetire = () => {
    if (!retiring) return;
    const reason = retireReason.trim() || null;
    run(retiring.kind === 'category'
      ? adminApi.setCategoryActive(retiring.id, false, reason)
      : adminApi.setSkillActive(retiring.id, false, reason),
      retiring.kind === 'category' ? 'Category retired.' : 'Service retired.');
  };

  const switchTab = (next: Tab) => {
    setTab(next);
    setPageIndex(1);
    setSort('name');
    setCategoryId('');
  };

  const page = tab === 'services' ? skills : categories;
  const filtersOn = Boolean(debounced || status || categoryId);

  return (
    <>
      <PageHeader
        title="Services"
        subtitle="The categories and services people can offer and book. Retiring hides one from new work without touching history."
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button tone="subtle" onClick={() => setCategoryDraft({ name: '', description: '', iconUrl: '' })}>
              ＋ Category
            </Button>
            <Button
              tone="primary"
              disabled={allCategories.length === 0}
              title={allCategories.length === 0 ? 'Create a category first' : undefined}
              onClick={() => setSkillDraft({ categoryId: allCategories[0]?.id ?? '', name: '', description: '' })}
            >
              ＋ New service
            </Button>
          </div>
        }
      />

      {/* ---- the numbers, which do not move while you type ---- */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 11, marginBottom: 15 }}>
        <Tally label="Services" value={skills?.totalCount ?? categories?.totalSkills ?? null} />
        <Tally label="Categories" value={categories?.totalCount ?? allCategories.length} />
        <Tally label="Active" value={page?.activeCount ?? null} tone="success" />
        <Tally label="Retired" value={page?.retiredCount ?? null} tone="warning" />
      </div>

      <Card pad={0}>
        {/* ---- tabs ---- */}
        <div style={{ display: 'flex', gap: 2, padding: '10px 14px 0', borderBottom: `1px solid ${t.border}` }}>
          {(['services', 'categories'] as Tab[]).map(name => (
            <button
              key={name}
              onClick={() => switchTab(name)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                padding: '9px 14px', fontSize: 13.5, fontWeight: 700, textTransform: 'capitalize',
                color: tab === name ? t.text : t.textMuted,
                borderBottom: `2px solid ${tab === name ? t.accent : 'transparent'}`,
                marginBottom: -1,
              }}
            >
              {name}
            </button>
          ))}
        </div>

        {/* ---- filters: every one of these is applied by the API ---- */}
        <div style={{
          display: 'flex', gap: 9, padding: '13px 14px', flexWrap: 'wrap', alignItems: 'center',
          borderBottom: `1px solid ${t.border}`,
        }}>
          <div style={{ flex: 1, minWidth: 210, position: 'relative' }}>
            <Input
              value={search}
              onChange={setSearch}
              placeholder={tab === 'services' ? 'Search services…' : 'Search categories…'}
            />
            {loading ? (
              <span style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)' }}>
                <Spinner size={14} />
              </span>
            ) : null}
          </div>

          {tab === 'services' ? (
            <Select
              width={188}
              value={categoryId}
              onChange={value => { setCategoryId(value); setPageIndex(1); }}
              clearable
              clearLabel="Every category"
              placeholder="Every category"
              options={allCategories.map(category => ({
                value: category.id,
                label: category.name,
                detail: `${category.skillCount} service${category.skillCount === 1 ? '' : 's'}`,
              }))}
            />
          ) : null}

          <Select
            width={168}
            value={status}
            onChange={value => { setStatus(value); setPageIndex(1); }}
            options={STATUS_OPTIONS}
          />

          <Select
            width={168}
            align="right"
            value={sort}
            onChange={setSort}
            options={tab === 'services' ? SKILL_SORTS : CATEGORY_SORTS}
          />

          {filtersOn ? (
            <Button size="sm" tone="subtle" onClick={() => {
              setSearch(''); setStatus(''); setCategoryId(''); setPageIndex(1);
            }}>
              Clear
            </Button>
          ) : null}
        </div>

        {/* ---- the list ---- */}
        <div style={{ padding: '4px 14px 14px' }}>
          {error ? <div style={{ padding: 14 }}><ErrorNote message={error} /></div>
            : !page ? <Loading />
            : page.items.length === 0 ? (
              <EmptyState
                icon="⌕"
                title={filtersOn ? 'Nothing matches those filters' : `No ${tab} yet`}
                message={filtersOn
                  ? 'Try a different search, or clear the filters.'
                  : 'Create the first one, then add the services that sit under it.'}
              />
            ) : tab === 'services' ? (
              <SkillTable
                skills={(page as SkillPage).items}
                busy={busy}
                onEdit={skill => setSkillDraft({
                  id: skill.id, categoryId: skill.categoryId, name: skill.name, description: skill.description ?? '',
                })}
                onRetire={skill => {
                  setRetiring({ kind: 'skill', id: skill.id, name: skill.name, count: skill.providerCount });
                  setRetireReason('');
                }}
                onRestore={skill => run(adminApi.setSkillActive(skill.id, true), 'Service restored.')}
              />
            ) : (
              <CategoryGrid
                categories={(page as CategoryPage).items}
                busy={busy}
                onEdit={category => setCategoryDraft({
                  id: category.id, name: category.name,
                  description: category.description ?? '', iconUrl: category.iconUrl ?? '',
                })}
                onAddSkill={category => setSkillDraft({ categoryId: category.id, name: '', description: '' })}
                onRetire={category => {
                  setRetiring({ kind: 'category', id: category.id, name: category.name, count: category.skillCount });
                  setRetireReason('');
                }}
                onRestore={category => run(adminApi.setCategoryActive(category.id, true), 'Category restored.')}
              />
            )}

          {page && page.items.length > 0 ? (
            <Pagination
              pageIndex={page.pageIndex}
              pageSize={page.pageSize}
              totalCount={page.totalCount}
              onPage={setPageIndex}
              onPageSize={size => { setPageSize(size); setPageIndex(1); }}
              noun={tab === 'services' ? 'service' : 'category'}
            />
          ) : null}
        </div>
      </Card>

      {/* ---- dialogs ---- */}
      {categoryDraft ? (
        <Modal title={categoryDraft.id ? 'Edit category' : 'New category'} onClose={() => setCategoryDraft(null)}>
          <Field label="Name">
            <Input value={categoryDraft.name} onChange={value => setCategoryDraft({ ...categoryDraft, name: value })} autoFocus placeholder="e.g. Home repair" />
          </Field>
          <Field label="Description" hint="Shown to people browsing services.">
            <Textarea value={categoryDraft.description} onChange={value => setCategoryDraft({ ...categoryDraft, description: value })} rows={2} />
          </Field>
          <Field label="Icon URL (optional)">
            <Input value={categoryDraft.iconUrl} onChange={value => setCategoryDraft({ ...categoryDraft, iconUrl: value })} placeholder="https://…" />
          </Field>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button tone="subtle" onClick={() => setCategoryDraft(null)}>Cancel</Button>
            <Button tone="primary" disabled={busy || categoryDraft.name.trim().length < 2} onClick={saveCategory}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </Modal>
      ) : null}

      {skillDraft ? (
        <Modal title={skillDraft.id ? 'Edit service' : 'New service'} onClose={() => setSkillDraft(null)}>
          <Field label="Category">
            <Select
              value={skillDraft.categoryId}
              onChange={value => setSkillDraft({ ...skillDraft, categoryId: value })}
              placeholder="Choose a category"
              options={allCategories.map(category => ({
                value: category.id,
                label: category.name,
                detail: category.active ? `${category.skillCount} service${category.skillCount === 1 ? '' : 's'}` : 'Retired',
                disabled: !category.active,
              }))}
            />
          </Field>
          <Field label="Name">
            <Input value={skillDraft.name} onChange={value => setSkillDraft({ ...skillDraft, name: value })} autoFocus placeholder="e.g. Plumbing" />
          </Field>
          <Field label="Description (optional)">
            <Textarea value={skillDraft.description} onChange={value => setSkillDraft({ ...skillDraft, description: value })} rows={2} />
          </Field>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button tone="subtle" onClick={() => setSkillDraft(null)}>Cancel</Button>
            <Button tone="primary" disabled={busy || skillDraft.name.trim().length < 2 || !skillDraft.categoryId} onClick={saveSkill}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </Modal>
      ) : null}

      {retiring ? (
        <Modal title={`Retire ${retiring.name}?`} onClose={() => setRetiring(null)}>
          <p style={{ color: t.textMuted, fontSize: 13.5, lineHeight: 1.6, margin: '0 0 14px' }}>
            {retiring.kind === 'category'
              ? <>This hides the category from new work. Its {retiring.count} service{retiring.count === 1 ? '' : 's'} stay attached and can be restored at any time.</>
              : retiring.count > 0
                ? <><strong style={{ color: t.text }}>{retiring.count} provider{retiring.count === 1 ? '' : 's'}</strong> list this service. Retiring keeps it on their profiles and in past bookings — it just stops appearing for new work.</>
                : <>Nobody offers this service yet. Retiring hides it from new work; it can be restored at any time.</>}
          </p>
          <Field label="Reason (optional)" hint="Recorded on the audit trail beside your name.">
            <Input value={retireReason} onChange={setRetireReason} placeholder="e.g. Merged into General repairs" autoFocus />
          </Field>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button tone="subtle" onClick={() => setRetiring(null)}>Cancel</Button>
            <Button tone="danger" disabled={busy} onClick={confirmRetire}>{busy ? 'Retiring…' : 'Retire'}</Button>
          </div>
        </Modal>
      ) : null}

      <Toasts toasts={toasts} />
    </>
  );
}

/* ---------- pieces ---------- */

function Tally({ label, value, tone }: { label: string; value: number | null; tone?: 'success' | 'warning' }) {
  const { t } = useTheme();
  const colour = tone === 'success' ? t.success : tone === 'warning' ? t.warning : t.text;
  return (
    <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, padding: '11px 14px' }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.8, color: t.textSubtle, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: colour, marginTop: 2 }}>
        {value === null ? '—' : value.toLocaleString()}
      </div>
    </div>
  );
}

function SkillTable({ skills, busy, onEdit, onRetire, onRestore }: {
  skills: AdminSkill[]; busy: boolean;
  onEdit: (skill: AdminSkill) => void;
  onRetire: (skill: AdminSkill) => void;
  onRestore: (skill: AdminSkill) => void;
}) {
  const { t } = useTheme();
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
        <thead>
          <tr>
            {['Service', 'Category', 'Providers', 'Added', ''].map((head, index) => (
              <th key={head || index} style={{
                textAlign: index === 2 ? 'right' : 'left', padding: '9px 10px', fontSize: 11,
                fontWeight: 800, letterSpacing: 0.7, color: t.textSubtle, textTransform: 'uppercase',
                borderBottom: `1px solid ${t.border}`, whiteSpace: 'nowrap',
              }}>{head}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {skills.map(skill => (
            <tr key={skill.id} style={{ borderBottom: `1px solid ${t.border}` }}>
              <td style={{ padding: '11px 10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, color: skill.active ? t.text : t.textSubtle }}>{skill.name}</span>
                  {!skill.active ? <Pill tone="warning">Retired</Pill> : null}
                </div>
                {skill.description ? (
                  <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2, maxWidth: 460 }}>{skill.description}</div>
                ) : null}
              </td>
              <td style={{ padding: '11px 10px', color: t.textMuted, whiteSpace: 'nowrap' }}>{skill.categoryName}</td>
              <td style={{ padding: '11px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                <span style={{ fontWeight: 700, color: skill.providerCount > 0 ? t.text : t.textSubtle }}>
                  {skill.providerCount.toLocaleString()}
                </span>
              </td>
              <td style={{ padding: '11px 10px', color: t.textSubtle, whiteSpace: 'nowrap', fontSize: 12.5 }}>
                {new Date(skill.dateCreated).toLocaleDateString()}
              </td>
              <td style={{ padding: '11px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                <div style={{ display: 'inline-flex', gap: 6 }}>
                  <Button size="sm" tone="subtle" onClick={() => onEdit(skill)}>Edit</Button>
                  {skill.active
                    ? <Button size="sm" tone="danger" disabled={busy} onClick={() => onRetire(skill)}>Retire</Button>
                    : <Button size="sm" tone="primary" disabled={busy} onClick={() => onRestore(skill)}>Restore</Button>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CategoryGrid({ categories, busy, onEdit, onAddSkill, onRetire, onRestore }: {
  categories: AdminCategory[]; busy: boolean;
  onEdit: (category: AdminCategory) => void;
  onAddSkill: (category: AdminCategory) => void;
  onRetire: (category: AdminCategory) => void;
  onRestore: (category: AdminCategory) => void;
}) {
  const { t } = useTheme();
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(310px,1fr))', gap: 12, paddingTop: 10 }}>
      {categories.map(category => (
        <div key={category.id} style={{
          border: `1px solid ${t.border}`, borderRadius: 13, padding: 14,
          background: category.active ? t.surface : t.surfaceMuted,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: category.active ? t.text : t.textSubtle }}>{category.name}</span>
            {!category.active ? <Pill tone="warning">Retired</Pill> : null}
          </div>
          <div style={{ fontSize: 12.5, color: t.textMuted, minHeight: 34, lineHeight: 1.55 }}>
            {category.description ?? <span style={{ color: t.textSubtle }}>No description.</span>}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, margin: '10px 0 12px' }}>
            {category.skills.slice(0, 6).map(skill => (
              <span key={skill.id} style={{
                fontSize: 11.5, padding: '3px 8px', borderRadius: 999,
                background: t.surfaceMuted, border: `1px solid ${t.border}`,
                color: skill.active ? t.textMuted : t.textSubtle,
                textDecoration: skill.active ? 'none' : 'line-through',
              }}>{skill.name}</span>
            ))}
            {category.skillCount > 6 ? (
              <span style={{ fontSize: 11.5, padding: '3px 8px', color: t.textSubtle }}>
                +{category.skillCount - 6} more
              </span>
            ) : category.skillCount === 0 ? (
              <span style={{ fontSize: 11.5, color: t.textSubtle }}>No services yet.</span>
            ) : null}
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Button size="sm" tone="subtle" onClick={() => onEdit(category)}>Edit</Button>
            <Button size="sm" tone="subtle" onClick={() => onAddSkill(category)}>＋ Service</Button>
            {category.active
              ? <Button size="sm" tone="danger" disabled={busy} onClick={() => onRetire(category)}>Retire</Button>
              : <Button size="sm" tone="primary" disabled={busy} onClick={() => onRestore(category)}>Restore</Button>}
          </div>
        </div>
      ))}
    </div>
  );
}
