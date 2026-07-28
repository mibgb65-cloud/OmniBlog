import {
  ArrowLeft,
  Bold,
  Check,
  Clock3,
  Code2,
  Columns2,
  Eye,
  FileUp,
  Globe2,
  Heading2,
  ImagePlus,
  Images,
  Italic,
  Link2,
  List,
  LoaderCircle,
  LockKeyhole,
  PanelRightClose,
  PanelRightOpen,
  PenLine,
  Quote,
  Send,
} from "lucide-react";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
} from "react";
import Markdown, { type Components } from "react-markdown";
import { Link, useBlocker, useNavigate, useParams } from "react-router-dom";
import remarkGfm from "remark-gfm";
import type {
  Category,
  MediaUpload,
  Post,
  PostStatus,
  PostVisibility,
} from "../../shared/types";
import { Loading } from "../components/Loading";
import { Seo } from "../components/Seo";
import { api } from "../lib/api";
import { insertMarkdownImage, parseMarkdownImport } from "../lib/markdown";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
const countFormatter = new Intl.NumberFormat("zh-CN");
const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
});

type EditorView = "write" | "split" | "preview";
type SaveIntent = "save" | "publish";

type DraftState = {
  title: string;
  category: string;
  content: string;
  visibility: PostVisibility;
};

type LocalDraft = DraftState & {
  savedAt: string;
};

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

const previewComponents: Components = {
  img({ node: _node, alt = "", ...properties }) {
    return <img {...properties} alt={alt} loading="lazy" decoding="async" />;
  },
};

function validLocalDraft(value: unknown): value is LocalDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<LocalDraft>;
  return (
    typeof draft.title === "string"
    && draft.title.length <= 100
    && typeof draft.category === "string"
    && draft.category.length <= 24
    && typeof draft.content === "string"
    && draft.content.length <= 50_000
    && ["public", "unlisted", "private"].includes(draft.visibility ?? "")
    && typeof draft.savedAt === "string"
  );
}

function sameDraft(left: DraftState, right: DraftState) {
  return (
    left.title === right.title
    && left.category === right.category
    && left.content === right.content
    && left.visibility === right.visibility
  );
}

export function EditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const markdownInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const contentInputRef = useRef<HTMLTextAreaElement>(null);
  const allowNavigationRef = useRef(false);
  const storageKey = `omniblog-editor-draft:${id ?? "new"}`;
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("随笔");
  const [categories, setCategories] = useState<Category[]>([]);
  const [content, setContent] = useState("");
  const [visibility, setVisibility] = useState<PostVisibility>("public");
  const [postStatus, setPostStatus] = useState<PostStatus>("draft");
  const [view, setView] = useState<EditorView>(() => (
    window.matchMedia("(min-width: 901px)").matches ? "split" : "write"
  ));
  const [settingsOpen, setSettingsOpen] = useState(() => (
    window.matchMedia("(min-width: 901px)").matches
  ));
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<SaveIntent | null>(null);
  const [error, setError] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageDropActive, setImageDropActive] = useState(false);
  const [imageMessage, setImageMessage] = useState<{
    kind: "error" | "success";
    text: string;
  } | null>(null);
  const [savedDraft, setSavedDraft] = useState<DraftState>({
    title: "",
    category: "随笔",
    content: "",
    visibility: "public",
  });
  const [recoveryDraft, setRecoveryDraft] = useState<LocalDraft | null>(null);
  const [readyForAutosave, setReadyForAutosave] = useState(false);
  const [localSavedAt, setLocalSavedAt] = useState<string | null>(null);
  const [autosaveFailed, setAutosaveFailed] = useState(false);
  const deferredContent = useDeferredValue(content);
  const characterCount = content.replace(/\s/g, "").length;
  const currentDraft = { title, category, content, visibility };
  const hasUnsavedChanges = !sameDraft(currentDraft, savedDraft);
  const blocker = useBlocker(useCallback(
    ({ currentLocation, nextLocation }) => (
      !allowNavigationRef.current
      && hasUnsavedChanges
      && (
        currentLocation.pathname !== nextLocation.pathname
        || currentLocation.search !== nextLocation.search
        || currentLocation.hash !== nextLocation.hash
      )
    ),
    [hasUnsavedChanges],
  ));

  useEffect(() => {
    allowNavigationRef.current = false;
    setLoading(true);
    setRecoveryDraft(null);
    setReadyForAutosave(false);
    setLocalSavedAt(null);
    setAutosaveFailed(false);
    const postRequest = id
      ? api<Post>(`/api/me/posts/${id}`)
      : Promise.resolve<Post | null>(null);

    Promise.all([api<Category[]>("/api/categories"), postRequest])
      .then(([nextCategories, post]) => {
        setCategories(nextCategories);
        const initialCategory =
          nextCategories.find((item) => item.name === "随笔")?.name
          ?? nextCategories[0]?.name
          ?? "";
        const serverDraft: DraftState = post
          ? {
            title: post.title,
            category: post.category || initialCategory,
            content: post.content,
            visibility: post.visibility || "public",
          }
          : {
            title: "",
            category: initialCategory,
            content: "",
            visibility: "public",
          };
        setTitle(serverDraft.title);
        setCategory(serverDraft.category);
        setContent(serverDraft.content);
        setVisibility(serverDraft.visibility);
        setPostStatus(post?.status ?? "draft");
        setSavedDraft(serverDraft);

        try {
          const rawDraft = localStorage.getItem(storageKey);
          const parsedDraft: unknown = rawDraft ? JSON.parse(rawDraft) : null;
          if (validLocalDraft(parsedDraft) && !sameDraft(parsedDraft, serverDraft)) {
            setRecoveryDraft(parsedDraft);
            return;
          }
          if (rawDraft) localStorage.removeItem(storageKey);
        } catch {
          setAutosaveFailed(true);
        }
        setReadyForAutosave(true);
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, [id, storageKey]);

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (window.confirm("还有未保存的内容，确定离开吗？")) blocker.proceed();
    else blocker.reset();
  }, [blocker]);

  useEffect(() => {
    if (!hasUnsavedChanges || allowNavigationRef.current) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (!readyForAutosave) return;
    if (!hasUnsavedChanges) {
      try {
        localStorage.removeItem(storageKey);
      } catch {
        setAutosaveFailed(true);
      }
      setLocalSavedAt(null);
      return;
    }

    const timer = window.setTimeout(() => {
      const savedAt = new Date().toISOString();
      try {
        localStorage.setItem(storageKey, JSON.stringify({ ...currentDraft, savedAt }));
        setLocalSavedAt(savedAt);
        setAutosaveFailed(false);
      } catch {
        setAutosaveFailed(true);
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [
    category,
    content,
    hasUnsavedChanges,
    readyForAutosave,
    storageKey,
    title,
    visibility,
  ]);

  const restoreRecovery = () => {
    if (!recoveryDraft) return;
    setTitle(recoveryDraft.title);
    setCategory(
      categories.some((item) => item.name === recoveryDraft.category)
        ? recoveryDraft.category
        : savedDraft.category,
    );
    setContent(recoveryDraft.content);
    setVisibility(recoveryDraft.visibility);
    setLocalSavedAt(recoveryDraft.savedAt);
    setRecoveryDraft(null);
    setReadyForAutosave(true);
  };

  const discardRecovery = () => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      setAutosaveFailed(true);
    }
    setRecoveryDraft(null);
    setReadyForAutosave(true);
  };

  const replaceSelection = useCallback((
    replacement: string,
    selectionStart: number,
    selectionEnd: number,
  ) => {
    const textarea = contentInputRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    setContent(`${content.slice(0, start)}${replacement}${content.slice(end)}`);
    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + selectionStart, start + selectionEnd);
    });
  }, [content]);

  const applyInline = useCallback((
    before: string,
    after: string,
    placeholder: string,
  ) => {
    const textarea = contentInputRef.current;
    if (!textarea) return;
    const selected = content.slice(textarea.selectionStart, textarea.selectionEnd);
    const value = selected || placeholder;
    replaceSelection(
      `${before}${value}${after}`,
      before.length,
      before.length + value.length,
    );
  }, [content, replaceSelection]);

  const applyLinePrefix = useCallback((prefix: string) => {
    const textarea = contentInputRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const lineStart = content.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const nextLine = content.indexOf("\n", end);
    const lineEnd = nextLine === -1 ? content.length : nextLine;
    const selectedLines = content.slice(lineStart, lineEnd) || "继续写下去";
    const replacement = selectedLines
      .split("\n")
      .map((line) => `${prefix}${line}`)
      .join("\n");
    setContent(`${content.slice(0, lineStart)}${replacement}${content.slice(lineEnd)}`);
    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(lineStart + prefix.length, lineStart + replacement.length);
    });
  }, [content]);

  const applyLink = useCallback(() => {
    const textarea = contentInputRef.current;
    if (!textarea) return;
    const selected = content.slice(textarea.selectionStart, textarea.selectionEnd);
    const label = selected || "链接文字";
    const url = "https://example.com";
    const replacement = `[${label}](${url})`;
    const selectionStart = selected ? label.length + 3 : 1;
    const selectionEnd = selected ? selectionStart + url.length : 1 + label.length;
    replaceSelection(replacement, selectionStart, selectionEnd);
  }, [content, replaceSelection]);

  const applyCode = useCallback(() => {
    const textarea = contentInputRef.current;
    if (!textarea) return;
    const selected = content.slice(textarea.selectionStart, textarea.selectionEnd);
    if (selected.includes("\n")) {
      const value = selected || "代码";
      replaceSelection(`\n\`\`\`\n${value}\n\`\`\`\n`, 5, 5 + value.length);
      return;
    }
    applyInline("`", "`", "代码");
  }, [applyInline, content, replaceSelection]);

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
        imported.title.length > 100
        || (imported.category?.length ?? 0) > 24
        || imported.content.length > 50_000
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
      setView("write");
      setError("");
    } catch {
      setError("无法读取这个 Markdown 文件，请确认文件编码为 UTF-8。");
    }
  };

  const openMarkdownImport = () => {
    if (
      hasUnsavedChanges
      && !window.confirm("导入 Markdown 会覆盖当前标题和正文，确定继续吗？")
    ) {
      return;
    }
    markdownInputRef.current?.click();
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
      setView("write");
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

  const save = useCallback(async (status: PostStatus, intent: SaveIntent) => {
    if (submitting || uploadingImage) return;
    setSubmitting(intent);
    setError("");
    try {
      const post = await api<Post>(id ? `/api/me/posts/${id}` : "/api/me/posts", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify({ title, category, content, status, visibility }),
      });
      const nextSavedDraft = { title, category, content, visibility };
      setSavedDraft(nextSavedDraft);
      setPostStatus(post.status);
      try {
        localStorage.removeItem(storageKey);
      } catch {
        // The server save succeeded; local cleanup is best effort.
      }
      setLocalSavedAt(null);
      if (intent === "save") {
        if (id) return;
        allowNavigationRef.current = true;
        navigate(`/write/${post.id}`, { replace: true });
        return;
      }
      allowNavigationRef.current = true;
      navigate(`/posts/${post.slug}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败，请稍后再试。");
    } finally {
      setSubmitting(null);
    }
  }, [
    category,
    content,
    id,
    navigate,
    storageKey,
    submitting,
    title,
    uploadingImage,
    visibility,
  ]);

  useEffect(() => {
    const handleKeyboardShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === "s") {
        event.preventDefault();
        void save(postStatus, "save");
        return;
      }
      if (key === "enter") {
        event.preventDefault();
        void save("published", "publish");
        return;
      }
      if (event.target !== contentInputRef.current) return;
      if (key === "b") {
        event.preventDefault();
        applyInline("**", "**", "加粗文字");
      }
      if (key === "i") {
        event.preventDefault();
        applyInline("*", "*", "斜体文字");
      }
    };
    window.addEventListener("keydown", handleKeyboardShortcut);
    return () => window.removeEventListener("keydown", handleKeyboardShortcut);
  }, [applyInline, postStatus, save]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void save("published", "publish");
  };

  const saveStatus = submitting
    ? submitting === "save" ? "正在保存…" : "正在发布…"
    : recoveryDraft
      ? "发现可恢复的内容"
      : autosaveFailed
        ? "本地自动保存不可用"
        : hasUnsavedChanges && localSavedAt
          ? `已自动保存到此设备 ${timeFormatter.format(new Date(localSavedAt))}`
          : hasUnsavedChanges
            ? "有未保存的更改"
            : "全部更改已保存";

  if (loading) return <Loading label="正在打开草稿" />;

  return (
    <section className="editor">
      <Seo
        title={`${id ? "编辑文章" : "写新文章"} — OmniBlog`}
        description="在 OmniBlog 中编辑和发布文章。"
        path={id ? `/write/${id}` : "/write"}
        noIndex
      />

      <form id="editor-form" onSubmit={submit}>
        <header className="editor-commandbar">
          <div className="editor-commandbar-start">
            <Link className="editor-back" to="/dashboard" aria-label="返回文章列表">
              <ArrowLeft size={18} aria-hidden="true" />
            </Link>
            <div className="editor-save-status" role="status" aria-live="polite">
              <span className={hasUnsavedChanges ? "unsaved" : ""} aria-hidden="true" />
              <span>{saveStatus}</span>
            </div>
          </div>

          <div className="editor-view-switch" role="group" aria-label="编辑器视图">
            <button
              className={view === "write" ? "active" : ""}
              type="button"
              aria-pressed={view === "write"}
              onClick={() => setView("write")}
            >
              <PenLine size={16} aria-hidden="true" />
              <span>编辑</span>
            </button>
            <button
              className={`editor-mode-split${view === "split" ? " active" : ""}`}
              type="button"
              aria-pressed={view === "split"}
              onClick={() => setView("split")}
            >
              <Columns2 size={16} aria-hidden="true" />
              <span>分屏</span>
            </button>
            <button
              className={view === "preview" ? "active" : ""}
              type="button"
              aria-pressed={view === "preview"}
              onClick={() => setView("preview")}
            >
              <Eye size={16} aria-hidden="true" />
              <span>预览</span>
            </button>
          </div>

          <div className="editor-commandbar-actions">
            <button
              className={`button button-secondary editor-settings-toggle${settingsOpen ? " active" : ""}`}
              type="button"
              aria-label={settingsOpen ? "关闭文章设置" : "打开文章设置"}
              aria-pressed={settingsOpen}
              onClick={() => setSettingsOpen((open) => !open)}
            >
              {settingsOpen
                ? <PanelRightClose size={17} aria-hidden="true" />
                : <PanelRightOpen size={17} aria-hidden="true" />}
              <span className="editor-action-label">文章设置</span>
            </button>
            <button
              className="button button-secondary editor-save-button"
              type="button"
              aria-label={postStatus === "published" ? "保存文章修改" : "保存草稿"}
              disabled={Boolean(submitting) || uploadingImage}
              onClick={() => void save(postStatus, "save")}
            >
              <Check size={17} aria-hidden="true" />
              <span className="editor-action-label">
                {submitting === "save"
                  ? "保存中…"
                  : postStatus === "published" ? "保存修改" : "保存草稿"}
              </span>
            </button>
            <button
              className="button button-primary editor-publish-button"
              type="submit"
              disabled={Boolean(submitting) || uploadingImage}
            >
              <Send size={17} aria-hidden="true" />
              {submitting === "publish" ? "发布中…" : "发布"}
            </button>
          </div>
        </header>

        {recoveryDraft && (
          <aside className="editor-recovery" aria-labelledby="editor-recovery-title">
            <Clock3 size={20} aria-hidden="true" />
            <div>
              <strong id="editor-recovery-title">发现一份未提交的本地内容</strong>
              <span>
                保存于 {new Intl.DateTimeFormat("zh-CN", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(recoveryDraft.savedAt))}
              </span>
            </div>
            <div>
              <button className="button button-primary" type="button" onClick={restoreRecovery}>
                恢复内容
              </button>
              <button className="button button-secondary" type="button" onClick={discardRecovery}>
                忽略
              </button>
            </div>
          </aside>
        )}

        {error && (
          <div className="message message-error editor-error" role="status" aria-live="polite">
            {error}
          </div>
        )}

        <div className={`editor-main-grid${settingsOpen ? " settings-open" : ""}`}>
          <div className={`editor-workspace mode-${view}`}>
            <section className="editor-writing-panel" aria-label="Markdown 编辑区">
              <div className="editor-document-heading">
                <span>{id ? "EDITING ARTICLE" : "NEW ARTICLE"}</span>
                <label htmlFor="title">
                  <span className="sr-only">文章标题</span>
                  <textarea
                    id="title"
                    name="title"
                    autoComplete="off"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="给这篇文章一个标题"
                    rows={2}
                    minLength={2}
                    maxLength={100}
                    required
                  />
                </label>
                <div>
                  <span>{category || "未分类"}</span>
                  <span>{countFormatter.format(characterCount)} 字</span>
                </div>
              </div>

              <div className="editor-markdown-toolbar" role="toolbar" aria-label="Markdown 格式">
                <button
                  type="button"
                  onClick={() => applyLinePrefix("## ")}
                  aria-label="二级标题"
                  title="二级标题"
                >
                  <Heading2 size={17} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => applyInline("**", "**", "加粗文字")}
                  aria-label="加粗"
                  title="加粗（Ctrl+B）"
                >
                  <Bold size={17} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => applyInline("*", "*", "斜体文字")}
                  aria-label="斜体"
                  title="斜体（Ctrl+I）"
                >
                  <Italic size={17} aria-hidden="true" />
                </button>
                <span aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => applyLinePrefix("> ")}
                  aria-label="引用"
                  title="引用"
                >
                  <Quote size={17} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => applyLinePrefix("- ")}
                  aria-label="无序列表"
                  title="无序列表"
                >
                  <List size={17} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={applyCode}
                  aria-label="代码"
                  title="代码"
                >
                  <Code2 size={17} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={applyLink}
                  aria-label="链接"
                  title="链接"
                >
                  <Link2 size={17} aria-hidden="true" />
                </button>
                <span aria-hidden="true" />
                <input
                  ref={imageInputRef}
                  className="sr-only"
                  type="file"
                  accept={IMAGE_TYPES.join(",")}
                  aria-label="选择要插入正文的图片"
                  onChange={handleImageInput}
                />
                <button
                  type="button"
                  disabled={uploadingImage || Boolean(submitting)}
                  onClick={() => imageInputRef.current?.click()}
                  aria-label={uploadingImage ? "图片上传中" : "插入图片"}
                  title="插入图片"
                >
                  {uploadingImage
                    ? <LoaderCircle className="editor-upload-spinner" size={17} aria-hidden="true" />
                    : <ImagePlus size={17} aria-hidden="true" />}
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
                <label htmlFor="content">
                  <span className="sr-only">文章正文</span>
                  <textarea
                    ref={contentInputRef}
                    id="content"
                    name="content"
                    autoComplete="off"
                    value={content}
                    readOnly={uploadingImage}
                    aria-describedby="editor-writing-help editor-image-status"
                    onChange={(event) => setContent(event.target.value)}
                    onPaste={handleImagePaste}
                    placeholder={"从这里开始写作…\n\n支持 Markdown，也可以直接粘贴或拖入图片。"}
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
              <footer className="editor-writing-footer">
                <span id="editor-writing-help">Markdown · Ctrl/⌘+S 保存 · Ctrl/⌘+Enter 发布</span>
                <span
                  id="editor-image-status"
                  className={`editor-image-status${imageMessage ? ` ${imageMessage.kind}` : ""}`}
                  role="status"
                  aria-live="polite"
                >
                  {imageMessage?.text ?? `${countFormatter.format(characterCount)} 字`}
                </span>
              </footer>
            </section>

            <section className="editor-preview-panel" aria-label="文章预览" aria-live="polite">
              <div className="editor-preview-label">
                <span>PREVIEW</span>
                <span>发布效果预览</span>
              </div>
              <article className="editor-preview">
                <header>
                  <div>
                    <span>{category || "随笔"}</span>
                    <span>{visibilityOptions.find((option) => option.value === visibility)?.label}</span>
                  </div>
                  <h1>{title || "文章标题会显示在这里"}</h1>
                </header>
                {deferredContent ? (
                  <div className="article-content">
                    <Markdown
                      components={previewComponents}
                      remarkPlugins={[remarkGfm]}
                      skipHtml
                    >
                      {deferredContent}
                    </Markdown>
                  </div>
                ) : (
                  <div className="editor-preview-empty">
                    <PenLine size={24} aria-hidden="true" />
                    <p>开始写作后，排版效果会出现在这里。</p>
                  </div>
                )}
              </article>
            </section>
          </div>

          {settingsOpen && (
            <aside className="editor-settings" aria-labelledby="editor-settings-title">
              <header>
                <div>
                  <span>ARTICLE SETTINGS</span>
                  <h2 id="editor-settings-title">文章设置</h2>
                </div>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  aria-label="关闭文章设置"
                >
                  <PanelRightClose size={17} aria-hidden="true" />
                </button>
              </header>

              <label className="editor-setting-field" htmlFor="category">
                <span>文章分类</span>
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

              <fieldset className="visibility-setting editor-settings-visibility">
                <legend>发布可见性</legend>
                <p>草稿始终只有你可见。</p>
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
                          <Icon size={17} />
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

              <section className="editor-settings-section" aria-labelledby="editor-resources-title">
                <h3 id="editor-resources-title">写作资源</h3>
                <input
                  ref={markdownInputRef}
                  className="sr-only"
                  type="file"
                  accept=".md,.markdown,text/markdown"
                  aria-label="选择 Markdown 文件"
                  onChange={importMarkdown}
                />
                <button type="button" onClick={openMarkdownImport}>
                  <span><FileUp size={17} aria-hidden="true" />导入 Markdown</span>
                  <span>覆盖标题与正文</span>
                </button>
                <Link to="/dashboard/media">
                  <span><Images size={17} aria-hidden="true" />打开媒体库</span>
                  <span>复用已上传图片</span>
                </Link>
              </section>

              <section className="editor-settings-section editor-shortcuts" aria-labelledby="editor-shortcuts-title">
                <h3 id="editor-shortcuts-title">快捷键</h3>
                <div><span>保存草稿</span><kbd>Ctrl / ⌘ + S</kbd></div>
                <div><span>发布文章</span><kbd>Ctrl / ⌘ + Enter</kbd></div>
                <div><span>加粗文字</span><kbd>Ctrl / ⌘ + B</kbd></div>
              </section>
            </aside>
          )}
        </div>
      </form>
    </section>
  );
}
