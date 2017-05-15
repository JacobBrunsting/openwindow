/**
 * @file Runs a database server that provides endpoints to create, modify, and
 * delete posts from a database. It has two databases, one main database storing
 * posts, accessed from a large variety of endpoints, and a backup database with
 * less complex endpoints, used to back up posts from another server in the
 * network
 */

// ============== Imports ===============

const mongoose = require('mongoose');
const util = require('util');
const bodyParser = require('body-parser');
const config = require(__dirname + '/config');
const constants = require(__dirname + '/constants');
const express = require('express');
const ipAddr = require('ip').address();
const log = require(__dirname + '/utils/log');
const networkUtils = require(__dirname + '/network_utils');

// ============== Settings ==============

const PORT_KEY = 'port';
const BOUND_IP_KEY = 'boundIp';
const MONGO_DB_ADDRESS_KEY = 'mongoDbAddress';
const SECONDS_BETWEEN_CLEANUP_KEY = 'secondsBetweenCleanup';
const CACHE_EXPIRY_TIME_KEY = 'cacheExpiryTime';
const UPVOTE_INC_KEY = 'upvoteInc';
const DOWNVOTE_INC_KEY = 'downvoteInc';
const INITIAL_SECONDS_TO_SHOW_FOR = 'initialSecondsToShowFor';
const SITE_POST_MODEL_KEY = 'postModelName';
const BACKUP_POST_MODEL_KEY = 'backupPostModelName';
const SERVER_POWER_CONSTANT_KEY = 'serverPowerConstant';
const BASE_ADDR_KEY = 'baseAddr';

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
settings[SERVER_POWER_CONSTANT_KEY] = 1;

for (var key in settings) {
    if (config[key]) {
        settings[key] = config[key];
    } else {
        log.msg(key + ' not set in config file, defaulting to ' + settings[key]);
    }
}

// ======= Command Line Arguments =======

let baseAddr;

process.argv.forEach(function (val, index) {
    if (index >= 2) {
        var splitVal = val.split('=');
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
                case SERVER_POWER_CONSTANT_KEY:
                    settings[SERVER_POWER_CONSTANT_KEY] = splitVal[1];
                    break;
                case BASE_ADDR_KEY:
                    baseAddr = splitVal[1];
                    break;
            }
        }
    }
});

if (!baseAddr) {
    baseAddr = 'http://' + ipAddr + ':' + settings[PORT_KEY];
}

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
let backupAddr;

// ========= Add Server to List =========

networkUtils.serverCall(constants.apiAddress + 'director/newserver',
        networkUtils.POST, {
            baseAddr: baseAddr
        })
    .then((_backupAddr) => {
        if (_backupAddr) {
            backupAddr = _backupAddr;
        } else {
            log.msg('did not receive backup database address. exiting.');
        }
    })
    .catch((err) => {
        log.err('error connecting to server network: ' + err);
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
        default: 'Point'
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
    // TODO: Just remove the same ones that were removed here instead of 
    // preforming a whole cleanup operation
    removeExpiredPosts(postModel)
        .then(() => {
            removeExpiredPostsFromBackup();
        })
        .catch((err) => {
            log.err('post_database:old post cleanup:' + err);
        });
}, cleanupInterval);

function removeExpiredPosts(model) {
    return new Promise((resolve, reject) => {
        model
            .find()
            .lean()
            // DO NOT change to an arrow function, it is important to bind 'this'
            .$where(function () {
                return this.secondsToShowFor < (Date.now() - this.postTime) / 1000;
            })
            .remove((err, data) => {
                if (err) {
                    log.err('post_database:removeExpiredPosts:' + err);
                    reject(err);
                } else {
                    resolve();
                }
            });
    });
}

// =========== API Endpoints ============

// allow access to external database servers directly from the frontend
app.use('*', (req, res, next) => {
    if (req.originalUrl !== '/heartbeat') {
        log.msg(req.method + ' ' + req.originalUrl);
        if (req.body && JSON.stringify(req.body) !== '{}') {
            console.log(JSON.stringify(req.body));
        }
    }
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
app.post('/api/post', postPost);

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
app.post('/api/posts', postPosts);

/**
 * @api {post} /api/comment - Add a new comment to a post
 * @apiParam {mongoose.Types.ObjectId} id
 * @apiParam {String} comment 
 */
app.post('/api/comment', postComment);

/**
 * @api {post} /api/settime - Update the total seconds to show the post for
 * @apiParam {mongoose.Types.ObjectId} id
 * @apiParam {Number} newSecondsToShowFor
 */
app.post('/api/settime', postSetTime);

/**
 * @api {get} /api/allposts - Get all posts stored in the main database
 * @apiSuccess {Object[]} posts
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
app.get('/api/allposts', getAllPosts);

/**
 * @api {get} /api/post - Get a specific post by id
 * @apiParam {mongoose.Types.ObjectId} id
 * @apiSuccess {Object[]} post
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
app.get('/api/post', getPost);

/**
 * @api {get} /api/posts - Get all the posts within a certain radius of a set of
 *  coordinates
 * @apiParam {Number} longitude - The longitude we want posts from
 * @apiParam {Number} latitude - The latitude we want posts from
 * @apiParam {Number} radius - The maximum distance from the provided longitude
 *  and latitude for a post returned by this endpoint
 * @apiSuccess {Object[]} post
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
app.get('/api/posts', getPosts);

/**
 * @api {get} /api/postssecondstoshowfor - Get the total time a post should be
 *  shown for, measured from the time it was first created
 * @apiSuccess {Object[]} postTimesToShowFor.{id} - The total number of seconds
 *  the post with the specified ID should be shown for
 */
app.get('/api/postssecondstoshowfor', getPostsSecondsToShowFor);

/**
 * @api {get} /api/postrange - Get the range of posts stored in the main 
 *  database
 * @apiSuccess {Object} range
 * @apiSuccess {Number} range.minLng
 * @apiSuccess {Number} range.maxLng
 * @apiSuccess {Number} range.minLat
 * @apiSuccess {Number} range.maxLat
 */
app.get('/api/postrange', getPostRange);

/**
 * @api {get} /api/amountused - Get a number representing the amount of the 
 *  server's total capacity that is used
 * @apiSuccess {Number} amountFull - The total amount of the server that is used, 
 *  porportionate to the number of posts stored on the server, and a server
 *  speed constant specified by the server creator
 */
app.get('/api/amountfull', getAmountFull);

/**
 * @api {get} /api/heartbeat - Get some response to verify that the server is 
 *  still running
 */
app.get('/api/heartbeat', getHeartbeat);

/**
 * @api {put} /api/upvote - Upvote a post
 * @apiParam {mongoose.Type.ObjectId} id - The id of the upvoted post
 * @apiParam {number} oldVote - The previous vote on the post
 */
app.put('/api/upvote', putUpvote);

/**
 * @api {put} /api/downvote - Downvote a post
 * @apiParam {mongoose.Type.ObjectId} id - The id of the downvoted post
 * @apiParam {number} oldVote - The previous vote on the post
 */
app.put('/api/downvote', putDownvote);

/**
 * @api {put} /api/post - Update a post, undefined post parameters will not be
 *  modified
 * @apiParam {Object[]} posts - The posts being created
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
app.put('/api/post', putPost);

/**
 * @api {put} /api/backupaddr - Update the address of the database server this 
 *  server backs up to
 * @apiParam {String} newBackupAddr
 */
app.put('/api/backupaddr', putBackupAddr);

/**
 * @api {delete} /api/comment - Delete a comment from a post
 * @apiParam {mongoose.Types.ObjectId} postId - The id of the post containing 
 *  the comment
 * @apiParam {mongoose.Types.ObjectId} commentId - The id of the comment
 */
app.delete('/api/comment', deleteComment);

/**
 * @api {delete} /api/comment - Delete a post
 * @apiParam {mongoose.Types.ObjectId} id
 */
app.delete('/api/post', deletePost);

// ------ Backup Database Endpoints -------

/**
 * @api {post} /api/backuppost - Create a new post in the backup database
 * @apiParam {Object} post - The post being created
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
app.post('/api/backuppost', postBackupPost);

/**
 * @api {post} /api/backupposts - Create new posts in the backup database
 * @apiParam {Object[]} posts - The posts being created
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
app.post('/api/backupposts', postBackupPosts);

/**
 * @api {get} /api/allbackupposts - Get all posts stored in the backup database
 * @apiSuccess {Object[]} posts
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
app.get('/api/allbackupposts', getAllBackupPosts);

/**
 * @api {put} /api/backuppost - Update a post stored in the backup database, 
 *  undefined post parameters will not be modified
 * @apiParam {Object[]} posts - The posts being created
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
app.put('/api/backuppost', putBackupPost);

/**
 * @api {delete} /api/backuppost - Delete a post from the backup database
 * @apiParam {mongoose.Types.ObjectId} id
 */
app.delete('/api/backuppost', deleteBackupPost);

/**
 * @api {delete} /api/expiredbackupposts - Delete all posts from the backup
 *  database which have been displayed longer than their secondsToShowFor
 */
app.delete('/api/expiredbackupposts', deleteExpiredBackupPosts);

/**
 * @api {delete} /api/backups - Delete all backups from the backup database
 */
app.delete('/api/backups', deleteBackups);

// ========= API Implementation =========

// ----- Main Database Endpoints ------

function postPost(req, res) {
    let post = req.body;
    addExtraPostProperties(post);
    log.msg('adding post ' + JSON.stringify(post));
    postModel
        .create(post)
        .then(() => {
            addPostToBackup(post);
            res.status(200).send();
        })
        .catch((err) => {
            res.status(500).send(err);
            log.err('post_database:postPost:' + err);
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
            req.status(500).send(err);
            log.err('post_database:postPosts:' + err);
        });
}

function getAllPosts(req, res) {
    postModel
        .find()
        .lean()
        .then((posts) => {
            res.json(posts);
        })
        .catch((err) => {
            res.status(500).send(err);
            log.err('post_database:getAllPosts:' + err);
        });
}

function getPost(req, res) {
    postModel
        .findOne({
                _id: req.query.id
            },
            function (err, data) {
                if (err || data === null) {
                    res.status(500).send(err);
                    log.err('post_database:getPost:' + JSON.stringify(err));
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
        .lean()
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
            res.status(500).send(err);
            log.err('post_database:getPosts:' + err);
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
        .lean()
        .then((posts) => {
            postsSecondsToShowForCache = {};
            posts.forEach((post) => {
                postsSecondsToShowForCache[post._id] = post.secondsToShowFor;
            });
            res.json(postsSecondsToShowForCache);
        })
        .catch((err) => {
            res.status(500).send(err);
            log.err('post_database:getPostsSecondsToShowFor:' + err);
        });
}

function getAmountFull(req, res) {
    postModel
        .count()
        .then(count => {
            res.json({
                amountFull: count * settings[SERVER_POWER_CONSTANT_KEY]
            });
        })
        .catch(err => {
            res.status(500).send(err);
            log.err('post_database:getAmountFull:' + err);
        })
}

function getHeartbeat(req, res) {
    res.status(200).send();
}

function getPostRange(req, res) {
    let minLng = MAX_LNG;
    let maxLng = MIN_LNG;
    let minLat = MAX_LAT;
    let maxLat = MIN_LAT;

    postModel
        .find()
        .lean()
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
            res.status(500).send(err);
            log.err('post_database:getPostRange:' + err);
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
    const newBackupAddr = req.body.newBackupAddr
    if (backupAddr) {
        clearBackups();
    }
    backupAddr = newBackupAddr;
    postModel
        .find()
        .lean()
        .then(posts => {
            posts.forEach(post => {
                post.backupDatabaseAddr = newBackupAddr;
                postModel.findByIdAndUpdate(post._id, {
                    $set: { backupDatabaseAddr: newBackupAddr }
                }, { new: true })
            });
            res.status(200).send();
            addPostsToBackup(posts);
        })
        .catch((err) => {
            res.status(500).send(err);
            log.err('post_database:putBackupAddr:' + err);
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
                    res.status(500).send(err);
                    log.err('post_database:deletePost:' + err);
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
            res.status(500).send(err);
            log.err('post_database:postBackupPost:' + err);
        });
}

function postBackupPosts(req, res) {
    backupPostModel
        .create(req.body)
        .then(() => {
            res.status(200).send();
        })
        .catch((err) => {
            req.status(500).send(err);
            log.err('post_database:postPosts:' + err);
        });
}

function getAllBackupPosts(req, res) {
    backupPostModel
        .find()
        .lean()
        .then((reqRes) => {
            res.json(reqRes);
        })
        .catch((err) => {
            res.status(500).send(err);
            log.err('post_database:getAllBackupPosts:' + err);
        });
}

function putBackupPost(req, res) {
    let updatedPost = req.body.updatedPostFields;
    delete updatedPost._id;
    backupPostModel
        .findByIdAndUpdate(req.body._id, {
            $set: updatedPost
        })
        .then(() => {
            res.status(200).send();
        })
        .catch((err) => {
            res.status(500).send(err);
            log.err('post_database:putBackupPost:' + err);
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
                    res.status(500).send(err);
                    log.err('post_database:deleteBackupPost:' + err);
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
            res.status(500).send(err);
            log.err('post_database:deleteExpiredBackupPosts:' + err);
        });
}

function deleteBackups(req, res) {
    backupPostModel
        .remove({}, function (err) {
            if (err) {
                res.status(500).send(err);
                log.err('post_database:deleteBackups:' + err);
            } else {
                res.status(200).send();
            }
        });
}

// ====== Post Management Utilities =====

function addExtraPostProperties(post) {
    post.secondsToShowFor = settings[INITIAL_SECONDS_TO_SHOW_FOR];
    post.postTime = Date.now();
    post.mainDatabaseAddr = 'http://' + ipAddr + ':' + settings[PORT_KEY];
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
            delete post._id;
            updatePostBackup(id, post);
        })
        .catch((err) => {
            res.status(500).send(err);
            log.err('post_database:updatePostFromUpdateObj:' + err);
        });
}

// ========== Backup Utilities ==========

function updatePostBackup(_id, updatedPostFields) {
    let body = {
        _id: _id,
        updatedPostFields: updatedPostFields
    }
    networkUtils.apiCall(backupAddr, 'backuppost', networkUtils.PUT, body)
        .catch(
            (err) => {
                log.err('post_database:updatePostBackup:' + err);
            }
        );
}

function addPostToBackup(post) {
    networkUtils.apiCall(backupAddr, 'backuppost', networkUtils.POST, post)
        .catch(
            (err) => {
                log.err('post_database:addPostToBackup:' + err);
            }
        );
}

function addPostsToBackup(posts) {
    networkUtils.apiCall(backupAddr, 'backupposts', networkUtils.POST, posts)
        .catch(
            (err) => {
                log.err('post_database:addPostsToBackup:' + err);
            }
        );
}

function removePostFromBackup(_id) {
    networkUtils.apiCall(backupAddr, 'backuppost', networkUtils.DELETE, undefined, {
            id: _id
        })
        .catch(
            (err) => {
                log.err('post_database:removePostFromBackup:' + err);
            }
        );
}

function removeExpiredPostsFromBackup() {
    networkUtils.apiCall(backupAddr, 'expiredbackupposts', networkUtils.DELETE)
        .catch(
            (err) => {
                log.err('post_database:removeExpiredPostsFromBackup:' + err);
            }
        );
}

function clearBackups() {
    networkUtils.apiCall(backupAddr, 'backups', networkUtils.DELETE)
        .catch(
            (err) => {
                log.err('post_database:clearBackups:' + err);
            }
        );
}
console.log('');
log.msg('post database listening on port ' + settings[PORT_KEY]);
console.log('');
app.listen(settings[PORT_KEY], settings[BOUND_IP_KEY]);

app.delete('/self', (req, res) => {
    res.status(200).send();
    log.msg('received kill request, exiting');
    process.exit(1);
});