angular.module('openwindow').controller('serverinfoctrl', [
    '$scope',
    '$http',
    function ($scope, $http) {
        var serverWriteAreaCanvas = document.getElementById("serverWriteAreaCanvas");
        var serverReadAreaCanvas = document.getElementById("serverReadAreaCanvas");

        $scope.webservers = [];
        $scope.databaseservers = [];

        $http.get("/webserver/allserverinfo")
            .success(servers => {
                $scope.webservers = servers;
            });

        $http.get("/director/allserverinfo")
            .success(servers => {
                $scope.databaseservers = servers;
                getPosts($scope, $http, servers)
                    .then(() => {
                        drawServers(serverWriteAreaCanvas, serverReadAreaCanvas, servers, $scope.posts);
                    });
            });

        $scope.posts = [];

        $scope.killServer = function (baseAddr) {
            $http.delete('/server', { params: { baseAddr }});
        }
    }
]);

function getPosts($scope, $http, servers) {
    return $http.get('/api/posts', {
            params: {
                radius: 9999999999999,
                longitude: 0,
                latitude: 0
            }
        })
        .then(res => {
            if (!res.data) {
                return;
            }
            res.data.body.forEach(post => {
                $scope.posts.push(post);
            });
        })
        .catch(err => {
            console.log("serverinfoctrl:" + JSON.stringify(err));
        });
}

function drawServers(serverWriteAreaCanvas, serverReadAreaCanvas, servers, posts) {
    serverWriteAreaCanvas.width = serverWriteAreaCanvas.clientWidth;
    serverWriteAreaCanvas.height = serverWriteAreaCanvas.clientHeight;
    serverReadAreaCanvas.width = serverReadAreaCanvas.clientWidth;
    serverReadAreaCanvas.height = serverReadAreaCanvas.clientHeight;
    servers.forEach(function (server, index) {
        drawServerArea(serverWriteAreaCanvas, server.writeRng.minLng,
            server.writeRng.minLat, server.writeRng.maxLng, server.writeRng.maxLat,
            index + 1, server.baseAddr);
        drawServerArea(serverReadAreaCanvas, server.readRng.minLng,
            server.readRng.minLat, server.readRng.maxLng, server.readRng.maxLat,
            index + 1, server.baseAddr);
    });
    posts.forEach(function (post) {
        drawPost(serverWriteAreaCanvas, post.loc.coordinates[0], post.loc.coordinates[1], post.mainDatabaseAddr);
        drawPost(serverReadAreaCanvas, post.loc.coordinates[0], post.loc.coordinates[1], post.mainDatabaseAddr);
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

function drawServerArea(canvas, minLng, minLat, maxLng, maxLat, text, serverAddr) {
    var ctx = canvas.getContext("2d");
    var minX = mapToNewRange(minLng, MIN_LNG, MAX_LNG, 0, canvas.width);
    var minY = mapToNewRange(-maxLat, MIN_LAT, MAX_LAT, 0, canvas.height);
    var maxX = mapToNewRange(maxLng, MIN_LNG, MAX_LNG, 0, canvas.width);
    var maxY = mapToNewRange(-minLat, MIN_LAT, MAX_LAT, 0, canvas.height);
    var rgbVals = getRgbFromServerAddr(serverAddr);
    console.log("rgb values are " + JSON.stringify(rgbVals));
    ctx.beginPath();
    ctx.lineWidth = "12";
    ctx.strokeStyle = `rgb(${rgbVals[0]}, ${rgbVals[1]}, ${rgbVals[2]})`;
    ctx.fillStyle = `rgba(${rgbVals[0]}, ${rgbVals[1]}, ${rgbVals[2]}, 0.6)`;
    ctx.rect(minX + 12, minY + 12, maxX - minX - 24, maxY - minY - 24);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.lineWidth = "4";
    ctx.strokeStyle = 'rgb(255, 255, 255)';
    ctx.rect(minX + 4, minY + 4, maxX - minX - 8, maxY - minY - 8);
    ctx.stroke();
    ctx.fillStyle = "white";
    ctx.font = "80px Arial";
    ctx.textAlign = "center";
    ctx.fillText(text, (minX + maxX) / 2, (minY + maxY) / 2);
}

function drawPost(canvas, lng, lat, serverAddr) {
    var ctx = canvas.getContext("2d");
    var x = mapToNewRange(lng, MIN_LNG, MAX_LNG, 0, canvas.width);
    var y = mapToNewRange(-lat, MIN_LAT, MAX_LAT, 0, canvas.height);
    var rgbVals = getRgbFromServerAddr(serverAddr);
    ctx.lineWidth = "5";
    ctx.strokeStyle = `rgb(${rgbVals[0]}, ${rgbVals[1]}, ${rgbVals[2]})`;
    ctx.fillStyle = 'rgb(0, 0, 0)';
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
}

function getRgbFromServerAddr(serverAddr) {
    let serverAddrComponents = serverAddr.split('//')[1].split(/[.:]/);
    let mappedAddrComponents = []

    for (let i = 0; i < serverAddrComponents.length; ++i) {
        const current = serverAddrComponents[i];
        if (i == serverAddrComponents.length - 1) { // if we are at the port number
            mappedAddrComponents[i] = Math.round((current / Math.pow(10, current.length)) * 255);
        } else {
            mappedAddrComponents[i] = Math.round(current);
        }
    }

    return [mappedAddrComponents[0], mappedAddrComponents[3], mappedAddrComponents[4]];
}