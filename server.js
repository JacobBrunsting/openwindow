
// =========== Configuration ============

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
    title:            {type:String, required:true}, 
    body:             {type:String, required:true},  
    posterId:         {type:Number, default:0},
    postTime:         {type:Number, required:true},
    secondsToShowFor: {type:Number, default:0},
    comments:         {type:[commentSchema]},
    longitude:        {type:Number, required:true},
    latitude:         {type:Number, requried:true}
}, {collection:sitePostCollectionName}); // structure of a post

var serverInfoSchema = mongoose.Schema({
    maxPostLongitude: {type:Number, required:true},
    minPostLongitude: {type:Number, required:true},
    maxPostLatitude:  {type:Number, required:true},
    minPostLatitude:  {type:Number, required:true}
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

function addNewSitePost(request, response) {
    var sitePost = request.body;
    sitePost.secondsToShowFor = 1000;
    sitePost.postTime = Date.now();
    sitePostModel.create(sitePost)
                 .then(function(request) {response.status(200).send()},
                       function(error)   {response.status(500).send()});
}

function getAllSitePosts(request, response) {
    sitePostModel.find()
                 .then(
        function(posts) {
            response.json(posts);
        },
        function (error) {
            response.json(error);
        }
    );
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
    sitePostModel.findByIdAndUpdate(
        {_id:id},
        {$inc:{secondsToShowFor:amountToInc}}, 
        {new:true},
        function(err, data) {
            if (err) {
                response.status(400).send();
            } else {
                response.json(data);
            }
        }
    );
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
    sitePostModel.findByIdAndUpdate(
        {_id:id},
        {$inc:{secondsToShowFor:amountToInc}}, 
        {new:true},
        function(err, data) {
            if (err) {
                response.status(400).send();
            } else {
                response.json(data);
            }
        }
    );
}

function getPost(request, response) {
    var id = request.query.id;
    sitePostModel.findOne(
        {_id:ObjectId(id)},
        function(err, data) {
            if (err || data == null) {
                response.status(400).send();
            } else {
                response.json(data);
            }
        }
    );
}

function comment(request, response) {
    var id = request.body.id;
    var commentBody = request.body.comment;
    sitePostModel.findByIdAndUpdate(
        {_id:id}, 
        {$push:{comments:{body:commentBody}}},
        {new:true},
        function(err, data) {
            if (err || data == null) {
                response.status(400).send();
            } else {
                response.json(data.comments);
            }
        }
    );
}

function setTime(request, response) {
    var id = request.body.id;
    var newSecondsToShowFor = request.body.newSecondsToShowFor;
    sitePostModel.findByIdAndUpdate(
        {_id:id}, 
        {$set:{secondsToShowFor:newSecondsToShowFor}}, 
        {new:true},
        function(err, data) {
            if (err || data == null) {
                response.status(400).send();
            } else {
                response.json(data);
            }
        }
    );
}

function deleteComment(request, response) {
    var postId = request.body.postId;
    var commentId = request.body.commentId;
    sitePostModel.findByIdAndUpdate(
        {_id:postId},
        {$pull:{'comments':{'_id':ObjectId(commentId)}}},
        {new:true},
        function(err, data) {
            if (err || data == null) {
                response.status(400).send();
            } else {
                response.json(data);
            }
        }
    );
}

function deletePost(request, response) {
    var id = request.body.id;
    sitePostModel.find({_id:id}).remove(
        function(err, data) {
            if (err || data == null) {
                response.status(400).send();
            } else {
                response.json(data);
            }
        }
    );
}

function getPostsWithinRange(request, response) {
    var longitude = request.query.longitude;
    var latitude = request.query.latitude;
    var range = request.query.range;
    var rangeSqrd = range * range;
    sitePostModel.find({}).$where(function() {
                var longDiff = longitude - this.longitude;
                var latDiff = latitude - this.latitude;
                return longDiff * longDiff + latDiff * latDiff < rangeSqrd;
            }
        )
                 .then(
        function(posts) {
            response.json(posts);
        },
        function (error) {
            response.json(error);
        }
    );
}

var cacheTime = 0;
var postsSecondsToShowForCache = {};
function getPostsSecondsToShowFor(request, response) {
   if (Date.now() - cacheTime < CACHE_MAX_SECONDS) {
       response.json(postsSecondsToShowForCache);
   }
   sitePostModel.find()
                .then(
         function(posts) {
             postsSecondsToShowForCache = {};
             for (var i = 0; i < posts.length; ++i) {
                 postsSecondsToShowForCache[posts[i]._id] = posts[i].secondsToShowFor;
             }
             response.json(postsSecondsToShowForCache);
         },
         function (error) {
             response.json(error);
         }
     );
}

app.listen(SERVER_PORT);
