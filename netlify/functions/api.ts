import { Readable } from 'node:stream';
import type http from 'node:http';
import { handleApiRequest } from '../../src/server/app.js';

interface NetlifyEvent {
  path: string;
  httpMethod: string;
  headers?: Record<string, string | undefined>;
  queryStringParameters?: Record<string, string | undefined> | null;
  rawQuery?: string;
  body?: string | null;
  isBase64Encoded?: boolean;
}

interface NetlifyResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export const handler = async (event: NetlifyEvent): Promise<NetlifyResponse> => {
  const query = event.rawQuery
    ? `?${event.rawQuery}`
    : event.queryStringParameters && Object.keys(event.queryStringParameters).length > 0
    ? '?' +
      new URLSearchParams(
        Object.entries(event.queryStringParameters).reduce<Record<string, string>>((acc, [k, v]) => {
          if (v !== undefined) acc[k] = v;
          return acc;
        }, {})
      ).toString()
    : '';

  const fullUrl = `${event.path || '/api/health'}${query}`;
  const rawBody = event.body
    ? event.isBase64Encoded
      ? Buffer.from(event.body, 'base64')
      : Buffer.from(event.body, 'utf-8')
    : Buffer.alloc(0);

  const reqStream = Readable.from(rawBody.length > 0 ? [rawBody] : []) as unknown as http.IncomingMessage;
  reqStream.url = fullUrl;
  reqStream.method = event.httpMethod || 'GET';
  reqStream.headers = (event.headers || {}) as http.IncomingHttpHeaders;

  let statusCode = 200;
  const responseHeaders: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
  };
  const responseChunks: Buffer[] = [];

  const resMock = {
    writeHead(code: number, headers?: Record<string, string>) {
      statusCode = code;
      if (headers) {
        for (const [k, v] of Object.entries(headers)) {
          responseHeaders[k] = String(v);
        }
      }
      return this;
    },
    end(chunk?: string | Buffer) {
      if (chunk) {
        responseChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf-8'));
      }
    },
  } as unknown as http.ServerResponse;

  const handled = await handleApiRequest(reqStream, resMock);
  if (!handled) {
    return {
      statusCode: 404,
      headers: responseHeaders,
      body: JSON.stringify({ error: `Ruta no encontrada: ${fullUrl}` }),
    };
  }

  return {
    statusCode,
    headers: responseHeaders,
    body: Buffer.concat(responseChunks).toString('utf-8'),
  };
};
