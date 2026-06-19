/**
 * Thin fetch wrapper around the Bitbucket Cloud REST API v2.
 * Centralizes auth, query building, pagination and error mapping so that
 * tool handlers stay declarative.
 */

import type { Config } from './config.js';

export class BitbucketError extends Error {
  constructor(
    public status: number,
    message: string,
    public detail?: string
  ) {
    super(message);
    this.name = 'BitbucketError';
  }
}

type QueryValue = string | number | boolean | undefined | null;

export interface RequestOptions {
  query?: Record<string, QueryValue>;
  body?: unknown;
  /** Return the raw response text instead of parsing JSON (diffs, logs). */
  raw?: boolean;
}

export class BitbucketClient {
  constructor(private config: Config) {}

  private buildUrl(path: string, query?: Record<string, QueryValue>): string {
    const url = new URL(`${this.config.baseUrl}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  async request<T = unknown>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: this.config.authHeader,
      Accept: options.raw ? 'text/plain, */*' : 'application/json',
    };
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(this.buildUrl(path, options.query), {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      await this.throwApiError(response, method, path);
    }

    if (response.status === 204) {
      return undefined as T;
    }
    if (options.raw) {
      return (await response.text()) as T;
    }
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  private async throwApiError(
    response: Response,
    method: string,
    path: string
  ): Promise<never> {
    let message = `${response.status} ${response.statusText}`;
    let detail: string | undefined;
    try {
      const data = (await response.json()) as {
        error?: { message?: string; detail?: string };
      };
      if (data?.error?.message) message = data.error.message;
      detail = data?.error?.detail;
    } catch {
      // body was not JSON; keep the status line
    }
    if (response.status === 403) {
      detail =
        detail ??
        'Likely a missing token scope. Required scopes are listed in README/.env.example.';
    }
    throw new BitbucketError(response.status, `${method} ${path} -> ${message}`, detail);
  }

  /**
   * Follow Bitbucket's `next` cursor until `cap` values are collected.
   * Returns the collected page plus the next cursor (if more remain).
   */
  async paginate<T = unknown>(
    path: string,
    options: { query?: Record<string, QueryValue>; cap?: number } = {}
  ): Promise<{ values: T[]; next?: string; size?: number }> {
    const cap = options.cap ?? 50;
    const values: T[] = [];
    let page = await this.request<{ values?: T[]; next?: string; size?: number }>(
      'GET',
      path,
      { query: options.query }
    );
    let size = page.size;

    while (page.values?.length) {
      for (const v of page.values) {
        values.push(v);
        if (values.length >= cap) {
          return { values, next: page.next, size };
        }
      }
      if (!page.next) break;
      // `next` is an absolute URL; strip the base to reuse request().
      const nextPath = page.next.replace(this.config.baseUrl, '');
      page = await this.request<{ values?: T[]; next?: string; size?: number }>(
        'GET',
        nextPath
      );
      size = page.size ?? size;
    }
    return { values, next: page.next, size };
  }
}
