export type User = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

export type PostStatus = "draft" | "published";
export type PostVisibility = "public" | "unlisted" | "private";

export type Post = {
  id: string;
  authorId: string;
  authorName: string;
  title: string;
  slug: string;
  category: string;
  excerpt: string;
  content: string;
  likeCount: number;
  likedByVisitor?: boolean;
  status: PostStatus;
  visibility: PostVisibility;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
};

export type PostSummary = {
  id: string;
  authorName: string;
  title: string;
  slug: string;
  category: string;
  excerpt: string;
  likeCount: number;
  readingMinutes: number;
  publishedAt: string | null;
};

export type PaginatedPosts = {
  items: PostSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type AdminPostSummary = {
  id: string;
  title: string;
  slug: string;
  category: string;
  status: PostStatus;
  visibility: PostVisibility;
  updatedAt: string;
  publishedAt: string | null;
};

export type PostInput = {
  title: string;
  category: string;
  content: string;
  status: PostStatus;
  visibility: PostVisibility;
};

export type Category = {
  id: string;
  name: string;
  sortOrder: number;
  postCount: number;
  createdAt: string;
};

export type RegistrationStatus = {
  open: boolean;
  configured: boolean;
};

export type MediaUpload = {
  contentType: string;
  key: string;
  size: number;
  url: string;
};

export type MediaItem = MediaUpload & {
  uploadedAt: string;
  inUse: boolean;
};

export type MediaPage = {
  items: MediaItem[];
  cursor: string | null;
};
