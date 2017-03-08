angular.module('openwindow').controller('serverinfoctrl', [
    '$scope',
    '$http',
    function ($scope, $http) {
        var serverWriteAreaCanvas = document.getElementById("serverWriteAreaCanvas");
        var serverReadAreaCanvas = document.getElementById("serverReadAreaCanvas");

        $http.get("/director/allserverinfo")
            .success(function (servers) {
                drawServers(serverWriteAreaCanvas, serverReadAreaCanvas, servers);
            });
    }
]);

function drawServers(serverWriteAreaCanvas, serverReadAreaCanvas, servers) {
    servers.forEach(function (server) {
        drawServerArea(serverWriteAreaCanvas, server.writeRng.minLng,
            server.writeRng.minLat, server.writeRng.maxLng, server.writeRng.maxLat);
        drawServerArea(serverReadAreaCanvas, server.readRng.minLng,
            server.readRng.minLat, server.readRng.maxLng, server.readRng.maxLat);
    });
}

function mapToNewRange(val, oldMin, oldMax, newMin, newMax) {
    if (oldMax - oldMin == 0) {
        return 0;
    }
    var valWithAdjustedMin = val + (newMin - oldMin);
    var increaseInRange = (newMax - newMin) / (oldMax - oldMin);
    return valWithAdjustedMin * increaseInRange;
}

var MAX_LNG = 180;
var MIN_LNG = -180;
var MAX_LAT = 90;
var MIN_LAT = -90;

function drawServerArea(canvas, minLng, minLat, maxLng, maxLat) {
    var canvasContext = canvas.getContext("2d");
    var minX = mapToNewRange(minLng, MIN_LNG, MAX_LNG, 0, canvas.width);
    var minY = mapToNewRange(minLat, MIN_LAT, MAX_LAT, 0, canvas.height);
    var maxX = mapToNewRange(maxLng, MIN_LNG, MAX_LNG, 0, canvas.width);
    var maxY = mapToNewRange(maxLat, MIN_LAT, MAX_LAT, 0, canvas.height);
    canvasContext.beginPath();
    canvasContext.lineWidth = "4";
    canvasContext.strokeStyle = "black";
    canvasContext.fillStyle = "rgba(0, 0, 0, 0.3)";
    canvasContext.rect(minX + 4, minY + 4, maxX - minX - 8, maxY - minY - 8);
    canvasContext.fill();
    canvasContext.stroke();
}