/**
 * @file Runs a webapp that allows users to anonymously create, comment on, and
 * vote on posts in their geographic area. These posts area stored on a network
 * of database servers, and each post is backed up so that is not lost in the 
 * event of a server failure or disconnection.
 */

// ============== Settings ==============

var config = require('./config');

var PORT_KEY = "port";
var BOUND_IP_KEY = "boundIp";
var MONGO_DB_ADDRESS_KEY = "mongoDbAddress";
var SECONDS_BETWEEN_SERVER_SIZE_CALCULATIONS_KEY = 'secondsBetweenServerSizeCalculations';
var SERVERS_INFO_COLLECTION_KEY = 'serversInfoCollection';

var settings = {};
settings[PORT_KEY] = 8080;
settings[BOUND_IP_KEY] = '0.0.0.0';
settings[MONGO_DB_ADDRESS_KEY] = 'mongodb://localhost/openwindowdatabase';
settings[SECONDS_BETWEEN_SERVER_SIZE_CALCULATIONS_KEY] = 20;
settings[SERVERS_INFO_COLLECTION_KEY] = 'ServersInfo';

for (var key in settings) {
    if (config[key]) {
        settings[key] = config[key];
    } else {
        console.log(key + " not set in config file, defaulting to " + settings[key]);
    }
}

// ============== Imports ===============

var bodyParser = require('body-parser');
var express = require('express');
var app = express();
var mongoose = require('mongoose');
var request = require('request');
var trafficDirector = require('./traffic_director/traffic_director')
    (app, mongoose, settings[SERVERS_INFO_COLLECTION_KEY]);
var util = require('util');

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

app.use('/api/*', function (req, res) {
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

app.use("/director/serverinfo", function (req, res) {
    trafficDirector.addServerInfo(req, res);
});

app.use("/director/allserverinfo", function (req, res) {
    trafficDirector.getAllServerInfo(req, res);
});

app.use("/director/removeserverinfo", function (req, res) {
    trafficDirector.removeServerInfo(req, res);
});

app.listen(settings[PORT_KEY], settings[BOUND_IP_KEY]);