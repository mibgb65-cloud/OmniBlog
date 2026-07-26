import { ArrowLeft, Heart } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Markdown, { type Components } from "react-markdown";
import { Link, useLocation, useParams } from "react-router-dom";
import remarkGfm from "remark-gfm";
import type { Post } from "../../shared/types";
import { Loading } from "../components/Loading";
import { api } from "../lib/api";
import { formatDate, readingTime } from "../lib/format";
import { extractMarkdownHeadings } from "../lib/markdown";

type LikeResponse = {
  likeCount: number;
  liked: boolean;
};

export function PostPage() {
  const { slug } = useParams();
  const location = useLocation();
  const linkedPost = (location.state as { post?: Post } | null)?.post;
  const [post, setPost] = useState<Post | null>(
    linkedPost && linkedPost.slug === slug ? linkedPost : null,
  );
  const [error, setError] = useState("");
  const [showLoading, setShowLoading] = useState(false);
  const [likePending, setLikePending] = useState(false);
  const [likeMessage, setLikeMessage] = useState("");
  const headings = useMemo(
    () => post ? extractMarkdownHeadings(post.content) : [],
    [post?.content],
  );
  const [activeHeadingId, setActiveHeadingId] = useState("");

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    const hasPreview = linkedPost?.slug === slug;
    const loadingTimer = hasPreview
      ? undefined
      : window.setTimeout(() => setShowLoading(true), 180);

    setError("");
    api<Post>(`/api/posts/${encodeURIComponent(slug)}`)
      .then((nextPost) => {
        if (!cancelled) setPost(nextPost);
      })
      .catch((reason: Error) => {
        if (!cancelled) setError(reason.message);
      })
      .finally(() => {
        if (loadingTimer !== undefined) window.clearTimeout(loadingTimer);
        if (!cancelled) setShowLoading(false);
      });

    return () => {
      cancelled = true;
      if (loadingTimer !== undefined) window.clearTimeout(loadingTimer);
    };
  }, [linkedPost?.slug, slug]);

  useEffect(() => {
    if (headings.length === 0) {
      setActiveHeadingId("");
      return;
    }

    let frame = 0;
    const updateActiveHeading = () => {
      let currentId = headings[0].id;
      for (const heading of headings) {
        const element = document.getElementById(heading.id);
        if (element && element.getBoundingClientRect().top <= 150) {
          currentId = heading.id;
        } else {
          break;
        }
      }
      setActiveHeadingId(currentId);
      frame = 0;
    };
    const handleScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(updateActiveHeading);
    };

    updateActiveHeading();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [headings]);

  useEffect(() => {
    if (!location.hash || headings.length === 0) return;
    const frame = window.requestAnimationFrame(() => {
      let id = location.hash.slice(1);
      try {
        id = decodeURIComponent(id);
      } catch {
        return;
      }
      document.getElementById(id)?.scrollIntoView();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [headings, location.hash]);

  const toggleLike = async () => {
    if (!post || likePending || post.visibility === "private") return;
    setLikePending(true);
    setLikeMessage("");
    try {
      const next = await api<LikeResponse>(
        `/api/posts/${encodeURIComponent(post.slug)}/likes`,
        { method: post.likedByVisitor ? "DELETE" : "POST" },
      );
      setPost((current) => current && current.id === post.id
        ? { ...current, likeCount: next.likeCount, likedByVisitor: next.liked }
        : current);
      setLikeMessage(next.liked ? "已为这篇文章点赞。" : "已取消点赞。");
    } catch (reason) {
      setLikeMessage(reason instanceof Error ? reason.message : "操作失败，请稍后重试。");
    } finally {
      setLikePending(false);
    }
  };

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

  let headingIndex = 0;
  const markdownComponents: Components = {
    h2({ node: _node, children, ...properties }) {
      const heading = headings[headingIndex++];
      return <h2 {...properties} id={heading?.id}>{children}</h2>;
    },
    h3({ node: _node, children, ...properties }) {
      const heading = headings[headingIndex++];
      return <h3 {...properties} id={heading?.id}>{children}</h3>;
    },
    img({ node: _node, alt = "", ...properties }) {
      return <img {...properties} alt={alt} loading="lazy" decoding="async" />;
    },
  };
  const hasTableOfContents = headings.length > 0;
  const canLike = post.visibility !== "private";

  return (
    <article className="article section">
      <Link className="back-link" to="/articles">
        <ArrowLeft size={17} aria-hidden="true" />
        返回所有文章
      </Link>
      <header className="article-header">
        <div className="article-meta">
          <span>{post.category || "随笔"}</span>
          {post.visibility !== "public" && (
            <span>{post.visibility === "unlisted" ? "仅链接可见" : "私密文章"}</span>
          )}
          <span>{post.authorName}</span>
          <time dateTime={post.publishedAt ?? undefined}>{formatDate(post.publishedAt)}</time>
          <span>{readingTime(post.content)}</span>
        </div>
        <h1>{post.title}</h1>
      </header>

      <div className={`article-reading-grid${hasTableOfContents ? "" : " without-toc"}${canLike ? "" : " without-actions"}`}>
        {canLike && (
          <aside className="article-actions" aria-label="文章互动">
            <div className="article-actions-sticky">
              <button
                className={`article-like${post.likedByVisitor ? " liked" : ""}`}
                type="button"
                onClick={() => void toggleLike()}
                disabled={likePending}
                aria-pressed={Boolean(post.likedByVisitor)}
                aria-label={post.likedByVisitor ? "取消点赞" : "为文章点赞"}
              >
                <span className="article-like-icon" aria-hidden="true">
                  <Heart size={19} fill={post.likedByVisitor ? "currentColor" : "none"} />
                </span>
                <strong>{post.likeCount}</strong>
                <span>{post.likedByVisitor ? "已赞" : "点赞"}</span>
              </button>
              <span className="sr-only" role="status" aria-live="polite">{likeMessage}</span>
            </div>
          </aside>
        )}

        <div className="article-body">
          <div className="article-content">
            <Markdown components={markdownComponents} remarkPlugins={[remarkGfm]} skipHtml>
              {post.content}
            </Markdown>
          </div>
          <footer className="article-end">
            <p>{post.likeCount > 0 ? `${post.likeCount} 人喜欢这篇文章。` : "感谢你读到这里。"}</p>
            <Link to="/articles">继续浏览文章</Link>
          </footer>
        </div>

        {hasTableOfContents && (
          <nav className="article-toc" aria-label="本文目录">
            <div className="article-toc-sticky">
              <p>本文目录</p>
              <ol>
                {headings.map((heading, index) => (
                  <li className={`level-${heading.level}`} key={heading.id}>
                    <a
                      className={activeHeadingId === heading.id ? "active" : undefined}
                      href={`#${heading.id}`}
                      onClick={() => setActiveHeadingId(heading.id)}
                      aria-current={activeHeadingId === heading.id ? "location" : undefined}
                    >
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      {heading.text}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </nav>
        )}
      </div>
    </article>
  );
}
