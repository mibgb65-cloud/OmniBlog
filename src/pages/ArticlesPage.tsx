import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import type { Category, PaginatedPosts } from "../../shared/types";
import { Loading } from "../components/Loading";
import { PostCard } from "../components/PostCard";
import { Seo } from "../components/Seo";
import { api } from "../lib/api";

const emptyPage: PaginatedPosts = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 12,
  totalPages: 1,
};

export function ArticlesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [postPage, setPostPage] = useState<PaginatedPosts>(emptyPage);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const selectedCategory = searchParams.get("category") ?? "";
  const query = searchParams.get("q") ?? "";
  const requestedSort = searchParams.get("sort") ?? "newest";
  const sort = ["newest", "oldest", "popular"].includes(requestedSort)
    ? requestedSort
    : "newest";
  const parsedPage = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const currentPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const [draftQuery, setDraftQuery] = useState(query);

  useEffect(() => {
    setDraftQuery(query);
  }, [query]);

  useEffect(() => {
    api<Category[]>("/api/categories")
      .then(setCategories)
      .catch((reason: Error) => setError(reason.message));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      page: String(currentPage),
      pageSize: "12",
      sort,
    });
    if (selectedCategory) params.set("category", selectedCategory);
    if (query) params.set("q", query);

    setLoading(true);
    setError("");
    api<PaginatedPosts>(`/api/posts?${params}`, { signal: controller.signal })
      .then((nextPage) => {
        if (currentPage > nextPage.totalPages) {
          const nextParams = new URLSearchParams(searchParams);
          if (nextPage.totalPages > 1) nextParams.set("page", String(nextPage.totalPages));
          else nextParams.delete("page");
          setSearchParams(nextParams, { replace: true });
          return;
        }
        setPostPage(nextPage);
      })
      .catch((reason: Error) => {
        if (reason.name !== "AbortError") setError(reason.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [currentPage, query, searchParams, selectedCategory, setSearchParams, sort]);

  const updateFilters = (changes: Record<string, string>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setSearchParams(next, { replace: true });
  };

  const chooseCategory = (category: string) => {
    updateFilters({ category, page: "" });
  };

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    updateFilters({ q: draftQuery.trim(), page: "" });
  };

  const visibleCategories = categories.filter(
    (category) => category.postCount > 0 || category.name === selectedCategory,
  );
  const showFeaturedPost = !query && postPage.items.length >= 3 && postPage.items.length % 2 === 1;
  const heading = query ? `“${query}”的搜索结果` : selectedCategory || "全部文章";

  return (
    <section className="articles-page section">
      <Seo
        title={`${heading} — OmniBlog`}
        description="浏览 OmniBlog 的全部文章，按分类、关键词和时间寻找值得继续阅读的内容。"
        path="/articles"
      />
      <header className="articles-hero">
        <div>
          <span className="section-index">文章归档</span>
          <h1>所有写下的东西。</h1>
        </div>
        <p>从最近的想法开始，也可以按分类或关键词慢慢翻阅。</p>
      </header>

      <div className="articles-layout">
        <div className="articles-content">
          <div className="articles-controls">
            <form className="archive-search" role="search" onSubmit={submitSearch}>
              <label className="sr-only" htmlFor="article-search">搜索文章</label>
              <span className="archive-search-field">
                <Search size={18} aria-hidden="true" />
                <input
                  id="article-search"
                  name="q"
                  type="search"
                  value={draftQuery}
                  onChange={(event) => setDraftQuery(event.target.value)}
                  autoComplete="off"
                  placeholder="搜索标题、摘要或正文…"
                  maxLength={100}
                />
              </span>
              <button className="button button-secondary" type="submit">搜索</button>
            </form>
            <label className="archive-sort" htmlFor="article-sort">
              <span>排序</span>
              <select
                id="article-sort"
                value={sort}
                onChange={(event) => updateFilters({ sort: event.target.value, page: "" })}
              >
                <option value="newest">最新发布</option>
                <option value="oldest">最早发布</option>
                <option value="popular">最多点赞</option>
              </select>
            </label>
          </div>

          <header className="articles-toolbar">
            <div className="articles-toolbar-title">
              <h2>{heading}</h2>
              <span>{postPage.total} 篇</span>
            </div>
            <nav className="category-list" aria-label="按分类筛选文章">
              <button
                className={!selectedCategory ? "active" : ""}
                type="button"
                aria-pressed={!selectedCategory}
                onClick={() => chooseCategory("")}
              >
                <span>全部</span>
                <span>{categories.reduce((total, category) => total + category.postCount, 0)}</span>
              </button>
              {visibleCategories.map((category) => (
                <button
                  className={selectedCategory === category.name ? "active" : ""}
                  type="button"
                  aria-pressed={selectedCategory === category.name}
                  onClick={() => chooseCategory(category.name)}
                  key={category.id}
                >
                  <span>{category.name}</span>
                  <span>{category.postCount}</span>
                </button>
              ))}
            </nav>
          </header>

          <div className="posts-feed">
            {loading && <Loading label="正在取回文章…" />}
            {error && (
              <div className="message message-error" role="status" aria-live="polite">
                {error}
              </div>
            )}
            {!loading && !error && postPage.items.length === 0 && (
              <div className="empty-state filter-empty">
                <span className="empty-number">00</span>
                <h3>{query || selectedCategory ? "没有找到匹配的文章" : "这里还很安静"}</h3>
                <p>
                  {query || selectedCategory
                    ? "试试更短的关键词，或者清除筛选后继续浏览。"
                    : "第一篇文章正在酝酿中，稍后再来看看。"}
                </p>
                {(query || selectedCategory) && (
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => updateFilters({ q: "", category: "", page: "" })}
                  >
                    清除筛选
                  </button>
                )}
              </div>
            )}
            {!loading && !error && postPage.items.length > 0 && (
              <div className={`post-grid${postPage.items.length === 1 ? " single-post-grid" : ""}`}>
                {postPage.items.map((post, index) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    featured={showFeaturedPost && index === 0}
                  />
                ))}
              </div>
            )}
          </div>

          {!loading && !error && postPage.totalPages > 1 && (
            <nav className="archive-pagination" aria-label="文章分页">
              <button
                className="button button-secondary"
                type="button"
                disabled={currentPage <= 1}
                onClick={() => updateFilters({
                  page: currentPage - 1 > 1 ? String(currentPage - 1) : "",
                })}
              >
                <ChevronLeft size={17} aria-hidden="true" />
                上一页
              </button>
              <span>第 {postPage.page} / {postPage.totalPages} 页</span>
              <button
                className="button button-secondary"
                type="button"
                disabled={currentPage >= postPage.totalPages}
                onClick={() => updateFilters({ page: String(currentPage + 1) })}
              >
                下一页
                <ChevronRight size={17} aria-hidden="true" />
              </button>
            </nav>
          )}
        </div>
      </div>
    </section>
  );
}
