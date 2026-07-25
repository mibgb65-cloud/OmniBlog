import { ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Post } from "../../shared/types";
import { api } from "../lib/api";
import { formatDate } from "../lib/format";

export function HomePage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Post[]>("/api/posts")
      .then(setPosts)
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, []);

  const recentPosts = posts.slice(0, 3);

  return (
    <section className="home-landing section">
      <div className="home-intro">
        <div className="eyebrow">
          <span className="status-dot" aria-hidden="true" />
          为独立思考保留一片空间
        </div>
        <h1>把想法，写成时间的形状。</h1>
        <p className="home-intro-copy">
          一个克制、专注于文字的博客。没有喧嚣的信息流，
          只有值得慢下来阅读的经验、观察与故事。
        </p>
        <Link className="home-all-link" to="/articles">
          浏览全部文章
          <ArrowUpRight size={17} aria-hidden="true" />
        </Link>
      </div>

      <section className="home-recent" aria-labelledby="recent-heading">
        <header className="home-recent-header">
          <div>
            <span className="section-index">最新</span>
            <h2 id="recent-heading">最近写下</h2>
          </div>
          <span>{String(recentPosts.length).padStart(2, "0")} / 03</span>
        </header>

        {loading && (
          <div className="home-recent-status" role="status" aria-live="polite">
            <span className="loading-pulse" aria-hidden="true">
              <span /><span /><span />
            </span>
            正在取回文章
          </div>
        )}
        {error && (
          <div className="home-recent-status message-error" role="status" aria-live="polite">
            暂时无法取回文章
          </div>
        )}
        {!loading && !error && recentPosts.length === 0 && (
          <div className="home-recent-status">
            第一篇文章正在酝酿中。
          </div>
        )}
        {!loading && !error && recentPosts.length > 0 && (
          <div className="home-recent-list">
            {recentPosts.map((post, index) => (
              <Link
                className="home-recent-item"
                to={`/posts/${post.slug}`}
                state={{ post }}
                key={post.id}
              >
                <span className="home-recent-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="home-recent-copy">
                  <div className="home-recent-meta">
                    <span>{post.category || "随笔"}</span>
                    <time dateTime={post.publishedAt ?? undefined}>
                      {formatDate(post.publishedAt)}
                    </time>
                  </div>
                  <h3>{post.title}</h3>
                  <p>{post.excerpt}</p>
                </div>
                <ArrowUpRight className="home-recent-arrow" size={18} aria-hidden="true" />
              </Link>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
