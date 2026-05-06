import * as net from "net";

// You can use print statements as follows for debugging, they'll be visible when running tests.
console.log("Logs from your program will appear here!");

const server = net.createServer((socket) => {
  socket.on('data', (chunk) => {
    const str = chunk.toString();
    const [status] = str.split("\n");
    const [_method, url] = status.split(" ");

    if (url === '/') {
      socket.write(createResponse(200));
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

function createResponse(status: 404 | 200): string {
  const statusMessage = status === 404 ? "Not Found" : "OK";
  return `HTTP/1.1 ${status} ${statusMessage}${crlf}${crlf}`;
}