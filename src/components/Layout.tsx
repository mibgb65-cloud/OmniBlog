import { Moon, PenLine, Sun } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

type Theme = "light" | "dark";

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isHome = location.pathname === "/";
  const [theme, setTheme] = useState<Theme>(
    document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );
  const [showIntro, setShowIntro] = useState(() => {
    if (!isHome || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return false;
    }
    try {
      return sessionStorage.getItem("monolog-intro-seen") !== "true";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("monolog-theme", theme);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#0c0c0b" : "#f6f4ef");
  }, [theme]);

  useEffect(() => {
    if (!showIntro) return;
    try {
      sessionStorage.setItem("monolog-intro-seen", "true");
    } catch {
      // The animation can still play when session storage is unavailable.
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => setShowIntro(false), 3250);
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
    };
  }, [showIntro]);

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <div
      className={`site-shell${isHome ? " home-route" : ""}${
        showIntro ? " intro-active" : " intro-complete"
      }`}
    >
      {showIntro && (
        <div className="intro-screen">
          <div className="intro-canvas" aria-hidden="true">
            <div className="intro-grid">
              <span /><span /><span /><span />
            </div>
            <div className="intro-meta">
              <span>OB / 001</span>
              <span>INDEPENDENT JOURNAL</span>
            </div>
            <div className="intro-symbol">
              <span className="intro-symbol-ring intro-symbol-ring-outer" />
              <span className="intro-symbol-ring intro-symbol-ring-inner" />
              <span className="intro-symbol-dot" />
              <strong>O</strong>
            </div>
            <div className="intro-wordmark" aria-label="OmniBlog">
              <span><i>OMNI</i></span>
              <span><i>BLOG</i></span>
            </div>
            <p className="intro-statement">写下值得留下的想法</p>
            <div className="intro-progress">
              <span />
            </div>
            <div className="intro-count">
              <span className="intro-count-current" />
              <span>100</span>
            </div>
          </div>
          <button className="intro-skip" type="button" onClick={() => setShowIntro(false)}>
            跳过开场
          </button>
        </div>
      )}
      <a className="skip-link" href="#main-content">
        跳到正文
      </a>
      <header className="topbar">
        <Link className="brand" to="/" aria-label="OmniBlog 首页">
          <span className="brand-mark" aria-hidden="true">O</span>
          <span>OmniBlog</span>
        </Link>

        <nav className="nav-links" aria-label="主导航">
          <NavLink to="/" end>首页</NavLink>
          <NavLink to="/articles">文章</NavLink>
          {user && <NavLink to="/dashboard">我的文章</NavLink>}
        </nav>

        <div className="nav-actions">
          <button
            className="icon-button"
            type="button"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            aria-label={theme === "light" ? "切换到深色模式" : "切换到浅色模式"}
          >
            {theme === "light"
              ? <Moon size={18} aria-hidden="true" />
              : <Sun size={18} aria-hidden="true" />}
          </button>
          {user ? (
            <>
              <Link className="button button-primary compact" to="/write">
                <PenLine size={16} aria-hidden="true" />
                <span>写文章</span>
              </Link>
              <button className="text-button desktop-only" type="button" onClick={handleLogout}>
                退出
              </button>
            </>
          ) : (
            <Link className="button button-primary compact" to="/login">
              <PenLine size={16} className="mobile-only-icon" aria-hidden="true" />
              <span>站长登录</span>
            </Link>
          )}
        </div>
      </header>

      <main id="main-content" tabIndex={-1}>{children}</main>

      <footer className="footer">
        <Link className="brand footer-brand" to="/">
          <span className="brand-mark" aria-hidden="true">O</span>
          <span>OmniBlog</span>
        </Link>
        <p>留一点安静，写一些值得留下的东西。</p>
        <p>独立写作 · 保持简单</p>
      </footer>
    </div>
  );
}
