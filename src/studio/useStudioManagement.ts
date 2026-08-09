import { useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { stories, type Story } from "../articles";
import { categories as defaultCategories, type Category } from "../categories";
import { deleteStudioAssets } from "../studioStorage";
import {
  createDraft,
  createDraftFromStory,
  emptyCategoryForm,
  emptySeriesForm,
  seriesNameMatches,
  type ArticleFilter,
  type CategoryForm,
  type ManagementSection,
  type ManagedArticle,
  type SeriesForm,
  type StudioSeries,
  type StudioState,
  type StudioView,
  type LocalizedDraft,
} from "./studioModel";

type ManagementOptions = {
  state: StudioState;
  setState: Dispatch<SetStateAction<StudioState>>;
  storageReady: boolean;
  persistOperation: (operation: Promise<void>) => Promise<void>;
};

export function useStudioManagement({ state, setState, storageReady, persistOperation }: ManagementOptions) {
  const [categoryForm, setCategoryForm] = useState<CategoryForm>(emptyCategoryForm);
  const [categoryStatus, setCategoryStatus] = useState("");
  const [view, setView] = useState<StudioView>("write");
  const [managementSection, setManagementSection] = useState<ManagementSection>("articles");
  const [articleFilter, setArticleFilter] = useState<ArticleFilter>("all");
  const [articleQuery, setArticleQuery] = useState("");
  const [articleCategory, setArticleCategory] = useState("all");
  const [selectedArticleKeys, setSelectedArticleKeys] = useState<Set<string>>(() => new Set());
  const [moveCategory, setMoveCategory] = useState(defaultCategories[0]?.id ?? "notes");
  const [managerStatus, setManagerStatus] = useState("");
  const [managerCategoryQuery, setManagerCategoryQuery] = useState("");
  const [managerCategoryForm, setManagerCategoryForm] = useState<CategoryForm>(emptyCategoryForm);
  const [editingCategoryId, setEditingCategoryId] = useState("");
  const [seriesQuery, setSeriesQuery] = useState("");
  const [seriesForm, setSeriesForm] = useState<SeriesForm>(emptySeriesForm);
  const [editingSeriesId, setEditingSeriesId] = useState("");
  const [removedPublishedSlugs, setRemovedPublishedSlugs] = useState<Set<string>>(() => new Set());
  const [isDeletingArticles, setIsDeletingArticles] = useState(false);

  const visibleStories = useMemo(() => stories.filter((story) => !removedPublishedSlugs.has(story.slug)), [removedPublishedSlugs]);
  const categoryUsage = useMemo(() => new Map(state.categories.map((category) => [category.id, {
    published: visibleStories.filter((story) => story.categoryId === category.id).length,
    drafts: state.drafts.filter((item) => item.category === category.id).length,
  }])), [state.categories, state.drafts, visibleStories]);
  const managedArticles = useMemo<ManagedArticle[]>(() => {
    const matchedDraftIds = new Set<string>();
    const publishedArticles = visibleStories.map((story): ManagedArticle => {
      const localDraft = state.drafts.find((item) => item.slug === story.slug && !matchedDraftIds.has(item.id));
      if (localDraft) matchedDraftIds.add(localDraft.id);
      return {
        key: localDraft ? `draft:${localDraft.id}` : `published:${story.slug}`,
        status: localDraft ? "pending" : "published",
        draft: localDraft,
        story,
        slug: story.slug,
        category: localDraft?.category ?? story.categoryId,
        date: localDraft?.date ?? story.date,
        updatedAt: localDraft?.updatedAt ?? `${story.date}T00:00:00.000Z`,
        title: {
          zh: localDraft?.title.zh || story.title.zh,
          en: localDraft?.title.en || story.title.en,
        },
        summary: {
          zh: localDraft?.summary.zh || story.summary.zh,
          en: localDraft?.summary.en || story.summary.en,
        },
      };
    });
    const localArticles = state.drafts
      .filter((item) => !matchedDraftIds.has(item.id))
      .map((item): ManagedArticle => ({
        key: `draft:${item.id}`,
        status: "draft",
        draft: item,
        slug: item.slug,
        category: item.category,
        date: item.date,
        updatedAt: item.updatedAt,
        title: { ...item.title },
        summary: { ...item.summary },
      }));
    return [...publishedArticles, ...localArticles]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }, [state.drafts, visibleStories]);
  const visibleManagedArticles = useMemo(() => {
    const query = articleQuery.trim().toLocaleLowerCase();
    return managedArticles.filter((item) => {
      if (articleFilter !== "all" && item.status !== articleFilter) return false;
      if (articleCategory !== "all" && item.category !== articleCategory) return false;
      if (!query) return true;
      return [item.title.zh, item.title.en, item.summary.zh, item.summary.en, item.slug]
        .some((value) => value.toLocaleLowerCase().includes(query));
    });
  }, [articleCategory, articleFilter, articleQuery, managedArticles]);
  const selectedManagedArticles = managedArticles.filter((item) => selectedArticleKeys.has(item.key));
  const activeMoveCategory = state.categories.some((category) => category.id === moveCategory)
    ? moveCategory
    : state.categories[0]?.id ?? "";
  const articleCounts = useMemo(() => ({
    published: managedArticles.filter((item) => item.status === "published").length,
    draft: managedArticles.filter((item) => item.status === "draft").length,
    pending: managedArticles.filter((item) => item.status === "pending").length,
  }), [managedArticles]);
  const seriesUsage = useMemo(() => new Map(state.series.map((series) => [series.id, {
    published: visibleStories.filter((story) => seriesNameMatches({ zh: story.series.zh ?? "", en: story.series.en ?? "" }, series)).length,
    drafts: state.drafts.filter((item) => seriesNameMatches(item.series, series)).length,
  }])), [state.drafts, state.series, visibleStories]);
  const visibleCategories = useMemo(() => {
    const query = managerCategoryQuery.trim().toLocaleLowerCase();
    if (!query) return state.categories;
    return state.categories.filter((category) => [category.id, category.name.zh, category.name.en, category.description.zh, category.description.en]
      .some((value) => value.toLocaleLowerCase().includes(query)));
  }, [managerCategoryQuery, state.categories]);
  const visibleSeries = useMemo(() => {
    const query = seriesQuery.trim().toLocaleLowerCase();
    if (!query) return state.series;
    return state.series.filter((series) => [series.id, series.name.zh, series.name.en]
      .some((value) => value.toLocaleLowerCase().includes(query)));
  }, [seriesQuery, state.series]);
  const managerHeading = {
    articles: { eyebrow: `LIBRARY / ${managedArticles.length} ARTICLES`, title: "全部文章", description: "统一查看本地草稿与已发布文章，筛选后可批量移动到其他分类。" },
    categories: { eyebrow: `TAXONOMY / ${state.categories.length} CATEGORIES`, title: "分类管理", description: "维护文章分类的中英文名称与简介，并查看每个分类的占用情况。" },
    series: { eyebrow: `COLLECTIONS / ${state.series.length} SERIES`, title: "系列管理", description: "集中维护系列名称；修改已发布系列时会自动建立待更新稿。" },
  }[managementSection];
  const managerItemCount = managementSection === "articles"
    ? managedArticles.length
    : managementSection === "categories"
      ? state.categories.length
      : state.series.length;

  const addDraft = () => {
    setState((current) => {
      const next = createDraft(current.categories[0]?.id);
      return { ...current, drafts: [next, ...current.drafts], activeId: next.id };
    });
    setView("write");
  };

  const openDraft = (draftId: string) => {
    setState((current) => ({ ...current, activeId: draftId }));
    setView("write");
  };

  const editPublishedStory = (story: Story) => {
    setState((current) => {
      const existing = current.drafts.find((item) => item.slug === story.slug);
      if (existing) return { ...current, activeId: existing.id };
      const next = createDraftFromStory(story);
      return { ...current, drafts: [next, ...current.drafts], activeId: next.id };
    });
    setView("write");
  };

  const toggleArticleSelection = (key: string) => {
    setSelectedArticleKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const allVisibleSelected = visibleManagedArticles.length > 0
    && visibleManagedArticles.every((item) => selectedArticleKeys.has(item.key));

  const toggleVisibleArticles = () => {
    setSelectedArticleKeys((current) => {
      const next = new Set(current);
      visibleManagedArticles.forEach((item) => {
        if (allVisibleSelected) next.delete(item.key);
        else next.add(item.key);
      });
      return next;
    });
  };

  const moveSelectedArticles = () => {
    if (!selectedManagedArticles.length || !activeMoveCategory) return;
    const articlesToMove = selectedManagedArticles.filter((item) => item.category !== activeMoveCategory);
    if (!articlesToMove.length) {
      setManagerStatus("所选文章已经在这个分类中。 ");
      return;
    }
    const selectedDraftIds = new Set(articlesToMove.flatMap((item) => item.draft ? [item.draft.id] : []));
    const publishedToImport = articlesToMove.flatMap((item) => !item.draft && item.story ? [item.story] : []);
    const now = new Date().toISOString();
    setState((current) => {
      const nextDrafts = current.drafts.map((item) => selectedDraftIds.has(item.id)
        ? { ...item, category: activeMoveCategory, updatedAt: now }
        : item);
      const existingSlugs = new Set(nextDrafts.map((item) => item.slug));
      const imported = publishedToImport
        .filter((story) => !existingSlugs.has(story.slug))
        .map((story) => ({ ...createDraftFromStory(story), category: activeMoveCategory, updatedAt: now }));
      return { ...current, drafts: [...imported, ...nextDrafts] };
    });
    const categoryName = state.categories.find((category) => category.id === activeMoveCategory)?.name.zh ?? activeMoveCategory;
    setManagerStatus(`已将 ${articlesToMove.length} 篇文章移至“${categoryName}”。已发布文章已生成待更新稿，重新发布后线上生效。`);
    setSelectedArticleKeys(new Set());
  };

  const deleteSelectedArticles = async () => {
    const draftIds = selectedManagedArticles.flatMap((item) => item.draft ? [item.draft.id] : []);
    const publishedSlugs = [...new Set(selectedManagedArticles.flatMap((item) => item.story ? [item.story.slug] : []))];
    if (!draftIds.length && !publishedSlugs.length) return;
    const detail = [
      publishedSlugs.length ? `${publishedSlugs.length} 篇已发布文章将从仓库下线` : "",
      draftIds.length ? `${draftIds.length} 篇本地稿将被删除` : "",
    ].filter(Boolean).join("，");
    if (!window.confirm(`确定继续吗？${detail}。仓库删除可通过 Git 历史恢复。`)) return;
    setIsDeletingArticles(true);
    setManagerStatus(publishedSlugs.length ? "正在创建下线提交…" : "正在删除本地稿…");
    let deletionResult;
    try {
      if (publishedSlugs.length) {
        const response = await fetch("/api/studio/articles/delete", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ slugs: publishedSlugs }),
        });
        deletionResult = await response.json().catch(() => ({}));
        if (!response.ok) {
          const configuredMessage = response.status === 401
            ? "写作台登录已过期，请刷新页面并重新登录。"
            : deletionResult.code === "github_not_configured"
              ? "尚未配置 GitHub 内容凭据，无法删除已发布文章。"
              : deletionResult.code === "github_conflict"
                ? "仓库刚刚发生变化，请重新选择后再试。"
                : "下线提交失败，请稍后重试。";
          throw new Error(configuredMessage);
        }
      }

      const deletedIds = new Set(draftIds);
      setState((current) => {
        const remaining = current.drafts.filter((item) => !deletedIds.has(item.id));
        const nextDrafts = remaining.length ? remaining : [createDraft(current.categories[0]?.id)];
        const activeId = deletedIds.has(current.activeId) ? nextDrafts[0].id : current.activeId;
        return { ...current, drafts: nextDrafts, activeId };
      });
      if (publishedSlugs.length) {
        setRemovedPublishedSlugs((current) => new Set([...current, ...publishedSlugs]));
      }
      if (storageReady && draftIds.length) {
        void persistOperation((async () => {
          await Promise.all(draftIds.map((draftId) => deleteStudioAssets(draftId)));
        })());
      }
      const deploymentMessage = !publishedSlugs.length
        ? ""
        : deletionResult.deployment?.triggered
          ? "，并已触发线上部署"
          : "；仓库提交已完成，但未触发部署，请手动运行 npm run deploy";
      const mediaWarning = deletionResult?.media?.failed ? "。R2 图片清理失败，可稍后重试" : "";
      setManagerStatus(`已删除 ${publishedSlugs.length} 篇已发布文章和 ${draftIds.length} 篇本地稿${deploymentMessage}${mediaWarning}。`);
      setSelectedArticleKeys(new Set());
    } catch (error) {
      setManagerStatus(error instanceof Error ? error.message : "删除失败，请稍后重试。");
    } finally {
      setIsDeletingArticles(false);
    }
  };

  const addCategory = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const id = categoryForm.id.trim().toLocaleLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "");
    const nameZh = categoryForm.nameZh.trim();
    const nameEn = categoryForm.nameEn.trim();
    if (!id || !nameZh || !nameEn) {
      setCategoryStatus("请填写分类标识、中英文名称。 ");
      return;
    }
    if (state.categories.some((category) => category.id === id)) {
      setCategoryStatus("这个分类标识已经存在，请换一个。 ");
      return;
    }
    const nextCategory: Category = {
      id,
      name: { zh: nameZh, en: nameEn },
      description: {
        zh: categoryForm.descriptionZh.trim() || `${nameZh}分类文章。`,
        en: categoryForm.descriptionEn.trim() || `${nameEn} stories.`,
      },
    };
    setState((current) => ({ ...current, categories: [...current.categories, nextCategory] }));
    setCategoryForm(emptyCategoryForm);
    setCategoryStatus(`已添加“${nameZh}”，可在上方选择。`);
  };

  const deleteCategory = (category: Category) => {
    const usage = categoryUsage.get(category.id);
    if ((usage?.published ?? 0) + (usage?.drafts ?? 0) > 0 || state.categories.length === 1) return;
    if (!window.confirm(`确定删除“${category.name.zh}”分类吗？`)) return;
    setState((current) => ({ ...current, categories: current.categories.filter((item) => item.id !== category.id) }));
    setCategoryStatus(`已删除“${category.name.zh}”。`);
    setManagerStatus(`已删除分类“${category.name.zh}”。`);
    if (editingCategoryId === category.id) {
      setEditingCategoryId("");
      setManagerCategoryForm(emptyCategoryForm);
    }
  };

  const editManagerCategory = (category: Category) => {
    setEditingCategoryId(category.id);
    setManagerCategoryForm({
      id: category.id,
      nameZh: category.name.zh,
      nameEn: category.name.en,
      descriptionZh: category.description.zh,
      descriptionEn: category.description.en,
    });
    setManagerStatus("");
  };

  const saveManagerCategory = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const id = managerCategoryForm.id.trim().toLocaleLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "");
    const nameZh = managerCategoryForm.nameZh.trim();
    const nameEn = managerCategoryForm.nameEn.trim();
    if (!id || !nameZh || !nameEn) {
      setManagerStatus("请填写分类标识、中英文名称。 ");
      return;
    }
    if (!editingCategoryId && state.categories.some((category) => category.id === id)) {
      setManagerStatus("这个分类标识已经存在，请换一个。 ");
      return;
    }
    const nextCategory: Category = {
      id: editingCategoryId || id,
      name: { zh: nameZh, en: nameEn },
      description: {
        zh: managerCategoryForm.descriptionZh.trim() || `${nameZh}分类文章。`,
        en: managerCategoryForm.descriptionEn.trim() || `${nameEn} stories.`,
      },
    };
    setState((current) => ({
      ...current,
      categories: editingCategoryId
        ? current.categories.map((category) => category.id === editingCategoryId ? nextCategory : category)
        : [...current.categories, nextCategory],
    }));
    setManagerStatus(editingCategoryId ? `已更新分类“${nameZh}”。` : `已创建分类“${nameZh}”。`);
    setEditingCategoryId("");
    setManagerCategoryForm(emptyCategoryForm);
  };

  const editSeries = (series: StudioSeries) => {
    setEditingSeriesId(series.id);
    setSeriesForm({ id: series.id, nameZh: series.name.zh, nameEn: series.name.en });
    setManagerStatus("");
  };

  const updateSeriesReferences = (current: StudioState, series: StudioSeries, nextName: LocalizedDraft | null) => {
    const now = new Date().toISOString();
    const matchingStories = stories.filter((story) => seriesNameMatches({ zh: story.series.zh ?? "", en: story.series.en ?? "" }, series));
    const nextDrafts = current.drafts.map((item) => seriesNameMatches(item.series, series)
      ? { ...item, series: nextName ? { ...nextName } : { zh: "", en: "" }, updatedAt: now }
      : item);
    const existingSlugs = new Set(nextDrafts.map((item) => item.slug));
    const imported = matchingStories
      .filter((story) => !existingSlugs.has(story.slug))
      .map((story) => ({
        ...createDraftFromStory(story),
        series: nextName ? { ...nextName } : { zh: "", en: "" },
        updatedAt: now,
      }));
    return [...imported, ...nextDrafts];
  };

  const saveSeries = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const id = seriesForm.id.trim().toLocaleLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "");
    const nameZh = seriesForm.nameZh.trim();
    const nameEn = seriesForm.nameEn.trim();
    if (!id || !nameZh || !nameEn) {
      setManagerStatus("请填写系列标识、中英文名称。 ");
      return;
    }
    if (!editingSeriesId && state.series.some((series) => series.id === id)) {
      setManagerStatus("这个系列标识已经存在，请换一个。 ");
      return;
    }
    const nextSeries: StudioSeries = { id: editingSeriesId || id, name: { zh: nameZh, en: nameEn } };
    const previousSeries = editingSeriesId ? state.series.find((series) => series.id === editingSeriesId) : undefined;
    const publishedCount = previousSeries ? seriesUsage.get(previousSeries.id)?.published ?? 0 : 0;
    setState((current) => {
      const drafts = previousSeries
        ? updateSeriesReferences(current, previousSeries, nextSeries.name)
        : current.drafts;
      return {
        ...current,
        drafts,
        series: editingSeriesId
          ? current.series.map((series) => series.id === editingSeriesId ? nextSeries : series)
          : [...current.series, nextSeries],
      };
    });
    setManagerStatus(editingSeriesId
      ? `已更新系列“${nameZh}”${publishedCount ? `，${publishedCount} 篇已发布文章已建立待更新稿` : ""}。`
      : `已创建系列“${nameZh}”。`);
    setEditingSeriesId("");
    setSeriesForm(emptySeriesForm);
  };

  const deleteSeries = (series: StudioSeries) => {
    const usage = seriesUsage.get(series.id) ?? { published: 0, drafts: 0 };
    const useCount = usage.published + usage.drafts;
    const message = useCount
      ? `“${series.name.zh}”正在被 ${useCount} 篇文章使用。删除后会从本地稿移除，并为已发布文章建立待更新稿，是否继续？`
      : `确定删除系列“${series.name.zh}”吗？`;
    if (!window.confirm(message)) return;
    setState((current) => {
      return {
        ...current,
        drafts: updateSeriesReferences(current, series, null),
        series: current.series.filter((item) => item.id !== series.id),
      };
    });
    setManagerStatus(`已删除系列“${series.name.zh}”${usage.published ? `，${usage.published} 篇已发布文章已建立待更新稿` : ""}。`);
    if (editingSeriesId === series.id) {
      setEditingSeriesId("");
      setSeriesForm(emptySeriesForm);
    }
  };

  return {
    categoryForm,
    setCategoryForm,
    categoryStatus,
    view,
    setView,
    managementSection,
    setManagementSection,
    articleFilter,
    setArticleFilter,
    articleQuery,
    setArticleQuery,
    articleCategory,
    setArticleCategory,
    selectedArticleKeys,
    moveCategory,
    setMoveCategory,
    managerStatus,
    setManagerStatus,
    managerCategoryQuery,
    setManagerCategoryQuery,
    managerCategoryForm,
    setManagerCategoryForm,
    editingCategoryId,
    setEditingCategoryId,
    seriesQuery,
    setSeriesQuery,
    seriesForm,
    setSeriesForm,
    editingSeriesId,
    setEditingSeriesId,
    categoryUsage,
    managedArticles,
    visibleManagedArticles,
    selectedManagedArticles,
    publishedStoryCount: visibleStories.length,
    isDeletingArticles,
    activeMoveCategory,
    articleCounts,
    seriesUsage,
    visibleCategories,
    visibleSeries,
    managerHeading,
    managerItemCount,
    addDraft,
    openDraft,
    editPublishedStory,
    toggleArticleSelection,
    allVisibleSelected,
    toggleVisibleArticles,
    moveSelectedArticles,
    deleteSelectedArticles,
    addCategory,
    deleteCategory,
    editManagerCategory,
    saveManagerCategory,
    editSeries,
    saveSeries,
    deleteSeries,
  };
}
