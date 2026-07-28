import { Link } from "react-router-dom";
import { Seo } from "../components/Seo";

export function NotFoundPage() {
  return (
    <section className="section not-found">
      <Seo
        title="页面不存在 — OmniBlog"
        description="这个地址不存在，或内容已经被移动。"
        path={window.location.pathname}
        noIndex
      />
      <span className="empty-number">404</span>
      <h1>走到了一页空白</h1>
      <p>这个地址不存在，或内容已经被移动。</p>
      <Link className="button button-secondary" to="/">返回首页</Link>
    </section>
  );
}
