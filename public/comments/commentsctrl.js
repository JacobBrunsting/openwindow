angular.module('openwindow').controller('commentsctrl', [
        '$scope',
        '$http',
        '$window',
        '$location',
        function($scope, $http, $window, $location) {
            $scope.postId = $location.search().postId;
            $scope.title = "";
            $scope.body = "";

            getPost = function(id, callback) {
                $http.get("/api/post", {params:{id:id}})
                     .success(function(response) {
                         callback(response);
                     })
                     .error(function(error) {
                     });

            }

            getPost($scope.postId, function(post) {
                        $scope.title = post.title;
                        $scope.body = post.body;
                    });
        }
]);

