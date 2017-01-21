angular.module('openwindow').service('post_updater', ['$interval', '$http', function($interval, $http) {
    this.startUpdatingPosts = function(posts, updateInterval, callback) {
        $interval(function(response) {
            $http.get("/api/poststimeleft").success(function(response) {
                for (var i = 0; i < posts.length; ++i) {
                    var original = posts[i].secondsToShowFor;
                    posts[i].secondsToShowFor = response.body[posts[i].id];
                }
            })
        }, updateInterval);
    }
}]);
