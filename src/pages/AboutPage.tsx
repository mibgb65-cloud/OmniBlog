import { ArrowRight, BookOpen, Compass, Layers3, PenLine } from "lucide-react";
import { Link } from "react-router-dom";
import { Seo } from "../components/Seo";

const principles = [
  {
    icon: Compass,
    index: "01",
    title: "先观察，再表达",
    copy: "从真实经验和具体问题出发，让文字保留思考发生过的痕迹。",
  },
  {
    icon: Layers3,
    index: "02",
    title: "把复杂整理清楚",
    copy: "技术、生活与创造彼此连接，也值得被拆开、理解，再重新放在一起。",
  },
  {
    icon: BookOpen,
    index: "03",
    title: "为长期阅读而写",
    copy: "不追逐即时热度，更在意一篇文章过一段时间后是否仍然值得打开。",
  },
];

export function AboutPage() {
  return (
    <section className="about-page section">
      <Seo
        title="关于 OmniBlog — 一份持续生长的独立刊物"
        description="了解 OmniBlog 的写作方向、编辑原则，以及这份独立刊物为什么存在。"
        path="/about"
      />

      <header className="about-hero">
        <div className="about-hero-copy">
          <span className="section-index">ABOUT / OMNIBLOG</span>
          <h1>给独立思考，<br />留一块安静的地方。</h1>
          <p>
            OmniBlog 是一份由站长独立维护的个人刊物，记录技术、生活与创造中
            值得被认真整理的经验。这里没有匆忙的信息流，只有可以慢慢读完的文字。
          </p>
          <div className="about-actions">
            <Link className="button button-primary" to="/articles">
              开始阅读
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
            <a className="button button-secondary" href="/rss.xml">
              <BookOpen size={17} aria-hidden="true" />
              订阅 RSS
            </a>
          </div>
        </div>
        <div className="about-folio" aria-hidden="true">
          <span>INDEPENDENT JOURNAL</span>
          <strong>O</strong>
          <div>
            <span>READ</span>
            <span>THINK</span>
            <span>KEEP</span>
          </div>
        </div>
      </header>

      <section className="about-statement" aria-labelledby="about-statement-title">
        <span className="section-index">WHY THIS EXISTS</span>
        <div>
          <h2 id="about-statement-title">写作不是增加声音，而是留下坐标。</h2>
          <p>
            很多想法在快速浏览中出现，也在下一次刷新里消失。OmniBlog 想做的事情很简单：
            把值得留下的部分重新看一遍、写清楚，并让它们可以被再次找到。
          </p>
        </div>
      </section>

      <section className="about-principles" aria-labelledby="about-principles-title">
        <header>
          <span className="section-index">EDITORIAL PRINCIPLES</span>
          <h2 id="about-principles-title">这份刊物如何写作</h2>
        </header>
        <div className="about-principle-grid">
          {principles.map((principle) => {
            const Icon = principle.icon;
            return (
              <article key={principle.index}>
                <div>
                  <span>{principle.index}</span>
                  <Icon size={20} aria-hidden="true" />
                </div>
                <h3>{principle.title}</h3>
                <p>{principle.copy}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="about-continue" aria-labelledby="about-continue-title">
        <PenLine size={24} aria-hidden="true" />
        <div>
          <span className="section-index">KEEP READING</span>
          <h2 id="about-continue-title">从任意一篇文章，继续认识这里。</h2>
        </div>
        <Link to="/articles" aria-label="浏览全部文章">
          <ArrowRight size={24} aria-hidden="true" />
        </Link>
      </section>
    </section>
  );
}
