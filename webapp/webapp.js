/**
 * @file Runs a webapp that allows users to anonymously create, comment on, and
 * vote on posts in their geographic area. These posts area stored on a network
 * of database servers, and each post is backed up so that is not lost in the 
 * event of a server failure or disconnection.
 */

// ============== Settings ==============

const config = require('./config');

const PORT_KEY = "port";
const BOUND_IP_KEY = "boundIp";
const MONGO_DB_ADDRESS_KEY = "mongoDbAddress";
const SECONDS_BETWEEN_SERVER_SIZE_CALCULATIONS_KEY = 'secondsBetweenServerSizeCalculations';
const DATABASE_SERVERS_INFO_COLLECTION_KEY = 'databaseServersInfoCollection';
const WEB_SERVERS_INFO_COLLECTION_KEY = 'webServersInfoCollection';

var settings = {};
settings[PORT_KEY] = 8080;
settings[BOUND_IP_KEY] = '0.0.0.0';
settings[MONGO_DB_ADDRESS_KEY] = 'mongodb://localhost/openwindowdatabase';
settings[SECONDS_BETWEEN_SERVER_SIZE_CALCULATIONS_KEY] = 20;
settings[DATABASE_SERVERS_INFO_COLLECTION_KEY] = 'DatabaseServersInfo';
settings[WEB_SERVERS_INFO_COLLECTION_KEY] = 'WebServersInfo';

for (var key in settings) {
    if (config[key]) {
        settings[key] = config[key];
    } else {
        console.log(key + " not set in config file, defaulting to " + settings[key]);
    }
}

// ============== Imports ===============

const bodyParser = require('body-parser');
const express = require('express');
const app = express();
const mongoose = require('mongoose');
const request = require('request');
const trafficDirector = require('./traffic_director/traffic_director')
    (app, mongoose, settings[DATABASE_SERVERS_INFO_COLLECTION_KEY]);
const util = require('util');
const webServerManager = require('./web_server_manager')
    (settings[WEB_SERVERS_INFO_COLLECTION_KEY]);

// ================ Setup ================

mongoose.Promise = require('bluebird');
mongoose.connect(settings[MONGO_DB_ADDRESS_KEY]);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: false
}));
app.set('json spaces', 1);
app.use(express.static('./public'));

var millsBetweenSizeUpdates = 1000 * settings[SECONDS_BETWEEN_SERVER_SIZE_CALCULATIONS_KEY];
setInterval(trafficDirector.recalculateServersRanges, millsBetweenSizeUpdates);

// ============= Endpoints ==============

app.use('/api/*', (req, res) => {
    var radius = 0;
    if (req.query.radius) {
        radius = req.query.radius;
    }
    var loc = {
        longitude: req.query.longitude,
        latitude: req.query.latitude
    };
    trafficDirector.redirectRequest(req, res, loc, radius);
});

/**
 * @api {post} /director/newserver - Add a new database server to the server
 *  info collection and assign it a geographic region so the traffic director
 *  can start reading from it and storing posts in it
 * @apiParam {string} baseAddr - The address of the database server
 */
app.post('/director/newserver', (req, res) => {
    trafficDirector.generateServerInfo(req, res)
        .then((server) => {
            console.log("added server " + JSON.stringify(server));
            // call /director/serverinfo on all web servers
        });
});

/**
 * @api {post} /director/serverinfo - Add server info to the database server
 *  info collection
 * @apiParam {string} baseAddr
 * @apiParam {string} backupAddr
 * @apiParam {Object} writeRng
 * @apiParam {number} writeRng.minLat
 * @apiParam {number} writeRng.maxLat
 * @apiParam {number} writeRng.minLng
 * @apiParam {number} writeRng.maxLng
 * @apiParam {Object} readRng
 * @apiParam {number} readRng.minLat
 * @apiParam {number} readRng.maxLat
 * @apiParam {number} readRng.minLng
 * @apiParam {number} readRng.maxLng
 */
app.post('/director/serverinfo', (req, res) => {
    trafficDirector.addServerInfo(req, res);
});

/**
 * @api {get} /director/allserverinfo - Get the information about all of the
 *  database servers
 * @apiSuccess {Object[]} servers
 * @apiSuccess {string} servers.baseAddr
 * @apiSuccess {string} servers.backupAddr
 * @apiSuccess {Object} servers.writeRng
 * @apiSuccess {number} servers.writeRng.minLat
 * @apiSuccess {number} servers.writeRng.maxLat
 * @apiSuccess {number} servers.writeRng.minLng
 * @apiSuccess {number} servers.writeRng.maxLng
 * @apiSuccess {Object} servers.readRng
 * @apiSuccess {number} servers.readRng.minLat
 * @apiSuccess {number} servers.readRng.maxLat
 * @apiSuccess {number} servers.readRng.minLng
 * @apiSuccess {number} servers.readRng.maxLng
 * @apiSuccess {string} servers._id
 */
app.get('/director/allserverinfo', (req, res) => {
    trafficDirector.getAllServerInfo(req, res);
});

/**
 * @api {delete} /director/serverinfo - Remove a database server
 * @apiParam {string} baseAddr - The base address of the server to remove
 */
app.delete('/director/serverinfo', (req, res) => {
    trafficDirector.removeServerInfo(req, res);
});

/**
 * @api {get} /webserver/allserverinfo - Get the information about all of the
 *  web servers
 * @apiSuccess {Object[]} servers
 * @apiSuccess {string} servers.baseAddr
 */
app.get('/webserver/allserverinfo', (req, res) => {
    webServerManager.getAllServerInfo(req, res);
});

/**
 * @api {post} /webserver/serverinfo - Add a web server to the web server info
 * database
 * @apiParam {string} baseAddr - The address of the web server
 */
app.post('/webserver/serverinfo', (req, res) => {
    webServerManager.addServerInfo(req, res);
});

/**
 * @api {delete} /webserver/serverinfo - Remove a web server from the database
 * @apiParam {string} baseAddr - The address of the web server
 */
app.delete('/webserver/serverinfo', (req, res) => {
    webServerManager.removeServerInfo(req, res);
});

app.listen(settings[PORT_KEY], settings[BOUND_IP_KEY]);