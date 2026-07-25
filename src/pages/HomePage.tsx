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
          <span className="status-dot" />
          为独立思考保留一片空间
        </div>
        <h1>把想法，写成<br />时间的形状。</h1>
        <p className="hero-copy">
          一个克制、专注于文字的博客。没有喧嚣的信息流，
          只有值得慢下来阅读的经验、观察与故事。
        </p>
        <a className="scroll-hint" href="#latest">
          浏览最近文章
          <ArrowDown size={16} />
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
        {error && <div className="message message-error">{error}</div>}
        {!loading && !error && posts.length === 0 && (
          <div className="empty-state">
            <span className="empty-number">00</span>
            <h3>这里还很安静</h3>
            <p>注册并发布第一篇文章，让故事从这里开始。</p>
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

      <section className="section manifesto">
        <span className="section-index">02</span>
        <blockquote>
          “简洁不是删去一切，<br />
          而是只留下真正重要的部分。”
        </blockquote>
      </section>
    </>
  );
}

