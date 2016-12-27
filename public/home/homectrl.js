angular.module('openwindow').controller('homectrl', [
        '$scope',
        '$http',
        '$window',
        function($scope, $http, $window) {
            // Title
            $scope.test = "Posts";
            // Input
            $scope.addPost = function() {
                $window.location.href = '#/new';
            }
            $scope.upvote = function(id) {
                for (postId in $scope.posts) {
                    var post = $scope.posts[postId];
                    if (post._id == id) {
                        if (post.selectedClass == "upvoted") {
                            updatePostVote("unupvote", post);
                            post.selectedClass = "none";
                        } else if (post.selectedClass == "downvoted") {
                            updatePostVote("undownvote", post);
                            updatePostVote("upvote", post);
                            post.selectedClass = "upvoted";
                        } else {
                            updatePostVote("upvote", post);
                            post.selectedClass = "upvoted";
                        }
                    }
                }
            }
            $scope.downvote = function(id) {
                for (postId in $scope.posts) {
                    var post = $scope.posts[postId];
                    if (post._id == id) {
                        if (post.selectedClass == "downvoted") {
                            updatePostVote("undownvote", post);
                            post.selectedClass = "none";
                        } else if (post.selectedClass == "upvoted") {
                            updatePostVote("unupvote", post);
                            updatePostVote("downvote", post);
                            post.selectedClass = "downvoted";
                        } else {
                            updatePostVote("downvote", post);
                            post.selectedClass = "downvoted";
                        }
                    }
                }
            }
            getAllSitePosts = function() {
                $http.get("/api/siteposts")
                     .success(function(posts) {
                         $scope.posts = posts;
                         updatePostTimes(10);
                     });
                
            }
            updatePostTimes = function(timeToRemove) {
                for (var postId in $scope.posts) {
                    var post = $scope.posts[postId];
                    post.secondsLeft -= timeToRemove;
                    if (post.secondsLeft < 3540) {
                        post.time_str = Math.ceil(post.secondsLeft / 60) + 
                                        " min";
                    } else if (post.secondsLeft < 21600) {
                        post.time_str = Math.floor(post.secondsLeft / 3600) + 
                                        " hr";
                    } else {
                        post.time_str = Math.floor(post.secondsLeft / 21600) + 
                                        " day";
                    }
                }
            }
            updatePostVote = function(apiCall, post) {
                var call = "/api/" + apiCall;
                $http.post(call, {id:post._id})
                     .success(function(response) {
                         if (response.secondsLeft) {
                            post.secondsLeft = response.secondsLeft;
                            updatePostTimes(0);
                         }
                     })
                     .error(function(error) {
                     
                     });
            }
            function init() {
                getAllSitePosts();
            }
            init();
        }
]);

