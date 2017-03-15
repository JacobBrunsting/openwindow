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
