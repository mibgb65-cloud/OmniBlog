type ApiEnvelope<T> = {
  data: T;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
      ...options?.headers,
    },
  });

  const payload = (await response.json()) as ApiEnvelope<T> | { error: string };
  if (!response.ok) {
    throw new ApiError("error" in payload ? payload.error : "请求失败。", response.status);
  }
  return (payload as ApiEnvelope<T>).data;
}

