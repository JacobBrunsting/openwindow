angular.module('openwindow').controller('commentsctrl', [
        '$scope',
        '$http',
        '$window',
        '$location',
        function($scope, $http, $window, $location) {
            $scope.postId = $location.search().postId;
            $scope.title = "";
            $scope.body = "";
            $scope.comments = [];

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
                        $scope.comments = post.comments;
                    });

            $scope.addComment = function() {
                $http.post("/api/comment", 
                          {id:$scope.postId, comment:$scope.body_box})
                     .success(function(response) {
                         $scope.comments = response; 
                     })
                     .error(function(error) {
                     });
            }
        }
]);

