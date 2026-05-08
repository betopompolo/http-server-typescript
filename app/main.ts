import * as net from "net";

const fileDirFlagIndex = Bun.argv.findIndex(flag => flag === "--directory");
const fileDir = fileDirFlagIndex !== -1 ? Bun.argv[fileDirFlagIndex + 1] : "";

const server = net.createServer((socket) => {
  socket.on('data', async (chunk) => {
    const {status, headers} = deserialize(chunk.toString());
    const {url} = deserializeStatusRequest(status);

    if (url === '/') {
      socket.write(createResponse(200));
    } else if (url.startsWith("/echo")) {
      const body = url.replace('/echo/', '');
      const header = serializeHeaders({
        'Content-Type': 'text/plain',
        'Content-Length': body.length.toString(),
      });
      socket.write(
        createResponse(
          200,
          header,
          body
        )
      );
    } else if (url.startsWith('/user-agent')) {
      const userAgentValue = headers['User-Agent'];
      socket.write(
        createResponse(
          200,
          serializeHeaders({
            'Content-Type': 'text/plain',
            'Content-Length': userAgentValue.length.toString(),
          }),
          userAgentValue
        )
      )
    } else if (url.startsWith('/files')) {
      try {
        const filename = url.replace('/files/', '');
        const fileURL = Bun.pathToFileURL(`${fileDir}/${filename}`);
        const file = await Bun.file(fileURL).text();
        socket.write(
          createResponse(
            200,
            serializeHeaders({
              'Content-Type': 'application/octet-stream',
              'Content-Length': file.length.toString(),
            }),
            file
          )
        );
      } catch (e) {
        socket.write(createResponse(404));
      }
    }
    else {
      socket.write(createResponse(404));
    }
  })
  socket.on("close", () => {
    socket.end();
  });
});

server.listen(4221, "localhost");

const crlf = "\r\n" as const;

function createResponse(status: 404 | 200, header: string = '', body: string = ""): string {
  const statusMessage = status === 404 ? "Not Found" : "OK";
  return [
    `HTTP/1.1 ${status} ${statusMessage}`,
    header,
    body
  ].join(crlf);
}

function serializeHeaders(headers: Record<string, string>): string {
  return Object.entries(headers).map(([key, value]) => `${key}: ${value}${crlf}`).join('');
}

function deserializeStatusRequest(status: string): { method: string, url: string } {
  const [method, url] = status.split(" ");
  return { method, url };
}

function deserialize(req: string): { status: string, headers: Record<string, string>, body: string} {
  const splitted = req.split(crlf);
  const status = splitted[0];
  const headers = splitted.slice(1, -1).reduce((acc, line) => {
    const [key, value] = line.split(': ');
    acc[key] = value;
    return acc;
  }, {} as Record<string, string>);
  const body = splitted[splitted.length - 1];
  return { status, headers, body };
}