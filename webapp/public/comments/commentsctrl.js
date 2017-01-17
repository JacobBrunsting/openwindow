angular.module('openwindow').controller('commentsctrl', [
        '$scope',
        '$http',
        '$window',
        function($scope, $http, $window) {
            $scope.page = "comments";
            $scope.location = getLocationFromWindow(window);
            $scope.post = {
                id:$window.location.search().postId, 
                title:"", 
                body:"", 
                comment_count:0, 
                seconds_left:0, 
                time_str:""
            };
            
            $scope.comments = [];

            getPost = function(id, callback) {
                $http.get("/api/post", 
                          {params:angular.extend({id:id}, $scope.location)})
                    .success(
                    function(response) {
                        callback(response);
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
                $http.post(
                    "/api/comment", 
                    {id:$scope.post.id, comment:$scope.body_box},
                    {params:$scope.location})
                    .success(
                    function(response) {
                        $scope.comments = response; 
                    })
                    .error(function(error) {
                    }
                );
                $scope.body_box = "";
            }
        }
]);

