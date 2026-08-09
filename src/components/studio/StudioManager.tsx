import {
  Check,
  ChevronDown,
  CircleAlert,
  ExternalLink,
  FilePlus2,
  Files,
  FolderInput,
  Layers3,
  ListFilter,
  PenLine,
  Plus,
  Search,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import { stories } from "../../articles";
import type { Locale } from "../../content";
import { emptyCategoryForm, emptySeriesForm } from "../../studio/studioModel";
import type { StudioPageModel } from "../../studio/useStudioPage";

type StudioManagerProps = { studio: StudioPageModel };

export function StudioManager({ studio }: StudioManagerProps) {
  const {
    state,
    managementSection,
    setManagementSection,
    managerHeading,
    addDraft,
    articleCounts,
    articleQuery,
    setArticleQuery,
    articleCategory,
    setArticleCategory,
    managedArticles,
    articleFilter,
    setArticleFilter,
    selectedManagedArticles,
    toggleVisibleArticles,
    visibleManagedArticles,
    allVisibleSelected,
    activeMoveCategory,
    setMoveCategory,
    moveSelectedArticles,
    selectedDraftCount,
    deleteSelectedDrafts,
    selectedArticleKeys,
    toggleArticleSelection,
    openDraft,
    editPublishedStory,
    managerStatus,
    setManagerStatus,
    visibleCategories,
    managerCategoryQuery,
    setManagerCategoryQuery,
    categoryUsage,
    editManagerCategory,
    deleteCategory,
    saveManagerCategory,
    editingCategoryId,
    setEditingCategoryId,
    managerCategoryForm,
    setManagerCategoryForm,
    visibleSeries,
    seriesQuery,
    setSeriesQuery,
    seriesUsage,
    editSeries,
    deleteSeries,
    saveSeries,
    editingSeriesId,
    setEditingSeriesId,
    seriesForm,
    setSeriesForm,
  } = studio;

  return (
          <section className="studio-manager" aria-labelledby="studio-manager-title">
            <header className="studio-manager-head">
              <div>
                <span>{managerHeading.eyebrow}</span>
                <h2 id="studio-manager-title">{managerHeading.title}</h2>
                <p>{managerHeading.description}</p>
              </div>
              {managementSection === "articles" ? <button type="button" className="studio-manager-create" onClick={addDraft}><FilePlus2 aria-hidden="true" />新建文章</button> : null}
            </header>

            <nav className="studio-manager-sections" aria-label="管理内容">
              {([
                ["articles", "文章", Files],
                ["categories", "分类", Tags],
                ["series", "系列", Layers3],
              ] as const).map(([section, label, Icon]) => (
                <button key={section} type="button" className={managementSection === section ? "is-active" : ""} onClick={() => { setManagementSection(section); setManagerStatus(""); }}>
                  <Icon aria-hidden="true" />{label}
                </button>
              ))}
            </nav>

            {managementSection === "articles" ? (
              <>
            <div className="studio-manager-summary" aria-label="文章概览">
              <div><span>线上文章</span><strong>{stories.length}</strong><small>当前博客可见</small></div>
              <div><span>本地草稿</span><strong>{state.drafts.length}</strong><small>保存在此浏览器</small></div>
              <div><span>待更新</span><strong>{articleCounts.pending}</strong><small>与线上文章同 slug</small></div>
            </div>

            <section className="studio-library">
              <div className="studio-library-toolbar">
                <label className="studio-library-search">
                  <Search aria-hidden="true" />
                  <span className="sr-only">搜索文章</span>
                  <input value={articleQuery} onChange={(event) => setArticleQuery(event.target.value)} placeholder="搜索标题、摘要或 slug" />
                </label>
                <label className="studio-library-category">
                  <ListFilter aria-hidden="true" />
                  <span className="sr-only">按分类筛选</span>
                  <select value={articleCategory} onChange={(event) => setArticleCategory(event.target.value)}>
                    <option value="all">全部分类</option>
                    {state.categories.map((category) => <option key={category.id} value={category.id}>{category.name.zh} / {category.name.en}</option>)}
                  </select>
                  <ChevronDown aria-hidden="true" />
                </label>
              </div>

              <div className="studio-library-tabs" role="tablist" aria-label="文章状态">
                {([
                  ["all", "全部", managedArticles.length],
                  ["published", "仅已发布", articleCounts.published],
                  ["draft", "仅草稿", articleCounts.draft],
                  ["pending", "待更新", articleCounts.pending],
                ] as const).map(([filter, label, count]) => (
                  <button key={filter} type="button" role="tab" aria-selected={articleFilter === filter} className={articleFilter === filter ? "is-active" : ""} onClick={() => setArticleFilter(filter)}>
                    {label}<span>{count}</span>
                  </button>
                ))}
              </div>

              <div className={`studio-library-selection${selectedManagedArticles.length ? " has-selection" : ""}`}>
                <div>
                  <button type="button" onClick={toggleVisibleArticles} disabled={!visibleManagedArticles.length}>{allVisibleSelected ? "取消全选" : "全选当前结果"}</button>
                  <span>显示 {visibleManagedArticles.length} 篇{selectedManagedArticles.length ? ` · 已选 ${selectedManagedArticles.length} 篇` : ""}</span>
                </div>
                {selectedManagedArticles.length ? (
                  <div className="studio-library-bulk-actions">
                    <label>
                      <span className="sr-only">目标分类</span>
                      <select value={activeMoveCategory} onChange={(event) => setMoveCategory(event.target.value)}>
                        {state.categories.map((category) => <option key={category.id} value={category.id}>移至：{category.name.zh}</option>)}
                      </select>
                      <ChevronDown aria-hidden="true" />
                    </label>
                    <button type="button" className="is-primary" onClick={moveSelectedArticles}><FolderInput aria-hidden="true" />移动</button>
                    <button type="button" disabled={!selectedDraftCount} title={selectedDraftCount ? "删除选中的本地稿" : "已发布原文不能在浏览器中直接删除"} onClick={deleteSelectedDrafts}><Trash2 aria-hidden="true" />删除本地稿</button>
                  </div>
                ) : null}
              </div>

              {visibleManagedArticles.length ? (
                <div className="studio-article-table">
                  <div className="studio-article-row studio-article-table-head" aria-hidden="true">
                    <span />
                    <span>文章</span>
                    <span>分类</span>
                    <span>日期</span>
                    <span>操作</span>
                  </div>
                  {visibleManagedArticles.map((item) => {
                    const category = state.categories.find((candidate) => candidate.id === item.category);
                    const languages = (["zh", "en"] as Locale[]).filter((candidate) => item.draft
                      ? Boolean(item.draft.title[candidate] && item.draft.body[candidate])
                      : item.story?.availableLocales.includes(candidate));
                    const statusLabel = { published: "已发布", draft: "草稿", pending: "待更新" }[item.status];
                    return (
                      <article className={`studio-article-row is-${item.status}`} key={item.key}>
                        <label className="studio-article-check">
                          <input type="checkbox" checked={selectedArticleKeys.has(item.key)} onChange={() => toggleArticleSelection(item.key)} />
                          <span className="sr-only">选择 {item.title.zh || item.title.en || "未命名草稿"}</span>
                        </label>
                        <div className="studio-article-main">
                          <div><span className={`studio-article-status is-${item.status}`}>{statusLabel}</span>{languages.length ? <small>{languages.map((candidate) => candidate.toUpperCase()).join(" + ")}</small> : <small>内容未完成</small>}</div>
                          <h3>{item.title.zh || item.title.en || "未命名草稿"}</h3>
                          <p>{item.summary.zh || item.summary.en || "尚未填写文章摘要。"}</p>
                          <code>{item.slug || "尚未设置 slug"}</code>
                        </div>
                        <div className="studio-article-category" data-label="分类"><strong>{category?.name.zh ?? item.category}</strong><span>{category?.name.en ?? item.category}</span></div>
                        <time className="studio-article-date" dateTime={item.date} data-label="日期">{item.date}</time>
                        <div className="studio-article-actions">
                          {item.draft
                            ? <button type="button" onClick={() => openDraft(item.draft!.id)}><PenLine aria-hidden="true" />编辑</button>
                            : <button type="button" onClick={() => editPublishedStory(item.story!)}><FilePlus2 aria-hidden="true" />建立编辑稿</button>}
                          {item.story ? <a href={`/zh/stories/${item.story.slug}`} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" />查看</a> : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="studio-library-empty"><Files aria-hidden="true" /><strong>没有符合条件的文章</strong><span>换一个关键词、分类或状态试试。</span></div>
              )}

              <p className="studio-manager-status" aria-live="polite">{managerStatus}</p>
              <p className="studio-manager-note"><CircleAlert aria-hidden="true" />移动已发布文章时会建立待更新稿；下载发布包并重新部署后，线上分类才会变化。</p>
            </section>
              </>
            ) : managementSection === "categories" ? (
              <div className="studio-taxonomy-workspace">
                <section className="studio-taxonomy-panel" aria-labelledby="studio-categories-list-title">
                  <div className="studio-taxonomy-panel-head">
                    <div><span>CATEGORIES</span><h3 id="studio-categories-list-title">全部分类</h3></div>
                    <strong>{visibleCategories.length} / {state.categories.length}</strong>
                  </div>
                  <label className="studio-library-search studio-taxonomy-search">
                    <Search aria-hidden="true" /><span className="sr-only">搜索分类</span>
                    <input value={managerCategoryQuery} onChange={(event) => setManagerCategoryQuery(event.target.value)} placeholder="搜索名称、标识或简介" />
                  </label>
                  <div className="studio-taxonomy-list">
                    {visibleCategories.map((category) => {
                      const usage = categoryUsage.get(category.id) ?? { published: 0, drafts: 0 };
                      const useCount = usage.published + usage.drafts;
                      const onlyCategory = state.categories.length === 1;
                      const deleteDisabled = onlyCategory || useCount > 0;
                      const deleteReason = onlyCategory ? "至少保留一个分类" : useCount ? "请先移动占用该分类的文章" : "删除分类";
                      return (
                        <article className="studio-taxonomy-item" key={category.id}>
                          <div className="studio-taxonomy-icon"><Tags aria-hidden="true" /></div>
                          <div className="studio-taxonomy-content">
                            <div><h4>{category.name.zh}</h4><span>{category.name.en}</span></div>
                            <p>{category.description.zh}</p>
                            <small>{category.id} · 线上 {usage.published} · 本地稿 {usage.drafts}</small>
                          </div>
                          <div className="studio-taxonomy-actions">
                            <button type="button" onClick={() => editManagerCategory(category)}><PenLine aria-hidden="true" />编辑</button>
                            <button type="button" className="is-danger" disabled={deleteDisabled} title={deleteReason} onClick={() => deleteCategory(category)}><Trash2 aria-hidden="true" />删除</button>
                          </div>
                        </article>
                      );
                    })}
                    {!visibleCategories.length ? <div className="studio-taxonomy-empty">没有符合条件的分类。</div> : null}
                  </div>
                </section>

                <form className="studio-taxonomy-form" onSubmit={saveManagerCategory}>
                  <div className="studio-taxonomy-panel-head">
                    <div><span>{editingCategoryId ? "EDIT" : "NEW"}</span><h3>{editingCategoryId ? "编辑分类" : "新增分类"}</h3></div>
                    {editingCategoryId ? <button type="button" aria-label="取消编辑分类" onClick={() => { setEditingCategoryId(""); setManagerCategoryForm(emptyCategoryForm); }}><X aria-hidden="true" /></button> : null}
                  </div>
                  <p className="studio-taxonomy-help">分类标识用于文章元数据与分类路由，创建后保持不变。</p>
                  <label>分类标识<input value={managerCategoryForm.id} disabled={Boolean(editingCategoryId)} onChange={(event) => setManagerCategoryForm((current) => ({ ...current, id: event.target.value.toLocaleLowerCase().replace(/[^a-z0-9-]/g, "-") }))} placeholder="design" /></label>
                  <div className="studio-taxonomy-name-grid">
                    <label>中文名称<input value={managerCategoryForm.nameZh} onChange={(event) => setManagerCategoryForm((current) => ({ ...current, nameZh: event.target.value }))} placeholder="设计" /></label>
                    <label>英文名称<input value={managerCategoryForm.nameEn} onChange={(event) => setManagerCategoryForm((current) => ({ ...current, nameEn: event.target.value }))} placeholder="Design" /></label>
                  </div>
                  <label>中文简介<textarea rows={3} value={managerCategoryForm.descriptionZh} onChange={(event) => setManagerCategoryForm((current) => ({ ...current, descriptionZh: event.target.value }))} placeholder="关于界面、产品与视觉秩序的观察。" /></label>
                  <label>英文简介<textarea rows={3} value={managerCategoryForm.descriptionEn} onChange={(event) => setManagerCategoryForm((current) => ({ ...current, descriptionEn: event.target.value }))} placeholder="Observations on interfaces and visual order." /></label>
                  <button type="submit" className="studio-taxonomy-submit">{editingCategoryId ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}{editingCategoryId ? "保存分类" : "创建分类"}</button>
                  <p className="studio-manager-status" aria-live="polite">{managerStatus}</p>
                </form>
              </div>
            ) : (
              <div className="studio-taxonomy-workspace">
                <section className="studio-taxonomy-panel" aria-labelledby="studio-series-list-title">
                  <div className="studio-taxonomy-panel-head">
                    <div><span>SERIES</span><h3 id="studio-series-list-title">全部系列</h3></div>
                    <strong>{visibleSeries.length} / {state.series.length}</strong>
                  </div>
                  <label className="studio-library-search studio-taxonomy-search">
                    <Search aria-hidden="true" /><span className="sr-only">搜索系列</span>
                    <input value={seriesQuery} onChange={(event) => setSeriesQuery(event.target.value)} placeholder="搜索系列名称或标识" />
                  </label>
                  <div className="studio-taxonomy-list">
                    {visibleSeries.map((series) => {
                      const usage = seriesUsage.get(series.id) ?? { published: 0, drafts: 0 };
                      return (
                        <article className="studio-taxonomy-item" key={series.id}>
                          <div className="studio-taxonomy-icon"><Layers3 aria-hidden="true" /></div>
                          <div className="studio-taxonomy-content">
                            <div><h4>{series.name.zh}</h4><span>{series.name.en}</span></div>
                            <p>线上 {usage.published} 篇 · 本地稿 {usage.drafts} 篇</p>
                            <small>{series.id}</small>
                          </div>
                          <div className="studio-taxonomy-actions">
                            <button type="button" onClick={() => editSeries(series)}><PenLine aria-hidden="true" />编辑</button>
                            <button type="button" className="is-danger" onClick={() => deleteSeries(series)}><Trash2 aria-hidden="true" />删除</button>
                          </div>
                        </article>
                      );
                    })}
                    {!visibleSeries.length ? <div className="studio-taxonomy-empty">还没有系列，可从右侧创建第一个。</div> : null}
                  </div>
                </section>

                <form className="studio-taxonomy-form" onSubmit={saveSeries}>
                  <div className="studio-taxonomy-panel-head">
                    <div><span>{editingSeriesId ? "EDIT" : "NEW"}</span><h3>{editingSeriesId ? "编辑系列" : "新增系列"}</h3></div>
                    {editingSeriesId ? <button type="button" aria-label="取消编辑系列" onClick={() => { setEditingSeriesId(""); setSeriesForm(emptySeriesForm); }}><X aria-hidden="true" /></button> : null}
                  </div>
                  <p className="studio-taxonomy-help">重命名或删除使用中的系列，会同步更新本地稿并为线上文章建立待更新稿。</p>
                  <label>系列标识<input value={seriesForm.id} disabled={Boolean(editingSeriesId)} onChange={(event) => setSeriesForm((current) => ({ ...current, id: event.target.value.toLocaleLowerCase().replace(/[^a-z0-9-]/g, "-") }))} placeholder="design-notes" /></label>
                  <div className="studio-taxonomy-name-grid">
                    <label>中文名称<input value={seriesForm.nameZh} onChange={(event) => setSeriesForm((current) => ({ ...current, nameZh: event.target.value }))} placeholder="设计札记" /></label>
                    <label>英文名称<input value={seriesForm.nameEn} onChange={(event) => setSeriesForm((current) => ({ ...current, nameEn: event.target.value }))} placeholder="Design Notes" /></label>
                  </div>
                  <button type="submit" className="studio-taxonomy-submit">{editingSeriesId ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}{editingSeriesId ? "保存系列" : "创建系列"}</button>
                  <p className="studio-manager-status" aria-live="polite">{managerStatus}</p>
                </form>
              </div>
            )}
          </section>
  );
}
