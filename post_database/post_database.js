/**
 * @file Runs a database server that provides endpoints to create, modify, and
 * delete posts from a database. It has two databases, one main database storing
 * posts, accessed from a large variety of endpoints, and a backup database with
 * less complex endpoints, used to back up posts from another server in the
 * network
 */

// ============== Imports ===============

const bodyParser = require('body-parser');
const config = require(__dirname + '/config');
const express = require('express');
const ipAddr = require('ip').address();
const mongoose = require('mongoose');
const util = require('util');
const networkUtils = require(__dirname + '/network_utils');

// ============== Settings ==============

const PORT_KEY = "port";
const BOUND_IP_KEY = "boundIp";
const MONGO_DB_ADDRESS_KEY = "mongoDbAddress";
const SECONDS_BETWEEN_CLEANUP_KEY = "secondsBetweenCleanup";
const CACHE_EXPIRY_TIME_KEY = "cacheExpiryTime";
const UPVOTE_INC_KEY = "upvoteInc";
const DOWNVOTE_INC_KEY = "downvoteInc";
const INITIAL_SECONDS_TO_SHOW_FOR = "initialSecondsToShowFor";
const SITE_POST_MODEL_KEY = "postModelName";
const BACKUP_POST_MODEL_KEY = "backupPostModelName";

var settings = {};
settings[PORT_KEY] = 8080;
settings[BOUND_IP_KEY] = '0.0.0.0';
settings[MONGO_DB_ADDRESS_KEY] = 'mongodb://localhost/openwindowdatabase';
settings[SECONDS_BETWEEN_CLEANUP_KEY] = 200;
settings[CACHE_EXPIRY_TIME_KEY] = 20;
settings[UPVOTE_INC_KEY] = 80;
settings[DOWNVOTE_INC_KEY] = -150;
settings[INITIAL_SECONDS_TO_SHOW_FOR] = 1000;
settings[SITE_POST_MODEL_KEY] = 'Post';
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

const UPVOTE = 2;
const DOWNVOTE = 1;
const NONE = 0;
const MAX_LNG = 180;
const MIN_LNG = -180;
const MAX_LAT = 90;
const MIN_LAT = -90;

// ================ Setup ================

mongoose.Promise = require('bluebird');
mongoose.connect(settings[MONGO_DB_ADDRESS_KEY]);
const app = express();
app.use(bodyParser.json());
app.use(express.static('./public'));
var backupAddr;

// ========= Add Server to List =========
// TEMP ONLY - Replace 'localhost:8080' with the actual website name later
networkUtils.serverCall('http://localhost:8080/director/newserver',
        networkUtils.POST, {
            baseAddr: "http://" + ipAddr + ":" + settings[PORT_KEY]
        })
    .then((res) => {
        if (res.backupAddr) {
            backupAddr = res.backupAddr;
        } else {
            console.log("did not receive backup database address. exiting.");
            process.exit(1);
        }
    })
    .catch((err) => {
        console.log("error connecting to server network: " + err);
        process.exit(1);
    });

// =============== Models ================

const commentSchema = mongoose.Schema({
    body: {
        type: String,
        required: true
    }
});

const coordinatesSchema = mongoose.Schema({
    type: {
        type: String,
        default: "Point"
    },
    coordinates: {
        type: [Number],
        required: true
    } // first index is lng, second is lat
});

const postSchema = mongoose.Schema({
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

const postModel = mongoose.model(settings[SITE_POST_MODEL_KEY], postSchema);
const backupPostModel = mongoose.model(settings[BACKUP_POST_MODEL_KEY], postSchema);

// ========== Old Post Cleanup ==========

const cleanupInterval = 1000 * settings[SECONDS_BETWEEN_CLEANUP_KEY];
setInterval(() => {
    removeExpiredPosts(postModel)
        .then(() => {
            removeExpiredPostsFromBackup();
        })
        .catch((err) => {
            console.log("post_database:old post cleanup:" + err);
        });
}, cleanupInterval);

function removeExpiredPosts(model) {
    return new Promise((resolve, reject) => {
        model
            .find()
            .$where(function() {
                return this.secondsToShowFor < (Date.now() - this.postTime) / 1000;
            })
            .remove((err, data) => {
                if (err) {
                    console.log("post_database:removeExpiredPosts:" + err);
                    reject(err);
                } else {
                    resolve();
                }
            });
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

// ------ Main Database Endpoints -------

/**
 * @api {post} /api/post - Create a new post
 * @apiParam {Object} post - The post being created
 * @apiParam {String} post.id
 * @apiParam {String} post.body
 * @apiParam {Number} post.posterId
 * @apiParam {Number} post.postTime
 * @apiParam {Number} post.secondsToShowFor
 * @apiParam {Object[]} post.comments
 * @apiParam {String} post.comments.body
 * @apiParams {Object} post.loc
 * @apiParam {String} post.loc.type
 * @apiParam {Number[]} post.loc.coordinates
 * @apiParam {String} post.mainDatabaseAddr
 * @apiParam {String} post.backupDatabaseAddr
 * @apiParam {mongoose.Types.ObjectId} post._id
 */
app.post("/api/post", postPost);

/**
 * @api {post} /api/posts - Create new posts
 * @apiParam {Object[]} posts
 * @apiParam {String} posts.id
 * @apiParam {String} posts.body
 * @apiParam {Number} posts.posterId
 * @apiParam {Number} posts.postTime
 * @apiParam {Number} posts.secondsToShowFor
 * @apiParam {Object[]} posts.comments
 * @apiParam {String} posts.comments.body
 * @apiParams {Object} posts.loc
 * @apiParam {String} posts.loc.type
 * @apiParam {Number[]} posts.loc.coordinates
 * @apiParam {String} posts.mainDatabaseAddr
 * @apiParam {String} posts.backupDatabaseAddr
 * @apiParam {mongoose.Types.ObjectId} posts._id
 */
app.post("/api/posts", postPosts);

/**
 * @api {post} /api/comment - Add a new comment to a post
 * @apiParam {mongoose.Types.ObjectId} id
 * @apiParam {String} comment 
 */
app.post("/api/comment", postComment);

/**
 * @api {post} /api/settime - Update the total seconds to show the post for
 * @apiParam {mongoose.Types.ObjectId} id
 * @apiParam {Number} newSecondsToShowFor
 */
app.post("/api/settime", postSetTime);

/**
 * @api {get} /api/allposts - Get all posts stored in the main database
 * @apiSuccess {Object[]} posts
 * @apiSuccess {String} posts.id
 * @apiSuccess {String} posts.body
 * @apiSuccess {Number} posts.posterId
 * @apiSuccess {Number} posts.postTime
 * @apiSuccess {Number} posts.secondsToShowFor
 * @apiSuccess {Object[]} posts.comments
 * @apiSuccess {String} posts.comments.body
 * @apiSuccess {Object} posts.loc
 * @apiSuccess {String} posts.loc.type
 * @apiSuccess {Number[]} posts.loc.coordinates
 * @apiSuccess {String} posts.mainDatabaseAddr
 * @apiSuccess {String} posts.backupDatabaseAddr
 * @apiSuccess {mongoose.Types.ObjectId} posts._id
 */
app.get("/api/allposts", getAllPosts);

/**
 * @api {get} /api/post - Get a specific post by id
 * @apiParam {mongoose.Types.ObjectId} id
 * @apiSuccess {Object[]} post
 * @apiSuccess {String} post.id
 * @apiSuccess {String} post.body
 * @apiSuccess {Number} post.posterId
 * @apiSuccess {Number} post.postTime
 * @apiSuccess {Number} post.secondsToShowFor
 * @apiSuccess {Object[]} post.comments
 * @apiSuccess {String} post.comments.body
 * @apiSuccess {Object} post.loc
 * @apiSuccess {String} post.loc.type
 * @apiSuccess {Number[]} post.loc.coordinates
 * @apiSuccess {String} post.mainDatabaseAddr
 * @apiSuccess {String} post.backupDatabaseAddr
 * @apiSuccess {mongoose.Types.ObjectId} posts._id
 */
app.get("/api/post", getPost);

/**
 * @api {get} /api/posts - Get all the posts within a certain radius of a set of
 *  coordinates
 * @apiParam {Number} longitude - The longitude we want posts from
 * @apiParam {Number} latitude - The latitude we want posts from
 * @apiParam {Number} radius - The maximum distance from the provided longitude
 *  and latitude for a post returned by this endpoint
 * @apiSuccess {Object[]} post
 * @apiSuccess {String} post.id
 * @apiSuccess {String} post.body
 * @apiSuccess {Number} post.posterId
 * @apiSuccess {Number} post.postTime
 * @apiSuccess {Number} post.secondsToShowFor
 * @apiSuccess {Object[]} post.comments
 * @apiSuccess {String} post.comments.body
 * @apiSuccess {Object} post.loc
 * @apiSuccess {String} post.loc.type
 * @apiSuccess {Number[]} post.loc.coordinates
 * @apiSuccess {String} post.mainDatabaseAddr
 * @apiSuccess {String} post.backupDatabaseAddr
 * @apiSuccess {mongoose.Types.ObjectId} posts._id
 */
app.get("/api/posts", getPosts);

/**
 * @api {get} /api/postssecondstoshowfor - Get the total time a post should be
 *  shown for, measured from the time it was first created
 * @apiSuccess {Object[]} postTimesToShowFor
 */
app.get("/api/postssecondstoshowfor", getPostsSecondsToShowFor);

/**
 * @api {get} /api/postrange - Get the range of posts stored in the main 
 *  database
 * @apiSuccess {Object} range
 * @apiSuccess {Number} range.minLng
 * @apiSuccess {Number} range.maxLng
 * @apiSuccess {Number} range.minLat
 * @apiSuccess {Number} range.maxLat
 */
app.get("/api/postrange", getPostRange);

/**
 * @api {put} /api/upvote - Upvote a post
 * @apiParam {mongoose.Type.ObjectId} id - The id of the upvoted post
 * @apiParam {number} oldVote - The previous vote on the post
 */
app.put("/api/upvote", putUpvote);

/**
 * @api {put} /api/downvote - Downvote a post
 * @apiParam {mongoose.Type.ObjectId} id - The id of the downvoted post
 * @apiParam {number} oldVote - The previous vote on the post
 */
app.put("/api/downvote", putDownvote);

/**
 * @api {put} /api/post - Update a post, undefined post parameters will not be
 *  modified
 * @apiParam {Object[]} posts - The posts being created
 * @apiParam {String} posts.id
 * @apiParam {String} posts.body
 * @apiParam {Number} posts.posterId
 * @apiParam {Number} posts.postTime
 * @apiParam {Number} posts.secondsToShowFor
 * @apiParam {Object[]} posts.comments
 * @apiParam {String} posts.comments.body
 * @apiParams {Object} posts.loc
 * @apiParam {String} posts.loc.type
 * @apiParam {Number[]} posts.loc.coordinates
 * @apiParam {String} posts.mainDatabaseAddr
 * @apiParam {String} posts.backupDatabaseAddr
 * @apiParam {mongoose.Types.ObjectId} posts._id
 */
app.put("/api/post", putPost);

/**
 * @api {put} /api/backupaddr - Update the address of the database server this 
 *  server backs up to
 * @apiParam {String} newBackupAddr
 */
app.put("/api/backupaddr", putBackupAddr);

/**
 * @api {delete} /api/comment - Delete a comment from a post
 * @apiParam {mongoose.Types.ObjectId} postId - The id of the post containing 
 *  the comment
 * @apiParam {mongoose.Types.ObjectId} commentId - The id of the comment
 */
app.delete("/api/comment", deleteComment);

/**
 * @api {delete} /api/comment - Delete a post
 * @apiParam {mongoose.Types.ObjectId} id
 */
app.delete("/api/post", deletePost);

// ------ Backup Database Endpoints -------

/**
 * @api {post} /api/backuppost - Create a new post in the backup database
 * @apiParam {Object} post - The post being created
 * @apiParam {String} post.id
 * @apiParam {String} post.body
 * @apiParam {Number} post.posterId
 * @apiParam {Number} post.postTime
 * @apiParam {Number} post.secondsToShowFor
 * @apiParam {Object[]} post.comments
 * @apiParam {String} post.comments.body
 * @apiParams {Object} post.loc
 * @apiParam {String} post.loc.type
 * @apiParam {Number[]} post.loc.coordinates
 * @apiParam {String} post.mainDatabaseAddr
 * @apiParam {String} post.backupDatabaseAddr
 * @apiParam {mongoose.Types.ObjectId} post._id
 */
app.post("/api/backuppost", postBackupPost);

/**
 * @api {post} /api/backupposts - Create new posts in the backup database
 * @apiParam {Object[]} posts - The posts being created
 * @apiParam {String} posts.id
 * @apiParam {String} posts.body
 * @apiParam {Number} posts.posterId
 * @apiParam {Number} posts.postTime
 * @apiParam {Number} posts.secondsToShowFor
 * @apiParam {Object[]} posts.comments
 * @apiParam {String} posts.comments.body
 * @apiParams {Object} posts.loc
 * @apiParam {String} posts.loc.type
 * @apiParam {Number[]} posts.loc.coordinates
 * @apiParam {String} posts.mainDatabaseAddr
 * @apiParam {String} posts.backupDatabaseAddr
 * @apiParam {mongoose.Types.ObjectId} posts._id
 */
app.post("/api/backupposts", postBackupPosts);

/**
 * @api {get} /api/allbackupposts - Get all posts stored in the backup database
 * @apiSuccess {Object[]} posts
 * @apiSuccess {String} posts.id
 * @apiSuccess {String} posts.body
 * @apiSuccess {Number} posts.posterId
 * @apiSuccess {Number} posts.postTime
 * @apiSuccess {Number} posts.secondsToShowFor
 * @apiSuccess {Object[]} posts.comments
 * @apiSuccess {String} posts.comments.body
 * @apiSuccess {Object} posts.loc
 * @apiSuccess {String} posts.loc.type
 * @apiSuccess {Number[]} posts.loc.coordinates
 * @apiSuccess {String} posts.mainDatabaseAddr
 * @apiSuccess {String} posts.backupDatabaseAddr
 * @apiSuccess {mongoose.Types.ObjectId} posts._id
 */
app.get("/api/allbackupposts", getAllBackupPosts);

/**
 * @api {put} /api/backuppost - Update a post stored in the backup database, 
 *  undefined post parameters will not be modified
 * @apiParam {Object[]} posts - The posts being created
 * @apiParam {String} posts.id
 * @apiParam {String} posts.body
 * @apiParam {Number} posts.posterId
 * @apiParam {Number} posts.postTime
 * @apiParam {Number} posts.secondsToShowFor
 * @apiParam {Object[]} posts.comments
 * @apiParam {String} posts.comments.body
 * @apiParams {Object} posts.loc
 * @apiParam {String} posts.loc.type
 * @apiParam {Number[]} posts.loc.coordinates
 * @apiParam {String} posts.mainDatabaseAddr
 * @apiParam {String} posts.backupDatabaseAddr
 * @apiParam {mongoose.Types.ObjectId} posts._id
 */
app.put("/api/backuppost", putBackupPost);

/**
 * @api {delete} /api/backuppost - Delete a post from the backup database
 * @apiParam {mongoose.Types.ObjectId} id
 */
app.delete("/api/backuppost", deleteBackupPost);

/**
 * @api {delete} /api/expiredbackupposts - Delete all posts from the backup
 *  database which have been displayed longer than their secondsToShowFor
 */
app.delete("/api/expiredbackupposts", deleteExpiredBackupPosts);

/**
 * @api {delete} /api/backups - Delete all backups from the backup database
 */
app.delete("/api/backups", deleteBackups);

// ========= API Implementation =========

// ----- Main Database Endpoints ------

function postPost(req, res) {
    let post = req.body;
    addExtraPostProperties(post);
    console.log("adding post " + JSON.stringify(post));
    postModel
        .create(post)
        .then(() => {
            addPostToBackup(post);
            res.status(200).send();
        })
        .catch((err) => {
            res.status(500).send();
            console.log("post_database:postPost:" + err);
        });
}

function postPosts(req, res) {
    let posts = req.body;
    posts.forEach(addExtraPostProperties);
    postModel
        .create(posts)
        .then(() => {
            addPostToBackup(posts);
            res.status(200).send();
        })
        .catch((err) => {
            req.status(500).send();
            console.log("post_database:postPosts:" + err);
        });
}

function getAllPosts(req, res) {
    postModel
        .find()
        .then((posts) => {
            res.json(posts);
        })
        .catch((err) => {
            res.status(500).send();
            console.log("post_database:getAllPosts:" + err);
        });
}

function getPost(req, res) {
    postModel
        .findOne({
                _id: req.query.id
            },
            function (err, data) {
                if (err || data === null) {
                    console.log("post_database:getPost:" + JSON.stringify(err));
                    res.status(500).send();
                } else {
                    res.json(data);
                }
            }
        );
}

function getPosts(req, res) {
    const lng = req.query.longitude;
    const lat = req.query.latitude;
    const rad = req.query.radius;
    postModel
        .find()
        .where('loc')
        .near({
            center: {
                type: 'Point',
                coordinates: [lng, lat]
            },
            maxDistance: rad
        })
        .then((posts) => {
            res.json(posts);
        })
        .catch((err) => {
            res.status(500).send();
            console.log("post_database:getPosts:" + err);
        });
}

var cacheTime = 0;
var postsSecondsToShowForCache = {};

function getPostsSecondsToShowFor(req, res) {
    if (Date.now() - cacheTime < settings[CACHE_EXPIRY_TIME_KEY]) {
        res.json(postsSecondsToShowForCache);
    }
    postModel
        .find()
        .then((posts) => {
            postsSecondsToShowForCache = {};
            posts.forEach((post) => {
                postsSecondsToShowForCache[post._id] = post.secondsToShowFor;
            });
            res.json(postsSecondsToShowForCache);
        })
        .catch((err) => {
            res.json("post_database:getPostsSecondsToShowFor:" + err);
        });
}

function getPostRange(req, res) {
    let minLng = MAX_LNG;
    let maxLng = MIN_LNG;
    let minLat = MAX_LAT;
    let maxLat = MIN_LAT;

    postModel
        .find()
        .then((posts) => {
            posts.forEach((post) => {
                updateRange(post);
            });
            res.json({
                minLng: minLng,
                maxLng: maxLng,
                minLat: minLat,
                maxLat: maxLat
            });
        })
        .catch((err) => {
            res.json("post_database:getPostRange:" + err);
        });

    function updateRange(post) {
        const lng = post.loc.coordinates[0];
        const lat = post.loc.coordinates[1];
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

function postComment(req, res) {
    const updateObj = {
        $push: {
            comments: req.body.comment
        }
    };
    updatePostFromUpdateObj(req.body.id, updateObj, req, res);
}

function postSetTime(req, res) {
    const updateObj = {
        $set: {
            secondsToShowFor: req.body.newSecondsToShowFor
        }
    };
    updatePostFromUpdateObj(req.body.id, updateObj, req, res);
}

function putUpvote(req, res) {
    const id = req.body.id;
    const oldVote = req.body.oldVote;

    let amountToInc;
    if (oldVote === UPVOTE) {
        amountToInc = -settings[UPVOTE_INC_KEY];
    } else if (oldVote === DOWNVOTE) {
        amountToInc = -settings[DOWNVOTE_INC_KEY] + settings[UPVOTE_INC_KEY];
    } else {
        amountToInc = settings[UPVOTE_INC_KEY];
    }

    const updateObj = {
        $inc: {
            secondsToShowFor: amountToInc
        }
    };
    updatePostFromUpdateObj(id, updateObj, req, res);
}

function putDownvote(req, res) {
    const id = req.body.id;
    const oldVote = req.body.oldVote;

    let amountToInc;
    if (oldVote === DOWNVOTE) {
        amountToInc = -settings[DOWNVOTE_INC_KEY];
    } else if (oldVote === UPVOTE) {
        amountToInc = -settings[UPVOTE_INC_KEY] + settings[DOWNVOTE_INC_KEY];
    } else {
        amountToInc = settings[DOWNVOTE_INC_KEY];
    }

    const updateObj = {
        $inc: {
            secondsToShowFor: amountToInc
        }
    };
    updatePostFromUpdateObj(id, updateObj, req, res);
}

function putPost(req, res) {
    const updateObj = {
        $set: req.body.updatedPostFields
    };
    updatePostFromUpdateObj(req.body._id, updateObj, req, res);
}

function putBackupAddr(req, res) {
    clearBackups();
    backupAddr = req.body.newbackupAddr;
    postModel
        .find()
        .then((posts) => {
            res.status(200).send();
            addPostsToBackup(posts);
        })
        .catch((err) => {
            res.status(500).send();
            console.log("post_database:changeBackupAddr:" + err);
        });
}

function deleteComment(req, res) {
    const updateObj = {
        $pull: {
            'comments': {
                '_id': req.query.commentId
            }
        }
    };
    updatePostFromUpdateObj(req.query.postId, updateObj, req, res);
}

function deletePost(req, res) {
    var id = req.query.id;
    postModel
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

// ----- Backup Database Endpoints ------

function postBackupPost(req, res) {
    backupPostModel
        .create(req.body)
        .then(() => {
            res.status(200).send();
        })
        .catch((err) => {
            res.status(500).send();
            console.log("post_database:postBackupPost:" + err);
        });
}

function postBackupPosts(req, res) {
    backupPostModel
        .create(req.body)
        .then(() => {
            res.status(200).send();
        })
        .catch((err) => {
            req.status(500).send();
            console.log("post_database:postPosts:" + err);
        });
}

function getAllBackupPosts(req, res) {
    backupPostModel
        .find()
        .then((reqRes) => {
            res.json(reqRes);
        })
        .catch((err) => {
            res.status(500).send();
            console.log("post_database:getAllBackupPosts:" + err);
        });
}

function putBackupPost(req, res) {
    backupPostModel
        .findByIdAndUpdate(req.body._id, {
            $set: req.body.updatedPostFields
        })
        .then(() => {
            res.status(200).send();
        })
        .catch((err) => {
            console.log("post_database:putBackupPost:" + err);
            res.status(500).send();
        });
}

function deleteBackupPost(req, res) {
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
    removeExpiredPosts(backupPostModel)
        .then(() => {
            res.status(200).send();
        })
        .catch((err) => {
            res.status(500).send();
            console.log("post_database:deleteExpiredBackupPosts:" + err);
        });
}

function deleteBackups(req, res) {
    backupPostModel
        .remove({}, function (err) {
            if (err) {
                console.log("post_database:deleteBackups:" + err);
                res.status(500).send();
            } else {
                res.status(200).send();
            }
        });
}

// ====== Post Management Utilities =====

function addExtraPostProperties(post) {
    post.secondsToShowFor = settings[INITIAL_SECONDS_TO_SHOW_FOR];
    post.postTime = Date.now();
    post.mainDatabaseAddr = ipAddr + ":" + settings[PORT_KEY];
    post.backupDatabaseAddr = backupAddr;
    post._id = mongoose.Types.ObjectId();
}

/**
 * Update an individual post, updating the main database, and the backup 
 * database
 * @param {mongoose.Types.ObjectId} id - id of the post being updated
 * @param {Object} updateInfo - Mongoose update object
 */
function updatePostFromUpdateObj(id, updateInfo, req, res) {
    postModel
        .findByIdAndUpdate({
                _id: id
            },
            updateInfo, {
                new: true
            }
        )
        .then((post) => {
            res.json(post);
            updatePostBackup(id, post);
        })
        .catch((err) => {
            res.status(500).send();
            console.log("post_database:updatePostFromUpdateObj:" + err);
        });
}

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

console.log("post database listening on port " + settings[PORT_KEY]);
app.listen(settings[PORT_KEY], settings[BOUND_IP_KEY]);