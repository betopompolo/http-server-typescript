const httpMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] as const;

export namespace HTTP {
  export type Headers = Record<string, string>;

  export type Method = typeof httpMethods[number];

  export type Request = {
    status: string;
    headers: HTTP.Headers;
    body: string;
  };

  export type RequestResponse = string | Uint8Array;

  export type StatusCode = 404 | 200 | 201;

  export type HandlerResponse = {
    data: RequestResponse;
    headers: HTTP.Headers;
    statusCode: StatusCode;
  }

  export type Handler = {
    path: string;
    method: Method;
    handle: (req: Request) => Promise<HandlerResponse>;
  }

  export function isHTTPMethod(method: unknown): method is Method {
    return typeof method === 'string' && httpMethods.includes(method as Method);
  }
}