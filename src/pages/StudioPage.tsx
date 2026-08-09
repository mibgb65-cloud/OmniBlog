import {
  ArchiveRestore,
  ArrowLeft,
  Check,
  ChevronDown,
  CircleAlert,
  Copy,
  Download,
  Eye,
  ExternalLink,
  FileImage,
  FilePlus2,
  Files,
  FolderInput,
  ImagePlus,
  Layers3,
  ListFilter,
  LogOut,
  LoaderCircle,
  Moon,
  Package,
  PenLine,
  Plus,
  Search,
  Smile,
  Sun,
  Tags,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { strFromU8, strToU8, unzip, zip } from "fflate";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent, type DragEvent, type FormEvent } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { categories as defaultCategories, type Category } from "../categories";
import { stories, type Story } from "../articles";
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
  categories: Category[];
  series: StudioSeries[];
};

type StudioSeries = {
  id: string;
  name: LocalizedDraft;
};

type CategoryForm = {
  id: string;
  nameZh: string;
  nameEn: string;
  descriptionZh: string;
  descriptionEn: string;
};

type SeriesForm = {
  id: string;
  nameZh: string;
  nameEn: string;
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
type StudioView = "write" | "manage";
type ManagementSection = "articles" | "categories" | "series";
type ArticleFilter = "all" | "published" | "draft" | "pending";

type ManagedArticle = {
  key: string;
  status: Exclude<ArticleFilter, "all">;
  draft?: StudioDraft;
  story?: Story;
  slug: string;
  category: string;
  date: string;
  updatedAt: string;
  title: LocalizedDraft;
  summary: LocalizedDraft;
};

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
const emptyCategoryForm: CategoryForm = {
  id: "",
  nameZh: "",
  nameEn: "",
  descriptionZh: "",
  descriptionEn: "",
};
const emptySeriesForm: SeriesForm = { id: "", nameZh: "", nameEn: "" };

function copyDefaultCategories(): Category[] {
  return defaultCategories.map((category) => ({
    ...category,
    name: { ...category.name },
    description: { ...category.description },
  }));
}

function createDraft(category = defaultCategories[0]?.id ?? "notes"): StudioDraft {
  const id = crypto.randomUUID();
  return {
    id,
    slug: "",
    date: new Date().toISOString().slice(0, 10),
    category,
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

function createDraftFromStory(story: Story): StudioDraft {
  return {
    id: crypto.randomUUID(),
    slug: story.slug,
    date: story.date,
    category: story.categoryId,
    readMinutes: Number.parseInt(story.readTime.en, 10) || 6,
    cover: story.cover.src,
    title: { ...story.title },
    summary: { ...story.summary },
    coverAlt: { ...story.cover.alt },
    body: { ...story.body },
    tags: { zh: story.tags.zh.join(", "), en: story.tags.en.join(", ") },
    series: { zh: story.series.zh ?? "", en: story.series.en ?? "" },
    updatedAt: new Date().toISOString(),
  };
}

function discoverSeries(drafts: StudioDraft[]): StudioSeries[] {
  const names = [
    ...stories.map((story) => ({ zh: story.series.zh ?? "", en: story.series.en ?? "" })),
    ...drafts.map((draft) => ({ zh: draft.series.zh.trim(), en: draft.series.en.trim() })),
  ].filter((name) => name.zh || name.en);
  const catalog: StudioSeries[] = [];
  const usedIds = new Set<string>();
  names.forEach((name) => {
    if (catalog.some((item) => item.name.zh === name.zh && item.name.en === name.en)) return;
    const preferredId = name.en.toLocaleLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "") || `series-${catalog.length + 1}`;
    let id = preferredId;
    let suffix = 2;
    while (usedIds.has(id)) id = `${preferredId}-${suffix++}`;
    usedIds.add(id);
    catalog.push({ id, name: { ...name } });
  });
  return catalog;
}

function loadStudioState(): StudioState {
  try {
    const saved = normalizeStudioState(JSON.parse(localStorage.getItem(storageKey) ?? "null"));
    if (saved) return saved;
  } catch {
    // Start with a clean draft if local data is malformed.
  }
  const draft = createDraft();
  return { drafts: [draft], activeId: draft.id, categories: copyDefaultCategories(), series: discoverSeries([draft]) };
}

function splitTags(value: string) {
  return value.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean);
}

function seriesNameMatches(value: LocalizedDraft, series: StudioSeries) {
  return (["zh", "en"] as Locale[]).some((locale) => {
    const currentName = value[locale].trim();
    return Boolean(currentName && currentName === series.name[locale].trim());
  });
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

function isCategory(value: unknown): value is Category {
  if (!value || typeof value !== "object") return false;
  const category = value as Partial<Category>;
  return typeof category.id === "string"
    && /^[a-z0-9-]+$/.test(category.id)
    && isLocalizedDraft(category.name)
    && isLocalizedDraft(category.description);
}

function isStudioSeries(value: unknown): value is StudioSeries {
  if (!value || typeof value !== "object") return false;
  const series = value as Partial<StudioSeries>;
  return typeof series.id === "string"
    && /^[a-z0-9-]+$/.test(series.id)
    && isLocalizedDraft(series.name);
}

function isStudioDraft(value: unknown): value is StudioDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<StudioDraft>;
  return typeof draft.id === "string"
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
    && isLocalizedDraft(draft.series);
}

function normalizeStudioState(value: unknown): StudioState | null {
  if (!value || typeof value !== "object") return null;
  const state = value as { drafts?: unknown; activeId?: unknown; categories?: unknown; series?: unknown };
  if (!Array.isArray(state.drafts) || !state.drafts.length || !state.drafts.every(isStudioDraft) || typeof state.activeId !== "string") return null;
  if (!state.drafts.some((draft) => draft.id === state.activeId)) return null;

  const managedCategories = Array.isArray(state.categories) && state.categories.length && state.categories.every(isCategory)
    ? state.categories.map((category) => ({ ...category, name: { ...category.name }, description: { ...category.description } }))
    : copyDefaultCategories();
  if (new Set(managedCategories.map((category) => category.id)).size !== managedCategories.length) return null;
  if (state.drafts.some((draft) => !managedCategories.some((category) => category.id === draft.category))) return null;

  const managedSeries = Array.isArray(state.series) && state.series.every(isStudioSeries)
    ? state.series.map((series) => ({ ...series, name: { ...series.name } }))
    : discoverSeries(state.drafts);
  if (new Set(managedSeries.map((series) => series.id)).size !== managedSeries.length) return null;

  return { drafts: state.drafts, activeId: state.activeId, categories: managedCategories, series: managedSeries };
}

async function createPublishPackage(
  draft: StudioDraft,
  locales: Locale[],
  coverAssets: ImageAsset[],
  bodyAssets: BodyImageAsset[],
  managedCategories: Category[],
) {
  const files: Record<string, Uint8Array> = {};
  locales.forEach((locale) => {
    files[`content/articles/${draft.slug}.${locale}.md`] = strToU8(buildMarkdown(draft, locale));
  });
  for (const asset of [...coverAssets, ...bodyAssets]) {
    files[`public/images/articles/${draft.slug}/${asset.filename}`] = new Uint8Array(await asset.blob.arrayBuffer());
  }
  files["content/categories.json"] = strToU8(`${JSON.stringify(managedCategories, null, 2)}\n`);
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
  const normalizedState = normalizeStudioState(manifest.state);
  if (manifest.version !== 1 || !normalizedState || !Array.isArray(manifest.assets)) {
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
  return { state: normalizedState, assets };
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
  const [categoryForm, setCategoryForm] = useState<CategoryForm>(emptyCategoryForm);
  const [categoryStatus, setCategoryStatus] = useState("");
  const [view, setView] = useState<StudioView>("write");
  const [managementSection, setManagementSection] = useState<ManagementSection>("articles");
  const [articleFilter, setArticleFilter] = useState<ArticleFilter>("all");
  const [articleQuery, setArticleQuery] = useState("");
  const [articleCategory, setArticleCategory] = useState("all");
  const [selectedArticleKeys, setSelectedArticleKeys] = useState<Set<string>>(() => new Set());
  const [moveCategory, setMoveCategory] = useState(defaultCategories[0]?.id ?? "notes");
  const [managerStatus, setManagerStatus] = useState("");
  const [managerCategoryQuery, setManagerCategoryQuery] = useState("");
  const [managerCategoryForm, setManagerCategoryForm] = useState<CategoryForm>(emptyCategoryForm);
  const [editingCategoryId, setEditingCategoryId] = useState("");
  const [seriesQuery, setSeriesQuery] = useState("");
  const [seriesForm, setSeriesForm] = useState<SeriesForm>(emptySeriesForm);
  const [editingSeriesId, setEditingSeriesId] = useState("");
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
  const categoryUsage = useMemo(() => new Map(state.categories.map((category) => [category.id, {
    published: stories.filter((story) => story.categoryId === category.id).length,
    drafts: state.drafts.filter((item) => item.category === category.id).length,
  }])), [state.categories, state.drafts]);
  const managedArticles = useMemo<ManagedArticle[]>(() => {
    const matchedDraftIds = new Set<string>();
    const publishedArticles = stories.map((story): ManagedArticle => {
      const localDraft = state.drafts.find((item) => item.slug === story.slug && !matchedDraftIds.has(item.id));
      if (localDraft) matchedDraftIds.add(localDraft.id);
      return {
        key: localDraft ? `draft:${localDraft.id}` : `published:${story.slug}`,
        status: localDraft ? "pending" : "published",
        draft: localDraft,
        story,
        slug: story.slug,
        category: localDraft?.category ?? story.categoryId,
        date: localDraft?.date ?? story.date,
        updatedAt: localDraft?.updatedAt ?? `${story.date}T00:00:00.000Z`,
        title: {
          zh: localDraft?.title.zh || story.title.zh,
          en: localDraft?.title.en || story.title.en,
        },
        summary: {
          zh: localDraft?.summary.zh || story.summary.zh,
          en: localDraft?.summary.en || story.summary.en,
        },
      };
    });
    const localArticles = state.drafts
      .filter((item) => !matchedDraftIds.has(item.id))
      .map((item): ManagedArticle => ({
        key: `draft:${item.id}`,
        status: "draft",
        draft: item,
        slug: item.slug,
        category: item.category,
        date: item.date,
        updatedAt: item.updatedAt,
        title: { ...item.title },
        summary: { ...item.summary },
      }));
    return [...publishedArticles, ...localArticles]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }, [state.drafts]);
  const visibleManagedArticles = useMemo(() => {
    const query = articleQuery.trim().toLocaleLowerCase();
    return managedArticles.filter((item) => {
      if (articleFilter !== "all" && item.status !== articleFilter) return false;
      if (articleCategory !== "all" && item.category !== articleCategory) return false;
      if (!query) return true;
      return [item.title.zh, item.title.en, item.summary.zh, item.summary.en, item.slug]
        .some((value) => value.toLocaleLowerCase().includes(query));
    });
  }, [articleCategory, articleFilter, articleQuery, managedArticles]);
  const selectedManagedArticles = managedArticles.filter((item) => selectedArticleKeys.has(item.key));
  const selectedDraftCount = selectedManagedArticles.filter((item) => item.draft).length;
  const activeMoveCategory = state.categories.some((category) => category.id === moveCategory)
    ? moveCategory
    : state.categories[0]?.id ?? "";
  const articleCounts = useMemo(() => ({
    published: managedArticles.filter((item) => item.status === "published").length,
    draft: managedArticles.filter((item) => item.status === "draft").length,
    pending: managedArticles.filter((item) => item.status === "pending").length,
  }), [managedArticles]);
  const seriesUsage = useMemo(() => new Map(state.series.map((series) => [series.id, {
    published: stories.filter((story) => seriesNameMatches({ zh: story.series.zh ?? "", en: story.series.en ?? "" }, series)).length,
    drafts: state.drafts.filter((item) => seriesNameMatches(item.series, series)).length,
  }])), [state.drafts, state.series]);
  const visibleCategories = useMemo(() => {
    const query = managerCategoryQuery.trim().toLocaleLowerCase();
    if (!query) return state.categories;
    return state.categories.filter((category) => [category.id, category.name.zh, category.name.en, category.description.zh, category.description.en]
      .some((value) => value.toLocaleLowerCase().includes(query)));
  }, [managerCategoryQuery, state.categories]);
  const visibleSeries = useMemo(() => {
    const query = seriesQuery.trim().toLocaleLowerCase();
    if (!query) return state.series;
    return state.series.filter((series) => [series.id, series.name.zh, series.name.en]
      .some((value) => value.toLocaleLowerCase().includes(query)));
  }, [seriesQuery, state.series]);
  const managerHeading = {
    articles: { eyebrow: `LIBRARY / ${managedArticles.length} ARTICLES`, title: "全部文章", description: "统一查看本地草稿与已发布文章，筛选后可批量移动到其他分类。" },
    categories: { eyebrow: `TAXONOMY / ${state.categories.length} CATEGORIES`, title: "分类管理", description: "维护文章分类的中英文名称与简介，并查看每个分类的占用情况。" },
    series: { eyebrow: `COLLECTIONS / ${state.series.length} SERIES`, title: "系列管理", description: "集中维护系列名称；修改已发布系列时会自动建立待更新稿。" },
  }[managementSection];
  const managerItemCount = managementSection === "articles"
    ? managedArticles.length
    : managementSection === "categories"
      ? state.categories.length
      : state.series.length;

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
        const stored = await readStudioState<unknown>();
        const nextState = normalizeStudioState(stored) ?? initialStateRef.current;
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
    setState((current) => {
      const next = createDraft(current.categories[0]?.id);
      return { ...current, drafts: [next, ...current.drafts], activeId: next.id };
    });
    setView("write");
    setPreview(false);
  };

  const openDraft = (draftId: string) => {
    setState((current) => ({ ...current, activeId: draftId }));
    setView("write");
    setPreview(false);
  };

  const editPublishedStory = (story: Story) => {
    setState((current) => {
      const existing = current.drafts.find((item) => item.slug === story.slug);
      if (existing) return { ...current, activeId: existing.id };
      const next = createDraftFromStory(story);
      return { ...current, drafts: [next, ...current.drafts], activeId: next.id };
    });
    setView("write");
    setPreview(false);
  };

  const toggleArticleSelection = (key: string) => {
    setSelectedArticleKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const allVisibleSelected = visibleManagedArticles.length > 0
    && visibleManagedArticles.every((item) => selectedArticleKeys.has(item.key));

  const toggleVisibleArticles = () => {
    setSelectedArticleKeys((current) => {
      const next = new Set(current);
      visibleManagedArticles.forEach((item) => {
        if (allVisibleSelected) next.delete(item.key);
        else next.add(item.key);
      });
      return next;
    });
  };

  const moveSelectedArticles = () => {
    if (!selectedManagedArticles.length || !activeMoveCategory) return;
    const articlesToMove = selectedManagedArticles.filter((item) => item.category !== activeMoveCategory);
    if (!articlesToMove.length) {
      setManagerStatus("所选文章已经在这个分类中。 ");
      return;
    }
    const selectedDraftIds = new Set(articlesToMove.flatMap((item) => item.draft ? [item.draft.id] : []));
    const publishedToImport = articlesToMove.flatMap((item) => !item.draft && item.story ? [item.story] : []);
    const now = new Date().toISOString();
    setState((current) => {
      const nextDrafts = current.drafts.map((item) => selectedDraftIds.has(item.id)
        ? { ...item, category: activeMoveCategory, updatedAt: now }
        : item);
      const existingSlugs = new Set(nextDrafts.map((item) => item.slug));
      const imported = publishedToImport
        .filter((story) => !existingSlugs.has(story.slug))
        .map((story) => ({ ...createDraftFromStory(story), category: activeMoveCategory, updatedAt: now }));
      return { ...current, drafts: [...imported, ...nextDrafts] };
    });
    const categoryName = state.categories.find((category) => category.id === activeMoveCategory)?.name.zh ?? activeMoveCategory;
    setManagerStatus(`已将 ${articlesToMove.length} 篇文章移至“${categoryName}”。已发布文章已生成待更新稿，重新发布后线上生效。`);
    setSelectedArticleKeys(new Set());
  };

  const deleteSelectedDrafts = () => {
    const draftIds = selectedManagedArticles.flatMap((item) => item.draft ? [item.draft.id] : []);
    if (!draftIds.length) return;
    if (!window.confirm(`确定删除选中的 ${draftIds.length} 篇本地稿吗？已发布原文不会被删除。`)) return;
    const deletedIds = new Set(draftIds);
    setState((current) => {
      const remaining = current.drafts.filter((item) => !deletedIds.has(item.id));
      const nextDrafts = remaining.length ? remaining : [createDraft(current.categories[0]?.id)];
      const activeId = deletedIds.has(current.activeId) ? nextDrafts[0].id : current.activeId;
      return { ...current, drafts: nextDrafts, activeId };
    });
    if (storageReady) {
      void persistOperation((async () => {
        await Promise.all(draftIds.map((draftId) => deleteStudioAssets(draftId)));
      })());
    }
    setManagerStatus(`已删除 ${draftIds.length} 篇本地稿；已发布原文保持不变。`);
    setSelectedArticleKeys(new Set());
  };

  const deleteDraft = () => {
    if (!window.confirm("确定删除这个本地草稿吗？此操作无法撤销。")) return;
    const deletedDraftId = draft.id;
    setState((current) => {
      const remaining = current.drafts.filter((item) => item.id !== current.activeId);
      const nextDrafts = remaining.length ? remaining : [createDraft(current.categories[0]?.id)];
      return { ...current, drafts: nextDrafts, activeId: nextDrafts[0].id };
    });
    if (storageReady) void persistOperation(deleteStudioAssets(deletedDraftId));
  };

  const addCategory = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const id = categoryForm.id.trim().toLocaleLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "");
    const nameZh = categoryForm.nameZh.trim();
    const nameEn = categoryForm.nameEn.trim();
    if (!id || !nameZh || !nameEn) {
      setCategoryStatus("请填写分类标识、中英文名称。 ");
      return;
    }
    if (state.categories.some((category) => category.id === id)) {
      setCategoryStatus("这个分类标识已经存在，请换一个。 ");
      return;
    }
    const nextCategory: Category = {
      id,
      name: { zh: nameZh, en: nameEn },
      description: {
        zh: categoryForm.descriptionZh.trim() || `${nameZh}分类文章。`,
        en: categoryForm.descriptionEn.trim() || `${nameEn} stories.`,
      },
    };
    setState((current) => ({ ...current, categories: [...current.categories, nextCategory] }));
    setCategoryForm(emptyCategoryForm);
    setCategoryStatus(`已添加“${nameZh}”，可在上方选择。`);
  };

  const deleteCategory = (category: Category) => {
    const usage = categoryUsage.get(category.id);
    if ((usage?.published ?? 0) + (usage?.drafts ?? 0) > 0 || state.categories.length === 1) return;
    if (!window.confirm(`确定删除“${category.name.zh}”分类吗？`)) return;
    setState((current) => ({ ...current, categories: current.categories.filter((item) => item.id !== category.id) }));
    setCategoryStatus(`已删除“${category.name.zh}”。`);
    setManagerStatus(`已删除分类“${category.name.zh}”。`);
    if (editingCategoryId === category.id) {
      setEditingCategoryId("");
      setManagerCategoryForm(emptyCategoryForm);
    }
  };

  const editManagerCategory = (category: Category) => {
    setEditingCategoryId(category.id);
    setManagerCategoryForm({
      id: category.id,
      nameZh: category.name.zh,
      nameEn: category.name.en,
      descriptionZh: category.description.zh,
      descriptionEn: category.description.en,
    });
    setManagerStatus("");
  };

  const saveManagerCategory = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const id = managerCategoryForm.id.trim().toLocaleLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "");
    const nameZh = managerCategoryForm.nameZh.trim();
    const nameEn = managerCategoryForm.nameEn.trim();
    if (!id || !nameZh || !nameEn) {
      setManagerStatus("请填写分类标识、中英文名称。 ");
      return;
    }
    if (!editingCategoryId && state.categories.some((category) => category.id === id)) {
      setManagerStatus("这个分类标识已经存在，请换一个。 ");
      return;
    }
    const nextCategory: Category = {
      id: editingCategoryId || id,
      name: { zh: nameZh, en: nameEn },
      description: {
        zh: managerCategoryForm.descriptionZh.trim() || `${nameZh}分类文章。`,
        en: managerCategoryForm.descriptionEn.trim() || `${nameEn} stories.`,
      },
    };
    setState((current) => ({
      ...current,
      categories: editingCategoryId
        ? current.categories.map((category) => category.id === editingCategoryId ? nextCategory : category)
        : [...current.categories, nextCategory],
    }));
    setManagerStatus(editingCategoryId ? `已更新分类“${nameZh}”。` : `已创建分类“${nameZh}”。`);
    setEditingCategoryId("");
    setManagerCategoryForm(emptyCategoryForm);
  };

  const editSeries = (series: StudioSeries) => {
    setEditingSeriesId(series.id);
    setSeriesForm({ id: series.id, nameZh: series.name.zh, nameEn: series.name.en });
    setManagerStatus("");
  };

  const updateSeriesReferences = (current: StudioState, series: StudioSeries, nextName: LocalizedDraft | null) => {
    const now = new Date().toISOString();
    const matchingStories = stories.filter((story) => seriesNameMatches({ zh: story.series.zh ?? "", en: story.series.en ?? "" }, series));
    const nextDrafts = current.drafts.map((item) => seriesNameMatches(item.series, series)
      ? { ...item, series: nextName ? { ...nextName } : { zh: "", en: "" }, updatedAt: now }
      : item);
    const existingSlugs = new Set(nextDrafts.map((item) => item.slug));
    const imported = matchingStories
      .filter((story) => !existingSlugs.has(story.slug))
      .map((story) => ({
        ...createDraftFromStory(story),
        series: nextName ? { ...nextName } : { zh: "", en: "" },
        updatedAt: now,
      }));
    return [...imported, ...nextDrafts];
  };

  const saveSeries = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const id = seriesForm.id.trim().toLocaleLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "");
    const nameZh = seriesForm.nameZh.trim();
    const nameEn = seriesForm.nameEn.trim();
    if (!id || !nameZh || !nameEn) {
      setManagerStatus("请填写系列标识、中英文名称。 ");
      return;
    }
    if (!editingSeriesId && state.series.some((series) => series.id === id)) {
      setManagerStatus("这个系列标识已经存在，请换一个。 ");
      return;
    }
    const nextSeries: StudioSeries = { id: editingSeriesId || id, name: { zh: nameZh, en: nameEn } };
    const previousSeries = editingSeriesId ? state.series.find((series) => series.id === editingSeriesId) : undefined;
    const publishedCount = previousSeries ? seriesUsage.get(previousSeries.id)?.published ?? 0 : 0;
    setState((current) => {
      const drafts = previousSeries
        ? updateSeriesReferences(current, previousSeries, nextSeries.name)
        : current.drafts;
      return {
        ...current,
        drafts,
        series: editingSeriesId
          ? current.series.map((series) => series.id === editingSeriesId ? nextSeries : series)
          : [...current.series, nextSeries],
      };
    });
    setManagerStatus(editingSeriesId
      ? `已更新系列“${nameZh}”${publishedCount ? `，${publishedCount} 篇已发布文章已建立待更新稿` : ""}。`
      : `已创建系列“${nameZh}”。`);
    setEditingSeriesId("");
    setSeriesForm(emptySeriesForm);
  };

  const deleteSeries = (series: StudioSeries) => {
    const usage = seriesUsage.get(series.id) ?? { published: 0, drafts: 0 };
    const useCount = usage.published + usage.drafts;
    const message = useCount
      ? `“${series.name.zh}”正在被 ${useCount} 篇文章使用。删除后会从本地稿移除，并为已发布文章建立待更新稿，是否继续？`
      : `确定删除系列“${series.name.zh}”吗？`;
    if (!window.confirm(message)) return;
    setState((current) => {
      return {
        ...current,
        drafts: updateSeriesReferences(current, series, null),
        series: current.series.filter((item) => item.id !== series.id),
      };
    });
    setManagerStatus(`已删除系列“${series.name.zh}”${usage.published ? `，${usage.published} 篇已发布文章已建立待更新稿` : ""}。`);
    if (editingSeriesId === series.id) {
      setEditingSeriesId("");
      setSeriesForm(emptySeriesForm);
    }
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
      const archive = await createPublishPackage(draft, completedLocales, coverAssets, bodyAssets, state.categories);
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
          <strong>{view === "manage" ? managerHeading.title : draft.title[locale] || "未命名草稿"}</strong>
          <span>{view === "manage" ? `${managerItemCount} 项` : `${locale === "zh" ? "中文" : "English"} · ${wordCount} 字`}</span>
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
          {view === "write" ? (
            <>
              <button type="button" className="studio-topbar-button" onClick={() => setPreview((value) => !value)}>
                {preview ? <PenLine aria-hidden="true" /> : <Eye aria-hidden="true" />}<span>{preview ? "继续编辑" : "预览"}</span>
              </button>
              <button type="button" className="studio-topbar-button is-primary" disabled={!canPackage || packageStatus !== "idle"} onClick={() => void exportPublishPackage()} title={canPackage ? "下载完整发布包" : "请先补全一种语言的发布必填项"}>
                {packageStatus === "packing" ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <Package aria-hidden="true" />}<span>发布包</span>
              </button>
            </>
          ) : (
            <button type="button" className="studio-topbar-button is-primary" onClick={addDraft}><FilePlus2 aria-hidden="true" /><span>新建文章</span></button>
          )}
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
          <nav className="studio-mode-switch" aria-label="写作台功能">
            <button type="button" className={view === "write" ? "is-active" : ""} onClick={() => setView("write")}><PenLine aria-hidden="true" />写文章</button>
            <button type="button" className={view === "manage" ? "is-active" : ""} onClick={() => setView("manage")}><Files aria-hidden="true" />文章管理</button>
          </nav>
          <button type="button" className="studio-new-draft" onClick={addDraft}><FilePlus2 aria-hidden="true" />新建文章</button>
          <div className="studio-sidebar-label"><span>本地草稿</span><strong>{state.drafts.length}</strong></div>
          <div className="studio-drafts">
            {state.drafts.map((item) => (
              <button
                key={item.id}
                type="button"
                className={item.id === draft.id ? "is-active" : ""}
                onClick={() => {
                  if (item.id === draft.id && view === "write") return;
                  openDraft(item.id);
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

        {view === "manage" ? (
          <section className="studio-manager" aria-labelledby="studio-manager-title">
            <header className="studio-manager-head">
              <div>
                <span>{managerHeading.eyebrow}</span>
                <h2 id="studio-manager-title">{managerHeading.title}</h2>
                <p>{managerHeading.description}</p>
              </div>
              {managementSection === "articles" ? <button type="button" className="studio-manager-create" onClick={addDraft}><FilePlus2 aria-hidden="true" />新建文章</button> : null}
            </header>

            <nav className="studio-manager-sections" aria-label="管理内容">
              {([
                ["articles", "文章", Files],
                ["categories", "分类", Tags],
                ["series", "系列", Layers3],
              ] as const).map(([section, label, Icon]) => (
                <button key={section} type="button" className={managementSection === section ? "is-active" : ""} onClick={() => { setManagementSection(section); setManagerStatus(""); }}>
                  <Icon aria-hidden="true" />{label}
                </button>
              ))}
            </nav>

            {managementSection === "articles" ? (
              <>
            <div className="studio-manager-summary" aria-label="文章概览">
              <div><span>线上文章</span><strong>{stories.length}</strong><small>当前博客可见</small></div>
              <div><span>本地草稿</span><strong>{state.drafts.length}</strong><small>保存在此浏览器</small></div>
              <div><span>待更新</span><strong>{articleCounts.pending}</strong><small>与线上文章同 slug</small></div>
            </div>

            <section className="studio-library">
              <div className="studio-library-toolbar">
                <label className="studio-library-search">
                  <Search aria-hidden="true" />
                  <span className="sr-only">搜索文章</span>
                  <input value={articleQuery} onChange={(event) => setArticleQuery(event.target.value)} placeholder="搜索标题、摘要或 slug" />
                </label>
                <label className="studio-library-category">
                  <ListFilter aria-hidden="true" />
                  <span className="sr-only">按分类筛选</span>
                  <select value={articleCategory} onChange={(event) => setArticleCategory(event.target.value)}>
                    <option value="all">全部分类</option>
                    {state.categories.map((category) => <option key={category.id} value={category.id}>{category.name.zh} / {category.name.en}</option>)}
                  </select>
                  <ChevronDown aria-hidden="true" />
                </label>
              </div>

              <div className="studio-library-tabs" role="tablist" aria-label="文章状态">
                {([
                  ["all", "全部", managedArticles.length],
                  ["published", "仅已发布", articleCounts.published],
                  ["draft", "仅草稿", articleCounts.draft],
                  ["pending", "待更新", articleCounts.pending],
                ] as const).map(([filter, label, count]) => (
                  <button key={filter} type="button" role="tab" aria-selected={articleFilter === filter} className={articleFilter === filter ? "is-active" : ""} onClick={() => setArticleFilter(filter)}>
                    {label}<span>{count}</span>
                  </button>
                ))}
              </div>

              <div className={`studio-library-selection${selectedManagedArticles.length ? " has-selection" : ""}`}>
                <div>
                  <button type="button" onClick={toggleVisibleArticles} disabled={!visibleManagedArticles.length}>{allVisibleSelected ? "取消全选" : "全选当前结果"}</button>
                  <span>显示 {visibleManagedArticles.length} 篇{selectedManagedArticles.length ? ` · 已选 ${selectedManagedArticles.length} 篇` : ""}</span>
                </div>
                {selectedManagedArticles.length ? (
                  <div className="studio-library-bulk-actions">
                    <label>
                      <span className="sr-only">目标分类</span>
                      <select value={activeMoveCategory} onChange={(event) => setMoveCategory(event.target.value)}>
                        {state.categories.map((category) => <option key={category.id} value={category.id}>移至：{category.name.zh}</option>)}
                      </select>
                      <ChevronDown aria-hidden="true" />
                    </label>
                    <button type="button" className="is-primary" onClick={moveSelectedArticles}><FolderInput aria-hidden="true" />移动</button>
                    <button type="button" disabled={!selectedDraftCount} title={selectedDraftCount ? "删除选中的本地稿" : "已发布原文不能在浏览器中直接删除"} onClick={deleteSelectedDrafts}><Trash2 aria-hidden="true" />删除本地稿</button>
                  </div>
                ) : null}
              </div>

              {visibleManagedArticles.length ? (
                <div className="studio-article-table">
                  <div className="studio-article-row studio-article-table-head" aria-hidden="true">
                    <span />
                    <span>文章</span>
                    <span>分类</span>
                    <span>日期</span>
                    <span>操作</span>
                  </div>
                  {visibleManagedArticles.map((item) => {
                    const category = state.categories.find((candidate) => candidate.id === item.category);
                    const languages = (["zh", "en"] as Locale[]).filter((candidate) => item.draft
                      ? Boolean(item.draft.title[candidate] && item.draft.body[candidate])
                      : item.story?.availableLocales.includes(candidate));
                    const statusLabel = { published: "已发布", draft: "草稿", pending: "待更新" }[item.status];
                    return (
                      <article className={`studio-article-row is-${item.status}`} key={item.key}>
                        <label className="studio-article-check">
                          <input type="checkbox" checked={selectedArticleKeys.has(item.key)} onChange={() => toggleArticleSelection(item.key)} />
                          <span className="sr-only">选择 {item.title.zh || item.title.en || "未命名草稿"}</span>
                        </label>
                        <div className="studio-article-main">
                          <div><span className={`studio-article-status is-${item.status}`}>{statusLabel}</span>{languages.length ? <small>{languages.map((candidate) => candidate.toUpperCase()).join(" + ")}</small> : <small>内容未完成</small>}</div>
                          <h3>{item.title.zh || item.title.en || "未命名草稿"}</h3>
                          <p>{item.summary.zh || item.summary.en || "尚未填写文章摘要。"}</p>
                          <code>{item.slug || "尚未设置 slug"}</code>
                        </div>
                        <div className="studio-article-category" data-label="分类"><strong>{category?.name.zh ?? item.category}</strong><span>{category?.name.en ?? item.category}</span></div>
                        <time className="studio-article-date" dateTime={item.date} data-label="日期">{item.date}</time>
                        <div className="studio-article-actions">
                          {item.draft
                            ? <button type="button" onClick={() => openDraft(item.draft!.id)}><PenLine aria-hidden="true" />编辑</button>
                            : <button type="button" onClick={() => editPublishedStory(item.story!)}><FilePlus2 aria-hidden="true" />建立编辑稿</button>}
                          {item.story ? <a href={`/zh/stories/${item.story.slug}`} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" />查看</a> : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="studio-library-empty"><Files aria-hidden="true" /><strong>没有符合条件的文章</strong><span>换一个关键词、分类或状态试试。</span></div>
              )}

              <p className="studio-manager-status" aria-live="polite">{managerStatus}</p>
              <p className="studio-manager-note"><CircleAlert aria-hidden="true" />移动已发布文章时会建立待更新稿；下载发布包并重新部署后，线上分类才会变化。</p>
            </section>
              </>
            ) : managementSection === "categories" ? (
              <div className="studio-taxonomy-workspace">
                <section className="studio-taxonomy-panel" aria-labelledby="studio-categories-list-title">
                  <div className="studio-taxonomy-panel-head">
                    <div><span>CATEGORIES</span><h3 id="studio-categories-list-title">全部分类</h3></div>
                    <strong>{visibleCategories.length} / {state.categories.length}</strong>
                  </div>
                  <label className="studio-library-search studio-taxonomy-search">
                    <Search aria-hidden="true" /><span className="sr-only">搜索分类</span>
                    <input value={managerCategoryQuery} onChange={(event) => setManagerCategoryQuery(event.target.value)} placeholder="搜索名称、标识或简介" />
                  </label>
                  <div className="studio-taxonomy-list">
                    {visibleCategories.map((category) => {
                      const usage = categoryUsage.get(category.id) ?? { published: 0, drafts: 0 };
                      const useCount = usage.published + usage.drafts;
                      const onlyCategory = state.categories.length === 1;
                      const deleteDisabled = onlyCategory || useCount > 0;
                      const deleteReason = onlyCategory ? "至少保留一个分类" : useCount ? "请先移动占用该分类的文章" : "删除分类";
                      return (
                        <article className="studio-taxonomy-item" key={category.id}>
                          <div className="studio-taxonomy-icon"><Tags aria-hidden="true" /></div>
                          <div className="studio-taxonomy-content">
                            <div><h4>{category.name.zh}</h4><span>{category.name.en}</span></div>
                            <p>{category.description.zh}</p>
                            <small>{category.id} · 线上 {usage.published} · 本地稿 {usage.drafts}</small>
                          </div>
                          <div className="studio-taxonomy-actions">
                            <button type="button" onClick={() => editManagerCategory(category)}><PenLine aria-hidden="true" />编辑</button>
                            <button type="button" className="is-danger" disabled={deleteDisabled} title={deleteReason} onClick={() => deleteCategory(category)}><Trash2 aria-hidden="true" />删除</button>
                          </div>
                        </article>
                      );
                    })}
                    {!visibleCategories.length ? <div className="studio-taxonomy-empty">没有符合条件的分类。</div> : null}
                  </div>
                </section>

                <form className="studio-taxonomy-form" onSubmit={saveManagerCategory}>
                  <div className="studio-taxonomy-panel-head">
                    <div><span>{editingCategoryId ? "EDIT" : "NEW"}</span><h3>{editingCategoryId ? "编辑分类" : "新增分类"}</h3></div>
                    {editingCategoryId ? <button type="button" aria-label="取消编辑分类" onClick={() => { setEditingCategoryId(""); setManagerCategoryForm(emptyCategoryForm); }}><X aria-hidden="true" /></button> : null}
                  </div>
                  <p className="studio-taxonomy-help">分类标识用于文章元数据与分类路由，创建后保持不变。</p>
                  <label>分类标识<input value={managerCategoryForm.id} disabled={Boolean(editingCategoryId)} onChange={(event) => setManagerCategoryForm((current) => ({ ...current, id: event.target.value.toLocaleLowerCase().replace(/[^a-z0-9-]/g, "-") }))} placeholder="design" /></label>
                  <div className="studio-taxonomy-name-grid">
                    <label>中文名称<input value={managerCategoryForm.nameZh} onChange={(event) => setManagerCategoryForm((current) => ({ ...current, nameZh: event.target.value }))} placeholder="设计" /></label>
                    <label>英文名称<input value={managerCategoryForm.nameEn} onChange={(event) => setManagerCategoryForm((current) => ({ ...current, nameEn: event.target.value }))} placeholder="Design" /></label>
                  </div>
                  <label>中文简介<textarea rows={3} value={managerCategoryForm.descriptionZh} onChange={(event) => setManagerCategoryForm((current) => ({ ...current, descriptionZh: event.target.value }))} placeholder="关于界面、产品与视觉秩序的观察。" /></label>
                  <label>英文简介<textarea rows={3} value={managerCategoryForm.descriptionEn} onChange={(event) => setManagerCategoryForm((current) => ({ ...current, descriptionEn: event.target.value }))} placeholder="Observations on interfaces and visual order." /></label>
                  <button type="submit" className="studio-taxonomy-submit">{editingCategoryId ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}{editingCategoryId ? "保存分类" : "创建分类"}</button>
                  <p className="studio-manager-status" aria-live="polite">{managerStatus}</p>
                </form>
              </div>
            ) : (
              <div className="studio-taxonomy-workspace">
                <section className="studio-taxonomy-panel" aria-labelledby="studio-series-list-title">
                  <div className="studio-taxonomy-panel-head">
                    <div><span>SERIES</span><h3 id="studio-series-list-title">全部系列</h3></div>
                    <strong>{visibleSeries.length} / {state.series.length}</strong>
                  </div>
                  <label className="studio-library-search studio-taxonomy-search">
                    <Search aria-hidden="true" /><span className="sr-only">搜索系列</span>
                    <input value={seriesQuery} onChange={(event) => setSeriesQuery(event.target.value)} placeholder="搜索系列名称或标识" />
                  </label>
                  <div className="studio-taxonomy-list">
                    {visibleSeries.map((series) => {
                      const usage = seriesUsage.get(series.id) ?? { published: 0, drafts: 0 };
                      return (
                        <article className="studio-taxonomy-item" key={series.id}>
                          <div className="studio-taxonomy-icon"><Layers3 aria-hidden="true" /></div>
                          <div className="studio-taxonomy-content">
                            <div><h4>{series.name.zh}</h4><span>{series.name.en}</span></div>
                            <p>线上 {usage.published} 篇 · 本地稿 {usage.drafts} 篇</p>
                            <small>{series.id}</small>
                          </div>
                          <div className="studio-taxonomy-actions">
                            <button type="button" onClick={() => editSeries(series)}><PenLine aria-hidden="true" />编辑</button>
                            <button type="button" className="is-danger" onClick={() => deleteSeries(series)}><Trash2 aria-hidden="true" />删除</button>
                          </div>
                        </article>
                      );
                    })}
                    {!visibleSeries.length ? <div className="studio-taxonomy-empty">还没有系列，可从右侧创建第一个。</div> : null}
                  </div>
                </section>

                <form className="studio-taxonomy-form" onSubmit={saveSeries}>
                  <div className="studio-taxonomy-panel-head">
                    <div><span>{editingSeriesId ? "EDIT" : "NEW"}</span><h3>{editingSeriesId ? "编辑系列" : "新增系列"}</h3></div>
                    {editingSeriesId ? <button type="button" aria-label="取消编辑系列" onClick={() => { setEditingSeriesId(""); setSeriesForm(emptySeriesForm); }}><X aria-hidden="true" /></button> : null}
                  </div>
                  <p className="studio-taxonomy-help">重命名或删除使用中的系列，会同步更新本地稿并为线上文章建立待更新稿。</p>
                  <label>系列标识<input value={seriesForm.id} disabled={Boolean(editingSeriesId)} onChange={(event) => setSeriesForm((current) => ({ ...current, id: event.target.value.toLocaleLowerCase().replace(/[^a-z0-9-]/g, "-") }))} placeholder="design-notes" /></label>
                  <div className="studio-taxonomy-name-grid">
                    <label>中文名称<input value={seriesForm.nameZh} onChange={(event) => setSeriesForm((current) => ({ ...current, nameZh: event.target.value }))} placeholder="设计札记" /></label>
                    <label>英文名称<input value={seriesForm.nameEn} onChange={(event) => setSeriesForm((current) => ({ ...current, nameEn: event.target.value }))} placeholder="Design Notes" /></label>
                  </div>
                  <button type="submit" className="studio-taxonomy-submit">{editingSeriesId ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}{editingSeriesId ? "保存系列" : "创建系列"}</button>
                  <p className="studio-manager-status" aria-live="polite">{managerStatus}</p>
                </form>
              </div>
            )}
          </section>
        ) : (
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
                  <label>分类<span className="studio-select"><select value={draft.category} onChange={(event) => updateDraft({ category: event.target.value })}>{state.categories.map((category) => <option key={category.id} value={category.id}>{category.name.zh} / {category.name.en}</option>)}</select><ChevronDown aria-hidden="true" /></span></label>
                  <details className="studio-category-manager">
                    <summary><span><Tags aria-hidden="true" />管理分类</span><ChevronDown aria-hidden="true" /></summary>
                    <div className="studio-category-list">
                      {state.categories.map((category) => {
                        const usage = categoryUsage.get(category.id) ?? { published: 0, drafts: 0 };
                        const useCount = usage.published + usage.drafts;
                        const onlyCategory = state.categories.length === 1;
                        const deleteDisabled = useCount > 0 || onlyCategory;
                        const deleteReason = onlyCategory
                          ? "至少保留一个分类"
                          : usage.published
                            ? `${usage.published} 篇已发布文章正在使用`
                            : usage.drafts
                              ? `${usage.drafts} 篇草稿正在使用`
                              : "删除分类";
                        return (
                          <div className="studio-category-item" key={category.id}>
                            <div>
                              <strong>{category.name.zh}<span>{category.name.en}</span></strong>
                              <small>{category.id} · {useCount ? `${useCount} 篇占用` : "未使用"}</small>
                            </div>
                            <button type="button" disabled={deleteDisabled} title={deleteReason} aria-label={`${deleteReason}：${category.name.zh}`} onClick={() => deleteCategory(category)}><Trash2 aria-hidden="true" /></button>
                          </div>
                        );
                      })}
                    </div>
                    <form className="studio-category-form" autoComplete="off" onSubmit={addCategory}>
                      <div className="studio-category-form-head"><strong>新增分类</strong><span>简介可留空</span></div>
                      <label>分类标识<input value={categoryForm.id} onChange={(event) => setCategoryForm((current) => ({ ...current, id: event.target.value.toLocaleLowerCase().replace(/[^a-z0-9-]/g, "-") }))} placeholder="photography" /></label>
                      <div className="studio-category-name-grid">
                        <label>中文名称<input value={categoryForm.nameZh} onChange={(event) => setCategoryForm((current) => ({ ...current, nameZh: event.target.value }))} placeholder="摄影" /></label>
                        <label>英文名称<input value={categoryForm.nameEn} onChange={(event) => setCategoryForm((current) => ({ ...current, nameEn: event.target.value }))} placeholder="Photography" /></label>
                      </div>
                      <label>中文简介<input value={categoryForm.descriptionZh} onChange={(event) => setCategoryForm((current) => ({ ...current, descriptionZh: event.target.value }))} placeholder="关于影像与观看的记录。" /></label>
                      <label>英文简介<input value={categoryForm.descriptionEn} onChange={(event) => setCategoryForm((current) => ({ ...current, descriptionEn: event.target.value }))} placeholder="Notes on images and seeing." /></label>
                      <button type="submit"><Plus aria-hidden="true" />添加分类</button>
                    </form>
                    <p className="studio-category-status" aria-live="polite">{categoryStatus}</p>
                  </details>
                  <label>阅读分钟<input type="number" min="1" max="120" value={draft.readMinutes} onChange={(event) => updateDraft({ readMinutes: Number(event.target.value) })} /></label>
                  <label>标签<input value={draft.tags[locale]} onChange={(event) => updateLocalized("tags", event.target.value)} placeholder="设计, 注意力, 写作" /></label>
                  <label>系列<input list={`studio-series-${locale}`} value={draft.series[locale]} onChange={(event) => updateLocalized("series", event.target.value)} placeholder="可选，可从系列目录选择" /></label>
                  <datalist id={`studio-series-${locale}`}>{state.series.map((series) => <option key={series.id} value={series.name[locale]}>{series.name[locale === "zh" ? "en" : "zh"]}</option>)}</datalist>
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
                  <small>{canPackage ? `将包含 ${completedLocales.length} 个 Markdown 文件、${coverAssets.length + bodyAssets.length} 张图片和分类配置。` : "补全一种语言的标题、摘要、正文、封面和替代文字后即可打包。"}</small>
                </div>
              </section>
            </aside>
          </div>
        </section>
        )}
      </div>
    </main>
  );
}
