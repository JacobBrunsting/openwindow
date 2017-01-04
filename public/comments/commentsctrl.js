angular.module('openwindow').controller('commentsctrl', [
        '$scope',
        '$http',
        '$window',
        '$location',
        function($scope, $http, $window, $location) {
            $scope.postId = $location.search().postId;
            $scope.post = {title:"", body:"", time_str:""}; // TODO: make post structure shared by all files
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
                        $scope.post = post;
                        $scope.comments = post.comments;
                    });

            $scope.addComment = function() {
                if ($scope.body_box == "") {
                    // TODO: add more rejected comment types
                    return;
                }
                $http.post("/api/comment", 
                          {id:$scope.postId, comment:$scope.body_box})
                     .success(function(response) {
                         $scope.comments = response; 
                     })
                     .error(function(error) {
                     });
                $scope.body_box = "";
            }
        }
]);

