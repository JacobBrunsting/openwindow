angular.module('openwindow').controller('postctrl', [
        '$scope',
        '$http',
        '$window',
        function($scope, $http, $window) {
            // must be consistent with their usages in server.js
            var UPVOTE = 2;
            var DOWNVOTE = 1;
            var NONE = 0;

            $scope.upvote = function() {
                $scope.vote(UPVOTE);
            }
            $scope.downvote = function() {
                $scope.vote(DOWNVOTE);
            }
            $scope.comments = function() {
               $window.location.href = '#/comments?postId=' + $scope.post.id;
            }
            $scope.vote = function(vote) {
                var oldVote = NONE;
                if ($scope.post.upvoted) {
                    oldVote = UPVOTE;
                } else if ($scope.post.downvoted) {
                    oldVote = DOWNVOTE;
                }
                $scope.updatePostVote(vote, function(success) {
                    if (success) {
                        if (vote == UPVOTE && oldVote == UPVOTE) {
                            $scope.post.upvoted = false;
                        } else if (vote == DOWNVOTE && oldVote == DOWNVOTE) {
                            $scope.post.downvoted = false;
                        } else if (vote == UPVOTE) {
                            $scope.post.upvoted = true;
                            $scope.post.downvoted = false;
                        } else if (vote == DOWNVOTE) {
                            $scope.post.upvoted = false;
                            $scope.post.downvoted = true;
                        } else {
                            $scope.post.upvoted = false;
                            $scope.post.downvoted = false;
                        }
                    }
                });
            }
            $scope.updatePostTimeStr = function() {
                var time = $scope.post.secondsLeft;
                if (time < 3540) {
                    $scope.post.time_str = Math.ceil(time / 60) + " min";
                } else if (time < 21600) {
                    $scope.post.time_str = Math.floor(time / 3600) + " hr";
                } else {
                    $scope.post.time_str = Math.floor(time / 21600) + " day";
                }
            }
            $scope.$watch("post.secondsLeft", function(newval, oldval) {
                $scope.updatePostTimeStr();
            });
            $scope.updatePostVote = function(vote, callback) {
                var call = "/api/" + getVoteCall(vote);
                $http.post(call, {id:$scope.post.id, oldVote:$scope.getPostStatus($scope.post)})
                     .success(function(response) {
                         if (response.secondsLeft) {
                            $scope.post.secondsLeft = response.secondsLeft;
                         }
                         callback(true);
                     })
                     .error(function(error) {
                         callback(false);
                     });
            }
            $scope.getPostStatus = function() {
                if ($scope.post.upvoted) {
                    return UPVOTE;
                } else if ($scope.post.downvoted) {
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
        }
]);

