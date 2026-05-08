import * as net from "net";

// You can use print statements as follows for debugging, they'll be visible when running tests.
console.log("Logs from your program will appear here!");

// GET /echo/abc HTTP/1.1\r\nHost: localhost:4221\r\nUser-Agent: curl/7.64.1\r\nAccept: */*\r\n\r\n

const server = net.createServer((socket) => {
  socket.on('data', (chunk) => {
    const str = chunk.toString();
    const [status] = str.split("\n");
    const [_method, url] = status.split(" ");

    if (url === '/') {
      socket.write(createResponse(200));
    } else if (url.startsWith("/echo")) {
      const body = url.replace('/echo/', '');
      const header = serializeHeaders({
        'Content-Type': 'text/plain',
        'Content-Length': body.length.toString(),
      });
      console.log(header);
      console.log(body);
      socket.write(
        createResponse(
          200,
          header,
          body
        )
      );
    } else {
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