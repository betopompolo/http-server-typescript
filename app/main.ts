import * as net from "net";

const fileDirFlagIndex = Bun.argv.findIndex(flag => flag === "--directory");
const fileDir = fileDirFlagIndex !== -1 ? Bun.argv[fileDirFlagIndex + 1] : "";

const server = net.createServer((socket) => {
  socket.on('data', async (chunk) => {
    const {status, headers, body: reqBody} = deserialize(chunk.toString());
    const {url, method} = deserializeStatusRequest(status);
    const compressionSchemas = getSupportedCompressionSchemas(headers);
    const selectedCompressionSchema = compressionSchemas.length > 0 ? compressionSchemas[0] : null;
    const defaultHeader: Headers = selectedCompressionSchema ? {
      'Content-Encoding': selectedCompressionSchema,
    } : {};

    // TODO: Implement a better handler for urls
    if (url === '/') {
      socket.write(createResponse(200, serializeHeaders(defaultHeader)));
    } else if (url.startsWith("/echo")) {
      const responseBody = compress(url.replace('/echo/', ''), selectedCompressionSchema)
      const header = serializeHeaders({
        ...defaultHeader,
        'Content-Type': 'text/plain',
        'Content-Length': responseBody.length.toString(),
      });
      socket.write(
        createResponse(
          200,
          header,
          responseBody,
        )
      );
    } else if (url.startsWith('/user-agent')) {
      const userAgentValue = headers['User-Agent'];
      const responseBody = compress(userAgentValue, selectedCompressionSchema);
      socket.write(
        createResponse(
          200,
          serializeHeaders({
            ...defaultHeader,
            'Content-Type': 'text/plain',
            'Content-Length': responseBody.length.toString(),
          }),
          responseBody
        )
      )
    } else if (url.startsWith('/files')) {
      const filename = url.replace('/files/', '');
      const fileURL = Bun.pathToFileURL(`${fileDir}/${filename}`);

      if (method === 'POST') {
        await Bun.file(fileURL).write(reqBody);
        socket.write(createResponse(201));
      } else {
        try {
          const file = await Bun.file(fileURL).text();
          const responseBody = compress(file, selectedCompressionSchema);
          socket.write(
            createResponse(
              200,
              serializeHeaders({
                ...defaultHeader,
                'Content-Type': 'application/octet-stream',
                'Content-Length': responseBody.length.toString()
              }),
              responseBody
            )
          );
        } catch (e) {
          socket.write(createResponse(404));
        }

      }
    } else {
      socket.write(createResponse(404));
    }
  })
  socket.on("close", () => {
    socket.end();
  });
});

server.listen(4221, "localhost");

// TODO: Organize

const crlf = "\r\n" as const;

type RequestStatus = 404 | 200 | 201;

type Headers = Record<string, string>;

const statusMessages: Record<RequestStatus, string> = {
  "200": "OK",
  "201": "Created",
  "404": "Not Found"
}

function createResponse(status: RequestStatus, header: string = '', body: string | Uint8Array = ""): string | Uint8Array {
  const statusMessage = statusMessages[status];
  const statusAndHeader = [
    `HTTP/1.1 ${status} ${statusMessage}`,
    `${header}${crlf}`,
  ].join(crlf);

  if (typeof body === 'string') {
    return `${statusAndHeader}${body}`;
  } else {
    const headerBuffer = Buffer.from(statusAndHeader);
    return Buffer.concat([headerBuffer, body]);
  }
}

function serializeHeaders(headers: Headers): string {
  return Object.entries(headers).map(([key, value]) => `${key}: ${value}${crlf}`).join('');
}

function deserializeStatusRequest(status: string): { method: string, url: string } {
  const [method, url] = status.split(" ");
  return { method, url };
}

function deserialize(req: string): { status: string, headers: Headers, body: string} {
  const [requestLineAndHeaders, body] = req.split(crlf + crlf);
  const splitted = requestLineAndHeaders.split(crlf);
  const status = splitted[0];
  const headers = splitted.slice(1).reduce((acc, line) => {
    const [key, value] = line.split(': ');
    if (key && value) {
      acc[key] = value;
    }
    return acc;
  }, {} as Headers);
  return { status, headers, body: body ?? "" };
}

const supportedCompressionSchemas = [
  'gzip',
] as const;
type CompressionSchema = typeof supportedCompressionSchemas[number];
function isCompressionSchema(value: unknown): value is CompressionSchema {
  return typeof value === 'string' && supportedCompressionSchemas.some(schema => schema === value);
}

const compressionSchemaSeparator = ', ';
function getSupportedCompressionSchemas(header: Headers): CompressionSchema[] {
  const clientSchemas = (header['Accept-Encoding'] ?? "").split(compressionSchemaSeparator);

  return clientSchemas.filter(isCompressionSchema);
}

// TODO: Improve both body and return types
type Compressor = (body: string) => ReturnType<typeof Bun.gzipSync>;
const compressors: Record<CompressionSchema, Compressor> = {
  gzip(body) {
    return Bun.gzipSync(body);
  }
}

// TODO: Improve data type
function compress(data: string, compressorSchema: CompressionSchema | null)  {
  return compressorSchema ? compressors[compressorSchema](data) : data;
}