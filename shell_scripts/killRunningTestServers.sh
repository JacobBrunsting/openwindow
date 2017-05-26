#!/bin/bash
kill -9 $(lsof -t -i:8001 -sTCP:LISTEN)
kill -9 $(lsof -t -i:8002 -sTCP:LISTEN)
kill -9 $(lsof -t -i:8003 -sTCP:LISTEN)
kill -9 $(lsof -t -i:9001 -sTCP:LISTEN)
kill -9 $(lsof -t -i:9002 -sTCP:LISTEN)
kill -9 $(lsof -t -i:9003 -sTCP:LISTEN)
kill -9 $(lsof -t -i:9004 -sTCP:LISTEN)
kill -9 $(lsof -t -i:8080 -sTCP:LISTEN)
sleep 0.1
while [[ $(wmctrl -l | grep port) ]]; do
    wmctrl -a port
    xdotool key KP_Enter
done
