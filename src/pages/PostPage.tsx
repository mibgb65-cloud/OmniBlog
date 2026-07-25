import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Post } from "../../shared/types";
import { Loading } from "../components/Loading";
import { api } from "../lib/api";
import { formatDate, readingTime } from "../lib/format";

export function PostPage() {
  const { slug } = useParams();
  const [post, setPost] = useState<Post | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!slug) return;
    api<Post>(`/api/posts/${encodeURIComponent(slug)}`)
      .then(setPost)
      .catch((reason: Error) => setError(reason.message));
  }, [slug]);

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
  if (!post) return <Loading label="正在打开文章" />;

  const paragraphs = post.content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const excerpt = post.excerpt.trim();
  const comparableExcerpt = excerpt.replace(/[.…]+$/, "");
  const showExcerpt = Boolean(
    comparableExcerpt && !paragraphs[0]?.startsWith(comparableExcerpt),
  );

  return (
    <article className="article section">
      <Link className="back-link" to="/">
        <ArrowLeft size={17} aria-hidden="true" />
        返回所有文章
      </Link>
      <header className="article-header">
        <div className="article-meta">
          <span>{post.authorName}</span>
          <time dateTime={post.publishedAt ?? undefined}>{formatDate(post.publishedAt)}</time>
          <span>{readingTime(post.content)}</span>
        </div>
        <h1>{post.title}</h1>
        {showExcerpt && <p>{excerpt}</p>}
      </header>
      <div className="article-rule" />
      <div className="article-content">
        {paragraphs.map((paragraph, index) => (
          <p key={`${index}-${paragraph.slice(0, 12)}`}>{paragraph}</p>
        ))}
      </div>
      <footer className="article-end">
        <p>感谢你读到这里。</p>
        <Link to="/">继续浏览文章</Link>
      </footer>
    </article>
  );
}
