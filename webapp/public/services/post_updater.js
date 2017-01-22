angular.module('openwindow').service('post_updater', [
        '$interval', 
        '$http', 
        'INT_CONSTANTS',
        function($interval, $http, INT_CONSTANTS) {
    this.startUpdatingPosts = function(posts, updateInterval, callback) {
        $interval(function(response) {
            $http.get("/api/poststimeleft", {params:{radius:INT_CONSTANTS.POST_RADIUS}})
                 .success(function(response) {
                for (var i = 0; i < posts.length; ++i) {
                    var original = posts[i].secondsToShowFor;
                    var newTime = response.body[posts[i].id];
                    if (newTime == undefined) {
                        newTime = -1;
                    }
                    posts[i].secondsToShowFor = newTime;
                }
            })
        }, updateInterval);
    }
}]);
