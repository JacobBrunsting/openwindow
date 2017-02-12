
// ============== Imports ===============

var bodyParser = require('body-parser');
var config = require('./config');
var express = require('express');
var app = express();
var mongoose = require('mongoose');
var request = require('request');
var trafficDirector = require('./public/traffic_director/traffic_director')(app, mongoose);
var util = require('util');

// ============== Settings ==============

var PORT_KEY = "port";
var BOUND_IP_KEY = "boundIp";
var MONGO_DB_ADDRESS_KEY = "mongoDbAddress";

var settings = {};
settings[PORT_KEY] = 8080;
settings[BOUND_IP_KEY] = '0.0.0.0';
settings[MONGO_DB_ADDRESS_KEY] = 'mongodb://localhost/openwindowdatabase';

for (var key in settings) {
    if (config[key]) {
        settings[key] = config[key];
    } else {
        console.log(key + " not set in config file, defaulting to " + settings[key]);
    }
}

// ================ Setup ================

mongoose.Promise = require('bluebird');
mongoose.connect(settings[MONGO_DB_ADDRESS_KEY]);

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: false
}));
app.set('json spaces', 1);
app.use(express.static('./public'));

// ============= Endpoints ==============

app.use('/api/*', function (req, res) {
    var radius = 0;
    if (req.query.radius) {
        radius = req.query.radius;
    }
    var loc = {longitude:req.query.longitude, latitude:req.query.latitude};
    trafficDirector.redirectRequest(req, res, loc, radius);
});
app.use("/director/addserverinfo", function (req, res) {
    console.log("adding server with base addr " + req.body.baseAddress);
    trafficDirector.addServerInfo(req, res);
});

app.listen(settings[PORT_KEY], settings[BOUND_IP_KEY]);
