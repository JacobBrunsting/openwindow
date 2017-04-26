#!/bin/bash
kill -9 $(lsof -t -i:8080 -sTCP:LISTEN)
kill -9 $(lsof -t -i:8000 -sTCP:LISTEN)
kill -9 $(lsof -t -i:8008 -sTCP:LISTEN)
kill -9 $(lsof -t -i:9000 -sTCP:LISTEN)
kill -9 $(lsof -t -i:6050 -sTCP:LISTEN)
kill -9 $(lsof -t -i:5000 -sTCP:LISTEN)
kill -9 $(lsof -t -i:4000 -sTCP:LISTEN)
kill -9 $(lsof -t -i:3000 -sTCP:LISTEN)
sleep 0.1
while [[ $(wmctrl -l | grep port) ]]; do
    wmctrl -a port
    xdotool key KP_Enter
done
