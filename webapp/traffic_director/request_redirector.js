/**
 * @file Provides a redirectRequest function which will take a request that 
 * retrieves or modifies post(s) from a geographic area or location, and directs
 * that request to the correct server
 */

const log = require(__dirname + '/../utils/log');
const request = require('request');
const util = require('util');
var serverInfoModel;

const MAX_LNG = 180;
const MIN_LNG = -180;
const MAX_LAT = 90;
const MIN_LAT = -90;

/**
 * Get the search query that should be used to find the servers the request 
 * should be routed to
 * @param {Object} targLoc - The center of the search range
 * @param {number} targLoc.latitude
 * @param {number} targLoc.longitude
 * @param {number} targRad - The query radius in meters (a negative radius 
 *  redirects to all available servers)
 * @param {string} reqMethod - The request method being used for the request
 *  being redirected, can be one of GET, POST, PUT, DELETE
 * @returns {Object} A mongoose query object
 */
function getServerSearchQuery(targLoc, targRad, reqMethod) {
    if (targRad !== 0 && (!targRad || targRad < 0)) {
        return {};
    }

    let minLngKey;
    let maxLngKey;
    let minLatKey;
    let maxLatKey;
    switch (reqMethod) {
        case 'POST':
            minLngKey = 'writeRng.minLng';
            maxLngKey = 'writeRng.maxLng';
            minLatKey = 'writeRng.minLat';
            maxLatKey = 'writeRng.maxLat';
            break;
        default:
            minLngKey = 'readRng.minLng';
            maxLngKey = 'readRng.maxLng';
            minLatKey = 'readRng.minLat';
            maxLatKey = 'readRng.maxLat';
    }

    const lat = Number(targLoc.latitude);
    const lng = Number(targLoc.longitude);
    const oneLatDegInMeters = Math.cos(lat * Math.PI / 180) * 111000;
    const oneLngDegInMeters = Math.cos(lng * Math.PI / 180) * 111000;

    // To avoid creating complex queries, we make a query to find all the
    // servers storing posts within the square surrounding the query location 
    // instead of finding all servers within the circular radius. This may 
    // result in a some extra calls to servers that do not fall within the
    // circular search radius, but allows for much simpler queries.

    let minValidMaxLat;
    let maxValidMinLat;
    if (oneLatDegInMeters > 0) {
        const locationRadInLatDeg = Number(targRad) / oneLatDegInMeters;
        minValidMaxLat = lat - locationRadInLatDeg;
        maxValidMinLat = lat + locationRadInLatDeg;
    } else {
        minValidMaxLat = MIN_LAT;
        maxValidMinLat = MAX_LAT;
    }

    let minValidMaxLng;
    let maxValidMinLng;
    if (oneLngDegInMeters > 0) {
        const locationRadInLngDeg = Number(targRad) / oneLngDegInMeters;
        minValidMaxLng = lng - locationRadInLngDeg;
        maxValidMinLng = lng + locationRadInLngDeg;
    } else {
        minValidMaxLat = MIN_LNG;
        maxValidMinLng = MAX_LNG;
    }

    // Now that we have found a square search area, we construct a query to find
    // all servers that may possibly store posts from within that square region

    // Find all servers within the correct latitude
    let query = {
        $and: [{
                [maxLatKey]: {
                    $gt: minValidMaxLat
                }
            },
            {
                [minLatKey]: {
                    $lte: maxValidMinLat
                }
            }
        ]
    };

    // Find all servers storing posts from a longitude greater than the 
    // minimum search area longitude
    if (minValidMaxLng < MIN_LNG) {
        // We need two cases here because our search area crosses the wraparound
        // point for the longitude
        query.$and.push({
            $or: [{
                    [maxLngKey]: {
                        $gt: MIN_LNG
                    }
                },
                {
                    [maxLngKey]: {
                        $gt: minValidMaxLng + (MAX_LNG - MIN_LNG)
                    }
                }
            ]
        });
    } else {
        query.$and.push({
            [maxLngKey]: {
                $gt: minValidMaxLng
            }
        });
    }

    // Find all servers storing posts from a latitude less than the maximum
    // search area latitude
    if (maxValidMinLng > MAX_LNG) {
        // We need two cases here because our search area crosses the wraparound
        // point for the longitude
        query.$and.push({
            $or: [{
                    [minLngKey]: {
                        $lte: MAX_LNG
                    }
                },
                {
                    [minLngKey]: {
                        $lte: maxValidMinLng - (MAX_LNG - MIN_LNG)
                    }
                }
            ]
        });
    } else {
        query.$and.push({
            [minLngKey]: {
                $lte: maxValidMinLng
            }
        });
    }

    return query;
}

/**
 * Redirect a location-based request to the correct database servers
 * @param {Object} req - The Express request object
 * @param {Object} res - The Express response object
 * @param {Object} targLoc - The target location for the query
 * @param {number} targLoc.latitude
 * @param {number} targLoc.longitude
 * @param {number} targRad - The query radius in meters (a negative radius 
 *  redirects to all available servers)
 */
function redirectRequest(req, res, targLoc, targRad) {
    const query = getServerSearchQuery(targLoc, targRad, req.method);
    let searchPromise;
    if (req.method === 'POST') {
        serverInfoModel
            .findOne(query)
            .then(server => sendRequestToServer(req, server))
            .then(reqRes => {
                res.json({
                    statusCode: 200,
                    body: reqRes
                });
            })
            .catch(err => {
                res.status(500).send(err);
                log("request_redirector:redirectRequest:" + err);
            });
    } else {
        serverInfoModel
            .find(query)
            .then(servers => sendRequestToServers(req, servers))
            .then(reqRes => {
                res.json({
                    statusCode: 200,
                    body: reqRes
                });
            })
            .catch(err => {
                res.status(500).send(err);
                log("request_redirector:redirectRequest:" + err);
            });
    }
}

/**
 * Make a request to multiple servers, and then merge the response
 * @param {Object} req - The Express request object
 * @param {Object[]} - The servers to redirect the request to, where each server
 *  was retrieved from the server database
 */
function sendRequestToServers(req, servers) {
    return new Promise((resolve, reject) => {
        Promise.all(servers.map(server => sendRequestToServer(req, server)))
            .then(results => resolve(results.reduce(Object.assign)))
            .catch(reject);
    });
}

/**
 * Make a request to a server
 * @param {Object[]} - The server to send the request to
 * @param {Object} req - The Express request object
 * @return {Promise}
 */
function sendRequestToServer(req, server) {
    var requestParams = {
        url: server.baseAddr + req.originalUrl,
        method: req.method,
        body: req.body,
        json: true
    };
    return new Promise((resolve, reject) => {
        request(requestParams, (err, res) => {
            if (err) {
                reject(err);
            } else {
                resolve(res.body);
            }
        });
    });
}

module.exports = (nServerInfoModel) => {
    serverInfoModel = nServerInfoModel;
    return {
        redirectRequest: (req, res, servers, targRad) => {
            redirectRequest(req, res, servers, targRad);
        }
    };
};