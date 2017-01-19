angular.module('openwindow').controller('devpanelctrl', [
        '$scope',
        '$http',
        '$window',
        function($scope, $http, $window) {
            getAllSitePosts = function() {
                $scope.page = "dev";
                $http.get("/api/siteposts")
                     .success(function(response) {
                         var posts = JSON.parse(response.body);
                         $scope.posts = [];
                         for (postId in posts) {
                             var post = posts[postId];
                             var formattedPost = {
                                 id:               post._id,
                                 title:            post.title,
                                 body:             post.body,
                                 upvoted:          false,
                                 downvoted:        false,
                                 postTime:  post.postTime,
                                 comment_count:    post.comments.length,
                                 secondsToShowFor: post.secondsToShowFor,
                                 time_str:         "",
                                 comments:         post.comments,
                                 longitude:        post.longitude,
                                 latitude:         post.latitude
                             }
                             formattedPost.timeLeft = getTimeLeft(formattedPost);
                             $scope.posts.push(formattedPost);
                         }
                     });
                
            }
            $scope.setTimeRemaining = function(post, newTimeLeft) {
                $http.post("/api/settime", 
                          {id:post.id, newSecondsToShowFor:getSecondsToShowForFromTimeLeft(post, newTimeLeft)})
                     .success(function(response) {
                         post.timeLeft = getTimeLeft(response.body);
                     })
                     .error(function(error) {
                     });
                $scope.body_box = "";
            }
            getAllSitePosts();
            getTimeLeft = function(post) {
                return Math.round(((post.postTime - Date.now()) / 1000) + post.secondsToShowFor);
            }
            getSecondsToShowForFromTimeLeft = function(post, timeLeft) {
                return timeLeft - Math.round((post.postTime - Date.now()) / 1000);
            }
            $scope.deleteComment = function(post, comment) {
                $http.post("/api/deletecomment", 
                           {postId:post.id, commentId:comment._id})
                     .success(function(response) {
                         post.comments = response.comments;
                     })
                     .error(function(error) {
                     });
            }
            $scope.deletePost = function(post) {
                $http.post("/api/deletepost", 
                           {id:post.id})
                     .success(function(response) {
                         var postIndex = -1;
                         for (; postIndex < $scope.posts.length; ++postIndex) {
                             if ($scope.posts[++postIndex]._id == post._id) {
                                 break;
                             }
                         }
                         if (postIndex != -1) {
                             $scope.posts.splice(postIndex, 1);
                         }
                     })
                     .error(function(error) {
                     });
            }
        }
]);

