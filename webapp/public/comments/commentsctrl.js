angular.module('openwindow').controller('commentsctrl', [
        '$scope',
        '$http',
        '$location',
        'geolocation',
        'INT_CONSTANTS',
        function($scope, $http, $location, geolocation, INT_CONSTANTS) {
            $scope.page = "comments";
            $scope.location = geolocation.getLocationFromLocationService($location);
            $scope.post = {
                id:            $location.search().postId, 
                title:         "", 
                body:          "", 
                comment_count: 0, 
                seconds_left:  0, 
                time_str:      ""
            };
            
            $scope.comments = [];

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

            getPost($scope.post.id, 
                function(post) {
                    $scope.post = {
                        id:               post._id,
                        title:            post.title,
                        body:             post.body,
                        upvoted:          false,
                        downvoted:        false,
                        timePostedMills:  post.postTime,
                        comment_count:    post.comments.length,
                        secondsToShowFor: post.secondsToShowFor,
                        time_str:         ""
                    }
                    $scope.comments = post.comments;
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
                    {id:$scope.post.id, comment:$scope.body_box},{params:params})
                    .success(
                    function(response) {
                        $scope.comments = response.body; 
                    })
                    .error(function(error) {
                    }
                );
                $scope.body_box = "";
            }
        }
]);

