import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { NavigationProvider, OpeningSequence, ScrollbarController, ThemeProvider } from "./components/AppProviders";
import { LocaleLayout, RootRedirect, getLocale } from "./components/Layout";
import { AboutPage } from "./pages/AboutPage";
import { HomePage } from "./pages/HomePage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { StoriesPage } from "./pages/StoriesPage";

const ArticlePage = lazy(() => import("./pages/ArticlePage").then((module) => ({ default: module.ArticlePage })));
const StudioPage = lazy(() => import("./pages/StudioPage").then((module) => ({ default: module.StudioPage })));

function LegacyStoryRedirect() {
  const { slug } = useParams();
  return <Navigate to={`/zh/stories/${slug ?? ""}`} replace />;
}

function LocaleFallback() {
  const { locale } = useParams();
  return <Navigate to={`/${getLocale(locale) ?? "zh"}`} replace />;
}

export default function App() {
  const location = useLocation();
  return (
    <ThemeProvider>
      <ScrollbarController />
      <NavigationProvider>
        <a className="skip-link" href="#main-content">Skip to content</a>
        {location.pathname !== "/studio" ? <OpeningSequence /> : null}
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/studio" element={<Suspense fallback={<div className="page-loader" aria-live="polite">Loading…</div>}><StudioPage /></Suspense>} />
          <Route path="/stories/:slug" element={<LegacyStoryRedirect />} />
          <Route path="/:locale" element={<LocaleLayout />}>
            <Route index element={<HomePage />} />
            <Route path="stories" element={<StoriesPage />} />
            <Route path="stories/category/:categoryId" element={<StoriesPage />} />
            <Route path="stories/:slug" element={<Suspense fallback={<div className="page-loader" aria-live="polite">Loading…</div>}><ArticlePage /></Suspense>} />
            <Route path="about" element={<AboutPage />} />
            <Route path="404" element={<NotFoundPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
          <Route path="*" element={<LocaleFallback />} />
        </Routes>
      </NavigationProvider>
    </ThemeProvider>
  );
}
