angular.module('openwindow').service('post_updater', [
        '$interval', 
        '$http', 
        'INT_CONSTANTS',
        function($interval, $http, INT_CONSTANTS) {
    this.startUpdatingPosts = function(posts, updateInterval, callback) {
        $interval(function(response) {
            $http.get("/api/poststimeleft", {params:{radius:INT_CONSTANTS.POST_RADIUS,
                                                     longitude:$scope.location.longitude,
                                                     latitude:$scope.location.latitude}})
                 .success(function(response) {
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
}]);
