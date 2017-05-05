There are 3 types of Node.js servers you can run - the load balancer, the 
webapp, and the post database. You can start them up by navigating to their
respective folders, and running 'npm start', after setting the correct 
values in the config file. All arguments are optional, as they simply 
override the values set in the config file.

The load balancer is the entry point into the website, you navigate to 
it's address to view the site. You should always start the load balancer
first, as all other servers you start will try and communicate through it.

Multiple instances of the webapp server are run, and they recieve traffic
redirected from the load balancer. Every instance should be identical,
they just serve up the web page and retrieve data from the database servers.
When starting up the first web server in the network, use the 'firstStartup'
argument to specify that it is the first server in the network, and does
not need to talk to any other servers in the network aside from the load 
balancer.

The post database server controls the main mongoDB database used to store the
site posts. It has relatively basic endpoints that the webapp calls to 
modify and retrieve the website posts. Each post database services a 
specific geographic area, storing posts from that area, so when one is
started up it must connect to the network so it can be configured to
service a particular area of the world.

webapp arguments:
port (number)
baseServersInfoCollection (string)
webServersInfoCollection (string)
firstStartup (boolean) - Must be true if this is the first server in the 
    retwork, as it prevents the server from attempting to connect to other 
    servers in the network

Example:
npm start port=8000 baseServersInfoCollection="SampleCollectionName"

post_database arguments:
port (number)
postModelName (string)
backupPostModelName (string)

load_balancer arguments:
port (number)
