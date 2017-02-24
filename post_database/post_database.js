// ============== Imports ===============

var bodyParser = require('body-parser');
var config = require('./config');
var express = require('express');
var ipAddr = require('ip').address();
var mongoose = require('mongoose');
var request = require('request');
var util = require('util');

// ============== Settings ==============

var PORT_KEY = "port";
var BOUND_IP_KEY = "boundIp";
var MONGO_DB_ADDRESS_KEY = "mongoDbAddress";
var SECONDS_BETWEEN_CLEANUP_KEY = "secondsBetweenCleanup";
var CACHE_EXPIRY_TIME_KEY = "cacheExpiryTime";
var UPVOTE_INC_KEY = "upvoteInc";
var DOWNVOTE_INC_KEY = "downvoteInc";
var INITIAL_SECONDS_TO_SHOW_FOR = "initialSecondsToShowFor";
var SITE_POST_MODEL_KEY = "sitePostModelName";
var BACKUP_POST_MODEL_KEY = "backupPostModelName";

var settings = {};
settings[PORT_KEY] = 8080;
settings[BOUND_IP_KEY] = '0.0.0.0';
settings[MONGO_DB_ADDRESS_KEY] = 'mongodb://localhost/openwindowdatabase';
settings[SECONDS_BETWEEN_CLEANUP_KEY] = 200;
settings[CACHE_EXPIRY_TIME_KEY] = 20;
settings[UPVOTE_INC_KEY] = 80;
settings[DOWNVOTE_INC_KEY] = -150;
settings[INITIAL_SECONDS_TO_SHOW_FOR] = 1000;
settings[SITE_POST_MODEL_KEY] = 'SitePost';
settings[BACKUP_POST_MODEL_KEY] = 'BackupPost';

for (var key in settings) {
    if (config[key]) {
        settings[key] = config[key];
    } else {
        console.log(key + " not set in config file, defaulting to " + settings[key]);
    }
}

// ============= Constants ==============

var UPVOTE = 2;
var DOWNVOTE = 1;
var NONE = 0;

// ================ Setup ================

mongoose.Promise = require('bluebird');
mongoose.connect(settings[MONGO_DB_ADDRESS_KEY]);
var app = express();
app.use(bodyParser.json());
app.use(express.static('./public'));
var backupAddr;

// ========= Add Server to List =========
// TEMP ONLY - Replace 'localhost:8080' with the actual website name later
var baseAddress = ipAddr + ":" + settings[PORT_KEY];
request.post(
    'http://localhost:8080/director/serverinfo', {
        json: {
            baseAddress: baseAddress
        }
    },
    function (err, res) {
        if (err || !res.body.backupAddr) {
            console.log("Error connecting to server network");
            if (err) {
                console.log(err);
            } else {
                console.log("Did not receive backup database address");
            }
            process.exit(1);
        } else {
            backupAddr = res.body.backupAddr;
        }
    }
);

// =============== Models ================

var commentSchema = mongoose.Schema({
    body: {
        type: String,
        required: true
    }
});

var coordinatesSchema = mongoose.Schema({
    type: {
        type: String,
        default: "Point"
    },
    coordinates: {
        type: [Number],
        required: true
    } // first index is lng, second is lat
});

var postSchema = mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    body: {
        type: String,
        required: true
    },
    posterId: {
        type: Number,
        default: 0
    },
    postTime: {
        type: Number,
        required: true
    },
    secondsToShowFor: {
        type: Number,
        default: 0
    },
    comments: {
        type: [commentSchema],
        default: []
    },
    loc: {
        type: coordinatesSchema,
        required: true
    },
    mainDatabaseAddr: {
        type: String,
        required: true
    },
    backupDatabaseAddr: {
        type: String,
        required: true
    }
});

postSchema.index({
    loc: '2dsphere'
});

var sitePostModel = mongoose.model(config[SITE_POST_MODEL_KEY], postSchema);
var backupPostModel = mongoose.model(config[BACKUP_POST_MODEL_KEY], postSchema);

// ========== Old Post Cleanup ==========

setInterval(function () {
    sitePostModel.find({}).$where(function () {
        return this.secondsToShowFor < (Date.now() - this.postTime) / 1000;
    }).remove(function (err, data) {
        if (err) {
            console.log(err);
        }
    });
}, 1000 * settings[SECONDS_BETWEEN_CLEANUP_KEY]);

// =========== API Endpoints ============

// allow access to external database servers directly from the frontend
app.all('*', function (req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'PUT, GET, POST, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

app.post("/api/upvote", upvotePost);
app.post("/api/downvote", downvotePost);
app.post("/api/post", addNewPost);
app.post("/api/posts", addNewPosts);
app.post("/api/comment", addComment);
app.post("/api/settime", setTime);
app.get("/api/allsiteposts", getAllPosts)
app.get("/api/post", getPost);
app.get("/api/posts", getPosts);
app.get("/api/poststimeleft", getPostsSecondsToShowFor);
app.get("/api/postrange", getPostRange);
app.delete("/api/cleanbackups", cleanBackups);
app.delete("/api/deletecomment", deleteComment);
app.delete("/api/deletepost", deletePost);

// ========= API Implementation =========

function getCorrectModel(req) {
    if (req.query.backup) {
        return backupPostModel;
    } else {
        return sitePostModel;
    }
}

function addNewPost(req, res) {
    var sitePost = req.body;
    sitePost.secondsToShowFor = settings[INITIAL_SECONDS_TO_SHOW_FOR];
    sitePost.postTime = Date.now();
    sitePost.mainDatabaseAddr = ipAddr + ":" + settings[PORT_KEY];
    sitePost.backupDatabaseAddr = backupAddr;
    getCorrectModel(req)
        .create(sitePost)
        .then(
            function (req) {
                res.status(200).send();
            },
            function (error) {
                console.log(error);
                res.status(500).send();
            }
        );
}

function addNewPosts(req, res) {
    var posts = req.body;
    getCorrectModel(req)
        .insert(posts)
        .then(
            function (req) {
                res.status(200).send();
            },
            function (err) {
                req.status(500).send();
            }
        );
}

function getAllPosts(req, res) {
    getCorrectModel(req)
        .find()
        .then(
            function (reqRes) {
                res.json(reqRes);
            },
            function (err) {
                res.status(500).send();
            }
        );
}

function getPosts(req, res) {
    var lng = req.query.longitude;
    var lat = req.query.latitude;
    var rad = req.query.radius;
    getCorrectModel(req).find()
        .where('loc')
        .near({
            center: {
                type: 'Point',
                coordinates: [lng, lat]
            },
            maxDistance: rad
        })
        .then(
            function (posts) {
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
    if (oldVote === UPVOTE) {
        amountToInc = -settings[UPVOTE_INC_KEY];
    } else if (oldVote === DOWNVOTE) {
        amountToInc = -settings[DOWNVOTE_INC_KEY] + settings[UPVOTE_INC_KEY];
    } else {
        amountToInc = settings[UPVOTE_INC_KEY];
    }
    getCorrectModel(req).findByIdAndUpdate({
            _id: id
        }, {
            $inc: {
                secondsToShowFor: amountToInc
            }
        }, {
            new: true
        },
        function (err, data) {
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
    if (oldVote === DOWNVOTE) {
        amountToInc = -settings[DOWNVOTE_INC_KEY];
    } else if (oldVote === UPVOTE) {
        amountToInc = -settings[UPVOTE_INC_KEY] + settings[DOWNVOTE_INC_KEY];
    } else {
        amountToInc = settings[DOWNVOTE_INC_KEY];
    }
    getCorrectModel(req).findByIdAndUpdate({
            _id: id
        }, {
            $inc: {
                secondsToShowFor: amountToInc
            }
        }, {
            new: true
        },
        function (err, data) {
            if (err) {
                res.status(400).send();
            } else {
                res.json(data);
            }
        }
    );
}

function getPost(req, res) {
    var id = req.query.id;
    getCorrectModel(req).findOne({
            _id: id
        },
        function (err, data) {
            if (err || data === null) {
                console.log("error is " + JSON.stringify(err));
                res.status(400).send();
            } else {
                res.json(data);
            }
        }
    );
}

function addComment(req, res) {
    var id = req.body.id;
    var comment = req.body.comment;
    getCorrectModel(req).findByIdAndUpdate({
            _id: id
        }, {
            $push: {
                comments: comment
            }
        }, {
            new: true
        },
        function (err, data) {
            if (err || data === null) {
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
    getCorrectModel(req).findByIdAndUpdate({
            _id: id
        }, {
            $set: {
                secondsToShowFor: newSecondsToShowFor
            }
        }, {
            new: true
        },
        function (err, data) {
            if (err || data === null) {
                res.status(400).send();
            } else {
                res.json(data);
            }
        }
    );
}

function deleteComment(req, res) {
    var postId = req.query.postId;
    var commentId = req.query.commentId;
    getCorrectModel(req).findByIdAndUpdate({
            _id: postId
        }, {
            $pull: {
                'comments': {
                    '_id': commentId
                }
            }
        }, {
            new: true
        },
        function (err, data) {
            if (err || data === null) {
                if (err) {
                    console.log("post_database:deleteComment:" + err);
                }
                res.status(500).send();
            } else {
                res.json(data);
            }
        }
    );
}

function deletePost(req, res) {
    var id = req.query.id;
    getCorrectModel(req).find({
        _id: id
    }).remove(
        function (err, data) {
            if (err || data === null) {
                res.status(400).send();
            } else {
                res.json(data);
            }
        }
    );
}

// TODO: Does this actually do stuff?
var cacheTime = 0;
var postsSecondsToShowForCache = {};

function getPostsSecondsToShowFor(req, res) {
    if (Date.now() - cacheTime < settings[CACHE_EXPIRY_TIME_KEY]) {
        res.json(postsSecondsToShowForCache);
    }
    getCorrectModel(req).find()
        .then(
            function (posts) {
                postsSecondsToShowForCache = {};
                posts.forEach(function (post) {
                    postsSecondsToShowForCache[post._id] = post.secondsToShowFor;
                });
                res.json(postsSecondsToShowForCache);
            },
            function (error) {
                res.json(error);
            }
        );
}

function getPostRange(req, res) {
    var minLng = 180;
    var maxLng = -180;
    var minLat = 90;
    var maxLat = -90;

    getCorrectModel(req).find()
        .then(
            function (posts) {
                posts.forEach(function (post) {
                    updateRange(post);
                });
                res.json({
                    minLng: minLng,
                    maxLng: maxLng,
                    minLat: minLat,
                    maxLat: maxLat
                });
            },
            function (error) {
                res.json(error);
            }
        );

    function updateRange(post) {
        var lng = post.loc.coordinates[0];
        var lat = post.loc.coordinates[1];
        if (lng < minLng) {
            minLng = lng;
        }
        if (lng > maxLng) {
            maxLng = lng;
        }
        if (lat < minLat) {
            minLat = lat;
        }
        if (lat > maxLat) {
            maxLat = lat;
        }
    }
}

function cleanBackups(req, res) {
    backupPostModel
        .remove({}, function (err) {
            if (err) {
                console.log("traffic_director:cleanBackups:" + err);
                response.status(500).send();
            } else {
                response.status(200).send();
            }
        });
}

app.listen(settings[PORT_KEY], settings[BOUND_IP_KEY]);