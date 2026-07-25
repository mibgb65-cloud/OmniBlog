import { ArrowDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Post } from "../../shared/types";
import { Loading } from "../components/Loading";
import { PostCard } from "../components/PostCard";
import { api } from "../lib/api";

export function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Post[]>("/api/posts")
      .then(setPosts)
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, []);

  const selectedCategory = searchParams.get("category") ?? "";
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const post of posts) {
      const category = post.category || "随笔";
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
    return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right, "zh-CN"));
  }, [posts]);
  const filteredPosts = selectedCategory
    ? posts.filter((post) => (post.category || "随笔") === selectedCategory)
    : posts;

  const chooseCategory = (category: string) => {
    setSearchParams(category ? { category } : {}, { replace: true });
  };

  return (
    <div className="home-layout section">
      <aside className="category-sidebar">
        <div className="category-heading">
          <span>分类</span>
          <span>{posts.length} 篇</span>
        </div>
        <nav className="category-list" aria-label="按分类筛选文章">
          <button
            className={!selectedCategory ? "active" : ""}
            type="button"
            aria-pressed={!selectedCategory}
            onClick={() => chooseCategory("")}
          >
            <span>全部文章</span>
            <span>{posts.length}</span>
          </button>
          {categories.map(([category, count]) => (
            <button
              className={selectedCategory === category ? "active" : ""}
              type="button"
              aria-pressed={selectedCategory === category}
              onClick={() => chooseCategory(category)}
              key={category}
            >
              <span>{category}</span>
              <span>{count}</span>
            </button>
          ))}
        </nav>
      </aside>

      <div className="home-content">
        <section className="hero">
          <div className="eyebrow">
            <span className="status-dot" aria-hidden="true" />
            为独立思考保留一片空间
          </div>
          <h1>把想法，写成时间的形状。</h1>
          <p className="hero-copy">
            一个克制、专注于文字的博客。没有喧嚣的信息流，
            只有值得慢下来阅读的经验、观察与故事。
          </p>
          <a className="scroll-hint" href="#latest">
            浏览最近文章
            <ArrowDown size={16} aria-hidden="true" />
          </a>
        </section>

        <section className="posts-section" id="latest">
          <div className="section-heading">
            <div>
              <span className="section-index">01</span>
              <h2>最近写下</h2>
            </div>
            <p>新鲜的思考，按时间倒序。</p>
          </div>

          <div className="posts-feed">
            {loading && <Loading label="正在取回文章" />}
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
              <div className="post-grid">
                {filteredPosts.map((post, index) => (
                  <PostCard key={post.id} post={post} featured={index === 0} />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
