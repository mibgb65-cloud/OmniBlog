import {
  Check,
  ChevronDown,
  Copy,
  Download,
  Eye,
  FileImage,
  ImagePlus,
  LoaderCircle,
  Package,
  Plus,
  Smile,
  Tags,
  Trash2,
  UploadCloud,
} from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useDeferredValue } from "react";
import { downloadBlob, downloadMarkdown, emojis } from "../../studio/studioModel";
import type { StudioPageModel } from "../../studio/useStudioPage";

type StudioEditorProps = { studio: StudioPageModel };

export function StudioEditor({ studio }: StudioEditorProps) {
  const {
    draft,
    locale,
    wordCount,
    deleteDraft,
    setLocale,
    updateLocalized,
    bodyAssets,
    isDraggingImage,
    rememberCaret,
    bodyImageInputRef,
    emojiOpen,
    setEmojiOpen,
    insertBodyText,
    bodyEditorRef,
    caretRef,
    handleBodyPaste,
    setIsDraggingImage,
    handleBodyDrop,
    processBodyImage,
    processCover,
    coverAssets,
    updateBodyAlt,
    bodySnippet,
    copyBodySnippet,
    copiedAsset,
    uploadAssets,
    assetStatus,
    state,
    categoryUsage,
    addCategory,
    deleteCategory,
    categoryForm,
    setCategoryForm,
    categoryStatus,
    updateDraft,
    updateSlug,
    canPackage,
    packageStatus,
    exportPublishPackage,
    canExport,
    completedLocales,
  } = studio;
  const activeCategory = state.categories.find((category) => category.id === draft.category);
  const previewBody = useDeferredValue(draft.body[locale]);
  const previewPending = previewBody !== draft.body[locale];

  return (
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
                  <div className="studio-language-tabs" role="group" aria-label="文章语言">
                    <button type="button" aria-pressed={locale === "zh"} className={locale === "zh" ? "is-active" : ""} onClick={() => setLocale("zh")}>中文</button>
                    <button type="button" aria-pressed={locale === "en"} className={locale === "en" ? "is-active" : ""} onClick={() => setLocale("en")}>English <span>可后补</span></button>
                  </div>
                </div>

                <div className="studio-content-fields">
                  <label className="studio-title-field">标题<input value={draft.title[locale]} onChange={(event) => updateLocalized("title", event.target.value)} placeholder={locale === "zh" ? "给文章起一个清晰的标题" : "Give the article a clear title"} /></label>
                  <label className="studio-summary-field">摘要<textarea rows={2} value={draft.summary[locale]} onChange={(event) => updateLocalized("summary", event.target.value)} placeholder="用一两句话说明这篇文章为什么值得读。" /></label>
                  <div className="studio-body-field">
                    <div className="studio-body-label"><label htmlFor="studio-body-editor">正文</label><small>{wordCount} 字</small></div>
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
                        <span><kbd>Ctrl/⌘ V</kbd> 粘贴剪贴板图片</span>
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
                      {assetStatus ? <p className="studio-composer-feedback" aria-live="polite">{assetStatus}</p> : null}
                      {isDraggingImage ? <div className="studio-drop-overlay"><ImagePlus aria-hidden="true" /><strong>松开以插入图片</strong></div> : null}
                    </div>
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
              <section className="studio-panel studio-live-preview" aria-labelledby="studio-preview-title">
                <div className="studio-live-preview-head">
                  <div><span>PREVIEW</span><h3 id="studio-preview-title"><Eye aria-hidden="true" />实时预览</h3></div>
                  <span className="studio-live-indicator"><i aria-hidden="true" />{previewPending ? "更新中…" : "已同步"}</span>
                </div>
                <article className="studio-preview-document">
                  <header>
                    <span>{activeCategory?.name[locale] ?? draft.category}</span>
                    <h4>{draft.title[locale] || "未命名文章"}</h4>
                    <p>{draft.summary[locale] || "摘要会实时显示在这里。"}</p>
                  </header>
                  <div className="studio-markdown-preview">
                    <Markdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        img: ({ src, alt = "", ...props }) => {
                          const localAsset = bodyAssets.find((asset) => src?.endsWith(`/${asset.filename}`));
                          return <img {...props} src={localAsset?.url ?? src} alt={alt} />;
                        },
                      }}
                    >
                      {previewBody || "正文会随着输入实时呈现。"}
                    </Markdown>
                  </div>
                </article>
              </section>

              <section className="studio-panel studio-publish-panel" aria-labelledby="studio-meta-title">
                <div className="studio-panel-title"><span>SETTINGS</span><h3 id="studio-meta-title">发布设置</h3></div>
                <div className="studio-meta-grid">
                  <label>Slug<input value={draft.slug} onChange={(event) => updateSlug(event.target.value)} placeholder="my-new-story" /></label>
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
  );
}
