(() => {
  try {
    const saved = localStorage.getItem("monolog-theme");
    const dark = saved === "dark"
      || (!saved && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  } catch {
    document.documentElement.dataset.theme = "light";
  }
})();
