import {
  ArchiveRestore,
  ArrowLeft,
  Check,
  CircleAlert,
  Download,
  FilePlus2,
  Files,
  LoaderCircle,
  LogOut,
  Moon,
  Package,
  PenLine,
  Sun,
} from "lucide-react";
import { TransitionLink } from "../components/AppProviders";
import { StudioEditor } from "../components/studio/StudioEditor";
import { StudioManager } from "../components/studio/StudioManager";
import { useStudioPage } from "../studio/useStudioPage";

export function StudioPage() {
  const studio = useStudioPage();
  const {
    theme,
    toggleTheme,
    view,
    managerHeading,
    managerItemCount,
    draft,
    locale,
    wordCount,
    saveStatus,
    saveStatusLabel,
    canPackage,
    packageStatus,
    exportPublishPackage,
    addDraft,
    setView,
    state,
    storageResolved,
    assetsReady,
    openDraft,
    backupWorkspace,
    restoreWorkspace,
  } = studio;

  if (!storageResolved || !assetsReady) {
    return (
      <main className="studio-page">
        <div className="page-loader" role="status" aria-live="polite">
          <LoaderCircle className="is-spinning" aria-hidden="true" />
          {storageResolved ? "正在载入文章图片…" : "正在恢复草稿与图片…"}
        </div>
      </main>
    );
  }

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
            <button type="button" className="studio-topbar-button is-primary" disabled={!canPackage || packageStatus !== "idle"} onClick={() => void exportPublishPackage()} title={canPackage ? "下载完整发布包" : "请先补全一种语言的发布必填项"}>
              {packageStatus === "packing" ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <Package aria-hidden="true" />}<span>发布包</span>
            </button>
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

        {view === "manage" ? <StudioManager studio={studio} /> : <StudioEditor studio={studio} />}
      </div>
    </main>
  );
}
