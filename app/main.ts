import * as net from "node:net";
import {HTTP} from "./http.ts";

const fileDirFlagIndex = Bun.argv.indexOf("--directory");
const fileDir = fileDirFlagIndex !== -1 ? Bun.argv[fileDirFlagIndex + 1] : "";

const server = net.createServer((socket) => {
  socket.on('data', async (chunk) => {
    const {status, headers, body: reqBody} = deserialize(chunk.toString());
    const {url, method} = deserializeStatusRequest(status);
    const compressionSchemas = getSupportedCompressionSchemas(headers);
    const selectedCompressionSchema = compressionSchemas.length > 0 ? compressionSchemas[0] : null;

    const defaultHeader: HTTP.Headers = selectedCompressionSchema ? {
      'Content-Encoding': selectedCompressionSchema,
    } : {};

    const connHeader = getConnectionHeader(headers);
    const shouldClose = connHeader === 'close';
    if (shouldClose) {
      defaultHeader[connectionHeaderKey] = 'close';
    }

    const handler = handlers.find(handler => handler.path === "/" ? url === handler.path : url.startsWith(handler.path) && handler.method === method);
    if (!handler) {
      writeResponse({
        socket,
        request: {
          headers,
        },
        response: createResponse(404)
      });
      return;
    }

    const handlerResponse = await handler.handle({
      status,
      headers: {
        ...headers,
        ...defaultHeader,
      },
      body: reqBody
    });

    const responseData = compress(
      handlerResponse.data.toString(),
      selectedCompressionSchema
    );

    // TODO: Remove nested 'headers'
    writeResponse({
      socket,
      request: {headers},
      response: createResponse(
        handlerResponse.statusCode,
        serializeHeaders({
          'Content-Type': 'text/plain',
          'Content-Length': responseData.length.toString(),
          ...(handlerResponse.headers ?? {}),
          ...defaultHeader,
        }),
        responseData
      )
    });
  })
});

server.listen(4221, "localhost");

// TODO: Organize
const handlers: HTTP.Handler[] = [
  {
    path: '/echo',
    method: 'GET',
    handle: async (req) => {
      const url = deserializeStatusRequest(req.status).url;

      return {
        data: url.replace('/echo/', ''),
        statusCode: 200,
        headers: req.headers,
      };
    }
  },
  {
    path: '/user-agent',
    method: 'GET',
    handle: async (req) => {
      const userAgentValue = req.headers['User-Agent'];
      return {
        data: userAgentValue,
        statusCode: 200,
      }
    }
  },
  {
    path: '/files',
    method: 'GET',
    handle: async (req) => {
      const {url} = deserializeStatusRequest(req.status);
      const filename = url.replace('/files/', '');
      const fileURL = Bun.pathToFileURL(`${fileDir}/${filename}`);
      try {
        const file = await Bun.file(fileURL).text();
        return {
          data: file,
          statusCode: 200,
          headers: {
            'Content-Type': 'application/octet-stream',
          }
        }
      } catch {
        return {
          data: '',
          statusCode: 404,
        }
      }
    }
  },
  {
    path: '/files',
    method: 'POST',
    handle: async (req) => {
      const {url} = deserializeStatusRequest(req.status);
      const filename = url.replace('/files/', '');
      const fileURL = Bun.pathToFileURL(`${fileDir}/${filename}`);
      await Bun.file(fileURL).write(req.body);
      return {
        statusCode: 201,
        data: ''
      };
    }
  },
  {
    path: '/',
    method: 'GET',
    handle: async () => {
      return {
        data: '',
        statusCode: 200,
      }
    }
  }
];


const crlf = "\r\n" as const;


const statusMessages: Record<HTTP.StatusCode, string> = {
  "200": "OK",
  "201": "Created",
  "404": "Not Found"
}

function createResponse(status: HTTP.StatusCode, header: string = '', body: string | Uint8Array = ""): HTTP.RequestResponse {
  const statusMessage = statusMessages[status];
  const statusAndHeader = `HTTP/1.1 ${status} ${statusMessage}${crlf}${header}${crlf}`;

  if (typeof body === 'string') {
    return `${statusAndHeader}${body}`;
  } else {
    const headerBuffer = Buffer.from(statusAndHeader);
    return Buffer.concat([headerBuffer, body]);
  }
}

type WriteResponseParams = {
  socket: net.Socket;
  request: {
    headers: HTTP.Headers;
  }
  response: HTTP.RequestResponse;
}

function writeResponse({socket, request, response}: WriteResponseParams) {
  if (request.headers.Connection === 'close') {
    socket.end(response);
  } else {
    socket.write(response);
  }
}

function serializeHeaders(headers: HTTP.Headers): string {
  return Object.entries(headers).map(([key, value]) => `${key}: ${value}${crlf}`).join('');
}

function deserializeStatusRequest(status: string): { method: HTTP.Method, url: string } {
  const [method, url] = status.split(" ");
  if (!HTTP.isHTTPMethod(method)) {
    throw new Error(`Invalid HTTP method ${method}`);
  }

  return {method, url};
}


// TODO: move
type Request = {
  status: string;
  headers: HTTP.Headers;
  body: string;
}

function deserialize(req: string): Request {
  const [requestLineAndHeaders, body] = req.split(crlf + crlf);
  const splitted = requestLineAndHeaders.split(crlf);
  const status = splitted[0];
  const headers = splitted.slice(1).reduce((acc, line) => {
    const [key, value] = line.split(': ');
    if (key && value) {
      acc[key] = value;
    }
    return acc;
  }, {} as HTTP.Headers);
  return {status, headers, body: body ?? ""};
}

const supportedCompressionSchemas = [
  'gzip',
] as const;
type CompressionSchema = typeof supportedCompressionSchemas[number];

function isCompressionSchema(value: unknown): value is CompressionSchema {
  return typeof value === 'string' && supportedCompressionSchemas.some(schema => schema === value);
}

const compressionSchemaSeparator = ', ';

function getSupportedCompressionSchemas(header: HTTP.Headers): CompressionSchema[] {
  const clientSchemas = (header['Accept-Encoding'] ?? "").split(compressionSchemaSeparator);

  return clientSchemas.filter(isCompressionSchema);
}

const connectionHeaderKey = 'Connection';

function getConnectionHeader(header: HTTP.Headers) {
  return connectionHeaderKey in header ? header.Connection : null;
}

// TODO: Improve both body and return types
type Compressor = (body: string) => ReturnType<typeof Bun.gzipSync>;
const compressors: Record<CompressionSchema, Compressor> = {
  gzip(body) {
    return Bun.gzipSync(body);
  }
}

// TODO: Improve data type
function compress(data: string, compressorSchema: CompressionSchema | null) {
  return compressorSchema ? compressors[compressorSchema](data) : data;
}