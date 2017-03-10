var DatabaseServerInfo = require('../classes/database_server_info');
var SqrGeoRng = require('../classes/sqr_geo_rng');

// returns the index of insertion, or undefined if it was not inserted
function insertEntryInOrderNoDuplicates(arr, val) {
    for (var splitIndex = 0; splitIndex < arr.length; ++splitIndex) {
        if (arr[splitIndex] >= val) {
            break;
        }
    }
    if (arr[splitIndex] === val) {
        return -1;
    } else {
        arr.splice(splitIndex, 0, val);
        return splitIndex;
    }
}

function splitAtLatitude(blockVals, blockLats, latitude) {
    var insertionIndex = insertEntryInOrderNoDuplicates(blockLats, latitude);
    if (insertionIndex !== -1) {
        // the '.slice()' ensures we get a copy of the array, not a reference to it
        blockVals.splice(insertionIndex, 0, blockVals[insertionIndex - 1].slice());
    }
}

function getCenterOfRange(geoRange) {
    var lngRange = getDistanceBetweenPointsOnCircle(geoRange.minLng, geoRange.maxLng, 360);
    var latRange = getDistanceBetweenPointsOnCircle(geoRange.minLat, geoRange.maxLat, 180);
    var center = {
        lng: geoRange.minLng + lngRange / 2,
        lat: geoRange.minLat + latRange / 2
    };
    if (center.lng > 180) {
        center.lng -= 360;
    } else if (center.lng < -180) {
        center.lng += 360;
    }
    if (center.lat > 90) {
        center.lat -= 180;
    } else if (center.lat < -90) {
        center.lat += 180;
    }
    return center;
}

// coordinates must be of the form {lng:Number, lat:Number}
function getDistanceBetweenCoords(coord1, coord2) {
    var lngDist = Math.min(
        getDistanceBetweenPointsOnCircle(coord1.lng, coord2.lng, 360),
        getDistanceBetweenPointsOnCircle(coord2.lng, coord1.lng, 360)
    );
    var latDist = Math.min(
        getDistanceBetweenPointsOnCircle(coord1.lat, coord2.lat, 180),
        getDistanceBetweenPointsOnCircle(coord2.lat, coord1.lat, 180)
    );
    return Math.sqrt(lngDist * lngDist + latDist * latDist);
}

// gets the distance it takes to travel from startPos to endPos by only
// incrimenting the position. When the position exceeds maxVal, it skips to
// minVal
function getDistanceBetweenPointsOnCircle(startPos, endPos, circleLen) {
    if (startPos < endPos) {
        return endPos - startPos;
    } else {
        return endPos + circleLen - startPos;
    }
}

module.exports = {
    getCenterOfRange: getCenterOfRange,
    splitAtLatitude: splitAtLatitude,
    getDistanceBetweenCoords: getDistanceBetweenCoords,
};