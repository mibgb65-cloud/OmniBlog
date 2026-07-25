import { Moon, PenLine, Sun } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

type Theme = "light" | "dark";

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [theme, setTheme] = useState<Theme>(
    document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );
  const [showIntro, setShowIntro] = useState(() => {
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
    const timer = window.setTimeout(() => setShowIntro(false), 1350);
    return () => window.clearTimeout(timer);
  }, [showIntro]);

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <div className="site-shell">
      {showIntro && (
        <div className="intro-screen" aria-hidden="true">
          <div className="intro-lockup">
            <span className="intro-mark">O</span>
            <span className="intro-name">OmniBlog</span>
            <span className="intro-line" />
            <span className="intro-copy">写下值得留下的想法</span>
          </div>
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
          <NavLink to="/" end>发现</NavLink>
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
