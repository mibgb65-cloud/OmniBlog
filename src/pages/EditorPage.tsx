import { ArrowLeft, Check, Send } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Post, PostStatus } from "../../shared/types";
import { Loading } from "../components/Loading";
import { api } from "../lib/api";

export function EditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(Boolean(id));
  const [submitting, setSubmitting] = useState<PostStatus | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    api<Post>(`/api/me/posts/${id}`)
      .then((post) => {
        setTitle(post.title);
        setContent(post.content);
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, [id]);

  const save = async (status: PostStatus) => {
    setSubmitting(status);
    setError("");
    try {
      const post = await api<Post>(id ? `/api/me/posts/${id}` : "/api/me/posts", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify({ title, content, status }),
      });
      navigate(status === "published" ? `/posts/${post.slug}` : "/dashboard");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败，请稍后再试。");
    } finally {
      setSubmitting(null);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void save("published");
  };

  if (loading) return <Loading label="正在打开草稿" />;

  return (
    <section className="editor section">
      <div className="editor-top">
        <Link className="back-link" to="/dashboard">
          <ArrowLeft size={17} />
          返回文章列表
        </Link>
        <span>{id ? "编辑文章" : "新文章"}</span>
      </div>

      <form onSubmit={submit}>
        <label className="editor-title" htmlFor="title">
          <span className="sr-only">文章标题</span>
          <textarea
            id="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="文章标题"
            rows={2}
            minLength={2}
            maxLength={100}
            required
          />
        </label>

        <div className="editor-divider">
          <span>{content.replace(/\s/g, "").length} 字</span>
        </div>

        <label className="editor-content" htmlFor="content">
          <span className="sr-only">文章正文</span>
          <textarea
            id="content"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder={"从这里开始写作。\n\n用空行分隔段落，让文字保持呼吸感。"}
            minLength={10}
            maxLength={50_000}
            required
          />
        </label>

        {error && <div className="message message-error">{error}</div>}
        <div className="editor-actions">
          <p>草稿仅自己可见，发布后会出现在首页。</p>
          <div>
            <button
              className="button button-secondary"
              type="button"
              disabled={Boolean(submitting)}
              onClick={() => void save("draft")}
            >
              <Check size={17} />
              {submitting === "draft" ? "保存中…" : "存为草稿"}
            </button>
            <button className="button button-primary" type="submit" disabled={Boolean(submitting)}>
              <Send size={17} />
              {submitting === "published" ? "发布中…" : "发布文章"}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}

