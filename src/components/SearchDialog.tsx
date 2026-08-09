import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ArrowUpRight, Search, X } from "lucide-react";
import { useDeferredValue, useEffect, useRef, useState, type FormEvent, type MutableRefObject } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { stripMarkdown } from "../articles";
import { getCategoryName } from "../categories";
import { copy, formatDate, stories, type Locale } from "../content";
import { TransitionLink, useTransitionNavigation } from "./AppProviders";

type SearchDialogProps = {
  locale: Locale;
  open: boolean;
  onClose: () => void;
  returnFocusRef: MutableRefObject<HTMLElement | null>;
};

export function SearchDialog({ locale, open, onClose, returnFocusRef }: SearchDialogProps) {
  const t = copy[locale].search;
  const location = useLocation();
  const { go } = useTransitionNavigation();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase());
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);

  const matches = deferredQuery
    ? stories.filter((story) => [
        story.title[locale],
        story.summary[locale],
        stripMarkdown(story.body[locale]),
        getCategoryName(story.categoryId, locale),
        story.tags[locale].join(" "),
        story.series[locale] ?? "",
      ].join(" ").toLocaleLowerCase().includes(deferredQuery))
    : stories;
  const visibleStories = matches.slice(0, 5);

  useEffect(() => {
    if (!open) return;

    const routeQuery = location.pathname.includes("/stories")
      ? new URLSearchParams(location.search).get("q") ?? ""
      : "";
    setQuery(routeQuery);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => inputRef.current?.focus());

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !rootRef.current) return;

      const focusable = [...rootRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      returnFocusRef.current?.focus();
    };
  }, [location.pathname, location.search, onClose, open, returnFocusRef]);

  useGSAP(
    () => {
      const root = rootRef.current;
      const panel = panelRef.current;
      if (!root || !panel) return;
      timelineRef.current?.kill();

      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduceMotion) {
        gsap.set(root, { autoAlpha: open ? 1 : 0, visibility: open ? "visible" : "hidden" });
        gsap.set(panel, { clearProps: "transform,opacity" });
        if (open) window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
        return;
      }

      if (open) {
        gsap.set(root, { visibility: "visible" });
        timelineRef.current = gsap.timeline()
          .to(root, { autoAlpha: 1, duration: 0.2, ease: "power2.out" })
          .call(() => inputRef.current?.focus({ preventScroll: true }), undefined, 0.05)
          .fromTo(panel, { y: 26, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.46, ease: "power3.out" }, 0.04);
      } else {
        timelineRef.current = gsap.timeline({
          onComplete: () => gsap.set(root, { visibility: "hidden" }),
        })
          .to(panel, { y: -12, autoAlpha: 0, duration: 0.2, ease: "power2.in" })
          .to(root, { autoAlpha: 0, duration: 0.18, ease: "power2.in" }, 0.04);
      }

      return () => timelineRef.current?.kill();
    },
    { scope: rootRef, dependencies: [open] },
  );

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const target = query.trim()
      ? `/${locale}/stories?q=${encodeURIComponent(query.trim())}`
      : `/${locale}/stories`;
    onClose();
    go(target);
  };

  return createPortal(
    <div
      className={`search-overlay ${open ? "is-open" : ""}`}
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="global-search-title"
      aria-hidden={!open}
    >
      <div className="search-dialog container" ref={panelRef}>
        <div className="search-dialog-head">
          <p id="global-search-title">{t.label}</p>
          <button className="search-close" type="button" onClick={onClose} aria-label={t.close} tabIndex={open ? 0 : -1}>
            <X aria-hidden="true" />
          </button>
        </div>

        <form className="global-search-form" role="search" onSubmit={submitSearch}>
          <Search aria-hidden="true" />
          <label className="sr-only" htmlFor="global-search-input">{t.label}</label>
          <input
            id="global-search-input"
            ref={inputRef}
            type="search"
            value={query}
            placeholder={t.placeholder}
            autoComplete="off"
            tabIndex={open ? 0 : -1}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} aria-label={t.clear} tabIndex={open ? 0 : -1}>
              <X aria-hidden="true" />
            </button>
          ) : <span aria-hidden="true" />}
        </form>

        <div className="search-results-head" aria-live="polite">
          <span>{deferredQuery ? t.results : t.latest}</span>
          <span>{String(matches.length).padStart(2, "0")}</span>
        </div>

        <div className="search-results">
          {visibleStories.map((story) => (
            <TransitionLink
              key={story.slug}
              className="search-result"
              to={`/${locale}/stories/${story.slug}`}
              onClick={onClose}
              tabIndex={open ? 0 : -1}
            >
              <div>
                <p>{getCategoryName(story.categoryId, locale)} · {formatDate(story.date, locale)}</p>
                <h2>{story.title[locale]}</h2>
              </div>
              <ArrowUpRight aria-hidden="true" />
            </TransitionLink>
          ))}
          {visibleStories.length === 0 ? <p className="search-empty">{t.noResults}</p> : null}
        </div>

        {deferredQuery && matches.length > 0 ? (
          <TransitionLink
            className="search-view-all"
            to={`/${locale}/stories?q=${encodeURIComponent(query.trim())}`}
            onClick={onClose}
            tabIndex={open ? 0 : -1}
          >
            {t.viewAll}<ArrowUpRight aria-hidden="true" />
          </TransitionLink>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
