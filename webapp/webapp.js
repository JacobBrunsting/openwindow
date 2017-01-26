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
app.use(bodyParser.urlencoded({extended:false}));
app.set('json spaces', 1);
app.use(express.static(__dirname + '/public'));
var trafficDirector = require('./public/traffic_director/traffic_director')(app, mongoose);

var PORT = 8080;

app.use('/api/getpostfromserver', function(req, res) {
    console.log("query is " + JSON.stringify(req.query));
    var postId = req.query.id;
    var serverAddress = req.query.serverAddress;
    request("http://" + serverAddress + "/api/post?id=" + postId,
                {json: req.body}, 
                function(err, reqRes, body) {
                    if (err) {
                        res.status(500);
                        res.json(err);
                    } else {
                        res.json(reqRes);
                    }
                });
});

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

app.listen(PORT, "0.0.0.0");
