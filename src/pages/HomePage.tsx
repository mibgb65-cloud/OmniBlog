import { ArrowDown, ArrowRight, ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Category, PaginatedPosts, PostSummary } from "../../shared/types";
import { Seo } from "../components/Seo";
import { api } from "../lib/api";
import { formatDate, formatReadingMinutes } from "../lib/format";

const writingPrinciples = [
  {
    index: "01",
    title: "观察",
    copy: "从日常的细节开始，记录那些容易被速度略过的瞬间。",
  },
  {
    index: "02",
    title: "思考",
    copy: "不急着给出答案，让问题在文字里多停留一会儿。",
  },
  {
    index: "03",
    title: "连接",
    copy: "把私人经验写成可以被理解、被回应的公共语言。",
  },
];

export function HomePage() {
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [totalPosts, setTotalPosts] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api<PaginatedPosts>("/api/posts?pageSize=5"),
      api<Category[]>("/api/categories"),
    ])
      .then(([postPage, nextCategories]) => {
        setPosts(postPage.items);
        setTotalPosts(postPage.total);
        setCategories(nextCategories);
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, []);

  const featuredPost = posts[0];
  const recentPosts = posts.slice(1, 5);
  const activeCategories = categories.filter((category) => category.postCount > 0);
  const topics = activeCategories
    .slice(0, 5)
    .map((category) => [category.name, category.postCount] as const);

  return (
    <div className="home-page">
      <Seo
        title="OmniBlog — 写下值得留下的想法"
        description="一份关于技术、生活与创造的独立写作，记录值得慢下来读完的经验、观察与故事。"
        path="/"
      />
      <section className="home-hero section" aria-labelledby="home-title">
        <div className="home-hero-topline" aria-hidden="true">
          <span>INDEPENDENT JOURNAL / VOL. 01</span>
          <span>WRITING FROM THE QUIET WEB</span>
        </div>

        <div className="home-hero-grid">
          <div className="home-hero-copy">
            <div className="eyebrow">
              <span className="status-dot" aria-hidden="true" />
              为独立思考保留一片空间
            </div>
            <h1 id="home-title">
              <span>把想法，</span>
              <span>写成<span className="home-title-serif">时间</span></span>
              <span>的形状。</span>
            </h1>
            <p>
              一份关于技术、生活与创造的独立写作。这里没有匆忙的信息流，
              只有经过整理的经验、观察，以及值得慢下来读完的故事。
            </p>
            <div className="home-hero-actions">
              <Link className="button button-primary home-primary-action" to="/articles">
                开始阅读
                <ArrowUpRight size={17} aria-hidden="true" />
              </Link>
              <a className="home-text-action" href="#recent">
                看看最近写了什么
                <ArrowDown size={15} aria-hidden="true" />
              </a>
            </div>
          </div>

          <div className="home-hero-visual" aria-hidden="true">
            <div className="home-orbit">
              <span className="home-orbit-ring home-orbit-ring-outer" />
              <span className="home-orbit-ring home-orbit-ring-middle" />
              <span className="home-orbit-ring home-orbit-ring-inner" />
              <span className="home-orbit-dot" />
              <strong>O</strong>
            </div>
            <div className="home-orbit-caption">
              <span>OMNIBLOG / 001</span>
              <span>IDEAS IN MOTION</span>
            </div>
          </div>
        </div>

        <div className="home-hero-footer">
          <p>
            写作不是为了追赶声音，<br />
            而是为了留下自己的坐标。
          </p>
          <dl className="home-hero-stats">
            <div>
              <dt>{loading ? "—" : String(totalPosts).padStart(2, "0")}</dt>
              <dd>已发布文章</dd>
            </div>
            <div>
              <dt>{loading ? "—" : String(activeCategories.length).padStart(2, "0")}</dt>
              <dd>持续话题</dd>
            </div>
            <div>
              <dt>慢</dt>
              <dd>阅读节奏</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="home-feature section" aria-labelledby="feature-heading">
        <header className="home-section-heading">
          <div>
            <span className="section-index">01 / FEATURED</span>
            <h2 id="feature-heading">本期推荐</h2>
          </div>
          <p>从一篇文章开始，进入最近的思考现场。</p>
        </header>

        {loading && (
          <div className="home-feature-status" role="status" aria-live="polite">
            <span className="loading-pulse" aria-hidden="true">
              <span /><span /><span />
            </span>
            正在取回文章
          </div>
        )}
        {!loading && error && (
          <div className="home-feature-status message-error" role="status" aria-live="polite">
            暂时无法取回文章，稍后再来看看。
          </div>
        )}
        {!loading && !error && !featuredPost && (
          <div className="home-feature-empty">
            <span>BLANK PAGE / 001</span>
            <h3>第一篇文章，正在成为它自己。</h3>
            <p>这里会留给下一次真正值得写下的时刻。</p>
          </div>
        )}
        {featuredPost && (
          <article className="home-feature-card">
            <Link to={`/posts/${featuredPost.slug}`}>
              <div className="home-feature-copy">
                <div className="home-feature-meta">
                  <span>{featuredPost.category || "随笔"}</span>
                  <time dateTime={featuredPost.publishedAt ?? undefined}>
                    {formatDate(featuredPost.publishedAt)}
                  </time>
                </div>
                <h3>{featuredPost.title}</h3>
                <p>{featuredPost.excerpt}</p>
                <div className="home-feature-byline">
                  <span>{featuredPost.authorName} · {formatReadingMinutes(featuredPost.readingMinutes)}</span>
                  <span>
                    阅读文章
                    <ArrowUpRight size={17} aria-hidden="true" />
                  </span>
                </div>
              </div>
              <div className="home-feature-art" aria-hidden="true">
                <span className="home-feature-art-label">SELECTED READING</span>
                <strong>01</strong>
                <span className="home-feature-art-axis">READ / THINK / KEEP</span>
                <i />
              </div>
            </Link>
          </article>
        )}
      </section>

      <section className="home-latest section" id="recent" aria-labelledby="latest-heading">
        <header className="home-section-heading home-latest-heading">
          <div>
            <span className="section-index">02 / LATEST</span>
            <h2 id="latest-heading">最近写下</h2>
          </div>
          <Link to="/articles">
            查看全部
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </header>

        {!loading && !error && recentPosts.length > 0 && (
          <div className="home-latest-list">
            {recentPosts.map((post, index) => (
              <article className="home-latest-item" key={post.id}>
                <Link to={`/posts/${post.slug}`}>
                  <span className="home-latest-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="home-latest-copy">
                    <div>
                      <span>{post.category || "随笔"}</span>
                      <time dateTime={post.publishedAt ?? undefined}>
                        {formatDate(post.publishedAt)}
                      </time>
                    </div>
                    <h3>{post.title}</h3>
                    <p>{post.excerpt}</p>
                  </div>
                  <div className="home-latest-end">
                    <span>{formatReadingMinutes(post.readingMinutes)}</span>
                    <ArrowUpRight size={19} aria-hidden="true" />
                  </div>
                </Link>
              </article>
            ))}
          </div>
        )}
        {!loading && !error && recentPosts.length === 0 && (
          <div className="home-latest-empty">更多内容会从这里慢慢长出来。</div>
        )}
      </section>

      <section className="home-manifesto" aria-labelledby="manifesto-heading">
        <div className="home-manifesto-inner section">
          <div className="home-manifesto-lead">
            <span className="section-index">03 / WHY WRITE</span>
            <h2 id="manifesto-heading">
              不追逐热闹，
              <br />
              只整理那些会反复想起的事。
            </h2>
            <p>
              OmniBlog 是一份持续生长的个人刊物。文字在这里不是即时反应，
              而是一次重新看见、重新理解的过程。
            </p>
            <Link className="home-manifesto-link" to="/about">
              关于这份刊物
              <ArrowUpRight size={17} aria-hidden="true" />
            </Link>
          </div>
          <div className="home-principles">
            {writingPrinciples.map((principle) => (
              <article key={principle.index}>
                <span>{principle.index}</span>
                <h3>{principle.title}</h3>
                <p>{principle.copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="home-archive section" aria-labelledby="archive-heading">
        <div className="home-archive-copy">
          <span className="section-index">CONTINUE EXPLORING</span>
          <h2 id="archive-heading">从任意一个话题，继续往下读。</h2>
          <p>文章会被认真归档，也允许偶然相遇。</p>
        </div>
        <div className="home-topic-list" aria-label="文章话题">
          {topics.length > 0 ? topics.map(([topic, count]) => (
            <Link to={`/articles?category=${encodeURIComponent(topic)}`} key={topic}>
              <span>{topic}</span>
              <small>{String(count).padStart(2, "0")}</small>
            </Link>
          )) : (
            <>
              <span>技术与创造</span>
              <span>生活观察</span>
              <span>思考札记</span>
            </>
          )}
        </div>
        <Link className="home-archive-link" to="/articles" aria-label="进入文章归档">
          <ArrowRight size={28} aria-hidden="true" />
        </Link>
      </section>
    </div>
  );
}
