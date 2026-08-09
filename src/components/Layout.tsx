import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ArrowUpRight, Globe2, Menu, Moon, Search, Sun, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, Outlet, useLocation, useParams } from "react-router-dom";
import { copy, type Locale } from "../content";
import { RouteAnnouncer, TransitionLink, useTheme } from "./AppProviders";
import { SearchDialog } from "./SearchDialog";
import site from "../../content/site.json";

export function getLocale(value?: string): Locale | null {
  return value === "zh" || value === "en" ? value : null;
}

export function useLocale() {
  const { locale: localeParam } = useParams();
  return getLocale(localeParam) ?? "zh";
}

export function RootRedirect() {
  const preferred = navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
  return <Navigate to={`/${preferred}`} replace />;
}

export function LocaleLayout() {
  const params = useParams();
  const locale = getLocale(params.locale);
  const location = useLocation();

  useEffect(() => {
    if (!locale) return;
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  }, [locale]);

  if (!locale) return <Navigate to="/zh" replace />;

  return (
    <div className="site-shell">
      <Header locale={locale} />
      <main id="main-content" key={location.pathname}>
        <Outlet />
      </main>
      <Footer locale={locale} />
      <RouteAnnouncer />
    </div>
  );
}

function Header({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const searchReturnRef = useRef<HTMLElement | null>(null);
  const otherLocale = locale === "zh" ? "en" : "zh";
  const localePath = `${location.pathname.replace(/^\/(zh|en)(?=\/|$)/, `/${otherLocale}`) || `/${otherLocale}`}${location.search}${location.hash}`;
  const closeSearch = useCallback(() => setSearchOpen(false), []);

  useEffect(() => {
    setMobileOpen(false);
    setSearchOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.from(headerRef.current, { y: -18, autoAlpha: 0, duration: 0.65, ease: "power3.out", delay: 0.12 });
    },
    { scope: headerRef },
  );

  const navItems = [
    { label: t.nav.home, to: `/${locale}` },
    { label: t.nav.stories, to: `/${locale}/stories` },
    { label: t.nav.about, to: `/${locale}/about` },
  ];

  const isActive = (to: string) =>
    to === `/${locale}` ? location.pathname === to : location.pathname.startsWith(to);

  const openSearch = (trigger: HTMLElement) => {
    searchReturnRef.current = trigger;
    setMobileOpen(false);
    setSearchOpen(true);
  };

  return (
    <header className="site-header" ref={headerRef}>
      <nav className="nav-shell" aria-label="Primary navigation">
        <TransitionLink className="brand" to={`/${locale}`} aria-label="Omni Journal home">
          <span className="brand-mark" aria-hidden="true">O</span>
          <span>Omni Journal</span>
        </TransitionLink>

        <div className="desktop-nav">
          {navItems.map((item) => (
            <TransitionLink
              key={item.to}
              to={item.to}
              className={isActive(item.to) ? "nav-link is-active" : "nav-link"}
              aria-current={isActive(item.to) ? "page" : undefined}
            >
              {item.label}
            </TransitionLink>
          ))}
        </div>

        <div className="nav-actions">
          <button
            className="icon-button desktop-search-button"
            type="button"
            onClick={(event) => openSearch(event.currentTarget)}
            aria-label={t.search.label}
            aria-haspopup="dialog"
          >
            <Search aria-hidden="true" />
          </button>
          <TransitionLink className="icon-button language-button" to={localePath} aria-label={t.controls.language}>
            <Globe2 aria-hidden="true" />
            <span>{otherLocale === "zh" ? "中" : "EN"}</span>
          </TransitionLink>
          <button className="icon-button" type="button" onClick={toggleTheme} aria-label={t.controls.theme}>
            {theme === "light" ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
          </button>
          <TransitionLink className="nav-cta" to={`/${locale}#newsletter`}>
            {t.nav.subscribe}
            <ArrowUpRight aria-hidden="true" />
          </TransitionLink>
          <button
            ref={menuButtonRef}
            className="icon-button menu-button"
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
            aria-label={mobileOpen ? t.controls.close : t.controls.menu}
          >
            {mobileOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </div>
      </nav>

      <div id="mobile-menu" className={`mobile-menu ${mobileOpen ? "is-open" : ""}`} aria-hidden={!mobileOpen}>
        <div className="mobile-menu-inner">
          <button
            className="mobile-search-action"
            type="button"
            onClick={(event) => openSearch(menuButtonRef.current ?? event.currentTarget)}
            tabIndex={mobileOpen ? 0 : -1}
            aria-haspopup="dialog"
          >
            <Search aria-hidden="true" />
            <span>{t.search.label}</span>
          </button>
          {navItems.map((item, index) => (
            <TransitionLink key={item.to} to={item.to} tabIndex={mobileOpen ? 0 : -1}>
              <span>0{index + 1}</span>
              {item.label}
            </TransitionLink>
          ))}
          <TransitionLink to={`/${locale}#newsletter`} tabIndex={mobileOpen ? 0 : -1} onClick={() => setMobileOpen(false)}>
            <span>04</span>
            {t.nav.subscribe}
          </TransitionLink>
        </div>
      </div>
      <SearchDialog
        locale={locale}
        open={searchOpen}
        onClose={closeSearch}
        returnFocusRef={searchReturnRef}
      />
    </header>
  );
}

function Footer({ locale }: { locale: Locale }) {
  const t = copy[locale];
  return (
    <footer className="site-footer">
      <div className="container footer-top">
        <TransitionLink className="footer-brand" to={`/${locale}`}>Omni Journal</TransitionLink>
        <p>{t.footer.note}</p>
      </div>
      <div className="container footer-bottom">
        <span>{t.footer.rights}</span>
        <div>
          <a href={`mailto:${site.email}`}>Email</a>
          <a href="/rss.xml">RSS</a>
        </div>
      </div>
    </footer>
  );
}
