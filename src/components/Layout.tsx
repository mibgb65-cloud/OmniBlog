import { LogIn, Moon, PenLine, Sun } from "lucide-react";
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
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("monolog-theme", theme);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#0b0b0c" : "#f5f5f7");
  }, [theme]);

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <div className={`site-shell${isHome ? " home-route" : ""}`}>
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
          <NavLink className="nav-about" to="/about">关于</NavLink>
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
              <LogIn size={16} className="mobile-only-icon" aria-hidden="true" />
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
        <nav className="footer-links" aria-label="页脚导航">
          <Link to="/about">关于</Link>
          <Link to="/articles">归档</Link>
          <a href="/rss.xml">RSS</a>
        </nav>
      </footer>
    </div>
  );
}
