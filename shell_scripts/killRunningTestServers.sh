#!/bin/bash
kill -9 $(lsof -t -i:8000 -sTCP:LISTEN)
kill -9 $(lsof -t -i:8008 -sTCP:LISTEN)
kill -9 $(lsof -t -i:8080 -sTCP:LISTEN)
kill -9 $(lsof -t -i:6050 -sTCP:LISTEN)
kill -9 $(lsof -t -i:5000 -sTCP:LISTEN)
kill -9 $(lsof -t -i:4000 -sTCP:LISTEN)
kill -9 $(lsof -t -i:3000 -sTCP:LISTEN)
