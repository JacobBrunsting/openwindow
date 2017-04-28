angular.module('openwindow').controller('serverinfoctrl', [
    '$scope',
    '$http',
    function ($scope, $http) {
        var serverWriteAreaCanvas = document.getElementById("serverWriteAreaCanvas");
        var serverReadAreaCanvas = document.getElementById("serverReadAreaCanvas");

        $http.get("/director/allserverinfo")
            .success(servers => {
                drawServers(serverWriteAreaCanvas, serverReadAreaCanvas, servers);
            });

        $scope.webservers = [];
        $scope.databaseservers = [];

        $http.get("/webserver/allserverinfo")
            .success(servers => {
                $scope.webservers = servers;
            });

        $http.get("/director/allserverinfo")
            .success(servers => {
                $scope.databaseservers = servers;
                getPosts($scope, $http, servers);
            });

        $scope.posts = [];

        $scope.killServer = function(baseAddr) {
            $http.delete(baseAddr + "/self");
        }
    }
]);

function getPosts($scope, $http, servers) {
    servers.forEach(server => {
        var url = server.baseAddr + '/api/allposts';
        $http.get(url)
            .then(res => {
                if (!res.data) {
                    return;
                }
                res.data.forEach(post => {
                    $scope.posts.push(post);
                });
            })
            .catch(err => {
                console.log("serverinfoctrl:" + JSON.stringify(err));
            });
    });
}

function drawServers(serverWriteAreaCanvas, serverReadAreaCanvas, servers) {
    serverWriteAreaCanvas.width = serverWriteAreaCanvas.clientWidth;
    serverWriteAreaCanvas.height = serverWriteAreaCanvas.clientHeight;
    serverReadAreaCanvas.width = serverReadAreaCanvas.clientWidth;
    serverReadAreaCanvas.height = serverReadAreaCanvas.clientHeight;
    servers.forEach(function (server) {
        drawServerArea(serverWriteAreaCanvas, server.writeRng.minLng,
            server.writeRng.minLat, server.writeRng.maxLng, server.writeRng.maxLat, 
            server.baseAddr);
        drawServerArea(serverReadAreaCanvas, server.readRng.minLng,
            server.readRng.minLat, server.readRng.maxLng, server.readRng.maxLat, 
            server.baseAddr);
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

function drawServerArea(canvas, minLng, minLat, maxLng, maxLat, serverAddr) {
    var ctx = canvas.getContext("2d");
    var minX = mapToNewRange(minLng, MIN_LNG, MAX_LNG, 0, canvas.width);
    var minY = mapToNewRange(-maxLat, MIN_LAT, MAX_LAT, 0, canvas.height);
    var maxX = mapToNewRange(maxLng, MIN_LNG, MAX_LNG, 0, canvas.width);
    var maxY = mapToNewRange(-minLat, MIN_LAT, MAX_LAT, 0, canvas.height);
    ctx.beginPath();
    ctx.lineWidth = "4";
    ctx.strokeStyle = "white";
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.rect(minX + 4, minY + 4, maxX - minX - 8, maxY - minY - 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "white";
    ctx.font="20px Arial";
    ctx.textAlign="center"; 
    ctx.fillText(serverAddr.replace('http://', ''),(minX + maxX) / 2,(minY + maxY) / 2);
}