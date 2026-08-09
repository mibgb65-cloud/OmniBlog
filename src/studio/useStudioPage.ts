import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent, type DragEvent } from "react";
import { useTheme } from "../components/AppProviders";
import type { Locale } from "../content";
import {
  deleteStudioAssets,
  readAllStudioAssets,
  readStudioAssets,
  readStudioState,
  replaceStudioWorkspace,
  writeStudioAssets,
  writeStudioState,
  type StoredDraftAssets,
} from "../studioStorage";
import { usePageMeta } from "../pages/usePageMeta";
import {
  createDraft,
  createPublishPackage,
  createWorkspaceBackup,
  downloadBlob,
  loadStudioState,
  normalizeStudioState,
  parseWorkspaceBackup,
  resizeImage,
  restoreBodyImage,
  restoreImage,
  storageKey,
  toStoredBodyImage,
  toStoredImage,
  type BodyImageAsset,
  type ImageAsset,
  type SaveStatus,
  type StudioDraft,
  type StudioState,
} from "./studioModel";
import { useStudioManagement } from "./useStudioManagement";

export function useStudioPage() {
  const { theme, toggleTheme } = useTheme();
  const [state, setState] = useState<StudioState>(loadStudioState);
  const [locale, setLocale] = useState<Locale>("zh");
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

  const management = useStudioManagement({ state, setState, storageReady, persistOperation });

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

  const updateSlug = (value: string) => {
    const nextSlug = value.toLocaleLowerCase().replace(/[^a-z0-9-]/g, "-");
    if (nextSlug === draft.slug) return;
    const rewriteArticlePath = (current: string) => draft.slug && nextSlug
      ? current.replaceAll(`/articles/${draft.slug}/`, `/articles/${nextSlug}/`)
      : current;
    updateDraft({
      slug: nextSlug,
      cover: rewriteArticlePath(draft.cover),
      body: {
        zh: rewriteArticlePath(draft.body.zh),
        en: rewriteArticlePath(draft.body.en),
      },
    });
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

  const processBodyFiles = async (
    files: File[],
    position = caretRef.current,
    source: "select" | "paste" | "drop" = "select",
  ) => {
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (!imageFiles.length) return;
    const titleSlug = (draft.title.en || draft.title.zh)
      .toLocaleLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const articleSlug = draft.slug || titleSlug || `draft-${draft.id.slice(0, 8)}`;
    if (!draft.slug) updateSlug(articleSlug);
    const progressLabel = source === "paste" ? "正在粘贴" : source === "drop" ? "正在插入" : "正在处理";
    setAssetStatus(`${progressLabel} ${imageFiles.length} 张正文图片…`);
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
        .map((asset) => `![${asset.alt}](${imageBase}/articles/${articleSlug}/${asset.filename})`)
        .join("\n\n");
      insertBodyText(`\n\n${markdown}\n\n`, position);
      const actionLabel = source === "paste" ? "已从剪贴板粘贴" : source === "drop" ? "已拖入" : "已插入";
      const slugLabel = draft.slug ? "" : `，并自动创建 slug“${articleSlug}”`;
      setAssetStatus(`${actionLabel} ${nextAssets.length} 张 WebP 图片${slugLabel}。`);
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
    void processBodyFiles(files, position, "paste");
  };

  const handleBodyDrop = (event: DragEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith("image/"));
    setIsDraggingImage(false);
    if (!files.length) return;
    event.preventDefault();
    const position = { start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd };
    void processBodyFiles(files, position, "drop");
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

  return {
    theme,
    toggleTheme,
    state,
    locale,
    setLocale,
    coverAssets,
    bodyAssets,
    emojiOpen,
    setEmojiOpen,
    isDraggingImage,
    setIsDraggingImage,
    assetStatus,
    copiedAsset,
    saveStatus,
    packageStatus,
    bodyEditorRef,
    bodyImageInputRef,
    caretRef,
    draft,
    canExport,
    completedLocales,
    canPackage,
    updateDraft,
    updateLocalized,
    updateSlug,
    deleteDraft,
    processCover,
    rememberCaret,
    insertBodyText,
    processBodyImage,
    handleBodyPaste,
    handleBodyDrop,
    bodySnippet,
    updateBodyAlt,
    copyBodySnippet,
    uploadAssets,
    exportPublishPackage,
    backupWorkspace,
    restoreWorkspace,
    wordCount,
    saveStatusLabel,
    ...management,
  };
}

export type StudioPageModel = ReturnType<typeof useStudioPage>;
