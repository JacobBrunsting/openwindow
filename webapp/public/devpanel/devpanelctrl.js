angular.module('openwindow').controller('devpanelctrl', [
        '$scope',
        '$http',
        '$window',
        'post_creator',
        function($scope, $http, $window, post_creator) {
            getAllSitePosts = function() {
                $scope.page = "dev";
                $http.get("/api/siteposts")
                     .success(function(response) {
                         var posts = response.body;
                         $scope.posts = [];
                         for (postId in posts) {
                             $scope.posts[postId] = post_creator.getFormattedPost(posts[postId]);
                         }
                     });
                
            }

            // TODO: Check git to see where this was called before
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
                return Math.round(((post.getPostTime() - Date.now()) / 1000) + post.getSecondsToShowFor());
            }
            getSecondsToShowForFromTimeLeft = function(post, timeLeft) {
                return timeLeft - Math.round((post.postTime - Date.now()) / 1000);
            }
            $scope.deleteComment = function(post, comment) {
                $http.post("/api/deletecomment", 
                           {postId:post.id, commentId:comment._id})
                     .success(function(response) {
                         post.setComments(post_creator.getFormattedCommentList(response.body));
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
                             if ($scope.posts[++postIndex].getId() == post.getId()) {
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
            $scope.addServerInfo = function(minLongitude, maxLongitude, minLatitude, maxLatitude) {
                var serverInfo = {
                    baseAddress: "127.0.0.1:3000",
                    maxLng:      maxLongitude,
                    minLng:      minLongitude,
                    maxLat:      maxLatitude,
                    minLat:      minLatitude
                };

                $scope.minLongitude = "";
                $scope.maxLongitude = "";
                $scope.minLatitude = "";
                $scope.maxLatitude = "";

                $http.post("/director/addserverinfo", serverInfo)
                     .success(function(response) {
                     })
                     .error(function(err) {
                         console.log(err);
                     });
            }
        }
]);

