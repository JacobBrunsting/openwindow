var request = require('request');
var util = require('util');

var serverInfoModel;

/**
 * Get the search query that should be used to find the servers the request 
 * should be routed to
 * targLoc ({longitude, latitude}): The center of the search range
 * targRad (Number):                The search radius in meters
 * returns: An object that should be passed to the 'find' function of a 
 *          mongoose query
 */
function getServerSearchQuery(targLoc, targRad) {
    if (!targRad || targRad == 0) {
        return {};
    }
    var lat = Number(targLoc.latitude);
    var lng = Number(targLoc.longitude);
    var oneLatDegInMeters = Math.cos(lat * Math.PI / 180) * 111000;
    var oneLngDegInMeters = Math.cos(lng * Math.PI / 180) * 111000;

    if (oneLatDegInMeters > 0) {
        var locationRadInLatDeg = Number(targRad) / oneLatDegInMeters;
        var minValidMaxLat = lat - locationRadInLatDeg;
        var maxValidMinLat = lat + locationRadInLatDeg;
    } else {
        var minValidMaxLat = -90;
        var maxValidMinLat = 90;
    }
    if (oneLngDegInMeters > 0) {
        var locationRadInLngDeg = Number(targRad) / oneLngDegInMeters;
        var minValidMaxLng = lng - locationRadInLngDeg;
        var maxValidMinLng = lng + locationRadInLngDeg;
    } else {
        var minValidMaxLat = -180;
        var maxValidMinLng = 180;
    }
    // we add latitude to the query immediately, but not longitude, because
    // longitude wraps around from -180 to 180
    var query = {
        $and: [{
                'readRng.maxLat': {
                    $gte: minValidMaxLat
                }
            },
            {
                'readRng.minLat': {
                    $lte: maxValidMinLat
                }
            }
        ]
    };
    if (minValidMaxLng < -180) {
        query.$and.push({
            $or: [{
                    'readRng.maxLng': {
                        $gte: -180
                    }
                },
                {
                    'readRng.maxLng': {
                        $gte: minValidMaxLng + 180
                    }
                }
            ]
        });
    } else {
        query.$and.push({
            'readRng.maxLng': {
                $gte: minValidMaxLng
            }
        });
    }
    if (maxValidMinLng > 180) {
        query.$and.push({
            $or: [{
                    'readRng.minLng': {
                        $lte: 180
                    }
                },
                {
                    'readRng.minLng': {
                        $lte: maxValidMinLng - 360
                    }
                }
            ]
        });
    } else {
        query.$and.push({
            'readRng.minLng': {
                $lte: maxValidMinLng
            }
        });
    }
    return query;
}

function redirectRequest(req, res, targLoc, targRad) {
    var query = getServerSearchQuery(targLoc, targRad);
    serverInfoModel
        .find(query)
        .then(
            function (servers) {
                sendRequestToServers(req, res, servers);
            },
            function (err) {
                console.log("request_redirector:redirectRequest:" + err);
            }
        );
}

/**
 * Makes and merges a request to a list of servers
 * req:     The mongoose request
 * res:     The mongoose response
 * servers: A list of Objects which each have the address of a server stored in
 *          the baseAddr property
 */
function sendRequestToServers(req, res, servers) {
    var numCallsRemaining = servers.length;
    var mergedRspBody = {};
    servers.forEach(function (server) {
        var addr = server.baseAddr;
        var path = req.originalUrl;
        var url = addr + path;
        var requestParams = {
            url: url,
            method: req.method,
            body: req.body,
            json: true
        };
        request(requestParams, function (err, reqRes) {
            numCallsRemaining -= 1;
            if (err) {
                console.log("request_redirector:sendRequestToServers:" + err);
            } else {
                // This only does a shallow merge, and isn't supported by
                // older versions of IE, so you should look varo changing
                // potentially
                Object.assign(mergedRspBody, reqRes.body);
            }
            if (numCallsRemaining === 0) {
                res.json({
                    statusCode: 200,
                    body: mergedRspBody
                });
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