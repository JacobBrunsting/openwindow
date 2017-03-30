The easiest way to start up the website is to run the startup script located in the 'shell_scripts' directory. It will start up a couple of web servers and a few database servers (assuming you are on linux), and give them each their own mongodb collection to work with. Mongo needs to be set up before doing this, but I will finish the readme later.

Ensure that at least one instance of webapp.js is running before starting up the post_database

Starting up webapp.js:
cd webapp
node --use-strict webapp.js

Arguments:
port (number)
baseServersInfoCollection (string)
webServersInfoCollection (string)
firstStartup (boolean) - Must be true if this is the first server in the network, as it prevents the server from attempting to connect to other servers in the network

Example:
node --use-strict webapp.js port=8000 baseServersInfoCollection="SampleCollectionName"

Starting up post_database.js
cd post_database
node --use-strict post_database.js

Arguments:
port (number)
postModelName (string)
backupPostModelName (string)
