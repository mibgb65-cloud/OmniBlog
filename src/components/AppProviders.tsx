import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import {
  createContext,
  type MouseEvent,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";

gsap.registerPlugin(useGSAP);

type Theme = "light" | "dark";

type ThemeContextValue = {
  theme: Theme;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0c0c0d" : "#f5f5f7");
    localStorage.setItem("omniblog-theme", theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === "light" ? "dark" : "light"));
  }, []);

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}

export function ScrollbarController() {
  useEffect(() => {
    const root = document.documentElement;
    const hoverQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
    let edgeActive = false;
    let scrollActive = false;
    let hideTimer = 0;

    const updateVisibility = () => {
      root.toggleAttribute("data-scrollbar-visible", edgeActive || scrollActive);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const nextEdgeActive = hoverQuery.matches && window.innerWidth - event.clientX <= 28;
      if (nextEdgeActive === edgeActive) return;
      edgeActive = nextEdgeActive;
      updateVisibility();
    };

    const handlePointerLeave = (event: globalThis.MouseEvent) => {
      if (event.relatedTarget || !edgeActive) return;
      edgeActive = false;
      updateVisibility();
    };

    const handleScroll = () => {
      scrollActive = true;
      updateVisibility();
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => {
        scrollActive = false;
        updateVisibility();
      }, 700);
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("mouseout", handlePointerLeave);
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.clearTimeout(hideTimer);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("mouseout", handlePointerLeave);
      window.removeEventListener("scroll", handleScroll);
      root.removeAttribute("data-scrollbar-visible");
    };
  }, []);

  return null;
}

type NavigationContextValue = {
  go: (to: string) => void;
};

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function useTransitionNavigation() {
  const navigation = useContext(NavigationContext);
  if (!navigation) throw new Error("useTransitionNavigation must be used inside NavigationProvider");
  return navigation;
}

export function NavigationProvider({ children }: PropsWithChildren) {
  const navigate = useNavigate();
  const overlayRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);

  const { contextSafe } = useGSAP(
    () => {
      gsap.set(overlayRef.current, { scaleY: 0, transformOrigin: "bottom center" });
      return () => timelineRef.current?.kill();
    },
    { scope: overlayRef },
  );

  const go = contextSafe((to: string) => {
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` === to) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      navigate(to);
      window.requestAnimationFrame(() => scrollToTarget(to));
      return;
    }

    const overlay = overlayRef.current;
    if (!overlay) return;
    timelineRef.current?.kill();
    overlay.style.pointerEvents = "auto";
    timelineRef.current = gsap
      .timeline({
        defaults: { ease: "power3.inOut" },
        onComplete: () => {
          overlay.style.pointerEvents = "none";
        },
      })
      .set(overlay, { transformOrigin: "bottom center", scaleY: 0 })
      .to(overlay, { scaleY: 1, duration: 0.36 })
      .call(() => {
        navigate(to);
        window.requestAnimationFrame(() => scrollToTarget(to));
      })
      .set(overlay, { transformOrigin: "top center" })
      .to(overlay, { scaleY: 0, duration: 0.42 }, "+=0.06");
  });

  return (
    <NavigationContext.Provider value={{ go }}>
      {children}
      <div className="route-curtain" ref={overlayRef} aria-hidden="true">
        <span>OMNI / JOURNAL</span>
      </div>
    </NavigationContext.Provider>
  );
}

function scrollToTarget(to: string) {
  const hash = new URL(to, window.location.origin).hash.slice(1);
  if (hash) {
    document.getElementById(hash)?.scrollIntoView();
    return;
  }
  window.scrollTo(0, 0);
}

export function TransitionLink({
  to,
  className,
  children,
  onClick,
  ...rest
}: PropsWithChildren<
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
    to: string;
  }
>) {
  const navigation = useTransitionNavigation();

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      rest.target === "_blank"
    ) {
      return;
    }
    event.preventDefault();
    navigation.go(to);
  };

  return (
    <a {...rest} href={to} className={className} onClick={handleClick}>
      {children}
    </a>
  );
}

export function OpeningSequence() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    return sessionStorage.getItem("omniblog-intro-seen") !== "true";
  });

  useGSAP(
    () => {
      if (!visible) return;
      document.body.style.overflow = "hidden";
      const timeline = gsap.timeline({
        defaults: { ease: "power3.out" },
        onComplete: () => {
          sessionStorage.setItem("omniblog-intro-seen", "true");
          document.body.style.overflow = "";
          setVisible(false);
        },
      });
      timeline
        .from(".opening-word", { yPercent: 120, duration: 0.72, stagger: 0.08 })
        .from(".opening-rule", { scaleX: 0, duration: 0.6, transformOrigin: "left" }, "-=0.42")
        .to(".opening-inner", { autoAlpha: 0, y: -18, duration: 0.3, ease: "power2.in" }, "+=0.18")
        .to(rootRef.current, { yPercent: -100, duration: 0.72, ease: "power4.inOut" });

      return () => {
        document.body.style.overflow = "";
      };
    },
    { scope: rootRef, dependencies: [visible] },
  );

  if (!visible) return null;

  return (
    <div className="opening" ref={rootRef} aria-hidden="true">
      <div className="opening-inner">
        <div className="opening-lockup">
          <span className="opening-clip"><span className="opening-word">OMNI</span></span>
          <span className="opening-clip"><span className="opening-word opening-word-muted">JOURNAL</span></span>
        </div>
        <span className="opening-rule" />
        <span className="opening-caption">Ideas worth slowing down for.</span>
      </div>
    </div>
  );
}

export function RouteAnnouncer() {
  const location = useLocation();
  const [message, setMessage] = useState("");

  useEffect(() => {
    setMessage(document.title);
  }, [location.pathname]);

  return <span className="sr-only" aria-live="polite">{message}</span>;
}
