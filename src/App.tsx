import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useState,
  type AnimationEvent,
} from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Loading } from "./components/Loading";
import { useAuth } from "./lib/auth";

const AboutPage = lazy(() => import("./pages/AboutPage").then((module) => ({
  default: module.AboutPage,
})));
const AuthPage = lazy(() => import("./pages/AuthPage").then((module) => ({
  default: module.AuthPage,
})));
const ArticlesPage = lazy(() => import("./pages/ArticlesPage").then((module) => ({
  default: module.ArticlesPage,
})));
const DashboardPage = lazy(() => import("./pages/DashboardPage").then((module) => ({
  default: module.DashboardPage,
})));
const EditorPage = lazy(() => import("./pages/EditorPage").then((module) => ({
  default: module.EditorPage,
})));
const HomePage = lazy(() => import("./pages/HomePage").then((module) => ({
  default: module.HomePage,
})));
const MediaPage = lazy(() => import("./pages/MediaPage").then((module) => ({
  default: module.MediaPage,
})));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage").then((module) => ({
  default: module.NotFoundPage,
})));
const PostPage = lazy(() => import("./pages/PostPage").then((module) => ({
  default: module.PostPage,
})));

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Loading label="正在确认身份" />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return children;
}

type RoutePhase = "entering" | "idle" | "leaving";

export function App() {
  const location = useLocation();
  const [displayLocation, setDisplayLocation] = useState(location);
  const [routePhase, setRoutePhase] = useState<RoutePhase>("entering");
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    const samePath = location.pathname === displayLocation.pathname;

    if (samePath) {
      if (
        location.key !== displayLocation.key ||
        location.search !== displayLocation.search ||
        location.hash !== displayLocation.hash
      ) {
        setDisplayLocation(location);
      }
      if (routePhase === "leaving") {
        setRoutePhase(prefersReducedMotion ? "idle" : "entering");
      }
      return;
    }

    if (prefersReducedMotion) {
      setDisplayLocation(location);
      setRoutePhase("idle");
      return;
    }

    if (routePhase !== "leaving") {
      setRoutePhase("leaving");
    }
  }, [displayLocation, location, prefersReducedMotion, routePhase]);

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, [displayLocation.pathname]);

  const handleRouteAnimationEnd = (event: AnimationEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;

    if (routePhase === "leaving") {
      setDisplayLocation(location);
      setRoutePhase("entering");
      return;
    }

    if (routePhase === "entering") {
      setRoutePhase("idle");
    }
  };

  return (
    <Layout>
      <div
        className={`route-transition route-${routePhase}`}
        onAnimationEnd={handleRouteAnimationEnd}
        key={displayLocation.pathname}
      >
        <Suspense fallback={<Loading label="正在打开页面" />}>
          <Routes location={displayLocation}>
            <Route path="/" element={<HomePage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/articles" element={<ArticlesPage />} />
            <Route path="/posts/:slug" element={<PostPage />} />
            <Route path="/login" element={<AuthPage mode="login" />} />
            <Route path="/register" element={<AuthPage mode="register" />} />
            <Route
              path="/dashboard"
              element={<Protected><DashboardPage /></Protected>}
            />
            <Route
              path="/dashboard/media"
              element={<Protected><MediaPage /></Protected>}
            />
            <Route
              path="/write"
              element={<Protected><EditorPage /></Protected>}
            />
            <Route
              path="/write/:id"
              element={<Protected><EditorPage /></Protected>}
            />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </div>
    </Layout>
  );
}
