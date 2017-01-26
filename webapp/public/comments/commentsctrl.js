angular.module('openwindow').controller('commentsctrl', [
        '$scope',
        '$http',
        '$location',
        'geolocation',
        'post_creator',
        'INT_CONSTANTS',
        function($scope, $http, $location, geolocation, post_creator, INT_CONSTANTS) {
            var postId = $location.search().postId;
            var postServerAddress = $location.search().postServerAddress;

            $scope.page = "comments";
            $scope.location = geolocation.getLocationFromLocationService($location);
            $scope.post = post_creator.createPost("", "", "", false, false, "", "", "", "", "", ""); 
            $scope.comments = {};

            getPost = function(id, serverAddress, callback) {
                var params = $scope.location;
                params.id = id;
                params.serverAddress = serverAddress;
                $http.get("/api/getpostfromserver", 
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
            getPost(postId,
                    postServerAddress,
                function(post) {
                    $scope.post = post_creator.getFormattedPost(post);
                    $scope.comments = $scope.post.getComments();
                    console.log("post is " + JSON.stringify($scope.post));
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

