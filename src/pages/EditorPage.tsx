import { ArrowLeft, Check, FileUp, Send } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Category, Post, PostStatus } from "../../shared/types";
import { Loading } from "../components/Loading";
import { api } from "../lib/api";
import { parseMarkdownImport } from "../lib/markdown";

export function EditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("随笔");
  const [categories, setCategories] = useState<Category[]>([]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<PostStatus | null>(null);
  const [error, setError] = useState("");
  const [savedDraft, setSavedDraft] = useState({ title: "", category: "随笔", content: "" });
  const hasUnsavedChanges =
    title !== savedDraft.title ||
    category !== savedDraft.category ||
    content !== savedDraft.content;

  useEffect(() => {
    const postRequest = id
      ? api<Post>(`/api/me/posts/${id}`)
      : Promise.resolve<Post | null>(null);

    Promise.all([api<Category[]>("/api/categories"), postRequest])
      .then(([nextCategories, post]) => {
        setCategories(nextCategories);
        if (!post) {
          const initialCategory =
            nextCategories.find((item) => item.name === "随笔")?.name
            ?? nextCategories[0]?.name
            ?? "";
          setCategory(initialCategory);
          setSavedDraft({ title: "", category: initialCategory, content: "" });
          return;
        }
        const postCategory = post.category || "随笔";
        setTitle(post.title);
        setCategory(postCategory);
        setContent(post.content);
        setSavedDraft({ title: post.title, category: postCategory, content: post.content });
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [hasUnsavedChanges]);

  const importMarkdown = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!/\.(?:md|markdown)$/i.test(file.name)) {
      setError("请选择 .md 或 .markdown 文件。");
      return;
    }

    try {
      const imported = parseMarkdownImport(file.name, await file.text());
      if (
        imported.title.length > 100 ||
        (imported.category?.length ?? 0) > 24 ||
        imported.content.length > 50_000
      ) {
        setError("Markdown 文件的标题、分类或正文超过长度限制。");
        return;
      }
      const importedCategory = imported.category
        ? categories.find(
          (item) => item.name.localeCompare(imported.category!, "zh-CN", {
            sensitivity: "accent",
          }) === 0,
        )
        : null;
      if (imported.category && !importedCategory) {
        setError(`分类“${imported.category}”尚未创建，请先在后台添加。`);
        return;
      }
      setTitle(imported.title);
      setContent(imported.content);
      if (importedCategory) setCategory(importedCategory.name);
      setError("");
    } catch {
      setError("无法读取这个 Markdown 文件，请确认文件编码为 UTF-8。");
    }
  };

  const save = async (status: PostStatus) => {
    setSubmitting(status);
    setError("");
    try {
      const post = await api<Post>(id ? `/api/me/posts/${id}` : "/api/me/posts", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify({ title, category, content, status }),
      });
      setSavedDraft({ title, category, content });
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
        <Link
          className="back-link"
          to="/dashboard"
          onClick={(event) => {
            if (hasUnsavedChanges && !window.confirm("还有未保存的内容，确定离开吗？")) {
              event.preventDefault();
            }
          }}
        >
          <ArrowLeft size={17} aria-hidden="true" />
          返回文章列表
        </Link>
        <div className="editor-top-actions">
          <span>{hasUnsavedChanges ? "有未保存的更改" : id ? "编辑文章" : "新文章"}</span>
          <input
            ref={fileInputRef}
            className="sr-only"
            type="file"
            accept=".md,.markdown,text/markdown"
            aria-label="选择 Markdown 文件"
            onChange={importMarkdown}
          />
          <button
            className="button button-secondary editor-import"
            type="button"
            onClick={() => {
              if (
                hasUnsavedChanges &&
                !window.confirm("导入 Markdown 会覆盖当前标题和正文，确定继续吗？")
              ) {
                return;
              }
              fileInputRef.current?.click();
            }}
          >
            <FileUp size={16} aria-hidden="true" />
            导入 Markdown
          </button>
        </div>
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

        <div className="editor-meta">
          <label htmlFor="category">
            <span>分类</span>
            <select
              id="category"
              name="category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              required
            >
              {categories.map((item) => (
                <option value={item.name} key={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
          <span>{content.replace(/\s/g, "").length} 字 · 支持 Markdown</span>
        </div>

        <label className="editor-content" htmlFor="content">
          <span className="sr-only">文章正文</span>
          <textarea
            id="content"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder={"从这里开始写作。\n\n支持 Markdown 标题、列表、引用、代码和图片。"}
            minLength={10}
            maxLength={50_000}
            required
          />
        </label>

        {error && (
          <div className="message message-error" role="status" aria-live="polite">
            {error}
          </div>
        )}
        <div className="editor-actions">
          <p>草稿仅自己可见，发布后会出现在首页。</p>
          <div>
            <button
              className="button button-secondary"
              type="button"
              disabled={Boolean(submitting)}
              onClick={() => void save("draft")}
            >
              <Check size={17} aria-hidden="true" />
              {submitting === "draft" ? "保存中…" : "存为草稿"}
            </button>
            <button className="button button-primary" type="submit" disabled={Boolean(submitting)}>
              <Send size={17} aria-hidden="true" />
              {submitting === "published" ? "发布中…" : "发布文章"}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
