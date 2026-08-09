import {
  ArchiveRestore,
  ArrowLeft,
  Check,
  ChevronDown,
  CircleAlert,
  Copy,
  Download,
  Eye,
  FileImage,
  FilePlus2,
  ImagePlus,
  LogOut,
  LoaderCircle,
  Moon,
  Package,
  PenLine,
  Smile,
  Sun,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { strFromU8, strToU8, unzip, zip } from "fflate";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent, type DragEvent } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { categories } from "../categories";
import { TransitionLink, useTheme } from "../components/AppProviders";
import type { Locale } from "../content";
import {
  deleteStudioAssets,
  readAllStudioAssets,
  readStudioAssets,
  readStudioState,
  replaceStudioWorkspace,
  writeStudioAssets,
  writeStudioState,
  type StoredBodyImageAsset,
  type StoredDraftAssets,
  type StoredImageAsset,
} from "../studioStorage";
import { usePageMeta } from "./usePageMeta";

type LocalizedDraft = Record<Locale, string>;

type StudioDraft = {
  id: string;
  slug: string;
  date: string;
  category: string;
  readMinutes: number;
  cover: string;
  title: LocalizedDraft;
  summary: LocalizedDraft;
  coverAlt: LocalizedDraft;
  body: LocalizedDraft;
  tags: LocalizedDraft;
  series: LocalizedDraft;
  updatedAt: string;
};

type StudioState = {
  drafts: StudioDraft[];
  activeId: string;
};

type ImageAsset = {
  filename: string;
  blob: Blob;
  url: string;
  width: number;
  height: number;
};

type BodyImageAsset = ImageAsset & {
  alt: string;
};

type SaveStatus = "loading" | "saving" | "saved" | "local" | "error";

type BackupImageMeta = Omit<StoredImageAsset, "blob"> & { path: string };
type BackupBodyImageMeta = BackupImageMeta & { alt: string };
type StudioBackupManifest = {
  version: 1;
  exportedAt: string;
  state: StudioState;
  assets: Array<{
    draftId: string;
    cover: BackupImageMeta[];
    body: BackupBodyImageMeta[];
  }>;
};

const emojis = [
  ["😀", "开心"], ["😄", "大笑"], ["😂", "笑哭"], ["🥹", "感动"], ["😊", "微笑"],
  ["🤔", "思考"], ["👍", "赞"], ["👏", "鼓掌"], ["🎉", "庆祝"], ["❤️", "爱心"],
  ["🔥", "火热"], ["✨", "闪光"], ["🚀", "起飞"], ["👀", "关注"], ["💡", "灵感"],
  ["✅", "完成"], ["❌", "错误"], ["⚠️", "注意"], ["📌", "标记"], ["📝", "记录"],
  ["🧠", "思考力"], ["💻", "电脑"], ["🐧", "Linux"], ["🙌", "欢呼"], ["🙏", "感谢"],
] as const;

const storageKey = "omniblog-studio-drafts-v1";

function createDraft(): StudioDraft {
  const id = crypto.randomUUID();
  return {
    id,
    slug: "",
    date: new Date().toISOString().slice(0, 10),
    category: categories[0]?.id ?? "notes",
    readMinutes: 6,
    cover: "",
    title: { zh: "", en: "" },
    summary: { zh: "", en: "" },
    coverAlt: { zh: "", en: "" },
    body: { zh: "", en: "" },
    tags: { zh: "", en: "" },
    series: { zh: "", en: "" },
    updatedAt: new Date().toISOString(),
  };
}

function loadStudioState(): StudioState {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null") as StudioState | null;
    if (saved?.drafts.length && saved.activeId) return saved;
  } catch {
    // Start with a clean draft if local data is malformed.
  }
  const draft = createDraft();
  return { drafts: [draft], activeId: draft.id };
}

function splitTags(value: string) {
  return value.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean);
}

function buildMarkdown(draft: StudioDraft, locale: Locale) {
  const tags = splitTags(draft.tags[locale]);
  const lines = [
    "---",
    `slug: ${JSON.stringify(draft.slug)}`,
    `locale: ${locale}`,
    `date: ${JSON.stringify(draft.date)}`,
    `category: ${draft.category}`,
    `readMinutes: ${draft.readMinutes}`,
    `title: ${JSON.stringify(draft.title[locale])}`,
    `summary: ${JSON.stringify(draft.summary[locale])}`,
    `cover: ${JSON.stringify(draft.cover)}`,
    `coverAlt: ${JSON.stringify(draft.coverAlt[locale])}`,
    ...(tags.length ? [`tags: ${JSON.stringify(tags)}`] : []),
    ...(draft.series[locale].trim() ? [`series: ${JSON.stringify(draft.series[locale].trim())}`] : []),
    "---",
    "",
    draft.body[locale].trim(),
    "",
  ];
  return lines.join("\n");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

function downloadMarkdown(draft: StudioDraft, locale: Locale) {
  downloadBlob(new Blob([buildMarkdown(draft, locale)], { type: "text/markdown;charset=utf-8" }), `${draft.slug}.${locale}.md`);
}

function toStoredImage(asset: ImageAsset): StoredImageAsset {
  return { filename: asset.filename, blob: asset.blob, width: asset.width, height: asset.height };
}

function toStoredBodyImage(asset: BodyImageAsset): StoredBodyImageAsset {
  return { ...toStoredImage(asset), alt: asset.alt };
}

function restoreImage(asset: StoredImageAsset): ImageAsset {
  return { ...asset, url: URL.createObjectURL(asset.blob) };
}

function restoreBodyImage(asset: StoredBodyImageAsset): BodyImageAsset {
  return { ...restoreImage(asset), alt: asset.alt };
}

function zipFiles(files: Record<string, Uint8Array>) {
  return new Promise<Uint8Array>((resolve, reject) => {
    zip(files, { level: 0 }, (error, archive) => error ? reject(error) : resolve(archive));
  });
}

function unzipFiles(archive: Uint8Array) {
  return new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    unzip(archive, (error, files) => error ? reject(error) : resolve(files));
  });
}

function archiveBlob(bytes: Uint8Array) {
  return new Blob([new Uint8Array(bytes).buffer], { type: "application/zip" });
}

function imageBlob(bytes: Uint8Array) {
  return new Blob([new Uint8Array(bytes).buffer], { type: "image/webp" });
}

function isLocalizedDraft(value: unknown): value is LocalizedDraft {
  if (!value || typeof value !== "object") return false;
  const localized = value as Record<string, unknown>;
  return typeof localized.zh === "string" && typeof localized.en === "string";
}

function isStudioState(value: unknown): value is StudioState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<StudioState>;
  if (!Array.isArray(state.drafts) || !state.drafts.length || typeof state.activeId !== "string") return false;
  return state.drafts.some((draft) => draft.id === state.activeId) && state.drafts.every((draft) =>
    typeof draft.id === "string"
    && typeof draft.slug === "string"
    && typeof draft.date === "string"
    && typeof draft.category === "string"
    && typeof draft.readMinutes === "number"
    && typeof draft.cover === "string"
    && typeof draft.updatedAt === "string"
    && isLocalizedDraft(draft.title)
    && isLocalizedDraft(draft.summary)
    && isLocalizedDraft(draft.coverAlt)
    && isLocalizedDraft(draft.body)
    && isLocalizedDraft(draft.tags)
    && isLocalizedDraft(draft.series),
  );
}

async function createPublishPackage(
  draft: StudioDraft,
  locales: Locale[],
  coverAssets: ImageAsset[],
  bodyAssets: BodyImageAsset[],
) {
  const files: Record<string, Uint8Array> = {};
  locales.forEach((locale) => {
    files[`content/articles/${draft.slug}.${locale}.md`] = strToU8(buildMarkdown(draft, locale));
  });
  for (const asset of [...coverAssets, ...bodyAssets]) {
    files[`public/images/articles/${draft.slug}/${asset.filename}`] = new Uint8Array(await asset.blob.arrayBuffer());
  }
  files["发布说明.txt"] = strToU8([
    `文章：${draft.title.zh || draft.title.en}`,
    "",
    "1. 将压缩包中的 content 与 public 目录合并到博客项目根目录。",
    "2. 运行 npm run build 检查文章。",
    "3. 提交并推送 Git 仓库即可触发部署。",
    "",
    "如果 Markdown 使用 /media 路径，图片已上传到 R2，无需再次复制 public 中的图片。",
  ].join("\n"));
  return archiveBlob(await zipFiles(files));
}

async function createWorkspaceBackup(state: StudioState, storedAssets: StoredDraftAssets[]) {
  const files: Record<string, Uint8Array> = {};
  const manifest: StudioBackupManifest = { version: 1, exportedAt: new Date().toISOString(), state, assets: [] };
  for (const record of storedAssets) {
    const cover: BackupImageMeta[] = [];
    const body: BackupBodyImageMeta[] = [];
    for (const asset of record.cover) {
      const path = `assets/${record.draftId}/cover/${asset.filename}`;
      files[path] = new Uint8Array(await asset.blob.arrayBuffer());
      cover.push({ filename: asset.filename, width: asset.width, height: asset.height, path });
    }
    for (const asset of record.body) {
      const path = `assets/${record.draftId}/body/${asset.filename}`;
      files[path] = new Uint8Array(await asset.blob.arrayBuffer());
      body.push({ filename: asset.filename, width: asset.width, height: asset.height, alt: asset.alt, path });
    }
    manifest.assets.push({ draftId: record.draftId, cover, body });
  }
  files["workspace.json"] = strToU8(JSON.stringify(manifest, null, 2));
  return archiveBlob(await zipFiles(files));
}

async function parseWorkspaceBackup(file: File) {
  const files = await unzipFiles(new Uint8Array(await file.arrayBuffer()));
  if (!files["workspace.json"]) throw new Error("备份缺少 workspace.json。 ");
  const manifest = JSON.parse(strFromU8(files["workspace.json"])) as StudioBackupManifest;
  if (manifest.version !== 1 || !isStudioState(manifest.state) || !Array.isArray(manifest.assets)) {
    throw new Error("备份格式无效。 ");
  }
  const assets: StoredDraftAssets[] = manifest.assets.map((record) => ({
    draftId: record.draftId,
    cover: record.cover.map((asset) => {
      const bytes = files[asset.path];
      if (!bytes) throw new Error(`备份缺少图片 ${asset.filename}。`);
      return { filename: asset.filename, width: asset.width, height: asset.height, blob: imageBlob(bytes) };
    }),
    body: record.body.map((asset) => {
      const bytes = files[asset.path];
      if (!bytes) throw new Error(`备份缺少图片 ${asset.filename}。`);
      return { filename: asset.filename, width: asset.width, height: asset.height, alt: asset.alt, blob: imageBlob(bytes) };
    }),
  }));
  return { state: manifest.state, assets };
}

async function resizeImage(file: File, width: number, height?: number): Promise<ImageAsset> {
  const bitmap = await createImageBitmap(file);
  const targetHeight = height ?? Math.max(1, Math.round(bitmap.height * Math.min(1, width / bitmap.width)));
  const targetWidth = height ? width : Math.min(width, bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is not available");

  if (height) {
    const scale = Math.max(targetWidth / bitmap.width, targetHeight / bitmap.height);
    const sourceWidth = targetWidth / scale;
    const sourceHeight = targetHeight / scale;
    context.drawImage(
      bitmap,
      (bitmap.width - sourceWidth) / 2,
      (bitmap.height - sourceHeight) / 2,
      sourceWidth,
      sourceHeight,
      0,
      0,
      targetWidth,
      targetHeight,
    );
  } else {
    context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
  }
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((output) => output ? resolve(output) : reject(new Error("Image conversion failed")), "image/webp", 0.86);
  });
  return { filename: "", blob, url: URL.createObjectURL(blob), width: targetWidth, height: targetHeight };
}

export function StudioPage() {
  const { theme, toggleTheme } = useTheme();
  const [state, setState] = useState<StudioState>(loadStudioState);
  const [locale, setLocale] = useState<Locale>("zh");
  const [preview, setPreview] = useState(false);
  const [coverAssets, setCoverAssets] = useState<ImageAsset[]>([]);
  const [bodyAssets, setBodyAssets] = useState<BodyImageAsset[]>([]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [assetStatus, setAssetStatus] = useState("");
  const [copiedAsset, setCopiedAsset] = useState("");
  const [storageReady, setStorageReady] = useState(false);
  const [loadedAssetDraftId, setLoadedAssetDraftId] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("loading");
  const [packageStatus, setPackageStatus] = useState<"idle" | "packing" | "backup" | "restoring">("idle");
  const [assetReloadVersion, setAssetReloadVersion] = useState(0);
  const bodyEditorRef = useRef<HTMLTextAreaElement>(null);
  const bodyImageInputRef = useRef<HTMLInputElement>(null);
  const bodyAssetsRef = useRef<BodyImageAsset[]>([]);
  const initialStateRef = useRef(state);
  const pendingSavesRef = useRef(0);
  const saveFailedRef = useRef(false);
  const caretRef = useRef({ start: 0, end: 0 });
  usePageMeta("写作台 — Omni Journal", "Omni Journal 本地 Markdown 写作台。", { noIndex: true });

  const draft = state.drafts.find((item) => item.id === state.activeId) ?? state.drafts[0];
  const canExport = Boolean(draft.slug && draft.title[locale] && draft.summary[locale] && draft.body[locale] && draft.cover && draft.coverAlt[locale]);
  const completedLocales = useMemo(() => (["zh", "en"] as Locale[]).filter((candidate) =>
    Boolean(draft.slug && draft.title[candidate] && draft.summary[candidate] && draft.body[candidate] && draft.cover && draft.coverAlt[candidate]),
  ), [draft]);
  const canPackage = completedLocales.length > 0;
  const imageBase = draft.cover.startsWith("/media/") ? "/media" : "/images";

  bodyAssetsRef.current = bodyAssets;

  const persistOperation = async (operation: Promise<void>) => {
    pendingSavesRef.current += 1;
    setSaveStatus("saving");
    try {
      await operation;
    } catch {
      saveFailedRef.current = true;
    } finally {
      pendingSavesRef.current -= 1;
      if (pendingSavesRef.current === 0) {
        setSaveStatus(saveFailedRef.current ? "error" : "saved");
        saveFailedRef.current = false;
      }
    }
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = await readStudioState<StudioState>();
        const nextState = isStudioState(stored) ? stored : initialStateRef.current;
        if (!stored) await writeStudioState(nextState);
        if (cancelled) return;
        setState(nextState);
        setStorageReady(true);
        setSaveStatus("saved");
      } catch {
        if (!cancelled) setSaveStatus("local");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(state));
    if (!storageReady) return;
    const timer = window.setTimeout(() => {
      void persistOperation(writeStudioState(state));
    }, 320);
    return () => window.clearTimeout(timer);
  }, [state, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    let cancelled = false;
    const activeId = state.activeId;
    setLoadedAssetDraftId("");
    setCoverAssets([]);
    bodyAssetsRef.current.forEach((asset) => URL.revokeObjectURL(asset.url));
    bodyAssetsRef.current = [];
    setBodyAssets([]);
    void (async () => {
      try {
        const stored = await readStudioAssets(activeId);
        if (cancelled) return;
        const nextCover = stored?.cover.map(restoreImage) ?? [];
        const nextBody = stored?.body.map(restoreBodyImage) ?? [];
        setCoverAssets(nextCover);
        bodyAssetsRef.current = nextBody;
        setBodyAssets(nextBody);
        setLoadedAssetDraftId(activeId);
        if (nextCover.length || nextBody.length) setAssetStatus(`已恢复 ${nextCover.length + nextBody.length} 张图片。`);
      } catch {
        if (!cancelled) {
          setLoadedAssetDraftId(activeId);
          setSaveStatus("error");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [assetReloadVersion, state.activeId, storageReady]);

  useEffect(() => {
    if (!storageReady || loadedAssetDraftId !== state.activeId) return;
    const timer = window.setTimeout(() => {
      void persistOperation(writeStudioAssets({
        draftId: state.activeId,
        cover: coverAssets.map(toStoredImage),
        body: bodyAssets.map(toStoredBodyImage),
      }));
    }, 240);
    return () => window.clearTimeout(timer);
  }, [bodyAssets, coverAssets, loadedAssetDraftId, state.activeId, storageReady]);

  useEffect(() => {
    if (saveStatus !== "saving") return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveStatus]);

  useEffect(() => () => {
    coverAssets.forEach((asset) => URL.revokeObjectURL(asset.url));
  }, [coverAssets]);

  useEffect(() => () => {
    bodyAssetsRef.current.forEach((asset) => URL.revokeObjectURL(asset.url));
  }, []);

  const updateDraft = (patch: Partial<StudioDraft>) => {
    setState((current) => ({
      ...current,
      drafts: current.drafts.map((item) => item.id === current.activeId
        ? { ...item, ...patch, updatedAt: new Date().toISOString() }
        : item),
    }));
  };

  const updateLocalized = (field: keyof Pick<StudioDraft, "title" | "summary" | "coverAlt" | "body" | "tags" | "series">, value: string) => {
    updateDraft({ [field]: { ...draft[field], [locale]: value } });
  };

  const addDraft = () => {
    const next = createDraft();
    setState((current) => ({ drafts: [next, ...current.drafts], activeId: next.id }));
  };

  const deleteDraft = () => {
    if (!window.confirm("确定删除这个本地草稿吗？此操作无法撤销。")) return;
    const deletedDraftId = draft.id;
    setState((current) => {
      const remaining = current.drafts.filter((item) => item.id !== current.activeId);
      const nextDrafts = remaining.length ? remaining : [createDraft()];
      return { drafts: nextDrafts, activeId: nextDrafts[0].id };
    });
    if (storageReady) void persistOperation(deleteStudioAssets(deletedDraftId));
  };

  const processCover = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !draft.slug) {
      setAssetStatus("请先填写文章 slug，再选择封面。 ");
      return;
    }
    setAssetStatus("正在生成图片…");
    try {
      const [cover, thumbnail, og] = await Promise.all([
        resizeImage(file, 1600, 1000),
        resizeImage(file, 800, 500),
        resizeImage(file, 1200, 630),
      ]);
      cover.filename = "cover.webp";
      thumbnail.filename = "thumbnail.webp";
      og.filename = "og.webp";
      setCoverAssets([cover, thumbnail, og]);
      updateDraft({ cover: `/images/articles/${draft.slug}/cover.webp` });
      setAssetStatus("已生成 WebP 封面、缩略图和社交分享图。 ");
    } catch {
      setAssetStatus("图片处理失败，请换一张图片重试。 ");
    }
  };

  const rememberCaret = () => {
    const editor = bodyEditorRef.current;
    if (editor) caretRef.current = { start: editor.selectionStart, end: editor.selectionEnd };
  };

  const insertBodyText = (text: string, position = caretRef.current) => {
    const nextCaret = position.start + text.length;
    setState((current) => ({
      ...current,
      drafts: current.drafts.map((item) => {
        if (item.id !== current.activeId) return item;
        const currentBody = item.body[locale];
        return {
          ...item,
          body: {
            ...item.body,
            [locale]: `${currentBody.slice(0, position.start)}${text}${currentBody.slice(position.end)}`,
          },
          updatedAt: new Date().toISOString(),
        };
      }),
    }));
    caretRef.current = { start: nextCaret, end: nextCaret };
    window.requestAnimationFrame(() => {
      bodyEditorRef.current?.focus();
      bodyEditorRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const processBodyFiles = async (files: File[], position = caretRef.current) => {
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (!imageFiles.length) return;
    if (!draft.slug) {
      setAssetStatus("请先填写文章 slug，再选择正文图片。 ");
      return;
    }
    setAssetStatus(`正在处理 ${imageFiles.length} 张正文图片…`);
    try {
      const usedNames = new Set(["cover.webp", "thumbnail.webp", "og.webp", ...bodyAssets.map((asset) => asset.filename)]);
      const nextAssets: BodyImageAsset[] = [];
      for (const [index, file] of imageFiles.entries()) {
        const asset = await resizeImage(file, 1600);
        const originalName = file.name.replace(/\.[^.]+$/, "").trim();
        const baseName = originalName.toLocaleLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "") || `detail-${bodyAssets.length + index + 1}`;
        let filename = `${baseName}.webp`;
        let suffix = 2;
        while (usedNames.has(filename)) filename = `${baseName}-${suffix++}.webp`;
        usedNames.add(filename);
        nextAssets.push({ ...asset, filename, alt: originalName.replace(/[\[\]]/g, "") || "正文图片" });
      }
      setBodyAssets((current) => [...current, ...nextAssets]);
      const markdown = nextAssets
        .map((asset) => `![${asset.alt}](${imageBase}/articles/${draft.slug}/${asset.filename})`)
        .join("\n\n");
      insertBodyText(`\n\n${markdown}\n\n`, position);
      setAssetStatus(`已插入 ${nextAssets.length} 张 WebP 图片，可直接预览。 `);
    } catch {
      setAssetStatus("图片处理失败，请换一张图片重试。 ");
    }
  };

  const processBodyImage = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    void processBodyFiles(files);
    event.target.value = "";
  };

  const handleBodyPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (!files.length) return;
    event.preventDefault();
    const position = { start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd };
    void processBodyFiles(files, position);
  };

  const handleBodyDrop = (event: DragEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith("image/"));
    setIsDraggingImage(false);
    if (!files.length) return;
    event.preventDefault();
    const position = { start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd };
    void processBodyFiles(files, position);
  };

  const bodySnippet = (asset: BodyImageAsset) => `![${asset.alt}](${imageBase}/articles/${draft.slug}/${asset.filename})`;

  const updateBodyAlt = (asset: BodyImageAsset, alt: string) => {
    const replaceAlt = (body: string) => ["/images", "/media"].reduce(
      (output, base) => output.replaceAll(
        `![${asset.alt}](${base}/articles/${draft.slug}/${asset.filename})`,
        `![${alt}](${base}/articles/${draft.slug}/${asset.filename})`,
      ),
      body,
    );
    setBodyAssets((current) => current.map((item) => item.filename === asset.filename ? { ...item, alt } : item));
    updateDraft({ body: { zh: replaceAlt(draft.body.zh), en: replaceAlt(draft.body.en) } });
  };

  const copyBodySnippet = async (asset: BodyImageAsset) => {
    await navigator.clipboard.writeText(bodySnippet(asset));
    setCopiedAsset(asset.filename);
    window.setTimeout(() => setCopiedAsset(""), 1500);
  };

  const uploadAssets = async () => {
    const assets = [...coverAssets, ...bodyAssets];
    if (!draft.slug || assets.length === 0) {
      setAssetStatus("请填写 slug 并先处理图片。 ");
      return;
    }
    setAssetStatus("正在上传到 Cloudflare R2…");
    try {
      for (const asset of assets) {
        const response = await fetch(`/api/media/articles/${encodeURIComponent(draft.slug)}/${encodeURIComponent(asset.filename)}`, {
          method: "PUT",
          headers: { "Content-Type": "image/webp" },
          body: asset.blob,
        });
        if (!response.ok) throw new Error(await response.text());
      }
      const switchImagePaths = (body: string) => bodyAssets.reduce(
        (output, asset) => output.replaceAll(`/images/articles/${draft.slug}/${asset.filename}`, `/media/articles/${draft.slug}/${asset.filename}`),
        body,
      );
      updateDraft({
        cover: coverAssets.some((asset) => asset.filename === "cover.webp") ? `/media/articles/${draft.slug}/cover.webp` : draft.cover,
        body: { zh: switchImagePaths(draft.body.zh), en: switchImagePaths(draft.body.en) },
      });
      setAssetStatus("图片已上传到 R2，正文与封面路径已切换为 /media。 ");
    } catch {
      setAssetStatus("上传失败或登录已过期，请重新登录写作台后重试。 ");
    }
  };

  const exportPublishPackage = async () => {
    if (!canPackage || packageStatus !== "idle") return;
    setPackageStatus("packing");
    setAssetStatus("正在生成发布包…");
    try {
      const archive = await createPublishPackage(draft, completedLocales, coverAssets, bodyAssets);
      downloadBlob(archive, `${draft.slug}-publish.zip`);
      setAssetStatus(`发布包已生成：${completedLocales.map((item) => item === "zh" ? "中文" : "English").join(" + ")}。`);
    } catch {
      setAssetStatus("发布包生成失败，请重试。 ");
    } finally {
      setPackageStatus("idle");
    }
  };

  const backupWorkspace = async () => {
    if (packageStatus !== "idle") return;
    setPackageStatus("backup");
    setAssetStatus("正在备份全部草稿与图片…");
    try {
      let storedAssets: StoredDraftAssets[];
      if (storageReady) {
        await writeStudioState(state);
        await writeStudioAssets({
          draftId: draft.id,
          cover: coverAssets.map(toStoredImage),
          body: bodyAssets.map(toStoredBodyImage),
        });
        storedAssets = await readAllStudioAssets();
      } else {
        storedAssets = [{
          draftId: draft.id,
          cover: coverAssets.map(toStoredImage),
          body: bodyAssets.map(toStoredBodyImage),
        }];
      }
      const archive = await createWorkspaceBackup(state, storedAssets);
      downloadBlob(archive, `omniblog-studio-${new Date().toISOString().slice(0, 10)}.zip`);
      setAssetStatus(`已备份 ${state.drafts.length} 篇草稿。`);
    } catch {
      setAssetStatus("备份失败，请确认浏览器允许本地存储后重试。 ");
    } finally {
      setPackageStatus("idle");
    }
  };

  const restoreWorkspace = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || packageStatus !== "idle") return;
    if (!window.confirm("恢复备份会替换当前浏览器中的全部草稿与图片，是否继续？")) return;
    setPackageStatus("restoring");
    setAssetStatus("正在恢复写作台备份…");
    try {
      const restored = await parseWorkspaceBackup(file);
      await replaceStudioWorkspace(restored.state, restored.assets);
      localStorage.setItem(storageKey, JSON.stringify(restored.state));
      setState(restored.state);
      setStorageReady(true);
      setAssetReloadVersion((value) => value + 1);
      setSaveStatus("saved");
      setAssetStatus(`已恢复 ${restored.state.drafts.length} 篇草稿。`);
    } catch {
      setAssetStatus("恢复失败：请选择由写作台导出的完整备份 ZIP。 ");
    } finally {
      setPackageStatus("idle");
    }
  };

  const wordCount = useMemo(() => draft.body[locale].replace(/\s+/g, "").length, [draft.body, locale]);
  const saveStatusLabel = {
    loading: "正在恢复…",
    saving: "正在保存…",
    saved: "草稿与图片已保存",
    local: "仅文字已保存",
    error: "保存失败",
  }[saveStatus];

  return (
    <main className="studio-page">
      <header className="studio-topbar">
        <TransitionLink to="/zh" className="studio-back"><ArrowLeft aria-hidden="true" />返回博客</TransitionLink>
        <div className="studio-topbar-document">
          <strong>{draft.title[locale] || "未命名草稿"}</strong>
          <span>{locale === "zh" ? "中文" : "English"} · {wordCount} 字</span>
        </div>
        <div className="studio-topbar-actions">
          <span className={`studio-save-state is-${saveStatus}`} aria-live="polite">
            {saveStatus === "loading" || saveStatus === "saving"
              ? <LoaderCircle className="is-spinning" aria-hidden="true" />
              : saveStatus === "error" || saveStatus === "local"
                ? <CircleAlert aria-hidden="true" />
                : <Check aria-hidden="true" />}
            {saveStatusLabel}
          </span>
          <button type="button" className="studio-topbar-button" onClick={() => setPreview((value) => !value)}>
            {preview ? <PenLine aria-hidden="true" /> : <Eye aria-hidden="true" />}<span>{preview ? "继续编辑" : "预览"}</span>
          </button>
          <button type="button" className="studio-topbar-button is-primary" disabled={!canPackage || packageStatus !== "idle"} onClick={() => void exportPublishPackage()} title={canPackage ? "下载完整发布包" : "请先补全一种语言的发布必填项"}>
            {packageStatus === "packing" ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <Package aria-hidden="true" />}<span>发布包</span>
          </button>
          <form className="studio-logout" action="/api/studio/logout" method="post">
            <button type="submit" className="studio-topbar-button" title="退出写作台"><LogOut aria-hidden="true" /><span>退出</span></button>
          </form>
          <button type="button" className="icon-button" onClick={toggleTheme} aria-label="切换主题">
            {theme === "light" ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
          </button>
        </div>
      </header>

      <div className="studio-shell">
        <aside className="studio-sidebar">
          <div className="studio-sidebar-head">
            <div><span>OMNI / JOURNAL</span><h1>写作台</h1></div>
          </div>
          <button type="button" className="studio-new-draft" onClick={addDraft}><FilePlus2 aria-hidden="true" />新建文章</button>
          <div className="studio-sidebar-label"><span>本地草稿</span><strong>{state.drafts.length}</strong></div>
          <div className="studio-drafts">
            {state.drafts.map((item) => (
              <button
                key={item.id}
                type="button"
                className={item.id === draft.id ? "is-active" : ""}
                onClick={() => {
                  if (item.id === draft.id) return;
                  setState((current) => ({ ...current, activeId: item.id }));
                }}
              >
                <span>{item.title.zh || item.title.en || "未命名草稿"}</span>
                <time>{new Date(item.updatedAt).toLocaleDateString("zh-CN")}</time>
              </button>
            ))}
          </div>
          <div className="studio-backup-actions">
            <button type="button" disabled={packageStatus !== "idle"} onClick={() => void backupWorkspace()}>
              {packageStatus === "backup" ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <Download aria-hidden="true" />}备份
            </button>
            <label className={packageStatus !== "idle" ? "is-disabled" : ""}>
              {packageStatus === "restoring" ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <ArchiveRestore aria-hidden="true" />}恢复
              <input type="file" accept=".zip,application/zip" disabled={packageStatus !== "idle"} onChange={(event) => void restoreWorkspace(event)} />
            </label>
          </div>
          <p className="studio-local-note">草稿与图片保存在当前浏览器。建议定期下载完整备份。</p>
        </aside>

        <section className="studio-editor">
          <div className="studio-editor-head">
            <div>
              <span>DRAFT / {draft.date.replaceAll("-", ".")}</span>
              <h2>{draft.title[locale] || "开始一篇新文章"}</h2>
              <p>{locale === "zh" ? "中文写作" : "English writing"} · {wordCount} 字 · 自动保存</p>
            </div>
            <button type="button" className="studio-delete" onClick={deleteDraft}><Trash2 aria-hidden="true" />删除草稿</button>
          </div>

          <div className="studio-workspace">
            <div className="studio-writing-column">
              <section className="studio-panel studio-content-panel" aria-labelledby="studio-content-title">
                <div className="studio-content-toolbar">
                  <div className="studio-panel-title"><span>CONTENT</span><h3 id="studio-content-title">文章内容</h3></div>
                  <div className="studio-language-tabs" role="tablist" aria-label="文章语言">
                    <button type="button" role="tab" aria-selected={locale === "zh"} className={locale === "zh" ? "is-active" : ""} onClick={() => setLocale("zh")}>中文</button>
                    <button type="button" role="tab" aria-selected={locale === "en"} className={locale === "en" ? "is-active" : ""} onClick={() => setLocale("en")}>English <span>可后补</span></button>
                  </div>
                </div>

                <div className="studio-content-fields">
                  <label className="studio-title-field">标题<input value={draft.title[locale]} onChange={(event) => updateLocalized("title", event.target.value)} placeholder={locale === "zh" ? "给文章起一个清晰的标题" : "Give the article a clear title"} /></label>
                  <label className="studio-summary-field">摘要<textarea rows={2} value={draft.summary[locale]} onChange={(event) => updateLocalized("summary", event.target.value)} placeholder="用一两句话说明这篇文章为什么值得读。" /></label>
                  <div className="studio-body-field">
                    <div className="studio-body-label"><label htmlFor="studio-body-editor">正文</label><small>{wordCount} 字</small></div>
                    {preview ? (
                      <div className="studio-markdown-preview">
                        <Markdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            img: ({ src, alt = "", ...props }) => {
                              const localAsset = bodyAssets.find((asset) => src?.endsWith(`/${asset.filename}`));
                              return <img {...props} src={localAsset?.url ?? src} alt={alt} loading="lazy" />;
                            },
                          }}
                        >
                          {draft.body[locale] || "在这里预览 Markdown 正文。"}
                        </Markdown>
                      </div>
                    ) : (
                      <div className={`studio-composer${isDraggingImage ? " is-dragging" : ""}`}>
                        <div className="studio-composer-toolbar" aria-label="正文插入工具">
                          <button type="button" onClick={() => { rememberCaret(); bodyImageInputRef.current?.click(); }}><ImagePlus aria-hidden="true" />图片</button>
                          <div className="studio-emoji-control">
                            <button type="button" aria-expanded={emojiOpen} aria-controls="studio-emoji-picker" onClick={() => { rememberCaret(); setEmojiOpen((value) => !value); }}><Smile aria-hidden="true" />表情</button>
                            {emojiOpen ? (
                              <div id="studio-emoji-picker" className="studio-emoji-picker" role="dialog" aria-label="选择表情" onKeyDown={(event) => { if (event.key === "Escape") setEmojiOpen(false); }}>
                                <span>常用表情</span>
                                <div>{emojis.map(([emoji, label]) => <button key={emoji} type="button" aria-label={label} title={label} onClick={() => insertBodyText(emoji)}>{emoji}</button>)}</div>
                              </div>
                            ) : null}
                          </div>
                          <span>支持粘贴或拖入图片</span>
                          <input ref={bodyImageInputRef} className="sr-only" type="file" accept="image/*" multiple tabIndex={-1} onChange={processBodyImage} />
                        </div>
                        <textarea
                          id="studio-body-editor"
                          ref={bodyEditorRef}
                          rows={24}
                          value={draft.body[locale]}
                          onChange={(event) => { updateLocalized("body", event.target.value); caretRef.current = { start: event.target.selectionStart, end: event.target.selectionEnd }; }}
                          onSelect={rememberCaret}
                          onKeyUp={rememberCaret}
                          onPaste={handleBodyPaste}
                          onKeyDown={(event) => { if (event.key === "Escape") setEmojiOpen(false); }}
                          onDragEnter={(event) => { if (event.dataTransfer.types.includes("Files")) setIsDraggingImage(true); }}
                          onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }}
                          onDragLeave={() => setIsDraggingImage(false)}
                          onDrop={handleBodyDrop}
                          placeholder={"从这里开始写作…\n\n## 第一个小标题\n\n继续写下去。"}
                        />
                        {isDraggingImage ? <div className="studio-drop-overlay"><ImagePlus aria-hidden="true" /><strong>松开以插入图片</strong></div> : null}
                      </div>
                    )}
                  </div>
                </div>
              </section>

              <section className="studio-panel studio-media-panel" aria-labelledby="studio-image-title">
                <div className="studio-panel-title"><span>MEDIA</span><h3 id="studio-image-title">文章图片</h3></div>
            <div className="studio-image-grid">
              <label className="studio-dropzone"><FileImage aria-hidden="true" /><strong>处理封面</strong><span>自动输出 1600×1000、800×500、1200×630 WebP</span><input type="file" accept="image/*" onChange={processCover} /></label>
              <label className="studio-dropzone"><FileImage aria-hidden="true" /><strong>处理正文图片</strong><span>支持多选，压缩后自动插入到正文光标处</span><input type="file" accept="image/*" multiple onChange={processBodyImage} /></label>
            </div>
            {coverAssets.length ? <div className="studio-assets">{coverAssets.map((asset) => <button key={asset.filename} type="button" onClick={() => downloadBlob(asset.blob, asset.filename)}><img src={asset.url} alt="" /><span>{asset.filename}<small>{asset.width} × {asset.height}</small></span><Download aria-hidden="true" /></button>)}</div> : null}
            {bodyAssets.length ? (
              <div className="studio-body-assets">
                {bodyAssets.map((asset) => (
                  <div className="studio-body-asset" key={asset.filename}>
                    <img src={asset.url} alt={asset.alt} />
                    <div>
                      <label>图片替代文字<input value={asset.alt} onChange={(event) => updateBodyAlt(asset, event.target.value.replace(/[\[\]]/g, ""))} /></label>
                      <code>{bodySnippet(asset)}</code>
                      <div><button type="button" onClick={() => copyBodySnippet(asset)}>{copiedAsset === asset.filename ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{copiedAsset === asset.filename ? "已复制" : "复制 Markdown"}</button><button type="button" onClick={() => downloadBlob(asset.blob, asset.filename)}><Download aria-hidden="true" />下载图片</button></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
                <details className="studio-cloud-details">
                  <summary><span><UploadCloud aria-hidden="true" />上传到 Cloudflare R2</span><ChevronDown aria-hidden="true" /></summary>
                  <div className="studio-cloud-upload">
                    <p>使用当前写作台登录会话鉴权，无需再次输入 Token。</p>
                    <button type="button" onClick={uploadAssets}><UploadCloud aria-hidden="true" />上传图片</button>
                  </div>
                </details>
                <p className="studio-status" aria-live="polite">{assetStatus}</p>
              </section>
            </div>

            <aside className="studio-inspector" aria-label="发布设置">
              <section className="studio-panel studio-publish-panel" aria-labelledby="studio-meta-title">
                <div className="studio-panel-title"><span>SETTINGS</span><h3 id="studio-meta-title">发布设置</h3></div>
                <div className="studio-meta-grid">
                  <label>Slug<input value={draft.slug} onChange={(event) => updateDraft({ slug: event.target.value.toLocaleLowerCase().replace(/[^a-z0-9-]/g, "-") })} placeholder="my-new-story" /></label>
                  <label>发布日期<input type="date" value={draft.date} onChange={(event) => updateDraft({ date: event.target.value })} /></label>
                  <label>分类<span className="studio-select"><select value={draft.category} onChange={(event) => updateDraft({ category: event.target.value })}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name.zh} / {category.name.en}</option>)}</select><ChevronDown aria-hidden="true" /></span></label>
                  <label>阅读分钟<input type="number" min="1" max="120" value={draft.readMinutes} onChange={(event) => updateDraft({ readMinutes: Number(event.target.value) })} /></label>
                  <label>标签<input value={draft.tags[locale]} onChange={(event) => updateLocalized("tags", event.target.value)} placeholder="设计, 注意力, 写作" /></label>
                  <label>系列<input value={draft.series[locale]} onChange={(event) => updateLocalized("series", event.target.value)} placeholder="可选" /></label>
                  <label>封面替代文字<input value={draft.coverAlt[locale]} onChange={(event) => updateLocalized("coverAlt", event.target.value)} placeholder="准确描述图片内容" /></label>
                </div>
                <details className="studio-advanced">
                  <summary><span>资源路径</span><ChevronDown aria-hidden="true" /></summary>
                  <label>封面路径<input value={draft.cover} onChange={(event) => updateDraft({ cover: event.target.value })} placeholder="/images/articles/slug/cover.webp" /></label>
                </details>
              </section>

              <section className="studio-export">
                <div><span>MARKDOWN + MEDIA</span><h3>准备发布</h3><p>一次打包文章与全部图片，保持正确的项目目录。</p></div>
                <div>
                  <div className="studio-export-actions">
                    <button type="button" disabled={!canPackage || packageStatus !== "idle"} onClick={() => void exportPublishPackage()}>
                      {packageStatus === "packing" ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <Package aria-hidden="true" />}下载完整发布包
                    </button>
                    <button type="button" className="is-secondary" disabled={!canExport || packageStatus !== "idle"} onClick={() => downloadMarkdown(draft, locale)}><Download aria-hidden="true" />仅下载 {locale.toUpperCase()} Markdown</button>
                  </div>
                  <small>{canPackage ? `将包含 ${completedLocales.length} 个 Markdown 文件和 ${coverAssets.length + bodyAssets.length} 张图片。` : "补全一种语言的标题、摘要、正文、封面和替代文字后即可打包。"}</small>
                </div>
              </section>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
