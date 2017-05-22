# OpenWindow
A scalable location-based social media website, allowing you to create and view posts from your region with automatic backup and failover
## Requirements
To host the website, you must have Node.js installed, along with npm, and have mongodb running on localhost. Then you must run 'npm install' in the webapp, post_database, and load_balancer directories. If you don't need to use all three types of servers, you only need to run 'npm install' in the server directory you will be using.

When you host the website, a new database, called openwindowdatabase, will be created. You should ensure that you do not already have a database with this name, otherwise it's contents may be overwritten.

## Overview
There are 3 types of Node.js servers you can run - the load balancer, the webapp, and the post database. You can start them up by navigating to their respective folders, and running 'npm start', after setting the correct values in the config file. All arguments are optional, as they simply 
override the values set in the config file.

The load balancer is the entry point into the website, you navigate to it's address to view the site. You should always start the load balancer first, as all other servers you start will try and communicate through it.

Multiple instances of the webapp server are run, and they recieve traffic redirected from the load balancer. Every instance should be identical, they just serve up the web page and retrieve data from the database servers. When starting up the first web server in the network, use the 'firstStartup' argument to specify that it is the first server in the network, and does not need to talk to any other servers in the network aside from the load balancer.

The post database server controls the main mongoDB database used to store the site posts. It has relatively basic endpoints that the webapp calls to modify and retrieve the website posts. Each post database services a specific geographic area, storing posts from that area, so when one is
started up it must connect to the network so it can be configured to
service a particular area of the world.

## Startup Script
In the shell_scripts directory, there is a script called 'startupTest.sh' which will start up all 3 types of servers locally, each using a different mongodb collection. It is set up assuming that you have gnome-terminal installed, but it should be easy to modify to fit whatever your setup is.

## Webapp Startup Arguments
port (number)

baseServersInfoCollection (string)

webServersInfoCollection (string)

firstStartup (boolean) - Must be true if this is the first server in the network, as it prevents the server from attempting to connect to other servers in the network

Example:
npm start port=8000 baseServersInfoCollection="SampleCollectionName"

## Post Database Startup Arguments
port (number)

postModelName (string)

backupPostModelName (string)

## Load Balancer Startup Arguments
port (number)