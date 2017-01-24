angular.module('openwindow').controller('commentsctrl', [
        '$scope',
        '$http',
        '$location',
        'geolocation',
        'post_creator',
        'INT_CONSTANTS',
        function($scope, $http, $location, geolocation, post_creator, INT_CONSTANTS) {
            $scope.page = "comments";
            $scope.location = geolocation.getLocationFromLocationService($location);
            $scope.post = post_creator.createPost("", "", "", false, false, "", "", "", "", "", ""); 
            $scope.comments = {};

            getPost = function(id, callback) {
                var params = $scope.location;
                params.id = id;
                params.radius = INT_CONSTANTS.POST_RADIUS;
                $http.get("/api/post", 
                          {params:params})
                    .success(
                    function(response) {
                        callback(response.body);
                    })
                    .error(function(error) {
                    }
                );
            }

            // TODO: The add comment function should only be created after the post is retrieved
            getPost($location.search().postId,
                function(post) {
                    $scope.post = post_creator.getFormattedPost(post);
                    $scope.comments = $scope.post.getComments();
                }
            );

            $scope.addComment = function() {
                if ($scope.body_box == "") {
                    return;
                }
                var params = $scope.location;
                params.radius = INT_CONSTANTS.POST_RADIUS;
                $http.post(
                    "/api/comment", 
                    {id:$scope.post.getId(), comment:$scope.body_box},{params:params})
                    .success(
                    function(response) {
                        $scope.comments = post_creator.getFormattedCommentList(response.body);
                    })
                    .error(function(error) {
                    }
                );
                $scope.body_box = "";
            }
        }
]);

