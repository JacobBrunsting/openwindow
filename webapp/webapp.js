/**
 * @file Runs a webapp that allows users to anonymously create, comment on, and
 * vote on posts in their geographic area. These posts area stored on a network
 * of database servers, and each post is backed up so that is not lost in the 
 * event of a server failure or disconnection.
 */

// TODO TODO TODO: Use lower case for the start of all imports and do all single
// quotes, rename 'director' endpoints to 'database'

const bodyParser = require('body-parser');
const express = require('express');
const ipAddr = require('ip').address();
const app = express();
const log = require(__dirname + '/utils/log');
const mongoose = require('mongoose');
const request = require('request');
const util = require('util');
const generalUtils = require(__dirname + '/utils/general_utils');

// ============= Constants ==============

const DATABASE_SERVER_HEARTBEAT_PATH = '/api/heartbeat';
const WEB_SERVER_HEARTBEAT_PATH = '/heartbeat';

// ============== Settings ==============

const config = require(__dirname + '/config');

const PORT_KEY = "port";
const BOUND_IP_KEY = "boundIp";
const MONGO_DB_ADDRESS_KEY = "mongoDbAddress";
const SECONDS_BETWEEN_SERVER_SIZE_CALCULATIONS_KEY = 'secondsBetweenServerSizeCalculations';
const SECONDS_BETWEEN_SERVER_VALIDATION_KEY = 'secondsBetweenServerValidation';
const DATABASE_SERVERS_INFO_COLLECTION_KEY = 'databaseServersInfoCollection';
const WEB_SERVERS_INFO_COLLECTION_KEY = 'webServersInfoCollection';
const FIRST_SETUP_KEY = "firstSetup";

var settings = {};
settings[PORT_KEY] = 8080;
settings[BOUND_IP_KEY] = '0.0.0.0';
settings[MONGO_DB_ADDRESS_KEY] = 'mongodb://localhost/openwindowdatabase';
settings[SECONDS_BETWEEN_SERVER_SIZE_CALCULATIONS_KEY] = 20;
settings[SECONDS_BETWEEN_SERVER_VALIDATION_KEY] = 6000;
settings[DATABASE_SERVERS_INFO_COLLECTION_KEY] = 'DatabaseServersInfo';
settings[WEB_SERVERS_INFO_COLLECTION_KEY] = 'WebServersInfo';

for (var key in settings) {
    if (config[key]) {
        settings[key] = config[key];
    } else {
        log.msg(key + " not set in config file, defaulting to " + settings[key]);
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

const databaseServerManager = require(__dirname + '/database_server_manager/database_server_manager')
    (mongoose, settings[DATABASE_SERVERS_INFO_COLLECTION_KEY]);
const baseAddr = "http://" + ipAddr + ":" + settings[PORT_KEY];
const webServerManager = require(__dirname + '/web_server_manager/web_server_manager')
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
setInterval(databaseServerManager.recalculateServersRanges, millsBetweenSizeUpdates);

// ============= Endpoints ==============

app.use('*', (req, res, next) => {
    log.msg(req.method + " " + req.originalUrl);
    if (req.body && JSON.stringify(req.body) !== "{}") {
        console.log(JSON.stringify(req.body));
    }
    next();
});

/**
 * @api /api/* - Endpoing for all api requests, redirects the requests to the 
 *  correct database server(s)
 * @apiParam {Object} targLoc - The target location for the query
 * @apiParam {number} targLoc.latitude
 * @apiParam {number} targLoc.longitude
 * @apiParam {number} targRad - The query radius in meters (an undefined or 0 
 *  radius redirects to the single server serving the target location)
 * @apiParam {string} databaseAddr - The database to redirect the request to,
 *  if this parameter is specified in the query parameters, the request will 
 *  only be sent to this database
 */
app.all('/api/*', (req, res) => {
    var loc = {
        longitude: req.query.longitude,
        latitude: req.query.latitude
    };
    databaseServerManager.redirectRequest(req, res, loc, req.query.radius);
});

app.post('/sync', (req, res) => {
    validateDatabaseAndWebServerInfo()
        .then(reqRes => {
            res.json(reqRes);
        })
        .catch(err => {
            res.json(err);
        });
});

/**
 * @api {get} /api/heartbeat - Get some response to verify that the server is 
 *  still running
 */
app.get("/heartbeat", (req, res) => { res.status(200).send() });

/**
 * @api {post} /director/newserver - Add a new database server to the server
 *  info collection and assign it a geographic region so the database server 
 *  manager can start reading from it and storing posts in it
 * @apiParam {string} baseAddr - The address of the database server
 */
app.post('/director/newserver', (req, res) => {
    if (!req.body.baseAddr) {
        log.msg("webapp:/director/newserver:baseAddr body property not provided");
        res.status(400).send("baseAddr body property required");
        return;
    }
    databaseServerManager.generateAndStoreServerInfo(req.body)
        .then((newAndUpdatedServers) => {
            return Promise.all([
                    webServerManager.notifyOtherServers('POST', 'director/serverinfo', newAndUpdatedServers.newServer),
                    webServerManager.notifyOtherServers('PUT', 'director/serversinfo', newAndUpdatedServers.updatedServers)
                ])
                .then(() => {
                    res.json(newAndUpdatedServers.newServer.backupAddr);
                });
        })
        .catch((err) => {
            res.status(500).send(err);
            log.err("webapp:/director/newserver:" + err);
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
    databaseServerManager.addServerInfo(req.body)
        .then(() => {
            res.status(200).send();
        })
        .catch((err) => {
            res.status(500).send(err);
            log.err("webapp:/director/serverinfo:" + err);
        });
});

/**
 * @api {post} /director/serversinfo - Add an array of server info to the 
 *  database server info collection
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
app.post('/director/serverinfo', (req, res) => {
    databaseServerManager.addServersInfo(req.body)
        .then(() => {
            res.status(200).send();
        })
        .catch((err) => {
            res.status(500).send(err);
            log.err("webapp:/director/serverinfo:" + err);
        });
});

/**
 * @api {post} /director/servermaybedown - Check if the provided server is down,
 *  and if it is, remove it from the network
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
app.post('/director/servermaybedown', (req, res) => {
    const serverInfo = req.body;
    const serverBaseAddr = serverInfo.baseAddr;
    const url = serverBaseAddr + DATABASE_SERVER_HEARTBEAT_PATH;
    request.get(url).on('error', err => {
        // TODO: Consider only running the server failure function for certain errors
        log.bright('server failure confirmed for server ' + JSON.stringify(serverInfo));
        removeDatabaseServerFromNetwork(serverInfo);
    })
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
    databaseServerManager.getAllServerInfo(req.query.excludeid)
        .then((serverInfo) => {
            res.json(serverInfo);
        })
        .catch((err) => {
            log.err("webapp:/director/allserverinfo:" + err);
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
    databaseServerManager.updateServersInfo(req.body)
        .then((result) => {
            res.status(200).send();
        })
        .catch(err => {
            log.err("webapp:/director/serversinfo:" + err);
            res.status(500).send(err);
        })
});

/**
 * @api {delete} /director/serverinfo - Remove a database server
 * @apiParam {string} baseAddr - The base address of the server to remove
 */
app.delete('/director/serverinfo', (req, res) => {
    databaseServerManager.removeServerInfo(req.query.baseAddr)
        .then(() => {
            res.status(200).send()
        })
        .catch((err) => {
            res.status(500).send(err);
            log.err("webapp:/director/serverinfo:" + err);
        });
});

/**
 * @api {delete} /director/serverfromnetwork - Remove a database server from 
 *  the network
 * @apiParam {string} baseAddr - The base address of the server to remove
 */
app.delete('/director/serverfromnetwork', (req, res) => {
    databaseServerManager.getServerInfo(req.query.baseAddr)
        .then(removeDatabaseServerFromNetwork)
        .then(() => { res.status(200).send(); })
        .catch(err => {
            res.status(500).send(err);
            log.err('webapp:/director/deleteserverfromnetwork:' + err);
        })
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
                log.err("webapp:/webserver/newserver:" + err);
            });
    }
    // TODO: If the server cannot be added to the network, notify the servers 
    // that were already notified of the server addition of the failure
    webServerManager.notifyOtherServers('POST', 'webserver/serverinfo', req.body)
        .then(addToDatabase)
        .catch((err) => {
            res.status(500).send(err);
            log.err("webapp:/webserver/newserver:" + err);
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
            log.err("webapp:/webserver/serverinfo:" + err);
        });
});

/**
 * @api {post} /webserver/servermaybedown - Check if the provided server is down,
 *  and if it is, remove it from the network
 * @apiParam {string} baseAddr
 */
app.post('/webserver/servermaybedown', (req, res) => {
    const serverInfo = req.body;
    const url = serverInfo.baseAddr + WEB_SERVER_HEARTBEAT_PATH;
    request.get(url, (err, res) => {
        if (err) { // TODO: Consider only running the server failure function for certain errors
            log.bright('server failure confirmed for server ' + JSON.stringify(serverInfo));
            removeWebServerFromNetwork(serverInfo.baseAddr);
        }
    })
});

/**
 * @api {get} /webserver/allserverinfo - Get the information about all of the
 *  web servers, in ascending order by IP address
 * @apiParam {boolean} excludeid
 * @apiSuccess {Object[]} servers
 * @apiSuccess {string} servers.baseAddr
 */
app.get('/webserver/allserverinfo', (req, res) => {
    webServerManager.getAllServerInfo(req.query.excludeid)
        .then((serverInfo) => {
            res.json(serverInfo);
        })
        .catch((err) => {
            res.status(500).send(err);
            log.err("webapp:/webserver/allserverinfo:" + err);
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
            log.err("webapp:/webserver/serverinfo:" + err);
        });
});

/**
 * @api {delete} /webserver/serverinfofromnetwork - Remove a web server from the
 *  network
 * @apiParam {string} baseAddr - The address of the web server
 */
app.delete('/webserver/serverfromnetwork', (req, res) => {
    removeWebServerFromNetwork(req.query.baseAddr)
        .then(() => { res.status(200).send(); })
        .catch((err) => {
            res.status(500).send(err);
            log.err('webapp:/webserver/serverinfofromnetwork:' + err);
        });
});

// ======= Network Syncronization ========

function validateDatabaseAndWebServerInfo() {
    return webServerManager
        .getAllServerInfo(true)
        .then(serversInfo => {
            let serverAddresses = [];
            serversInfo.forEach(serverInfo => {
                if (serverInfo.baseAddr !== baseAddr) {
                    serverAddresses.push(serverInfo.baseAddr);
                }
            });
            return Promise.all([
                databaseServerManager.syncWithNetwork(serverAddresses),
                webServerManager.syncWithNetwork(serverAddresses)
            ]);
        });
}

setInterval(() => {
    validateDatabaseAndWebServerInfo()
        .catch(err => {
            log.err("webapp:validateDatabaseAndWebServerInfo:" + err);
        });
}, settings[SECONDS_BETWEEN_SERVER_VALIDATION_KEY] * 1000);

function removeDatabaseServerFromNetwork(serverInfo) {
    return databaseServerManager
        .removeServerAndAdjust(serverInfo, true)
        .then(removedAndUpdatedServers => {
            log.bright('removed database server from network, removed and updated servers are ' + JSON.stringify(removedAndUpdatedServers));
            const removedServer = removedAndUpdatedServers.removedServer;
            const updatedServers = removedAndUpdatedServers.updatedServers;
            const removalQueryParams = { baseAddr: removedServer.baseAddr };
            webServerManager.notifyOtherServers('DELETE', 'director/serverinfo', undefined, removalQueryParams);
            webServerManager.notifyOtherServers('PUT', 'director/serversinfo', updatedServers);
        });
}

function removeWebServerFromNetwork(serverBaseAddr) {
    return webServerManager
        .removeServerInfo(serverBaseAddr)
        .then(() => {
            log.bright('removed web server from network, removed server address is ' + serverBaseAddr);
            const removalQueryParams = { baseAddr: serverBaseAddr };
            webServerManager.notifyOtherServers('DELETE', 'webserver/serverinfo', undefined, removalQueryParams);
        })
}

databaseServerManager.startHeartbeat(failedServerInfo => {
    webServerManager
        .getAllServerInfo()
        .then(servers => {
            generalUtils.notifyNextAliveServer(servers, baseAddr, '/director/servermaybedown', failedServerInfo)
                .catch(err => {
                    if (err) {
                        log.err('webapp:onHeartbeatFailure:' + err);
                    }
                    // if we could not notify another server about the potential
                    //  server failure, assume the server has failed
                    removeDatabaseServerFromNetwork(failedServerInfo);
                })
        })
});

// =============== Startup ===============

// the first server in the network needs to be set up differently, so we have
// this setting (which can be passed in from the command line) to account for that
const setupAsFirst = settings[FIRST_SETUP_KEY] === "true";
Promise.all([
        webServerManager.setupSelf(setupAsFirst),
        databaseServerManager.setupSelf(setupAsFirst)
    ])
    .then(() => {
        console.log("");
        log.msg("webapp listening on port " + settings[PORT_KEY]);
        console.log("");
        app.listen(settings[PORT_KEY], settings[BOUND_IP_KEY]);
    })
    .catch((err) => {
        log.err("webapp:" + err);
        log.msg("error connecting to server network. exiting.");
        process.exit(1);
    });