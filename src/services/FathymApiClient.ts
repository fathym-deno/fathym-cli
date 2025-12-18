import { FathymConfigStore } from './FathymConfigStore.ts';

export class MissingAccessTokenError extends Error {
  public constructor() {
    super("Access token not available. Run 'ftm auth' to sign in.");
  }
}

export class FathymApiClient {
  public constructor(private readonly configStore: FathymConfigStore) {}

  public async Request(path: string, init: RequestInit = {}): Promise<Response> {
    const url = await this.buildUrl(path);
    const headers = await this.buildHeaders(init.headers);

    const response = await fetch(url, {
      ...init,
      headers,
    });

    return response;
  }

  public async GetJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.Request(path, {
      ...init,
      method: init?.method ?? 'GET',
    });

    if (!response.ok) {
      throw new Error(
        `Request to ${path} failed with status ${response.status}: ${await response
          .text()}`,
      );
    }

    return await response.json() as T;
  }

  public async PostJson<TBody extends Record<string, unknown>, TResponse>(
    path: string,
    body: TBody,
    init?: RequestInit,
  ): Promise<TResponse> {
    const response = await this.Request(path, {
      ...init,
      method: init?.method ?? 'POST',
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(
        `Request to ${path} failed with status ${response.status}: ${await response
          .text()}`,
      );
    }

    return await response.json() as TResponse;
  }

  protected async buildUrl(path: string): Promise<string> {
    const base = await this.configStore.GetApiRoot();
    const normalizedBase = base.endsWith('/') ? base : `${base}/`;
    const trimmedPath = path.startsWith('/') ? path.slice(1) : path;

    return new URL(trimmedPath, normalizedBase).toString();
  }

  protected async buildHeaders(
    existing?: HeadersInit,
  ): Promise<Headers> {
    const headers = new Headers(existing ?? {});

    const token = await this.configStore.GetAccessToken();
    if (!token?.access_token) {
      throw new MissingAccessTokenError();
    }

    if (!headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token.access_token}`);
    }

    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    return headers;
  }
}
