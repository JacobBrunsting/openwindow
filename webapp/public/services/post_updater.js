angular.module('openwindow').service('post_updater', [
    '$interval',
    '$http',
    'INT_CONSTANTS',
    function ($interval, $http, INT_CONSTANTS) {
        this.startUpdatingPosts = function (posts, location, updateInterval, callback) {
            $interval(function () {
                $http.get("/api/postssecondstoshowfor", {
                        params: {
                            radius: INT_CONSTANTS.POST_RADIUS,
                            longitude: location.longitude,
                            latitude: location.latitude
                        }
                    })
                    .success(function (response) {
                        for (var i = 0; i < posts.length; ++i) {
                            var original = posts[i].getSecondsToShowFor();
                            var newTime = response.body[posts[i].id];
                            if (newTime == undefined) {
                                newTime = -1;
                            }
                            posts[i].setSecondsToShowFor(newTime);
                        }
                    })
            }, updateInterval);
        }
    }
]);