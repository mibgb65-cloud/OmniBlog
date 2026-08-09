import { strFromU8, strToU8, unzip, zip } from "fflate";
import { stories, type Story } from "../articles";
import { categories as defaultCategories, type Category } from "../categories";
import type { Locale } from "../content";
import type {
  StoredBodyImageAsset,
  StoredDraftAssets,
  StoredImageAsset,
} from "../studioStorage";

export type LocalizedDraft = Record<Locale, string>;

export type StudioDraft = {
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

export type StudioState = {
  drafts: StudioDraft[];
  activeId: string;
  categories: Category[];
  series: StudioSeries[];
};

export type StudioSeries = {
  id: string;
  name: LocalizedDraft;
};

export type CategoryForm = {
  id: string;
  nameZh: string;
  nameEn: string;
  descriptionZh: string;
  descriptionEn: string;
};

export type SeriesForm = {
  id: string;
  nameZh: string;
  nameEn: string;
};

export type ImageAsset = {
  filename: string;
  blob: Blob;
  url: string;
  width: number;
  height: number;
};

export type BodyImageAsset = ImageAsset & {
  alt: string;
};

export type SaveStatus = "loading" | "saving" | "saved" | "local" | "error";
export type StudioView = "write" | "manage";
export type ManagementSection = "articles" | "categories" | "series";
export type ArticleFilter = "all" | "published" | "draft" | "pending";

export type ManagedArticle = {
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

export type BackupImageMeta = Omit<StoredImageAsset, "blob"> & { path: string };
export type BackupBodyImageMeta = BackupImageMeta & { alt: string };
export type StudioBackupManifest = {
  version: 1;
  exportedAt: string;
  state: StudioState;
  assets: Array<{
    draftId: string;
    cover: BackupImageMeta[];
    body: BackupBodyImageMeta[];
  }>;
};

export const emojis = [
  ["😀", "开心"], ["😄", "大笑"], ["😂", "笑哭"], ["🥹", "感动"], ["😊", "微笑"],
  ["🤔", "思考"], ["👍", "赞"], ["👏", "鼓掌"], ["🎉", "庆祝"], ["❤️", "爱心"],
  ["🔥", "火热"], ["✨", "闪光"], ["🚀", "起飞"], ["👀", "关注"], ["💡", "灵感"],
  ["✅", "完成"], ["❌", "错误"], ["⚠️", "注意"], ["📌", "标记"], ["📝", "记录"],
  ["🧠", "思考力"], ["💻", "电脑"], ["🐧", "Linux"], ["🙌", "欢呼"], ["🙏", "感谢"],
] as const;

export const storageKey = "omniblog-studio-drafts-v1";
const maxBackupFileBytes = 128 * 1024 * 1024;
const maxBackupExtractedBytes = 256 * 1024 * 1024;
const maxBackupEntries = 2_000;
const maxSourceImageBytes = 30 * 1024 * 1024;
const maxSourceImagePixels = 80_000_000;
export const emptyCategoryForm: CategoryForm = {
  id: "",
  nameZh: "",
  nameEn: "",
  descriptionZh: "",
  descriptionEn: "",
};
export const emptySeriesForm: SeriesForm = { id: "", nameZh: "", nameEn: "" };

export function copyDefaultCategories(): Category[] {
  return defaultCategories.map((category) => ({
    ...category,
    name: { ...category.name },
    description: { ...category.description },
  }));
}

export function createDraft(category = defaultCategories[0]?.id ?? "notes"): StudioDraft {
  const id = crypto.randomUUID();
  return {
    id,
    slug: "",
    date: new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()),
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

export function createDraftFromStory(story: Story): StudioDraft {
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

export function discoverSeries(drafts: StudioDraft[]): StudioSeries[] {
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

export function loadStudioState(): StudioState {
  try {
    const saved = normalizeStudioState(JSON.parse(localStorage.getItem(storageKey) ?? "null"));
    if (saved) return saved;
  } catch {
    // Start with a clean draft if local data is malformed.
  }
  const draft = createDraft();
  return { drafts: [draft], activeId: draft.id, categories: copyDefaultCategories(), series: discoverSeries([draft]) };
}

export function splitTags(value: string) {
  return value.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean);
}

export function seriesNameMatches(value: LocalizedDraft, series: StudioSeries) {
  return (["zh", "en"] as Locale[]).some((locale) => {
    const currentName = value[locale].trim();
    return Boolean(currentName && currentName === series.name[locale].trim());
  });
}

export function buildMarkdown(draft: StudioDraft, locale: Locale) {
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

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

export function downloadMarkdown(draft: StudioDraft, locale: Locale) {
  downloadBlob(new Blob([buildMarkdown(draft, locale)], { type: "text/markdown;charset=utf-8" }), `${draft.slug}.${locale}.md`);
}

export function toStoredImage(asset: ImageAsset): StoredImageAsset {
  return { filename: asset.filename, blob: asset.blob, width: asset.width, height: asset.height };
}

export function toStoredBodyImage(asset: BodyImageAsset): StoredBodyImageAsset {
  return { ...toStoredImage(asset), alt: asset.alt };
}

export function restoreImage(asset: StoredImageAsset): ImageAsset {
  return { ...asset, url: URL.createObjectURL(asset.blob) };
}

export function restoreBodyImage(asset: StoredBodyImageAsset): BodyImageAsset {
  return { ...restoreImage(asset), alt: asset.alt };
}

export function zipFiles(files: Record<string, Uint8Array>) {
  return new Promise<Uint8Array>((resolve, reject) => {
    zip(files, { level: 0 }, (error, archive) => error ? reject(error) : resolve(archive));
  });
}

export function unzipFiles(archive: Uint8Array) {
  return new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    let extractedBytes = 0;
    let entryCount = 0;
    unzip(archive, {
      filter: (entry) => {
        entryCount += 1;
        extractedBytes += entry.originalSize;
        if (entryCount > maxBackupEntries || extractedBytes > maxBackupExtractedBytes) {
          throw new Error("备份内容过大。 ");
        }
        return true;
      },
    }, (error, files) => error ? reject(error) : resolve(files));
  });
}

export function archiveBlob(bytes: Uint8Array) {
  return new Blob([new Uint8Array(bytes).buffer], { type: "application/zip" });
}

export function imageBlob(bytes: Uint8Array) {
  return new Blob([new Uint8Array(bytes).buffer], { type: "image/webp" });
}

export function isLocalizedDraft(value: unknown): value is LocalizedDraft {
  if (!value || typeof value !== "object") return false;
  const localized = value as Record<string, unknown>;
  return typeof localized.zh === "string" && typeof localized.en === "string";
}

export function isCategory(value: unknown): value is Category {
  if (!value || typeof value !== "object") return false;
  const category = value as Partial<Category>;
  return typeof category.id === "string"
    && /^[a-z0-9-]+$/.test(category.id)
    && isLocalizedDraft(category.name)
    && isLocalizedDraft(category.description);
}

export function isStudioSeries(value: unknown): value is StudioSeries {
  if (!value || typeof value !== "object") return false;
  const series = value as Partial<StudioSeries>;
  return typeof series.id === "string"
    && /^[a-z0-9-]+$/.test(series.id)
    && isLocalizedDraft(series.name);
}

function isBackupImageMeta(value: unknown, body: boolean) {
  if (!value || typeof value !== "object") return false;
  const asset = value as Partial<BackupBodyImageMeta>;
  return typeof asset.filename === "string"
    && /^[a-z0-9][a-z0-9.-]*$/.test(asset.filename)
    && typeof asset.path === "string"
    && typeof asset.width === "number"
    && Number.isFinite(asset.width)
    && asset.width > 0
    && typeof asset.height === "number"
    && Number.isFinite(asset.height)
    && asset.height > 0
    && (!body || typeof asset.alt === "string");
}

function isBackupAssetRecord(value: unknown): value is StudioBackupManifest["assets"][number] {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<StudioBackupManifest["assets"][number]>;
  if (typeof record.draftId !== "string" || !Array.isArray(record.cover) || !Array.isArray(record.body)) return false;
  return record.cover.every((asset) => isBackupImageMeta(asset, false)
      && asset.path === `assets/${record.draftId}/cover/${asset.filename}`)
    && record.body.every((asset) => isBackupImageMeta(asset, true)
      && asset.path === `assets/${record.draftId}/body/${asset.filename}`);
}

export function isStudioDraft(value: unknown): value is StudioDraft {
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

export function normalizeStudioState(value: unknown): StudioState | null {
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

export async function createPublishPackage(
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

export async function createWorkspaceBackup(state: StudioState, storedAssets: StoredDraftAssets[]) {
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

export async function parseWorkspaceBackup(file: File) {
  if (file.size > maxBackupFileBytes) throw new Error("备份文件过大。 ");
  const files = await unzipFiles(new Uint8Array(await file.arrayBuffer()));
  if (!files["workspace.json"]) throw new Error("备份缺少 workspace.json。 ");
  const manifest = JSON.parse(strFromU8(files["workspace.json"])) as StudioBackupManifest;
  const normalizedState = normalizeStudioState(manifest.state);
  if (manifest.version !== 1 || !normalizedState || !Array.isArray(manifest.assets) || !manifest.assets.every(isBackupAssetRecord)) {
    throw new Error("备份格式无效。 ");
  }
  const draftIds = new Set(normalizedState.drafts.map((draft) => draft.id));
  if (new Set(manifest.assets.map((record) => record.draftId)).size !== manifest.assets.length
    || manifest.assets.some((record) => !draftIds.has(record.draftId))) {
    throw new Error("备份图片与草稿不匹配。 ");
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

export async function resizeImage(file: File, width: number, height?: number): Promise<ImageAsset> {
  if (!file.type.startsWith("image/") || !file.size || file.size > maxSourceImageBytes) {
    throw new Error("Image file is invalid or too large");
  }
  const bitmap = await createImageBitmap(file);
  if (bitmap.width * bitmap.height > maxSourceImagePixels) {
    bitmap.close();
    throw new Error("Image dimensions are too large");
  }
  const targetHeight = height ?? Math.max(1, Math.round(bitmap.height * Math.min(1, width / bitmap.width)));
  const targetWidth = height ? width : Math.min(width, bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Canvas is not available");
  }

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
