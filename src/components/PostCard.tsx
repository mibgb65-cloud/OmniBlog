import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { Post } from "../../shared/types";
import { formatDate, readingTime } from "../lib/format";

export function PostCard({ post, featured = false }: { post: Post; featured?: boolean }) {
  return (
    <article className={`post-card${featured ? " featured-card" : ""}`}>
      <div className="post-card-top">
        <span>{post.authorName}</span>
        <span>{formatDate(post.publishedAt)}</span>
      </div>
      <div>
        <h2>{post.title}</h2>
        <p>{post.excerpt}</p>
      </div>
      <div className="post-card-bottom">
        <span>{readingTime(post.content)}</span>
        <Link to={`/posts/${post.slug}`} aria-label={`阅读《${post.title}》`}>
          阅读全文
          <ArrowUpRight size={17} />
        </Link>
      </div>
    </article>
  );
}

