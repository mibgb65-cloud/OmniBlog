export function formatDate(value: string | null): string {
  if (!value) return "未发布";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}

export function readingTime(content: string): string {
  const count = content.replace(/\s/g, "").length;
  return `${Math.max(1, Math.ceil(count / 400))} 分钟阅读`;
}

export function formatReadingMinutes(minutes: number): string {
  return `${Math.max(1, minutes)} 分钟阅读`;
}

const decimalFormatter = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${new Intl.NumberFormat("zh-CN").format(bytes)} B`;
  if (bytes < 1024 * 1024) return `${decimalFormatter.format(bytes / 1024)} KB`;
  return `${decimalFormatter.format(bytes / (1024 * 1024))} MB`;
}
