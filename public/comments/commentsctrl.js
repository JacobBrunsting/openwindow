angular.module('openwindow').controller('commentsctrl', [
        '$scope',
        '$http',
        '$window',
        '$location',
        function($scope, $http, $window, $location) {
            $scope.page = "comments";
            $scope.post = {
                id:$location.search().postId, 
                title:"", 
                body:"", 
                comment_count:0, 
                seconds_left:0, 
                time_str:""
            };
            $scope.comments = [];

            getPost = function(id, callback) {
                $http.get("/api/post", {params:{id:id}})
                     .success(function(response) {
                         callback(response);
                     })
                     .error(function(error) {
                     });

            }

            getPost($scope.post.id, function(post) {
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
                    });

            $scope.addComment = function() {
                if ($scope.body_box == "") {
                    // TODO: add more rejected comment types
                    return;
                }
                $http.post("/api/comment", 
                          {id:$scope.post.id, comment:$scope.body_box})
                     .success(function(response) {
                         $scope.comments = response; 
                     })
                     .error(function(error) {
                     });
                $scope.body_box = "";
            }
        }
]);

