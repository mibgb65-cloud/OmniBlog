import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isLogin = mode === "login";

  if (user) return <Navigate to="/dashboard" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      if (isLogin) await login({ email, password });
      else await register({ name, email, password });
      const destination = (location.state as { from?: string } | null)?.from ?? "/dashboard";
      navigate(destination, { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "操作失败，请稍后再试。");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="auth-wrap section">
      <div className="auth-intro">
        <span className="section-index">{isLogin ? "欢迎回来" : "加入 MonoLog"}</span>
        <h1>{isLogin ? "继续写下去。" : "从第一句话开始。"}</h1>
        <p>
          {isLogin
            ? "登录后继续管理、编辑和发布你的文章。"
            : "创建你的写作空间，草稿和已发布文章都由你掌控。"}
        </p>
      </div>

      <form className="auth-card" onSubmit={submit}>
        <div className="form-heading">
          <h2>{isLogin ? "登录" : "注册"}</h2>
          <p>
            {isLogin ? "还没有账号？" : "已经有账号？"}
            <Link to={isLogin ? "/register" : "/login"}>
              {isLogin ? "立即注册" : "直接登录"}
            </Link>
          </p>
        </div>

        {!isLogin && (
          <label className="field" htmlFor="name">
            <span>昵称</span>
            <input
              id="name"
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              minLength={2}
              maxLength={32}
              autoComplete="name"
              placeholder="你希望被如何称呼"
              required
            />
          </label>
        )}
        <label className="field" htmlFor="email">
          <span>邮箱</span>
          <input
            id="email"
            name="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            placeholder="name@example.com"
            required
          />
        </label>
        <label className="field" htmlFor="password">
          <span>密码</span>
          <span className="password-field">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              maxLength={128}
              autoComplete={isLogin ? "current-password" : "new-password"}
              placeholder="至少 8 个字符"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "隐藏密码" : "显示密码"}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </span>
        </label>

        {error && <div className="message message-error">{error}</div>}
        <button className="button button-primary form-submit" type="submit" disabled={submitting}>
          {submitting ? "请稍候…" : isLogin ? "登录" : "创建账号"}
          {!submitting && <ArrowRight size={17} />}
        </button>
        <p className="form-note">继续即表示你同意妥善、真实地使用这个写作空间。</p>
      </form>
    </section>
  );
}

