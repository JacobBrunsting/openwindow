var express = require('express');
var util = require('util');
var app = express();
var bodyParser = require('body-parser');
var mongoose = require('mongoose');
var ObjectId = require('mongodb').ObjectId;
var trafficDirector = require('./public/traffic_director/traffic_director')(app);
mongoose.Promise = require('bluebird');
mongoose.connect('mongodb://localhost/openwindowdatabase');
app.use(bodyParser.json());
app.use(express.static(__dirname + '/public'));

var PORT = 8080;

app.use('/api/*', function(req, res) {
    trafficDirector.redirectRequest(req, res, req.query.location);
});

app.listen(PORT);
