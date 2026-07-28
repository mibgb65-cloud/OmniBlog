import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import type { RegistrationStatus } from "../../shared/types";
import { Loading } from "../components/Loading";
import { Seo } from "../components/Seo";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [registration, setRegistration] = useState<RegistrationStatus | null>(null);
  const [checkingRegistration, setCheckingRegistration] = useState(mode === "register");
  const isLogin = mode === "login";

  useEffect(() => {
    if (isLogin) {
      setCheckingRegistration(false);
      return;
    }
    setCheckingRegistration(true);
    api<RegistrationStatus>("/api/auth/registration")
      .then(setRegistration)
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setCheckingRegistration(false));
  }, [isLogin]);

  if (user) return <Navigate to="/dashboard" replace />;
  if (checkingRegistration) return <Loading label="正在确认站点状态" />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      if (isLogin) await login({ email, password });
      else await register({ name, email, password, setupToken });
      const destination = (location.state as { from?: string } | null)?.from ?? "/dashboard";
      navigate(destination, { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "操作失败，请稍后再试。");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isLogin && registration && (!registration.open || !registration.configured)) {
    return (
      <section className="auth-wrap section">
        <Seo
          title="站点初始化 — OmniBlog"
          description="检查 OmniBlog 的站长账号初始化状态。"
          path="/register"
          noIndex
        />
        <div className="auth-intro">
          <span className="section-index">OmniBlog</span>
          <h1>{registration.open ? "还差一项配置。" : "站点已经准备好了。"}</h1>
          <p>
            {registration.open
              ? "请先为 Worker 配置 OWNER_SETUP_TOKEN，再创建唯一的站长账号。"
              : "初始化注册已经关闭，请使用已有的站长账号登录。"}
          </p>
        </div>
        <div className="auth-card">
          <h2>{registration.open ? "需要初始化密钥" : "仅限站长登录"}</h2>
          <Link className="button button-primary form-submit" to="/login">
            前往登录
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="auth-wrap section">
      <Seo
        title={`${isLogin ? "站长登录" : "初始化站长"} — OmniBlog`}
        description={isLogin ? "登录 OmniBlog 写作后台。" : "创建 OmniBlog 的唯一站长账号。"}
        path={isLogin ? "/login" : "/register"}
        noIndex
      />
      <div className="auth-intro">
        <span className="section-index">{isLogin ? "欢迎回来" : "初始化 OmniBlog"}</span>
        <h1>{isLogin ? "继续写下去。" : "创建站长账号。"}</h1>
        <p>
          {isLogin
            ? "登录后继续管理、编辑和发布你的文章。"
            : "这个入口只开放一次。完成后，站点将关闭注册。"}
        </p>
      </div>

      <form className="auth-card" onSubmit={submit}>
        <div className="form-heading">
          <h2>{isLogin ? "登录" : "注册"}</h2>
          <p>
            {isLogin ? "首次配置站点？" : "已经有账号？"}
            <Link to={isLogin ? "/register" : "/login"}>
              {isLogin ? "初始化站长" : "直接登录"}
            </Link>
          </p>
        </div>

        {!isLogin && (
          <>
            <label className="field" htmlFor="setup-token">
              <span>初始化密钥</span>
              <input
                id="setup-token"
                name="setup-token"
                type="password"
                value={setupToken}
                onChange={(event) => setSetupToken(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                placeholder="OWNER_SETUP_TOKEN"
                required
              />
            </label>
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
          </>
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
            spellCheck={false}
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
              {showPassword
                ? <EyeOff size={18} aria-hidden="true" />
                : <Eye size={18} aria-hidden="true" />}
            </button>
          </span>
        </label>

        {error && (
          <div className="message message-error" role="status" aria-live="polite">
            {error}
          </div>
        )}
        <button className="button button-primary form-submit" type="submit" disabled={submitting}>
          {submitting ? "请稍候…" : isLogin ? "登录" : "创建站长账号"}
          {!submitting && <ArrowRight size={17} aria-hidden="true" />}
        </button>
        <p className="form-note">
          {isLogin ? "登录会话会安全保存在 HttpOnly Cookie 中。" : "初始化完成后，此注册入口会自动关闭。"}
        </p>
      </form>
    </section>
  );
}
