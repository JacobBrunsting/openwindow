var express = require('express');
var request = require('request');
var util = require('util');
var app = express();
var bodyParser = require('body-parser');
var mongoose = require('mongoose');
var ObjectId = require('mongodb').ObjectId;
mongoose.Promise = require('bluebird');
mongoose.connect('mongodb://localhost/openwindowdatabase');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: false
}));
app.set('json spaces', 1);
app.use(express.static(__dirname + '/public'));
var trafficDirector = require('./public/traffic_director/traffic_director')(app, mongoose);
var PORT = 8080;
app.use('/api/*', function (req, res) {
    var radius = 0;
    if (req.query.radius != undefined) {
        radius = req.query.radius;
    }
    var loc = {longitude:req.query.longitude, latitude:req.query.latitude};
    trafficDirector.redirectRequest(req, res, loc, radius);
});
app.use("/director/addserverinfo", function (req, res) {
    console.log("request is " + util.inspect(req));
    console.log("adding server with base addr " + req.body.baseAddress);
    trafficDirector.addServerInfo(req, res);
});
app.listen(PORT, "0.0.0.0");
