angular.module('openwindow').controller('postctrl', [
    '$scope',
    '$http',
    '$window',
    '$interval',
    'request_maker',
    'geolocation',
    'post_creator',
    'INT_CONSTANTS',
    function ($scope, $http, $window, $interval, request_maker, geolocation,
        post_creator, INT_CONSTANTS) {
        $scope.upvote = function () {
            $scope.vote(INT_CONSTANTS.UPVOTE);
        }
        $scope.downvote = function () {
            $scope.vote(INT_CONSTANTS.DOWNVOTE);
        }
        $scope.comments = function () {
            var urlWithPostId = '#/comments?postId=' +
                $scope.post.getId() +
                '&postServerAddress=' +
                $scope.post.getMainDatabaseAddr();
            $window.location.href = geolocation.addLocationToURL(urlWithPostId, $scope.location);
        }
        $scope.vote = function (vote) {
            var oldVote = INT_CONSTANTS.NONE;
            if ($scope.post.isUpvoted()) {
                oldVote = INT_CONSTANTS.UPVOTE;
            } else if ($scope.post.isDownvoted()) {
                oldVote = INT_CONSTANTS.DOWNVOTE;
            }
            $scope.updatePostVote(vote, function (success) {
                if (success) {
                    if (vote == INT_CONSTANTS.UPVOTE && oldVote == INT_CONSTANTS.UPVOTE) {
                        $scope.post.setIsUpvoted(false);
                    } else if (vote == INT_CONSTANTS.DOWNVOTE && oldVote == INT_CONSTANTS.DOWNVOTE) {
                        $scope.post.setIsDownvoted(false);
                    } else if (vote == INT_CONSTANTS.UPVOTE) {
                        $scope.post.setIsUpvoted(true);
                        $scope.post.setIsDownvoted(false);
                    } else if (vote == INT_CONSTANTS.DOWNVOTE) {
                        $scope.post.setIsUpvoted(false);
                        $scope.post.setIsDownvoted(true);
                    } else {
                        $scope.post.setIsUpvoted(false);
                        $scope.post.setIsDownvoted(false);
                    }
                }
            });
        }
        $scope.updatePostTimeStr = function () {
            var timeRemaining = $scope.getSecondsRemaining();
            if (timeRemaining < 0 || timeRemaining == undefined) {
                $scope.hidePost = true;
                return;
            } else {
                $scope.hidePost = false;
            }
            if (timeRemaining < 60 * 60) {
                $scope.post.time_str = Math.ceil(timeRemaining / 60) + " min";
            } else if (timeRemaining < 60 * 60 * 24) {
                $scope.post.time_str = Math.floor(timeRemaining / 3600) + " hr";
            } else if (timeRemaining < 60 * 60 * 24 * 2) {
                $scope.post.time_str = "1 day";
            } else {
                $scope.post.time_str = Math.floor(timeRemaining / 21600) + " days";
            }
        }
        $scope.$watch("post.getSecondsToShowFor()", function (newval, oldval) {
            $scope.updatePostTimeStr();
        });
        var POST_UPDATE_INTERVAL = 10000;
        $interval(function () {
            $scope.updatePostTimeStr();
        }, POST_UPDATE_INTERVAL);
        $scope.updatePostVote = function (vote, callback) {
            var params = $scope.location;
            request_maker
                .voteOnPost($scope.post.id, $scope.post.mainDatabaseAddr, getVoteCall(vote))
                .then(function (response) {
                    var post = post_creator.getFormattedPost(response.data.body);
                    $scope.post.setSecondsToShowFor(post.getSecondsToShowFor());
                    callback(true);
                })
                .catch(function (error) {
                    callback(false);
                });
        }
        $scope.getPostStatus = function () {
            if ($scope.post.isUpvoted()) {
                return INT_CONSTANTS.UPVOTE;
            } else if ($scope.post.isDownvoted()) {
                return INT_CONSTANTS.DOWNVOTE;
            }
            return INT_CONSTANTS.NONE;
        }
        getVoteCall = function (status) {
            if (status == INT_CONSTANTS.UPVOTE) {
                return "upvote";
            } else if (status == INT_CONSTANTS.DOWNVOTE) {
                return "downvote";
            }
            return "";
        }
        $scope.getSecondsRemaining = function () {
            if ($scope.post == undefined) {
                return undefined;
            }
            var millsSincePosting = Date.now() - $scope.post.getPostTime();
            return $scope.post.getSecondsToShowFor() - (millsSincePosting / 1000);
        }
    }
]);