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

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("monolog-theme", theme);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#090909" : "#f5f5f7");
  }, [theme]);

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <div className="site-shell">
      <header className="topbar">
        <Link className="brand" to="/" aria-label="MonoLog 首页">
          <span className="brand-mark" aria-hidden="true">M</span>
          <span>MonoLog</span>
        </Link>

        <nav className="nav-links" aria-label="主导航">
          <NavLink to="/">发现</NavLink>
          {user && <NavLink to="/dashboard">我的文章</NavLink>}
        </nav>

        <div className="nav-actions">
          <button
            className="icon-button"
            type="button"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            aria-label={theme === "light" ? "切换到深色模式" : "切换到浅色模式"}
          >
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          {user ? (
            <>
              <Link className="button button-primary compact" to="/write">
                <PenLine size={16} />
                <span>写文章</span>
              </Link>
              <button className="text-button desktop-only" type="button" onClick={handleLogout}>
                退出
              </button>
            </>
          ) : (
            <>
              <Link className="text-button desktop-only" to="/login">登录</Link>
              <Link className="button button-primary compact" to="/register">
                <PenLine size={16} className="mobile-only-icon" />
                <span>开始写作</span>
              </Link>
            </>
          )}
        </div>
      </header>

      <main>{children}</main>

      <footer className="footer">
        <Link className="brand footer-brand" to="/">
          <span className="brand-mark" aria-hidden="true">M</span>
          <span>MonoLog</span>
        </Link>
        <p>留一点安静，写一些值得留下的东西。</p>
        <p>由 Cloudflare Workers 与 D1 驱动</p>
      </footer>
    </div>
  );
}
