#!/bin/bash
gnome-terminal --window-with-profile=solarized-dark-small -x sh -c '
node --use-strict ../webapp/webapp.js firstSetup=true databaseServersInfoCollection=DatabaseServersInfo1 webServersInfoCollection=WebServersInfoCollection1 port=8080
echo "\n\nEND OF EXECUTION"
sleep infinity
'
sleep 2
gnome-terminal --window-with-profile=solarized-dark-small -x sh -c '
node --use-strict ../post_database/post_database.js postModelName=Posts1 backupPostModelName=BackupPosts1 port=8008
echo "\n\nEND OF EXECUTION"
sleep infinity
'
sleep 2
gnome-terminal --window-with-profile=solarized-dark-small -x sh -c '
node --use-strict ../webapp/webapp.js databaseServersInfoCollection=DatabaseServersInfo2 webServersInfoCollection=WebServersInfoCollection2 port=3000
echo "\n\nEND OF EXECUTION"
sleep infinity
'
sleep 2
gnome-terminal --window-with-profile=solarized-dark-small -x sh -c '
node --use-strict ../post_database/post_database.js postModelName=Posts2 backupPostModelName=BackupPosts2 port=8000
echo "\n\nEND OF EXECUTION"
sleep infinity
'
sleep 2
gnome-terminal --window-with-profile=solarized-dark-small -x sh -c '
node --use-strict ../post_database/post_database.js postModelName=Posts3 backupPostModelName=BackupPosts3 port=5000
echo "\n\nEND OF EXECUTION"
sleep infinity
'

