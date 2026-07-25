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
  category: string;
  excerpt: string;
  content: string;
  status: PostStatus;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
};

export type PostInput = {
  title: string;
  category: string;
  content: string;
  status: PostStatus;
};

export type RegistrationStatus = {
  open: boolean;
  configured: boolean;
};
