import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Category, Post } from "../../shared/types";
import { Loading } from "../components/Loading";
import { PostCard } from "../components/PostCard";
import { api } from "../lib/api";

export function ArticlesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [posts, setPosts] = useState<Post[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api<Post[]>("/api/posts"),
      api<Category[]>("/api/categories"),
    ])
      .then(([nextPosts, nextCategories]) => {
        setPosts(nextPosts);
        setCategories(nextCategories);
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, []);

  const selectedCategory = searchParams.get("category") ?? "";
  const filteredPosts = selectedCategory
    ? posts.filter((post) => (post.category || "随笔") === selectedCategory)
    : posts;
  const visibleCategories = categories.filter(
    (category) => category.postCount > 0 || category.name === selectedCategory,
  );
  const showFeaturedPost = filteredPosts.length >= 3 && filteredPosts.length % 2 === 1;

  const chooseCategory = (category: string) => {
    setSearchParams(category ? { category } : {}, { replace: true });
  };

  return (
    <section className="articles-page section">
      <header className="articles-hero">
        <div>
          <span className="section-index">文章归档</span>
          <h1>所有写下的东西。</h1>
        </div>
        <p>从最近的想法开始，也可以按分类慢慢翻阅。</p>
      </header>

      <div className="articles-layout">
        <div className="articles-content">
          <header className="articles-toolbar">
            <div className="articles-toolbar-title">
              <h2>{selectedCategory || "全部文章"}</h2>
              <span>{filteredPosts.length} 篇</span>
            </div>
            <nav className="category-list" aria-label="按分类筛选文章">
              <button
                className={!selectedCategory ? "active" : ""}
                type="button"
                aria-pressed={!selectedCategory}
                onClick={() => chooseCategory("")}
              >
                <span>全部</span>
                <span>{posts.length}</span>
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
            {!loading && !error && posts.length === 0 && (
              <div className="empty-state">
                <span className="empty-number">00</span>
                <h3>这里还很安静</h3>
                <p>第一篇文章正在酝酿中，稍后再来看看。</p>
              </div>
            )}
            {!loading && posts.length > 0 && filteredPosts.length === 0 && (
              <div className="empty-state filter-empty">
                <h3>这个分类暂时没有文章</h3>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => chooseCategory("")}
                >
                  查看全部文章
                </button>
              </div>
            )}
            {filteredPosts.length > 0 && (
              <div
                className={`post-grid${filteredPosts.length === 1 ? " single-post-grid" : ""}`}
              >
                {filteredPosts.map((post, index) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    featured={showFeaturedPost && index === 0}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
