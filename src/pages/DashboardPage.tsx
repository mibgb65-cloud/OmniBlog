import { Edit3, ExternalLink, FileText, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Post } from "../../shared/types";
import { Loading } from "../components/Loading";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDate } from "../lib/format";

export function DashboardPage() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    api<Post[]>("/api/me/posts")
      .then(setPosts)
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const remove = async (post: Post) => {
    if (!window.confirm(`确定删除《${post.title}》吗？此操作无法撤销。`)) return;
    try {
      await api<boolean>(`/api/me/posts/${post.id}`, { method: "DELETE" });
      setPosts((current) => current.filter((item) => item.id !== post.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "删除失败。");
    }
  };

  const published = posts.filter((post) => post.status === "published").length;

  return (
    <section className="dashboard section">
      <header className="dashboard-heading">
        <div>
          <span className="eyebrow">你的写作空间</span>
          <h1>你好，{user?.name}。</h1>
          <p>所有想法都值得先被记录，再决定是否公开。</p>
        </div>
        <Link className="button button-primary" to="/write">
          <Plus size={18} aria-hidden="true" />
          新建文章
        </Link>
      </header>

      <div className="stats">
        <div><strong>{posts.length}</strong><span>全部文章</span></div>
        <div><strong>{published}</strong><span>已发布</span></div>
        <div><strong>{posts.length - published}</strong><span>草稿</span></div>
      </div>

      <div className="dashboard-section-heading">
        <h2>文章</h2>
        <span>{posts.length} 篇</span>
      </div>

      {loading && <Loading label="正在整理你的文章" />}
      {error && (
        <div className="message message-error" role="status" aria-live="polite">
          {error}
        </div>
      )}
      {!loading && posts.length === 0 && (
        <div className="empty-state compact-empty">
          <FileText size={28} aria-hidden="true" />
          <h3>还没有文章</h3>
          <p>新建一篇草稿，从标题开始。</p>
          <Link className="button button-secondary" to="/write">开始写作</Link>
        </div>
      )}

      {posts.length > 0 && (
        <div className="post-table">
          {posts.map((post) => (
            <article className="post-row" key={post.id}>
              <div className="post-row-main">
                <span className={`status-badge ${post.status}`}>
                  {post.status === "published" ? "已发布" : "草稿"}
                </span>
                <h3>{post.title}</h3>
                <p>更新于 {formatDate(post.updatedAt)}</p>
              </div>
              <div className="row-actions">
                {post.status === "published" && (
                  <Link
                    className="icon-button"
                    to={`/posts/${post.slug}`}
                    aria-label={`查看《${post.title}》`}
                  >
                    <ExternalLink size={17} aria-hidden="true" />
                  </Link>
                )}
                <Link
                  className="icon-button"
                  to={`/write/${post.id}`}
                  aria-label={`编辑《${post.title}》`}
                >
                  <Edit3 size={17} aria-hidden="true" />
                </Link>
                <button
                  className="icon-button danger"
                  type="button"
                  onClick={() => remove(post)}
                  aria-label={`删除《${post.title}》`}
                >
                  <Trash2 size={17} aria-hidden="true" />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
