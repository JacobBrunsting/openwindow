angular.module('openwindow').controller('homectrl', [
        '$scope',
        '$http',
        '$window',
        function($scope, $http, $window) {
            // must be consistent with their usages in server.js
            var UPVOTE = 2;
            var DOWNVOTE = 1;
            var NONE = 0;

            $scope.addPost = function() {
                $window.location.href = '#/new';
            }
            $scope.upvote = function(id) {
                vote(UPVOTE, id);
            }
            $scope.downvote = function(id) {
                vote(DOWNVOTE, id);
            }
            vote = function(vote, id) {
                for (postId in $scope.posts) {
                    var post = $scope.posts[postId];
                    if (post._id == id) {
                        var oldVote = NONE;
                        if (post.upvoted) {
                            oldVote = UPVOTE;
                        } else if (post.downvoted) {
                            oldVote = DOWNVOTE;
                        }
                        updatePostVote(vote, post, function(success) {
                            if (success) {
                                if (vote == UPVOTE && oldVote == UPVOTE) {
                                    post.upvoted = false;
                                } else if (vote == DOWNVOTE && oldVote == DOWNVOTE) {
                                    post.downvoted = false;
                                } else if (vote == UPVOTE) {
                                    post.upvoted = true;
                                    post.downvoted = false;
                                } else if (vote == DOWNVOTE) {
                                    post.upvoted = false;
                                    post.downvoted = true;
                                } else {
                                    post.upvoted = false;
                                    post.downvoted = false;
                                }
                            }
                        });
                        break;
                    }
                }
            }
            getAllSitePosts = function() {
                $http.get("/api/siteposts")
                     .success(function(posts) {
                         $scope.posts = posts;
                         for (postId in $scope.posts) {
                            $scope.posts[postId].upvoted = false;
                            $scope.posts[postId].downvoted = false;
                         }
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
            updatePostVote = function(vote, post, callback) {
                var call = "/api/" + getVoteCall(vote);
                $http.post(call, {id:post._id, oldVote:getPostStatus(post)})
                     .success(function(response) {
                         if (response.secondsLeft) {
                            post.secondsLeft = response.secondsLeft;
                            updatePostTimes(0);
                         }
                         callback(true);
                     })
                     .error(function(error) {
                         callback(false);
                     });
            }
            getPostStatus = function(post) {
                if (post.upvoted) {
                    return UPVOTE;
                } else if (post.downvoted) {
                    return DOWNVOTE;
                }
                return NONE;
            }
            getVoteCall = function(status) {
                if (status == UPVOTE) {
                    return "upvote";
                } else if (status == DOWNVOTE) {
                    return "downvote";
                }
                return "";
            }
            function init() {
                getAllSitePosts();
            }
            init();
        }
]);

