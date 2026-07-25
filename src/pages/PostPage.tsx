import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import { Link, useParams } from "react-router-dom";
import remarkGfm from "remark-gfm";
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

  return (
    <article className="article section">
      <Link className="back-link" to="/">
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
        <Link to="/">继续浏览文章</Link>
      </footer>
    </article>
  );
}
