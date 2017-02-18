var FILL_VAL = 1;

// returns the index of insertion, or -1 if it was not inserted
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

function splitAtLongitude(blockVals, blockLngs, longitude) {
    var insertionIndex = insertEntryInOrderNoDuplicates(blockLngs, longitude);
    if (insertionIndex !== -1) {
        for (var i = 0; i < blockVals.length; ++i) {
            blockVals[i].splice(insertionIndex, 0, blockVals[i][insertionIndex - 1]);
        }
    }
}

function fillRange(blockVals, blockLngs, blockLats, minLng, maxLng, 
                   minLat, maxLat, fillVal) {
    var minLatIndex = -1;
    var maxLatIndex = -1;
    for (var i = 0; i < blockLats.length; ++i) {
        if (minLatIndex === -1 && minLat <= blockLats[i]) {
            minLatIndex = i;
        } else if (maxLatIndex === -1 && maxLat <= blockLats[i]) {
            maxLatIndex = i - 1;
        }
    }

    var minLngIndex = -1;
    var maxLngIndex = -1;
    for (var i = 0; i < blockLngs.length; ++i) {
        if (minLngIndex === -1 && minLng <= blockLngs[i]) {
            minLngIndex = i;
        } else if (maxLngIndex === -1 && maxLng <= blockLngs[i]) {
            maxLngIndex = i - 1;
        }
    }
    for (var lat = minLatIndex; lat <= maxLatIndex; ++lat) {
        for (var lng = minLngIndex; lng <= maxLngIndex; ++lng) {
            blockVals[lat][lng] = fillVal;
        }
    }
}

function bottomPerimeterContainsVal(blockVals, targVal, r1, c1, r2, c2) {
    for (var c = c1; c <= c2; ++c) {
        if (blockVals[r2][c] === targVal) {
            return true;
        }
    }
    for (var r = r1; r <= r2; ++r) {
        if (blockVals[r][c2] === targVal) {
            return true;
        }
    }
    return false;
}

// TODO: Clean up this mess, stop using 'r' and 'c', us 'lng' and 'lat'
function calculateSquareArea(blockLngs, blockLats, r1, c1, r2, c2) {
    return (blockLngs[c2 + 1] - blockLngs[c1]) * (blockLats[r2 + 1] - blockLats[r1]);
}

// returns {minLng, maxLng, minLat, maxLat}
function getLargestRectangleInfoFromCoord(blockVals, blockLngs, blockLats, 
                                          fillVal, row, col) {
    var largestRectangleInfo = {
        area: 0,
        minLng: 0,
        maxLng: 0,
        minLat: 0,
        maxLat: 0
    };
    for (var h = 0; row + h < blockVals.length; ++h) {
        for (var w = 0; col + w < blockVals[0].length; ++w) {
            var area = calculateSquareArea(blockLngs, blockLats, row, col, row + h, col + w);
            if (bottomPerimeterContainsVal(blockVals, fillVal, row, col, row + h, col + w)) {
                break;
            }
            if (area > largestRectangleInfo.area) {
                largestRectangleInfo = {
                    area: area,
                    minLng: blockLngs[col],
                    maxLng: blockLngs[col + w + 1],
                    minLat: blockLats[row],
                    maxLat: blockLats[row + h + 1]
                };
            }
        }
    }
    return largestRectangleInfo;
}

// returns {minLng, maxLng, minLat, maxLat}
function getLargestArea(blockVals, blockLngs, blockLats, fillVal) {
    var currentLargestAreaParams = {
        area: 0,
        minLng: 0,
        maxLng: 0,
        minLat: 0,
        maxLat: 0
    };
    for (var r = 0; r < blockVals.length; ++r) {
        for (var c = 0; c < blockVals[0].length; ++c) {
            if (blockVals[r][c] !== fillVal) {
                var rectangleInfo = getLargestRectangleInfoFromCoord(blockVals, blockLngs, blockLats, fillVal, r, c);
                if (rectangleInfo.area > currentLargestAreaParams.area) {
                    currentLargestAreaParams = rectangleInfo;
                }
            }
        }
    }
    return currentLargestAreaParams;
}

module.exports = {
    splitAtLongitude: splitAtLongitude,
    splitAtLatitude: splitAtLatitude,
    fillRange: fillRange,
    getLargestArea: getLargestArea
};