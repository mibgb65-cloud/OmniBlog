import { ArrowDown } from "lucide-react";
import { useEffect, useState } from "react";
import type { Post } from "../../shared/types";
import { Loading } from "../components/Loading";
import { PostCard } from "../components/PostCard";
import { api } from "../lib/api";

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

  return (
    <>
      <section className="hero section">
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

      <section className="section posts-section" id="latest">
        <div className="section-heading">
          <div>
            <span className="section-index">01</span>
            <h2>最近写下</h2>
          </div>
          <p>新鲜的思考，按时间倒序。</p>
        </div>

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
        {posts.length > 0 && (
          <div className="post-grid">
            {posts.map((post, index) => (
              <PostCard key={post.id} post={post} featured={index === 0} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
