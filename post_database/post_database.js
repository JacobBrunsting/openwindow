// =========== Configuration ============

var util = require('util');
var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var mongoose = require('mongoose');
var ObjectId = require('mongodb').ObjectId;
var sitePostCollectionName = 'SitePostDatabase';
var serverInfoCollectionName = 'ServerInfoDatabase';
mongoose.Promise = require('bluebird');
mongoose.connect('mongodb://localhost/openwindowdatabase');
app.use(bodyParser.json());
app.use(express.static(__dirname + '/public'));
var ipAddr = require('ip').address(); 

// ============= Constants ==============

var UPVOTE = 2;
var DOWNVOTE = 1;
var NONE = 0;
var UPVOTE_INC = 80;
var DOWNVOTE_INC = -150;
var CACHE_MAX_SECONDS = 10;
var SECONDS_BETWEEN_CLEANUPS = 200;
var SERVER_PORT = 3000;

// =============== Models ================

var commentSchema = mongoose.Schema({
    body: {type: String, required:true},
});

var sitePostSchema = mongoose.Schema({
    title:              {type:String, required:true}, 
    body:               {type:String, required:true},  
    posterId:           {type:Number, default:0},
    postTime:           {type:Number, required:true},
    secondsToShowFor:   {type:Number, default:0},
    comments:           {type:[commentSchema]},
    longitude:          {type:Number, required:true},
    latitude:           {type:Number, requried:true},
    mainDatabaseAddr:   {type:String, requried:true},
    backupDatabaseAddr: {type:String, requried:true},
}, {collection:sitePostCollectionName}); // structure of a post

var serverInfoSchema = mongoose.Schema({
    baseAddress:        {type:String, required:true},
    maxPostLongitude:   {type:Number, required:true},
    minPostLongitude:   {type:Number, required:true},
    maxPostLatitude:    {type:Number, required:true},
    minPostLatitude:    {type:Number, required:true}
}, {collection:serverInfoCollectionName});

var sitePostModel = mongoose.model("sitePostModel", sitePostSchema);

var serverInfoModel = mongoose.model("serverInfoModel", serverInfoSchema);

// ========== Old Post Cleanup ==========

setInterval(function() {
    sitePostModel.find({}).$where(function() {
        return this.secondsToShowFor < (Date.now() - this.postTime) / 1000;   
    }).remove(function(err, data) {
        if (err) {
            console.log(err);
        }
    });
}, 1000 * SECONDS_BETWEEN_CLEANUPS);

// =========== API Endpoints ============

// allow access to external database servers directly from the frontend
app.all('*', function(req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'PUT, GET, POST, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

app.post("/api/upvote", upvotePost);
app.post("/api/downvote", downvotePost);
app.post("/api/sitepost", addNewSitePost);
app.post("/api/comment", comment);
app.post("/api/settime", setTime);
app.post("/api/deletecomment", deleteComment);
app.post("/api/deletepost", deletePost);
app.get("/api/siteposts", getAllSitePosts);
app.get("/api/post", getPost);
app.get("/api/postswithinrange", getPostsWithinRange);
app.get("/api/poststimeleft", getPostsSecondsToShowFor);

// ========= API Implementation =========

function addNewSitePost(req, res) {
    var sitePost = req.body;
    sitePost.secondsToShowFor = 1000;
    sitePost.postTime = Date.now();
    sitePost.mainDatabaseAddr = ipAddr + ":" + SERVER_PORT;
    sitePost.backupDatabaseAddr = ipAddr; // TODO: Setup backup logic
    sitePostModel.create(sitePost)
                 .then(function(req) {
                           res.status(200).send();
                       },
                       function(error)   {
                           console.log(error); 
                           res.status(500).send();
                       });
}

function getAllSitePosts(req, res) {
    sitePostModel.find()
                 .then(
        function(posts) {
            res.json(posts);
        },
        function (error) {
            console.log(error);
            res.json(error);
        }
    );
}

function upvotePost(req, res) {
    var id = req.body.id;
    var oldVote = req.body.oldVote;
    var amountToInc;
    if (oldVote == UPVOTE) {
        amountToInc = -UPVOTE_INC;
    } else if (oldVote == DOWNVOTE) {
        amountToInc = -DOWNVOTE_INC + UPVOTE_INC;
    } else {
        amountToInc = UPVOTE_INC;
    }
    sitePostModel.findByIdAndUpdate(
        {_id:id},
        {$inc:{secondsToShowFor:amountToInc}}, 
        {new:true},
        function(err, data) {
            if (err) {
                res.status(400).send();
            } else {
                res.json(data);
            }
        }
    );
}

function downvotePost(req, res) {
    var id = req.body.id;
    var oldVote = req.body.oldVote;
    var amountToInc;
    if (oldVote == DOWNVOTE) {
        amountToInc = -DOWNVOTE_INC;
    } else if (oldVote == UPVOTE) {
        amountToInc = -UPVOTE_INC + DOWNVOTE_INC;
    } else {
        amountToInc = DOWNVOTE_INC;
    }
    sitePostModel.findByIdAndUpdate(
        {_id:id},
        {$inc:{secondsToShowFor:amountToInc}}, 
        {new:true},
        function(err, data) {
            if (err) {
                res.status(400).send();
            } else {
                res.json(data);
            }
        }
    );
}

function getPost(req, res) {
    console.log("getting post");
    var id = req.query.id;
    sitePostModel.findOne(
        {_id:ObjectId(id)},
        function(err, data) {
            if (err || data == null) {
                console.log("error is " + JSON.stringify(err));
                console.log("data is " + JSON.stringify(data));
                res.status(400).send();
            } else {
                console.log("data is " + JSON.stringify(data));
                res.json(data);
            }
        }
    );
}

function comment(req, res) {
    var id = req.body.id;
    var commentBody = req.body.comment;
    sitePostModel.findByIdAndUpdate(
        {_id:id}, 
        {$push:{comments:{body:commentBody}}},
        {new:true},
        function(err, data) {
            if (err || data == null) {
                res.status(400).send();
            } else {
                res.json(data.comments);
            }
        }
    );
}

function setTime(req, res) {
    var id = req.body.id;
    var newSecondsToShowFor = req.body.newSecondsToShowFor;
    sitePostModel.findByIdAndUpdate(
        {_id:id}, 
        {$set:{secondsToShowFor:newSecondsToShowFor}}, 
        {new:true},
        function(err, data) {
            if (err || data == null) {
                res.status(400).send();
            } else {
                res.json(data);
            }
        }
    );
}

function deleteComment(req, res) {
    var postId = req.body.postId;
    var commentId = req.body.commentId;
    sitePostModel.findByIdAndUpdate(
        {_id:postId},
        {$pull:{'comments':{'_id':ObjectId(commentId)}}},
        {new:true},
        function(err, data) {
            if (err || data == null) {
                res.status(400).send();
            } else {
                res.json(data);
            }
        }
    );
}

function deletePost(req, res) {
    var id = req.body.id;
    sitePostModel.find({_id:id}).remove(
        function(err, data) {
            if (err || data == null) {
                res.status(400).send();
            } else {
                res.json(data);
            }
        }
    );
}

function getPostsWithinRange(req, res) {
    var longitude = req.query.longitude;
    var latitude = req.query.latitude;
    var range = req.query.range;
    var rangeSqrd = range * range;
    sitePostModel.find({}).$where(function() {
                var longDiff = longitude - this.longitude;
                var latDiff = latitude - this.latitude;
                return longDiff * longDiff + latDiff * latDiff < rangeSqrd;
            }
        )
                 .then(
        function(posts) {
            res.json(posts);
        },
        function (error) {
            res.json(error);
        }
    );
}

var cacheTime = 0;
var postsSecondsToShowForCache = {};
function getPostsSecondsToShowFor(req, res) {
   if (Date.now() - cacheTime < CACHE_MAX_SECONDS) {
       res.json(postsSecondsToShowForCache);
   }
   sitePostModel.find()
                .then(
         function(posts) {
             postsSecondsToShowForCache = {};
             for (var i = 0; i < posts.length; ++i) {
                 postsSecondsToShowForCache[posts[i]._id] = posts[i].secondsToShowFor;
             }
             res.json(postsSecondsToShowForCache);
         },
         function (error) {
             res.json(error);
         }
     );
}

app.listen(SERVER_PORT, "0.0.0.0");
