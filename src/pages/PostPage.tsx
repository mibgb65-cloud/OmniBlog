import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import { Link, useLocation, useParams } from "react-router-dom";
import remarkGfm from "remark-gfm";
import type { Post } from "../../shared/types";
import { Loading } from "../components/Loading";
import { api } from "../lib/api";
import { formatDate, readingTime } from "../lib/format";

export function PostPage() {
  const { slug } = useParams();
  const location = useLocation();
  const linkedPost = (location.state as { post?: Post } | null)?.post;
  const [post, setPost] = useState<Post | null>(
    linkedPost && linkedPost.slug === slug ? linkedPost : null,
  );
  const [error, setError] = useState("");
  const [showLoading, setShowLoading] = useState(false);

  useEffect(() => {
    if (!slug || post?.slug === slug) return;
    let cancelled = false;
    const loadingTimer = window.setTimeout(() => setShowLoading(true), 180);

    api<Post>(`/api/posts/${encodeURIComponent(slug)}`)
      .then((nextPost) => {
        if (!cancelled) setPost(nextPost);
      })
      .catch((reason: Error) => {
        if (!cancelled) setError(reason.message);
      })
      .finally(() => {
        window.clearTimeout(loadingTimer);
        if (!cancelled) setShowLoading(false);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(loadingTimer);
    };
  }, [post?.slug, slug]);

  if (error) {
    return (
      <section className="section not-found">
        <span className="empty-number">404</span>
        <h1>没有找到这篇文章</h1>
        <p>{error}</p>
        <Link className="button button-secondary" to="/">返回首页</Link>
      </section>
    );
  }
  if (!post) {
    return (
      <div className="article-loading-shell">
        {showLoading && <Loading label="正在打开文章" />}
      </div>
    );
  }

  return (
    <article className="article section">
      <Link className="back-link" to="/articles">
        <ArrowLeft size={17} aria-hidden="true" />
        返回所有文章
      </Link>
      <header className="article-header">
        <div className="article-meta">
          <span>{post.category || "随笔"}</span>
          <span>{post.authorName}</span>
          <time dateTime={post.publishedAt ?? undefined}>{formatDate(post.publishedAt)}</time>
          <span>{readingTime(post.content)}</span>
        </div>
        <h1>{post.title}</h1>
      </header>
      <div className="article-rule" />
      <div className="article-content">
        <Markdown remarkPlugins={[remarkGfm]} skipHtml>{post.content}</Markdown>
      </div>
      <footer className="article-end">
        <p>感谢你读到这里。</p>
        <Link to="/articles">继续浏览文章</Link>
      </footer>
    </article>
  );
}
