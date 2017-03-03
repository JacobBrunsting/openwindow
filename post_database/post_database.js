// ============== Imports ===============

var bodyParser = require('body-parser');
var config = require('./config');
var express = require('express');
var ipAddr = require('ip').address();
var mongoose = require('mongoose');
var util = require('util');
var networkUtils = require('./network_utils');

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

// ======= Command Line Arguments =======

process.argv.forEach(function (val, index) {
    if (index >= 2) {
        var splitVal = val.split("=");
        if (splitVal.length > 1) {
            switch (splitVal[0]) {
                case PORT_KEY:
                    settings[PORT_KEY] = parseInt(splitVal[1]);
                    break;
                case SITE_POST_MODEL_KEY:
                    settings[SITE_POST_MODEL_KEY] = splitVal[1];
                    break;
                case BACKUP_POST_MODEL_KEY:
                    settings[BACKUP_POST_MODEL_KEY] = splitVal[1];
                    break;
            }
        }
    }
});

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
networkUtils.serverCall('http://localhost:8080/director/serverinfo',
        networkUtils.POST, {
            baseAddr: "http://" + ipAddr + ":" + settings[PORT_KEY]
        })
    .then(
        (res) => {
            if (res.backupAddr) {
                backupAddr = res.backupAddr;
            } else {
                console.log("did not receive backup database address. exiting.");
                process.exit(1);
            }
        },
        (err) => {
            console.log("error connecting to server network: " + err);
            process.exit(1);
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
    },
    _id: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    }
});

postSchema.index({
    loc: '2dsphere'
});

var sitePostModel = mongoose.model(settings[SITE_POST_MODEL_KEY], postSchema);
var backupPostModel = mongoose.model(settings[BACKUP_POST_MODEL_KEY], postSchema);

// ========== Old Post Cleanup ==========

setInterval(function () {
    removeExpiredPosts(sitePostModel, function () {
        removeExpiredPostsFromBackup();
    });

}, 1000 * settings[SECONDS_BETWEEN_CLEANUP_KEY]);

function removeExpiredPosts(model, onSuccess, onFailure) {
    model
        .find({})
        .$where(function () {
            return this.secondsToShowFor < (Date.now() - this.postTime) / 1000;
        }).remove(function (err, data) {
            if (err) {
                console.log("post_database:removeExpiredPosts:" + err);
                if (onFailure) {
                    onFailure();
                }
            } else if (onSuccess) {
                onSuccess();
            }
        });
}

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
app.post("/api/backuppost", addNewBackupPost);
app.post("/api/backupposts", addNewBackupPosts);
app.post("/api/comment", addComment);
app.post("/api/settime", setTime);
app.put("/api/post", updatePost);
app.put("/api/backuppost", updateBackupPost);
app.put("/api/backupAddr", changebackupAddr);
app.get("/api/allsiteposts", getAllPosts);
app.get("/api/allbackupposts", getAllBackupPosts);
app.get("/api/post", getPost);
app.get("/api/posts", getPosts);
app.get("/api/poststimeleft", getPostsSecondsToShowFor);
app.get("/api/postrange", getPostRange);
app.delete("/api/backups", cleanBackups);
app.delete("/api/deletecomment", deleteComment);
app.delete("/api/deletepost", deletePost);
app.delete("/api/backuppost", deleteBackupPost);
app.delete("/api/expiredbackupposts", deleteExpiredBackupPosts);

// ========= API Implementation =========

function addNewPost(req, res) {
    var post = req.body;
    addExtraPostProperties(post);
    console.log("adding post " + JSON.stringify(post));
    sitePostModel
        .create(post)
        .then(
            function (req) {
                addPostToBackup(post);
                res.status(200).send();
            },
            function (err) {
                console.log("post_database:addNewPost:" + err);
                res.status(500).send();
            }
        );
}

function addNewPosts(req, res) {
    var posts = req.body;
    posts.forEach(addExtraPostProperties);
    sitePostModel
        .create(posts)
        .then(
            function (req) {
                addPostToBackup(posts);
                res.status(200).send();
            },
            function (err) {
                console.log("post_database:addNewPosts:" + err);
                req.status(500).send();
            }
        );
}

function addExtraPostProperties(post) {
    post.secondsToShowFor = settings[INITIAL_SECONDS_TO_SHOW_FOR];
    post.postTime = Date.now();
    post.mainDatabaseAddr = ipAddr + ":" + settings[PORT_KEY];
    post.backupDatabaseAddr = backupAddr;
    post._id = mongoose.Types.ObjectId();
}

function addNewBackupPost(req, res) {
    console.log("adding backup post " + JSON.stringify(req.body));
    backupPostModel
        .create(req.body)
        .then(
            function (req) {
                res.status(200).send();
            },
            function (err) {
                console.log("post_database:addNewBackupPost:" + err);
                res.status(500).send();
            }
        );
}

function addNewBackupPosts(req, res) {
    backupPostModel
        .create(req.body)
        .then(
            function (req) {
                res.status(200).send();
            },
            function (err) {
                console.log("post_database:addNewPosts:" + err);
                req.status(500).send();
            }
        );
}

function getAllPosts(req, res) {
    sitePostModel
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

function getAllBackupPosts(req, res) {
    backupPostModel
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
    sitePostModel
        .find()
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
    sitePostModel
        .findByIdAndUpdate({
                _id: id
            }, {
                $inc: {
                    secondsToShowFor: amountToInc
                }
            }, {
                new: true
            },
            function (err, post) {
                if (err) {
                    res.status(400).send();
                } else {
                    res.json(post);
                    updatePostBackup(post._id, {
                        secondsToShowFor: post.secondsToShowFor
                    });
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
    sitePostModel
        .findByIdAndUpdate({
                _id: id
            }, {
                $inc: {
                    secondsToShowFor: amountToInc
                }
            }, {
                new: true
            },
            function (err, post) {
                if (err || !post) {
                    res.status(500).send();
                } else {
                    res.json(post);
                    updatePostBackup(post._id, {
                        secondsToShowFor: post.secondsToShowFor
                    });
                }
            }
        );
}

function getPost(req, res) {
    var id = req.query.id;
    sitePostModel
        .findOne({
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
    sitePostModel
        .findByIdAndUpdate({
                _id: id
            }, {
                $push: {
                    comments: comment
                }
            }, {
                new: true
            },
            function (err, post) {
                if (err || post === null) {
                    res.status(400).send();
                } else {
                    res.json(post.comments);
                    updatePostBackup(post._id, {
                        comments: post.comments
                    });
                }
            }
        );
}

function setTime(req, res) {
    var id = req.body.id;
    var newSecondsToShowFor = req.body.newSecondsToShowFor;
    sitePostModel
        .findByIdAndUpdate({
                _id: id
            }, {
                $set: {
                    secondsToShowFor: newSecondsToShowFor
                }
            }, {
                new: true
            },
            function (err, post) {
                if (err || post === null) {
                    res.status(400).send();
                } else {
                    res.json(post);
                    updatePostBackup(post._id, {
                        secondsToShowFor: post.secondsToShowFor
                    });
                }
            }
        );
}

function updatePost(req, res) {
    sitePostModel
        .findByIdAndUpdate(req.body._id, {
                $set: req.body.updatedPostFields
            },
            function (err, post) {
                if (err) {
                    console.log("post_database:updatePost:" + err);
                    res.status(500).send();
                } else {
                    res.status(200).send();
                    updatePostBackup(post._id,
                        req.body.updatedPostFields);
                }
            });
}

function updateBackupPost(req, res) {
    backupPostModel
        .findByIdAndUpdate(req.body._id, {
                $set: req.body.updatedPostFields
            },
            function (err) {
                if (err) {
                    console.log("post_database:updateBackupPost:" + err);
                    res.status(500).send();
                } else {
                    res.status(200).send();
                }
            });
}

function changebackupAddr(req, res) {
    clearBackups();
    backupAddr = req.query.newbackupAddr;
    sitePostModel
        .find()
        .then(function (posts) {
            res.status(200).send();
            addPostsToBackup(posts);
        })
        .catch(function (err) {
            res.status(500).send();
            console.log("post_database:changeBackupAddr:" + err);
        });
}

function deleteComment(req, res) {
    var postId = req.query.postId;
    var commentId = req.query.commentId;
    sitePostModel
        .findByIdAndUpdate({
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
            function (err, post) {
                if (err || post === null) {
                    if (err) {
                        console.log("post_database:deleteComment:" + err);
                    }
                    res.status(500).send();
                } else {
                    res.json(post);
                    updatePostBackup(post._id, {
                        comments: post.comments
                    });
                }
            }
        );
}

function deletePost(req, res) {
    var id = req.query.id;
    sitePostModel
        .find({
            _id: id
        }).remove(
            function (err, data) {
                if (err) {
                    res.status(500).send();
                } else {
                    res.status(200).send();
                    removePostFromBackup(id);
                }
            }
        );
}

function deleteBackupPost(req, res) {
    console.log("deleting backup post");
    var id = req.query.id;
    backupPostModel
        .find({
            _id: id
        }).remove(
            function (err, data) {
                if (err) {
                    res.status(500).send();
                } else {
                    res.status(200).send();
                }
            }
        );
}

function deleteExpiredBackupPosts(req, res) {
    removeExpiredPosts(backupPostModel,
        function () {
            res.status(200).send();
        },
        function () {
            res.status(500).send();
        });
}

// TODO: Does this actually do stuff?
var cacheTime = 0;
var postsSecondsToShowForCache = {};

function getPostsSecondsToShowFor(req, res) {
    if (Date.now() - cacheTime < settings[CACHE_EXPIRY_TIME_KEY]) {
        res.json(postsSecondsToShowForCache);
    }
    sitePostModel
        .find()
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

    sitePostModel
        .find()
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
                console.log("post_database:cleanBackups:" + err);
                res.status(500).send();
            } else {
                res.status(200).send();
            }
        });
}
// TODO: Differentiate better between functions that deal with the backups 
// stored on this database, and the backups of the main data from this server
// Consider solving this issue by moving the backup api to a different file
// Also, you should pass the response object into these functions to send back
// a status code when done
// ========== Backup Utilities ==========

function updatePostBackup(_id, updatedPostFields) {
    let body = {
        _id: _id,
        updatedPostFields: updatedPostFields
    }
    networkUtils.apiCall(backupAddr, "backuppost", networkUtils.PUT, body)
        .catch(
            (err) => {
                console.log("post_database:updatePostBackup:" + err);
            }
        );
}

function addPostToBackup(post) {
    networkUtils.apiCall(backupAddr, "backuppost", networkUtils.POST, post)
        .catch(
            (err) => {
                console.log("post_database:addPostToBackup:" + err);
            }
        );
}

function addPostsToBackup(posts) {
    networkUtils.apiCall(backupAddr, "backupposts", networkUtils.POST, posts)
        .catch(
            (err) => {
                console.log("post_database:addPostsToBackup:" + err);
            }
        );
}

function removePostFromBackup(_id) {
    networkUtils.apiCall(backupAddr, "backuppost", networkUtils.DELETE, undefined, {
            id: _id
        })
        .catch(
            (err) => {
                console.log("post_database:removePostFromBackup:" + err);
            }
        );
}

function removeExpiredPostsFromBackup() {
    networkUtils.apiCall(backupAddr, "expiredbackupposts", networkUtils.DELETE)
        .catch(
            (err) => {
                console.log("post_database:removeExpiredPostsFromBackup:" + err);
            }
        );
}

function clearBackups() {
    networkUtils.apiCall(backupAddr, "backups", networkUtils.DELETE)
        .catch(
            (err) => {
                console.log("post_database:clearBackups:" + err);
            }
        );
}

app.listen(settings[PORT_KEY], settings[BOUND_IP_KEY]);