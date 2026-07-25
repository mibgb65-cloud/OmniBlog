import { Check, Edit3, ExternalLink, FileText, Plus, Tag, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { Category, Post } from "../../shared/types";
import { Loading } from "../components/Loading";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatDate } from "../lib/format";

export function DashboardPage() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [categoryError, setCategoryError] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingName, setEditingName] = useState("");
  const [categoryBusy, setCategoryBusy] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api<Post[]>("/api/me/posts"),
      api<Category[]>("/api/me/categories"),
    ])
      .then(([nextPosts, nextCategories]) => {
        setPosts(nextPosts);
        setCategories(nextCategories);
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const remove = async (post: Post) => {
    if (!window.confirm(`确定删除《${post.title}》吗？此操作无法撤销。`)) return;
    try {
      await api<boolean>(`/api/me/posts/${post.id}`, { method: "DELETE" });
      setPosts((current) => current.filter((item) => item.id !== post.id));
      setCategories((current) => current.map((category) => (
        category.name === post.category
          ? { ...category, postCount: Math.max(0, category.postCount - 1) }
          : category
      )));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "删除失败。");
    }
  };

  const createCategory = async (event: FormEvent) => {
    event.preventDefault();
    setCategoryBusy("new");
    setCategoryError("");
    try {
      const category = await api<Category>("/api/me/categories", {
        method: "POST",
        body: JSON.stringify({ name: newCategory }),
      });
      setCategories((current) => [...current, category]);
      setNewCategory("");
    } catch (reason) {
      setCategoryError(reason instanceof Error ? reason.message : "添加分类失败。");
    } finally {
      setCategoryBusy("");
    }
  };

  const renameCategory = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingCategory) return;
    setCategoryBusy(editingCategory.id);
    setCategoryError("");
    try {
      const category = await api<Category>(`/api/me/categories/${editingCategory.id}`, {
        method: "PUT",
        body: JSON.stringify({ name: editingName }),
      });
      setCategories((current) => current.map((item) => (
        item.id === category.id ? category : item
      )));
      setPosts((current) => current.map((post) => (
        post.category === editingCategory.name
          ? { ...post, category: category.name }
          : post
      )));
      setEditingCategory(null);
      setEditingName("");
    } catch (reason) {
      setCategoryError(reason instanceof Error ? reason.message : "重命名分类失败。");
    } finally {
      setCategoryBusy("");
    }
  };

  const removeCategory = async (category: Category) => {
    if (!window.confirm(`确定删除分类“${category.name}”吗？`)) return;
    setCategoryBusy(category.id);
    setCategoryError("");
    try {
      await api<boolean>(`/api/me/categories/${category.id}`, { method: "DELETE" });
      setCategories((current) => current.filter((item) => item.id !== category.id));
    } catch (reason) {
      setCategoryError(reason instanceof Error ? reason.message : "删除分类失败。");
    } finally {
      setCategoryBusy("");
    }
  };

  const published = posts.filter((post) => post.status === "published").length;

  return (
    <section className="dashboard section">
      <header className="dashboard-heading">
        <div>
          <span className="eyebrow">你的写作空间</span>
          <h1>你好，{user?.name}。</h1>
          <p>所有想法都值得先被记录，再决定是否公开。</p>
        </div>
        <Link className="button button-primary" to="/write">
          <Plus size={18} aria-hidden="true" />
          新建文章
        </Link>
      </header>

      <div className="stats">
        <div><strong>{posts.length}</strong><span>全部文章</span></div>
        <div><strong>{published}</strong><span>已发布</span></div>
        <div><strong>{posts.length - published}</strong><span>草稿</span></div>
      </div>

      <div className="dashboard-section-heading">
        <h2>文章</h2>
        <span>{posts.length} 篇</span>
      </div>

      {loading && <Loading label="正在整理你的文章" />}
      {error && (
        <div className="message message-error" role="status" aria-live="polite">
          {error}
        </div>
      )}
      {!loading && posts.length === 0 && (
        <div className="empty-state compact-empty">
          <FileText size={28} aria-hidden="true" />
          <h3>还没有文章</h3>
          <p>新建一篇草稿，从标题开始。</p>
          <Link className="button button-secondary" to="/write">开始写作</Link>
        </div>
      )}

      {posts.length > 0 && (
        <div className="post-table">
          {posts.map((post) => (
            <article className="post-row" key={post.id}>
              <div className="post-row-main">
                <div className="post-row-badges">
                  <span className={`status-badge ${post.status}`}>
                    {post.status === "published" ? "已发布" : "草稿"}
                  </span>
                  <span className="category-badge">{post.category || "随笔"}</span>
                </div>
                <h3>{post.title}</h3>
                <p>更新于 {formatDate(post.updatedAt)}</p>
              </div>
              <div className="row-actions">
                {post.status === "published" && (
                  <Link
                    className="icon-button"
                    to={`/posts/${post.slug}`}
                    aria-label={`查看《${post.title}》`}
                  >
                    <ExternalLink size={17} aria-hidden="true" />
                  </Link>
                )}
                <Link
                  className="icon-button"
                  to={`/write/${post.id}`}
                  aria-label={`编辑《${post.title}》`}
                >
                  <Edit3 size={17} aria-hidden="true" />
                </Link>
                <button
                  className="icon-button danger"
                  type="button"
                  onClick={() => remove(post)}
                  aria-label={`删除《${post.title}》`}
                >
                  <Trash2 size={17} aria-hidden="true" />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {!loading && (
        <section className="category-manager" aria-labelledby="category-manager-title">
          <div className="dashboard-section-heading category-manager-heading">
            <div>
              <h2 id="category-manager-title">分类</h2>
              <p>统一管理首页导航和文章可选分类。</p>
            </div>
            <span>{categories.length} 个</span>
          </div>

          <form className="category-create" onSubmit={createCategory}>
            <label className="sr-only" htmlFor="new-category">新分类名称</label>
            <input
              id="new-category"
              value={newCategory}
              onChange={(event) => setNewCategory(event.target.value)}
              placeholder="输入新分类名称"
              minLength={1}
              maxLength={24}
              required
            />
            <button
              className="button button-secondary"
              type="submit"
              disabled={categoryBusy === "new"}
            >
              <Plus size={17} aria-hidden="true" />
              {categoryBusy === "new" ? "添加中…" : "添加分类"}
            </button>
          </form>

          {categoryError && (
            <div className="message message-error" role="status" aria-live="polite">
              {categoryError}
            </div>
          )}

          <div className="category-table">
            {categories.map((category) => (
              editingCategory?.id === category.id ? (
                <form className="category-row editing" onSubmit={renameCategory} key={category.id}>
                  <label className="sr-only" htmlFor={`category-${category.id}`}>
                    修改分类名称
                  </label>
                  <input
                    id={`category-${category.id}`}
                    value={editingName}
                    onChange={(event) => setEditingName(event.target.value)}
                    minLength={1}
                    maxLength={24}
                    autoFocus
                    required
                  />
                  <div className="row-actions">
                    <button
                      className="icon-button"
                      type="submit"
                      disabled={categoryBusy === category.id}
                      aria-label={`保存分类“${category.name}”`}
                    >
                      <Check size={17} aria-hidden="true" />
                    </button>
                    <button
                      className="icon-button"
                      type="button"
                      onClick={() => {
                        setEditingCategory(null);
                        setEditingName("");
                      }}
                      aria-label="取消修改分类"
                    >
                      <X size={17} aria-hidden="true" />
                    </button>
                  </div>
                </form>
              ) : (
                <div className="category-row" key={category.id}>
                  <div className="category-row-main">
                    <span className="category-icon" aria-hidden="true">
                      <Tag size={16} />
                    </span>
                    <div>
                      <strong>{category.name}</strong>
                      <span>{category.postCount > 0 ? `${category.postCount} 篇文章` : "暂未使用"}</span>
                    </div>
                  </div>
                  <div className="row-actions">
                    <button
                      className="icon-button"
                      type="button"
                      onClick={() => {
                        setEditingCategory(category);
                        setEditingName(category.name);
                        setCategoryError("");
                      }}
                      aria-label={`重命名分类“${category.name}”`}
                    >
                      <Edit3 size={17} aria-hidden="true" />
                    </button>
                    <button
                      className="icon-button danger"
                      type="button"
                      disabled={category.postCount > 0 || categories.length <= 1}
                      onClick={() => void removeCategory(category)}
                      aria-label={`删除分类“${category.name}”`}
                      title={
                        category.postCount > 0
                          ? "该分类仍有文章，无法删除"
                          : categories.length <= 1
                            ? "至少需要保留一个分类"
                            : "删除分类"
                      }
                    >
                      <Trash2 size={17} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
