#!/bin/bash
kill -9 $(lsof -t -i:8080 -sTCP:LISTEN)
kill -9 $(lsof -t -i:8000 -sTCP:LISTEN)
kill -9 $(lsof -t -i:8008 -sTCP:LISTEN)
kill -9 $(lsof -t -i:9000 -sTCP:LISTEN)
kill -9 $(lsof -t -i:6050 -sTCP:LISTEN)
kill -9 $(lsof -t -i:5000 -sTCP:LISTEN)
kill -9 $(lsof -t -i:4000 -sTCP:LISTEN)
kill -9 $(lsof -t -i:3000 -sTCP:LISTEN)

gnome-terminal -x sh -c '
echo -ne "\033]0;port 8080 load balancer\007"
node --use-strict ../load_balancer/load_balancer.js port=8080
echo "\n\nEND OF EXECUTION\n\nPress enter to exit"
read _
'
sleep 1

gnome-terminal -x sh -c '
echo -ne "\033]0;port 8001 webserver\007"
node --use-strict ../webapp/webapp.js firstSetup=true databaseServersInfoCollection=DatabaseServersInfo1 webServersInfoCollection=WebServersInfoCollection1 port=8001
echo "\n\nEND OF EXECUTION\n\nPress enter to exit"
read _
'
sleep 1
gnome-terminal -x sh -c '
echo -ne "\033]0;port 8002 webserver\007"
node --use-strict ../webapp/webapp.js databaseServersInfoCollection=DatabaseServersInfo2 webServersInfoCollection=WebServersInfoCollection2 port=8002
echo "\n\nEND OF EXECUTION\n\nPress enter to exit"
read _
'
sleep 1
gnome-terminal -x sh -c '
echo -ne "\033]0;port 9001 database\007"
node --use-strict ../post_database/post_database.js postModelName=Posts1 backupPostModelName=BackupPosts1 port=9001
echo "\n\nEND OF EXECUTION\n\nPress enter to exit"
read _
'
sleep 1
gnome-terminal -x sh -c '
echo -ne "\033]0;port 8003 webserver\007"
node --use-strict ../webapp/webapp.js databaseServersInfoCollection=DatabaseServersInfo3 webServersInfoCollection=WebServersInfoCollection3 port=8003
echo "\n\nEND OF EXECUTION\n\nPress enter to exit"
read _
'
sleep 1
gnome-terminal -x sh -c '
echo -ne "\033]0;port 9002 database\007"
node --use-strict ../post_database/post_database.js postModelName=Posts2 backupPostModelName=BackupPosts2 port=9002
echo "\n\nEND OF EXECUTION\n\nPress enter to exit"
read _
'
sleep 1
gnome-terminal -x sh -c '
echo -ne "\033]0;port 9003 database\007"
node --use-strict ../post_database/post_database.js postModelName=Posts3 backupPostModelName=BackupPosts3 port=9003
echo "\n\nEND OF EXECUTION\n\nPress enter to exit"
read _
'
sleep 1
gnome-terminal -x sh -c '
echo -ne "\033]0;port 9004 database\007"
node --use-strict ../post_database/post_database.js postModelName=Posts4 backupPostModelName=BackupPosts4 port=9004
echo "\n\nEND OF EXECUTION\n\nPress enter to exit"
read _
'
