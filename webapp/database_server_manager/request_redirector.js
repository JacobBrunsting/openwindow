/**
 * @file Provides a redirectRequest function which will take a request that 
 * retrieves or modifies post(s) from a geographic area or location, and directs
 * that request to the correct server
 */

const request = require('request-promise');
const util = require('util');
const log = require(__dirname + '/../utils/log');

let serverInfoModelWrapper;

const MAX_LNG = 180;
const MIN_LNG = -180;
const MAX_LAT = 90;
const MIN_LAT = -90;

/**
 * Get a search query to find all servers servicing the provided range
 * @param {Object} targLoc - The center of the search range
 * @param {number} targLoc.latitude
 * @param {number} targLoc.longitude
 * @param {number} targRad - The query radius in meters (a negative radius 
 *  redirects to all available servers)
 * @param {string} reqMethod - The request method being used for the request
 *  being redirected, can be one of GET, POST, PUT, DELETE
 * @returns {Object} A mongoose query object
 */
function getRangeBasedServerSearchQuery(targLoc, targRad, reqMethod) {
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
    const oneLatDegInMeters = 111000;
    const oneLngDegInMeters = Math.cos(lat * Math.PI / 180) * 111000;

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
 * @apiParam {Object} req - The Express request object
 * @apiParam {Object} res - The Express response object
 * @apiParam {Object} targLoc - The target location for the query
 * @apiParam {number} targLoc.latitude
 * @apiParam {number} targLoc.longitude
 * @apiParam {number} targRad - The query radius in meters (an undefined or 0 
 *  radius redirects to the single server serving the target location)
 * @apiParam {string} databaseAddr - The database to redirect the request to,
 *  if this parameter is specified in the query parameters, the request will 
 *  only be sent to this database
 */
function redirectRequest(req, res, targLoc, targRad) {
    if (req.query.databaseAddress) {
        sendRequestToAddress(req, req.query.databaseAddress)
            .then(reqRes => {
                res.json({
                    statusCode: 200,
                    body: reqRes
                });
            })
            .catch(err => {
                res.status(500).send(err);
                log.err('request_redirector:redirectRequest:' + err);
            });
        return;
    }
    if (!targRad) {
        targRad = 0;
    }
    let query = getRangeBasedServerSearchQuery(targLoc, targRad, req.method);
    let searchPromise;
    serverInfoModelWrapper
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
            log.err('request_redirector:redirectRequest:' + err);
        });
}

/**
 * Make a request to multiple servers, and then merge the responses
 * @param {Object} req - The Express request object
 * @param {Object[]} - The servers to redirect the request to, where each server
 *  was retrieved from the server database
 */
function sendRequestToServers(req, servers) {
    return Promise.all(servers.map(server => sendRequestToAddress(req, server.baseAddr)))
        .then(results => {
            if (results.length === 0) {
                return [];
            } else {
                return results.reduce(mergeObjects);
            }
        });

    function mergeObjects(a, b) {
        if (a.constructor === Array && b.constructor === Array) {
            return a.concat(b);
        } else if (isObject(a) && isObject(b)) {
            // merge all shared properties
            for (let key in a) {
                if (b[key]) {
                    a[key] = mergeObjects(a[key], b[key]);
                }
            }
            // insert properties from b not in a
            for (let key in b) {
                if (!a[key]) {
                    a[key] = b[key];
                }
            }
            if (Object.keys(a).length > 0) {
                return a;
            } else if (!b) {
                return a;
            } else if (!a) {
                return b;
            } else {
                return [a, b];
            }
        } else {
            return [a, b];
        }

        function isObject(a) {
            return a === Object(a);
        }
    }
}

/**
 * Make a request to a server
 * @param {string} serverAddress - The base address of the server to send the 
 *  request to
 * @param {Object} req - The Express request object
 * @return {Promise}
 */
function sendRequestToAddress(req, serverAddress) {
    var requestParams = {
        url: serverAddress + req.originalUrl,
        method: req.method,
        body: req.body,
        json: true
    };
    return request(requestParams).catch(err => {
        log.err('request_redirector:sendRequestToAddress:' + err);
        throw err;
    });
}

module.exports = (nserverInfoModelWrapper) => {
    serverInfoModelWrapper = nserverInfoModelWrapper;
    return {
        redirectRequest
    };
};