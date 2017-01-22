var express = require('express');
var util = require('util');
var app = express();
var bodyParser = require('body-parser');
var mongoose = require('mongoose');
var ObjectId = require('mongodb').ObjectId;
mongoose.Promise = require('bluebird');
mongoose.connect('mongodb://localhost/openwindowdatabase');
app.use(bodyParser.json());
app.use(express.static(__dirname + '/public'));
var trafficDirector = require('./public/traffic_director/traffic_director')(app, mongoose);

var PORT = 8080;

app.use('/api/*', function(req, res) {
    var radius = 0;
    if (req.query.radius != undefined) {
        radius = req.query.radius;
    }  
    trafficDirector.redirectRequest(req, res, req.query.location, radius);
});

app.use("/director/addserverinfo", function(req, res) {
    trafficDirector.addServerInfo(req, res);
});

app.listen(PORT);
