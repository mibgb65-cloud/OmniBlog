import {
  Copy,
  ExternalLink,
  Image as ImageIcon,
  ImagePlus,
  LoaderCircle,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import type { MediaItem, MediaPage, MediaUpload } from "../../shared/types";
import { Loading } from "../components/Loading";
import { Seo } from "../components/Seo";
import { api } from "../lib/api";
import { formatDate, formatFileSize } from "../lib/format";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];

export function MediaPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (nextCursor?: string, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError("");
    try {
      const page = await api<MediaPage>(
        `/api/me/media${nextCursor ? `?cursor=${encodeURIComponent(nextCursor)}` : ""}`,
      );
      setItems((current) => append ? [...current, ...page.items] : page.items);
      setCursor(page.cursor);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法读取媒体库。");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) {
      setError("请选择 JPEG、PNG、WebP、GIF 或 AVIF 图片。");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("图片不能超过 8 MB，请压缩后重试。");
      return;
    }

    setUploading(true);
    setError("");
    setNotice("");
    try {
      const formData = new FormData();
      formData.set("file", file);
      const uploaded = await api<MediaUpload>("/api/me/media", {
        method: "POST",
        body: formData,
      });
      setItems((current) => [{
        ...uploaded,
        uploadedAt: new Date().toISOString(),
        inUse: false,
      }, ...current]);
      setNotice("图片已上传，可以复制 Markdown 插入文章。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "图片上传失败。");
    } finally {
      setUploading(false);
    }
  };

  const copyMarkdown = async (item: MediaItem) => {
    try {
      await navigator.clipboard.writeText(`![图片说明](${item.url})`);
      setNotice("已复制图片 Markdown。");
      setError("");
    } catch {
      setError("无法访问剪贴板，请打开图片后手动复制地址。");
    }
  };

  const remove = async (item: MediaItem) => {
    if (item.inUse) return;
    if (!window.confirm("确定删除这张图片吗？此操作无法撤销。")) return;
    setBusyKey(item.key);
    setError("");
    setNotice("");
    try {
      await api<boolean>(`/api/me/media?key=${encodeURIComponent(item.key)}`, {
        method: "DELETE",
      });
      setItems((current) => current.filter((currentItem) => currentItem.key !== item.key));
      setNotice("图片已从媒体库删除。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "删除图片失败。");
    } finally {
      setBusyKey("");
    }
  };

  return (
    <section className="media-page section">
      <Seo
        title="媒体库 — OmniBlog"
        description="管理 OmniBlog 文章使用的图片。"
        path="/dashboard/media"
        noIndex
      />
      <header className="media-heading">
        <div>
          <span className="eyebrow">写作资源</span>
          <h1>媒体库</h1>
          <p>集中查看、复用和清理文章图片。正在被文章引用的图片不会被删除。</p>
        </div>
        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          accept={IMAGE_TYPES.join(",")}
          aria-label="选择要上传的图片"
          onChange={upload}
        />
        <button
          className="button button-primary"
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading
            ? <LoaderCircle className="editor-upload-spinner" size={18} aria-hidden="true" />
            : <ImagePlus size={18} aria-hidden="true" />}
          {uploading ? "上传中…" : "上传图片"}
        </button>
      </header>

      <div className="media-summary">
        <span>{items.length} 张图片</span>
        <span>单张不超过 8 MB</span>
      </div>

      {error && (
        <div className="message message-error" role="status" aria-live="polite">{error}</div>
      )}
      <p className="media-notice" role="status" aria-live="polite">{notice}</p>
      {loading && <Loading label="正在整理媒体库" />}

      {!loading && !error && items.length === 0 && (
        <div className="empty-state media-empty">
          <ImageIcon size={30} aria-hidden="true" />
          <h2>媒体库还是空的</h2>
          <p>上传第一张图片，或者在编辑文章时直接粘贴图片。</p>
          <button className="button button-secondary" type="button" onClick={() => inputRef.current?.click()}>
            选择图片
          </button>
        </div>
      )}

      {items.length > 0 && (
        <div className="media-grid">
          {items.map((item) => (
            <article className="media-card" key={item.key}>
              <a href={item.url} target="_blank" rel="noreferrer" aria-label="在新窗口打开图片">
                <img src={item.url} alt="" width="640" height="400" loading="lazy" />
              </a>
              <div className="media-card-copy">
                <div>
                  <strong>{item.key.split("/").at(-1)}</strong>
                  <span>{formatFileSize(item.size)} · {formatDate(item.uploadedAt)}</span>
                </div>
                <span className={`media-usage${item.inUse ? " in-use" : ""}`}>
                  {item.inUse ? "文章使用中" : "未被引用"}
                </span>
              </div>
              <div className="media-card-actions">
                <button className="button button-secondary" type="button" onClick={() => void copyMarkdown(item)}>
                  <Copy size={16} aria-hidden="true" />
                  复制 Markdown
                </button>
                <a className="icon-button" href={item.url} target="_blank" rel="noreferrer" aria-label="打开原图">
                  <ExternalLink size={17} aria-hidden="true" />
                </a>
                <button
                  className="icon-button danger"
                  type="button"
                  disabled={item.inUse || busyKey === item.key}
                  onClick={() => void remove(item)}
                  aria-label={`删除图片 ${item.key.split("/").at(-1)}`}
                  title={item.inUse ? "图片仍被文章使用" : "删除图片"}
                >
                  <Trash2 size={17} aria-hidden="true" />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {cursor && (
        <div className="media-load-more">
          <button
            className="button button-secondary"
            type="button"
            disabled={loadingMore}
            onClick={() => void load(cursor, true)}
          >
            {loadingMore ? "加载中…" : "加载更多"}
          </button>
        </div>
      )}
    </section>
  );
}
