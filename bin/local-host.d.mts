export interface HostApiRequestOptions {
  method?: string;
  body?: unknown;
  timeoutMs?: number;
}

export interface HostApiResponse<T> {
  body: T;
  status: number;
}

export function hostApiRequest<T = unknown>(
  path: string,
  options?: HostApiRequestOptions,
): Promise<HostApiResponse<T>>;
