import {
  ArrowLeft,
  Check,
  FileUp,
  Globe2,
  ImagePlus,
  Link2,
  LoaderCircle,
  LockKeyhole,
  Send,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type {
  Category,
  MediaUpload,
  Post,
  PostStatus,
  PostVisibility,
} from "../../shared/types";
import { Loading } from "../components/Loading";
import { api } from "../lib/api";
import { insertMarkdownImage, parseMarkdownImport } from "../lib/markdown";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];

const visibilityOptions = [
  {
    value: "public",
    label: "公开",
    description: "出现在首页和文章归档，任何人都能阅读。",
    icon: Globe2,
  },
  {
    value: "unlisted",
    label: "仅链接可见",
    description: "不进入文章列表，知道链接的人可以阅读。",
    icon: Link2,
  },
  {
    value: "private",
    label: "私密",
    description: "只有你登录后才能打开这篇文章。",
    icon: LockKeyhole,
  },
] as const;

export function EditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const markdownInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const contentInputRef = useRef<HTMLTextAreaElement>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("随笔");
  const [categories, setCategories] = useState<Category[]>([]);
  const [content, setContent] = useState("");
  const [visibility, setVisibility] = useState<PostVisibility>("public");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<PostStatus | null>(null);
  const [error, setError] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageDropActive, setImageDropActive] = useState(false);
  const [imageMessage, setImageMessage] = useState<{
    kind: "error" | "success";
    text: string;
  } | null>(null);
  const [savedDraft, setSavedDraft] = useState({
    title: "",
    category: "随笔",
    content: "",
    visibility: "public" as PostVisibility,
  });
  const hasUnsavedChanges =
    title !== savedDraft.title ||
    category !== savedDraft.category ||
    content !== savedDraft.content ||
    visibility !== savedDraft.visibility;

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
          setSavedDraft({
            title: "",
            category: initialCategory,
            content: "",
            visibility: "public",
          });
          return;
        }
        const postCategory = post.category || "随笔";
        const postVisibility = post.visibility || "public";
        setTitle(post.title);
        setCategory(postCategory);
        setContent(post.content);
        setVisibility(postVisibility);
        setSavedDraft({
          title: post.title,
          category: postCategory,
          content: post.content,
          visibility: postVisibility,
        });
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

  const uploadImage = async (file: File) => {
    if (uploadingImage) return;
    if (file.type && !IMAGE_TYPES.includes(file.type)) {
      setImageMessage({ kind: "error", text: "请选择 JPEG、PNG、WebP、GIF 或 AVIF 图片。" });
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImageMessage({ kind: "error", text: "图片不能超过 8 MB，请压缩后重试。" });
      return;
    }

    const textarea = contentInputRef.current;
    const selectionStart = textarea?.selectionStart ?? content.length;
    const selectionEnd = textarea?.selectionEnd ?? selectionStart;
    setUploadingImage(true);
    setImageMessage(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const uploaded = await api<MediaUpload>("/api/me/media", {
        method: "POST",
        body: formData,
      });
      const insertion = insertMarkdownImage(
        content,
        selectionStart,
        selectionEnd,
        uploaded.url,
      );
      setContent(insertion.content);
      setImageMessage({
        kind: "success",
        text: "图片已插入正文，请补充准确的图片说明。",
      });
      window.requestAnimationFrame(() => {
        contentInputRef.current?.focus();
        contentInputRef.current?.setSelectionRange(
          insertion.selectionStart,
          insertion.selectionEnd,
        );
      });
    } catch (reason) {
      setImageMessage({
        kind: "error",
        text: reason instanceof Error ? reason.message : "图片上传失败，请重新选择。",
      });
    } finally {
      setUploadingImage(false);
    }
  };

  const handleImageInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void uploadImage(file);
  };

  const handleImagePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const file = Array.from(event.clipboardData.items)
      .find((item) => item.kind === "file" && item.type.startsWith("image/"))
      ?.getAsFile();
    if (!file) return;
    event.preventDefault();
    void uploadImage(file);
  };

  const handleImageDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setImageDropActive(false);
    const file = Array.from(event.dataTransfer.files)
      .find((item) => item.type.startsWith("image/"));
    if (file) {
      void uploadImage(file);
    } else {
      setImageMessage({ kind: "error", text: "拖入的文件不是支持的图片格式。" });
    }
  };

  const save = async (status: PostStatus) => {
    setSubmitting(status);
    setError("");
    try {
      const post = await api<Post>(id ? `/api/me/posts/${id}` : "/api/me/posts", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify({ title, category, content, status, visibility }),
      });
      setSavedDraft({ title, category, content, visibility });
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
            ref={markdownInputRef}
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
              markdownInputRef.current?.click();
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
            name="title"
            autoComplete="off"
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

        <fieldset className="visibility-setting">
          <legend>文章可见性</legend>
          <p>草稿始终只有你可见；以下设置会在文章发布后生效。</p>
          <div className="visibility-options">
            {visibilityOptions.map((option) => {
              const Icon = option.icon;
              return (
                <label
                  className={`visibility-option${visibility === option.value ? " active" : ""}`}
                  key={option.value}
                >
                  <input
                    type="radio"
                    name="visibility"
                    value={option.value}
                    checked={visibility === option.value}
                    disabled={Boolean(submitting)}
                    onChange={() => setVisibility(option.value)}
                  />
                  <span className="visibility-option-icon" aria-hidden="true">
                    <Icon size={18} />
                  </span>
                  <span>
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <section className="editor-content-section" aria-labelledby="editor-content-title">
          <div className="editor-content-toolbar">
            <div>
              <strong id="editor-content-title">文章正文</strong>
              <span id="editor-image-help">支持选择、拖拽或粘贴图片，单张不超过 8 MB。</span>
            </div>
            <input
              ref={imageInputRef}
              className="sr-only"
              type="file"
              accept={IMAGE_TYPES.join(",")}
              aria-label="选择要插入正文的图片"
              onChange={handleImageInput}
            />
            <button
              className="button button-secondary editor-image-upload"
              type="button"
              disabled={uploadingImage || Boolean(submitting)}
              onClick={() => imageInputRef.current?.click()}
            >
              {uploadingImage
                ? <LoaderCircle className="editor-upload-spinner" size={16} aria-hidden="true" />
                : <ImagePlus size={16} aria-hidden="true" />}
              {uploadingImage ? "上传中…" : "插入图片"}
            </button>
          </div>
          <div
            className={`editor-content-shell${imageDropActive ? " dragging" : ""}${uploadingImage ? " uploading" : ""}`}
            onDragEnter={(event) => {
              event.preventDefault();
              if (event.dataTransfer.types.includes("Files")) setImageDropActive(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setImageDropActive(false);
              }
            }}
            onDrop={handleImageDrop}
          >
            <label className="editor-content" htmlFor="content">
              <span className="sr-only">文章正文</span>
              <textarea
                ref={contentInputRef}
                id="content"
                name="content"
                autoComplete="off"
                value={content}
                readOnly={uploadingImage}
                aria-describedby="editor-image-help editor-image-status"
                onChange={(event) => setContent(event.target.value)}
                onPaste={handleImagePaste}
                placeholder={"从这里开始写作…\n\n支持 Markdown 标题、列表、引用、代码和图片。"}
                minLength={10}
                maxLength={50_000}
                required
              />
            </label>
            {imageDropActive && (
              <div className="editor-drop-overlay" aria-hidden="true">
                <ImagePlus size={22} />
                <strong>松开以上传图片</strong>
              </div>
            )}
          </div>
          <p
            id="editor-image-status"
            className={`editor-image-status${imageMessage ? ` ${imageMessage.kind}` : ""}`}
            role="status"
            aria-live="polite"
          >
            {imageMessage?.text ?? ""}
          </p>
        </section>

        {error && (
          <div className="message message-error" role="status" aria-live="polite">
            {error}
          </div>
        )}
        <div className="editor-actions">
          <p>
            发布可见性：{visibilityOptions.find((option) => option.value === visibility)?.label}
          </p>
          <div>
            <button
              className="button button-secondary"
              type="button"
              disabled={Boolean(submitting) || uploadingImage}
              onClick={() => void save("draft")}
            >
              <Check size={17} aria-hidden="true" />
              {submitting === "draft" ? "保存中…" : "存为草稿"}
            </button>
            <button
              className="button button-primary"
              type="submit"
              disabled={Boolean(submitting) || uploadingImage}
            >
              <Send size={17} aria-hidden="true" />
              {submitting === "published" ? "发布中…" : "发布文章"}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
