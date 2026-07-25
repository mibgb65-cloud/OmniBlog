import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { Post } from "../../shared/types";
import { formatDate, readingTime } from "../lib/format";

export function PostCard({ post, featured = false }: { post: Post; featured?: boolean }) {
  return (
    <article className={`post-card${featured ? " featured-card" : ""}`}>
      <Link
        className="post-card-link"
        to={`/posts/${post.slug}`}
        aria-label={`阅读《${post.title}》`}
      >
        <div className="post-card-top">
          <span className="post-category">{post.category || "随笔"}</span>
          <time dateTime={post.publishedAt ?? undefined}>{formatDate(post.publishedAt)}</time>
        </div>
        <div className="post-card-copy">
          <h2>{post.title}</h2>
          <p>{post.excerpt}</p>
        </div>
        <div className="post-card-bottom">
          <span>{post.authorName} · {readingTime(post.content)}</span>
          <span className="read-more">
            阅读全文
            <ArrowUpRight size={17} aria-hidden="true" />
          </span>
        </div>
      </Link>
    </article>
  );
}
