angular.module('openwindow').controller('commentsctrl', [
        '$scope',
        '$http',
        '$window',
        function($scope, $http, $window) {
            getAllSitePosts = function() {
                $http.get("/api/siteposts")
                     .success(function(posts) {
                         $scope.posts = posts;
                         for (postId in $scope.posts) {
                            $scope.posts[postId].upvoted = false;
                            $scope.posts[postId].downvoted = false;
                         }
                         updatePostTimes(10);
                     });
                
            }
]);

