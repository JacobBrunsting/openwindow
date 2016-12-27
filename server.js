var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var mongoose = require('mongoose');
var ObjectId = require('mongodb').ObjectId;
var collectionName = 'SitePostDatabase';
mongoose.Promise = require('bluebird');
mongoose.connect('mongodb://localhost/openwindowdatabase');

var SitePostSchema = mongoose.Schema({
    title: {type: String, required:true}, 
    body: {type: String, required:true},  
    posterId: {type: Number, default: 0},
    postTime: {type: Date, default: Date.now},
    secondsLeft: {type: Number, default: 0},
}, {collection: collectionName}); // structure of a post

var sitePostModel = mongoose.model("sitePostModel", SitePostSchema);

app.use(bodyParser.json()); // lots of other parsers you can use!
app.use(express.static(__dirname + '/public'));

app.post("/api/upvote", upvotePost);
app.post("/api/unupvote", unupvotePost);
app.post("/api/downvote", downvotePost);
app.post("/api/sitepost", addNewSitePost);
app.get("/api/siteposts", getAllSitePosts);

// request body must match SitePostSchema (i.e. have title and body strings)
function addNewSitePost(request, response) {
    var sitePost = request.body;
    sitePost.secondsLeft = 1000;
    console.log("added new post " + sitePost.title + ", " + sitePost.body);
    sitePostModel.create(sitePost)
                 .then(function(request) {response.status(200).send()},
                       function(error) {response.status(500).send()});
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

function upvotePost(request, response) {
    var id = request.body.id;
    console.log("upvote");
    sitePostModel.findByIdAndUpdate({_id:id}, {$inc:{secondsLeft: 80}}, {new:true},
                                   function(err, data) {
                                       if (err) {
                                           response.status(400).send();
                                       } else {
                                           response.json(data);
                                       }
                                   });
}

function unupvotePost(request, response) {
    var id = request.body.id;
    console.log("unupvoting");
    sitePostModel.findByIdAndUpdate({_id:id}, {$inc:{secondsLeft: -80}}, {new:true},
                                   function(err, data) {
                                       if (err) {
                                           response.status(400).send();
                                       } else {
                                           response.json(data);
                                       }
                                   });
}

function downvotePost(request, response) {
    var id = request.body.id;
    sitePostModel.find({_id:id}).remove().exec();
    console.log("downvoting post " + id);
    response.status(200).send();
}

app.listen(3000);

