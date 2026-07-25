export type User = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

export type PostStatus = "draft" | "published";

export type Post = {
  id: string;
  authorId: string;
  authorName: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  status: PostStatus;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
};

export type PostInput = {
  title: string;
  content: string;
  status: PostStatus;
};

