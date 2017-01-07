var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var mongoose = require('mongoose');
var ObjectId = require('mongodb').ObjectId;
var collectionName = 'SitePostDatabase';
mongoose.Promise = require('bluebird');
mongoose.connect('mongodb://localhost/openwindowdatabase');

// TODO: All files should use these same constants, and the constants should
// be in their own file
var UPVOTE = 2;
var DOWNVOTE = 1;
var NONE = 0;
var UPVOTE_INC = 80;
var DOWNVOTE_INC = -150;

var SitePostSchema = mongoose.Schema({
    title: {type: String, required:true}, 
    body: {type: String, required:true},  
    posterId: {type: Number, default: 0},
    postTime: {type: Number, default: 0},
    secondsToShowFor: {type: Number, default: 0},
    comments: {type: [String]},
}, {collection: collectionName}); // structure of a post

var sitePostModel = mongoose.model("sitePostModel", SitePostSchema);

app.use(bodyParser.json()); // lots of other parsers you can use!
app.use(express.static(__dirname + '/public'));

app.post("/api/upvote", upvotePost);
app.post("/api/downvote", downvotePost);
app.post("/api/sitepost", addNewSitePost);
app.post("/api/comment", comment);
app.get("/api/siteposts", getAllSitePosts);
app.get("/api/post", getPost);

// request body must match SitePostSchema (i.e. have title and body strings)
function addNewSitePost(request, response) {
    var sitePost = request.body;
    sitePost.secondsToShowFor = 1000;
    sitePostModel.create(sitePost)
                 .then(function(request) {response.status(200).send()},
                       function(error) {response.status(500).send()});
}

function getAllSitePosts(request, response) {
    sitePostModel.find()
                 .then(
                      function(posts) {
                          response.json(posts);
                      },
                      function (error) {
                          response.json(error);
                      });
}

function upvotePost(request, response) {
    var id = request.body.id;
    var oldVote = request.body.oldVote;
    var amountToInc;
    if (oldVote == UPVOTE) {
        amountToInc = -UPVOTE_INC;
    } else if (oldVote == DOWNVOTE) {
        amountToInc = -DOWNVOTE_INC + UPVOTE_INC;
    } else {
        amountToInc = UPVOTE_INC;
    }
    sitePostModel.findByIdAndUpdate({_id:id}, {$inc:{secondsToShowFor:amountToInc}}, 
                                    {new:true},
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
    var oldVote = request.body.oldVote;
    var amountToInc;
    if (oldVote == DOWNVOTE) {
        amountToInc = -DOWNVOTE_INC;
    } else if (oldVote == UPVOTE) {
        amountToInc = -UPVOTE_INC + DOWNVOTE_INC;
    } else {
        amountToInc = DOWNVOTE_INC;
    }
    sitePostModel.findByIdAndUpdate({_id:id}, {$inc:{secondsToShowFor:amountToInc}}, 
                                    {new:true},
                                   function(err, data) {
                                       if (err) {
                                           response.status(400).send();
                                       } else {
                                           response.json(data);
                                       }
                                   });
}

function getPost(request, response) {
    var id = request.query.id;
    sitePostModel.findOne({_id:ObjectId(id)},
                           function(err, data) {
                               if (err || data == null) {
                                   response.status(400).send();
                               } else {
                                   response.json(data);
                               }
                           });
}

function comment(request, response) {
    var id = request.body.id;
    var comment = request.body.comment;
    sitePostModel.findByIdAndUpdate({_id:id}, {$push:{comments:comment}},
                                   {new:true},
                                   function(err, data) {
                                       if (err || data == null) {
                                           response.status(400).send();
                                       } else {
                                           response.json(data.comments);
                                       }
                                   });
}

app.listen(3000);
