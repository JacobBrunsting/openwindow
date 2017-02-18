angular.module('openwindow').controller('serverinfoctrl', [
    '$scope',
    '$http',
    function($scope, $http) {
        var serverWriteAreaCanvas = document.getElementById("serverWriteAreaCanvas");
        var serverReadAreaCanvas = document.getElementById("serverReadAreaCanvas");

        $http.get("/director/getallserverinfo")
                .success(function(servers) {
                    drawServers(serverWriteAreaCanvas, serverReadAreaCanvas, servers);
                });
    }
]);

var COLOR_INCREMENT = 100;
var MIN_COLOR_VAL = 50;
var MAX_COLOR_VAL = 250;
var ALPHA = 0.3;
var MAX_LNG = 180;
var MIN_LNG = -180;
var MAX_LAT = 90;
var MIN_LAT = -90;
var currentColor = [3 * MIN_COLOR_VAL, 3 * MIN_COLOR_VAL, 0];

function drawServers(serverWriteAreaCanvas, serverReadAreaCanvas, servers) {
    servers.forEach(function(server) {
        drawServerArea(serverWriteAreaCanvas, server.minLngWrite, 
                       server.minLatWrite, server.maxLngWrite, server.maxLatWrite);
        drawServerArea(serverReadAreaCanvas, server.minLngRead, 
                       server.minLatRead, server.maxLngRead, server.maxLatRead);
        generateNextColor();
    });
}

function generateNextColor() {
    for (var i = 0; i < currentColor.length; ++i) {
        currentColor[i] += COLOR_INCREMENT;
        if (currentColor[i] > MAX_COLOR_VAL) {
            currentColor[i] = MIN_COLOR_VAL;
        } else {
            break;
        }
    }
}

function getCurrentColor() {
    return "rgba(" + currentColor[0] + "," + currentColor[1] + "," + 
           currentColor[2] + "," + ALPHA + ")";
}

function mapToNewRange(val, oldMin, oldMax, newMin, newMax) {
    if (oldMax - oldMin == 0) {
        return 0;
    }
    var valWithAdjustedMin = val + (newMin - oldMin);
    var increaseInRange = (newMax - newMin) / (oldMax - oldMin);
    return valWithAdjustedMin * increaseInRange;
}

function drawServerArea(canvas, minLng, minLat, maxLng, maxLat) {
    console.log("drawing with range " + minLng + ", " + minLat + "...");
    console.log("canvas width, height are " + canvas.width + ", " + canvas.height);
    var canvasContext = canvas.getContext("2d");
    var minX = mapToNewRange(minLng, MIN_LNG, MAX_LNG, 0, canvas.width);
    var minY = mapToNewRange(minLat, MIN_LAT, MAX_LAT, 0, canvas.height);
    var maxX = mapToNewRange(maxLng, MIN_LNG, MAX_LNG, 0, canvas.width);
    var maxY = mapToNewRange(maxLat, MIN_LAT, MAX_LAT, 0, canvas.height);
    canvasContext.beginPath();
    canvasContext.lineWidth="1";
    canvasContext.strokeStyle="black";
    canvasContext.fillStyle = getCurrentColor();
    canvasContext.rect(minX, minY, maxX, maxY);
    canvasContext.fill();
    canvasContext.stroke();
    console.log("drawing at " + minX + ", " + minY + ", " + maxX + ", " + maxY);
}