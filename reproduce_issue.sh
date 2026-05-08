#!/bin/bash
./your_program.sh &
SERVER_PID=$!
sleep 2

echo "Testing /echo/abc with gzip..."
curl -v -H "Accept-Encoding: gzip" http://localhost:4221/echo/abc 2>&1 | tee curl_verbose.txt

echo "Hexdump of response:"
curl -s -H "Accept-Encoding: gzip" http://localhost:4221/echo/abc | hexdump -C

kill $SERVER_PID
