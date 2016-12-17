var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var mongoose = require('mongoose');
var ObjectId = require('mongodb').ObjectId;
mongoose.Promise = require('bluebird');
mongoose.connect('mongodb://localhost/openwindowdatabase');

var SitePostSchema = mongoose.Schema({
    title: {type: String, required:true}, 
    body: {type: String, required:true},  
    posterId: {type: Number, default: 0},
    postTime: {type: Date, default: Date.now}
}, {collection: 'SitePostDatabase'}); // structure of a post

var sitePostModel = mongoose.model("sitePostModel", SitePostSchema);

app.use(bodyParser.json()); // lots of other parsers you can use!
app.use(express.static(__dirname + '/public'));

app.post("/api/sitepost", addNewSitePost);
app.get("/api/siteposts", getAllSitePosts);

// request body must match SitePostSchema (i.e. have title and body strings)
function addNewSitePost(request, response) {
    var sitePost = request.body;
    console.log("added new post " + sitePost.title + ", " + sitePost.body);
    sitePostModel.create(sitePost).then(function(request) {response.json(200)},
                                        function(error) {response.json(500)});
}

function getAllSitePosts(request, response) {
    sitePostModel.find()
                 .then( // thie '.then' is a promis that calls a function on success or on failure
                      function(posts) {
                          response.json(posts);
                      },
                      function (error) {
                          response.json(error);
                      });
}

app.listen(3000);

