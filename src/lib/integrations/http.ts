const DEFAULT_TIMEOUT_MS = 12000;

export async function fetchJson<T>(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        ...(init.headers ?? {})
      }
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Request failed (${response.status}): ${body.slice(0, 280)}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}
