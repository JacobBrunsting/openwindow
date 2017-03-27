/**
 * @file Runs a webapp that allows users to anonymously create, comment on, and
 * vote on posts in their geographic area. These posts area stored on a network
 * of database servers, and each post is backed up so that is not lost in the 
 * event of a server failure or disconnection.
 */
// TODO: Split servers based on how many posts they store

// ============== Settings ==============

const config = require(__dirname + '/config');

const PORT_KEY = "port";
const BOUND_IP_KEY = "boundIp";
const MONGO_DB_ADDRESS_KEY = "mongoDbAddress";
const SECONDS_BETWEEN_SERVER_SIZE_CALCULATIONS_KEY = 'secondsBetweenServerSizeCalculations';
const DATABASE_SERVERS_INFO_COLLECTION_KEY = 'databaseServersInfoCollection';
const WEB_SERVERS_INFO_COLLECTION_KEY = 'webServersInfoCollection';
const FIRST_SETUP_KEY = "firstSetup";

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
        log(key + " not set in config file, defaulting to " + settings[key]);
    }
}

process.argv.forEach(function (val, index) {
    if (index >= 2) {
        var splitVal = val.split("=");
        if (splitVal.length > 1) {
            switch (splitVal[0]) {
                case PORT_KEY:
                    settings[PORT_KEY] = parseInt(splitVal[1]);
                    break;
                case DATABASE_SERVERS_INFO_COLLECTION_KEY:
                    settings[DATABASE_SERVERS_INFO_COLLECTION_KEY] = splitVal[1];
                    break;
                case WEB_SERVERS_INFO_COLLECTION_KEY:
                    settings[WEB_SERVERS_INFO_COLLECTION_KEY] = splitVal[1];
                    break;
                case FIRST_SETUP_KEY:
                    settings[FIRST_SETUP_KEY] = splitVal[1];
                    break;
            }
        }
    }
});

// ============== Imports ===============

const bodyParser = require('body-parser');
const express = require('express');
const ipAddr = require('ip').address();
const app = express();
const log = require(__dirname + '/utils/log');
const mongoose = require('mongoose');
const request = require('request');
const trafficDirector = require(__dirname + '/traffic_director/traffic_director')
    (app, mongoose, settings[DATABASE_SERVERS_INFO_COLLECTION_KEY]);
const util = require('util');
const baseAddr = "http://" + ipAddr + ":" + settings[PORT_KEY];
const webServerManager = require(__dirname + '/web_server_manager')
    (settings[WEB_SERVERS_INFO_COLLECTION_KEY], baseAddr);

// ================ Setup ================
mongoose.Promise = require('bluebird');
mongoose.connect(settings[MONGO_DB_ADDRESS_KEY]);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: false
}));
app.set('json spaces', 1);
app.use(express.static(__dirname + '/public'));

var millsBetweenSizeUpdates = 1000 * settings[SECONDS_BETWEEN_SERVER_SIZE_CALCULATIONS_KEY];
setInterval(trafficDirector.recalculateServersRanges, millsBetweenSizeUpdates);

// ============= Endpoints ==============

app.use('*', (req, res, next) => {
    log(req.method + " " + req.originalUrl);
    if (req.body && JSON.stringify(req.body) !== "{}") {
        console.log(JSON.stringify(req.body));
    }
    next();
});

app.all('/api/*', (req, res) => {
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
    if (!req.body.baseAddr) {
        log("webapp:/director/newserver:baseAddr body property not provided");
        res.status(400).send("baseAddr body property required");
        return;
    }
    trafficDirector.generateAndStoreServerInfo(req.body)
        .then((updatedServersInfo) => {
            const newServer = updatedServersInfo[0];
            updatedServersInfo.splice(0, 1);
            const updatedServers = updatedServersInfo;
            res.json(newServer.backupAddr);
            return Promise.all([
                webServerManager.notifyOtherServers('POST', 'director/serverinfo', newServer),
                webServerManager.notifyOtherServers('PUT', 'director/serversinfo', updatedServers)
            ]);
        })
        .catch((err) => {
            res.status(500).send(err);
            log("webapp:/director/newserver:" + err);
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
    trafficDirector.addServerInfo(req.body)
        .then(() => {
            res.status(200).send();
        })
        .catch((err) => {
            res.status(500).send(err);
            log("webapp:/director/serverinfo:" + err);
        });
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
    trafficDirector.getAllServerInfo(req.query.excludeId)
        .then((serverInfo) => {
            res.json(serverInfo);
        })
        .catch((err) => {
            log("webapp:/director/allserverinfo:" + err);
            res.status(500).send(err);
        });
});

/**
 * @api {put} director/serversinfo - Update several server infos in the database 
 *  server info collection
 * @apiParam {Object[]} servers
 * @apiParam {string} servers.baseAddr
 * @apiParam {string} servers.backupAddr
 * @apiParam {Object} servers.writeRng
 * @apiParam {number} servers.writeRng.minLat
 * @apiParam {number} servers.writeRng.maxLat
 * @apiParam {number} servers.writeRng.minLng
 * @apiParam {number} servers.writeRng.maxLng
 * @apiParam {Object} servers.readRng
 * @apiParam {number} servers.readRng.minLat
 * @apiParam {number} servers.readRng.maxLat
 * @apiParam {number} servers.readRng.minLng
 * @apiParam {number} servers.readRng.maxLng
 */
app.put('/director/serversinfo', (req, res) => {
    trafficDirector.updateServersInfo(req.body)
        .then((result) => {
            res.status(200).send();
        })
        .catch(err => {
            log("webapp:/director/serversinfo:" + err);
            res.status(500).send(err);
        })
});

/**
 * @api {delete} /director/serverinfo - Remove a database server
 * @apiParam {string} baseAddr - The base address of the server to remove
 */
app.delete('/director/serverinfo', (req, res) => {
    trafficDirector.removeServerInfo(req.query.baseAddr)
        .then(() => {
            res.status(200).send()
        })
        .catch((err) => {
            res.status(500).send(err);
            log("webapp:/director/serverinfo:" + err);
        });
});

/**
 * @api {post} /webserver/newserver - Add server info to the database server
 *  info collection, and add it to all other servers in the network
 * @apiParam {string} baseAddr
 */
app.post('/webserver/newserver', (req, res) => {
    function addToDatabase() {
        webServerManager.addServerInfo(req.body)
            .then(() => {
                res.status(200).send();
            })
            .catch((err) => {
                res.status(500).send(err);
                log("webapp:/webserver/newserver:" + err);
            });
    }
    webServerManager.notifyOtherServers('POST', 'webserver/serverinfo', req.body)
        .then(addToDatabase)
        .catch((err) => {
            addToDatabase();
            log("webapp:/webserver/newserver:" + err);
        });
});

/**
 * @api {post} /webserver/serverinfo - Add a web server to the web server info
 * database
 * @apiParam {string} baseAddr - The address of the web server
 */
app.post('/webserver/serverinfo', (req, res) => {
    webServerManager.addServerInfo(req.body)
        .then(() => {
            res.status(200).send();
        })
        .catch((err) => {
            res.status(500).send(err);
            log("webapp:/webserver/serverinfo:" + err);
        });
});

/**
 * @api {get} /webserver/allserverinfo - Get the information about all of the
 *  web servers, in ascending order by IP address
 * @apiParam {boolean} excludeId
 * @apiSuccess {Object[]} servers
 * @apiSuccess {string} servers.baseAddr
 */
app.get('/webserver/allserverinfo', (req, res) => {
    webServerManager.getAllServerInfo(req.query.excludeId)
        .then((serverInfo) => {
            res.json(serverInfo);
        })
        .catch((err) => {
            res.status(500).send(err);
            log("webapp:/webserver/allserverinfo:" + err);
        });
});

/**
 * @api {delete} /webserver/serverinfo - Remove a web server from the database
 * @apiParam {string} baseAddr - The address of the web server
 */
app.delete('/webserver/serverinfo', (req, res) => {
    webServerManager.removeServerInfo(req.query.baseAddr)
        .then(() => {
            res.status(200).send();
        })
        .catch((err) => {
            res.status(500).send(err);
            log("webapp:/webserver/serverinfo:" + err);
        });
});

// the first server in the network needs to be set up differently, so we have
// this setting (which can be passed in from the command line) to account for that
const setupAsFirst = settings[FIRST_SETUP_KEY] === "true";
Promise.all([
        webServerManager.setupSelf(setupAsFirst),
        trafficDirector.setupSelf(setupAsFirst)
    ])
    .then(() => {
        console.log("");
        log("webapp listening on port " + settings[PORT_KEY]);
        console.log("");
        app.listen(settings[PORT_KEY], settings[BOUND_IP_KEY]);
    })
    .catch((err) => {
        log("webapp:" + err);
        log("error connecting to server network. exiting.");
        process.exit(1);
    });