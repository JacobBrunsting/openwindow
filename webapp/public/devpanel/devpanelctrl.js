angular.module('openwindow').controller('devpanelctrl', [
    '$scope',
    '$http',
    '$window',
    'post_creator',
    function ($scope, $http, $window, post_creator) {
        getAllPosts = function () {
            $scope.page = "dev";
            $http.get("/api/allposts")
                .success(function (response) {
                    var posts = response.body;
                    $scope.posts = [];
                    for (postId in posts) {
                        $scope.posts[postId] = post_creator.getFormattedPost(posts[postId]);
                    }
                });

        }
        // TODO: Check git to see where this was called before
        $scope.setTimeRemaining = function (post, newTimeLeft) {
            $http.post("/api/settime", {
                    id: post.id,
                    newSecondsToShowFor: getSecondsToShowForFromTimeLeft(post, newTimeLeft)
                })
                .success(function (response) {
                    post.timeLeft = getTimeLeft(response.body);
                })
                .error(function (error) {});
            $scope.body_box = "";
        }
        getAllPosts();
        getTimeLeft = function (post) {
            return Math.round(((post.getPostTime() - Date.now()) / 1000) + post.getSecondsToShowFor());
        }
        getSecondsToShowForFromTimeLeft = function (post, timeLeft) {
            return timeLeft - Math.round((post.postTime - Date.now()) / 1000);
        }
        $scope.deleteComment = function (post, comment) {
            $http.delete("/api/comment", {
                    params: {
                        postId: post.getId(),
                        commentId: comment.getId()
                    }
                })
                .success(function (response) {
                    post.setComments(post_creator.getFormattedCommentList(response.body.comments));
                })
                .error(function (error) {});
        }
        $scope.deletePost = function (post) {
            $http.delete("/api/post", {
                    params: {
                        id: post.getId()
                    }
                })
                .success(function (response) {
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
                .error(function (error) {});
        }
        // temp, for testing only
        $scope.addServerInfo = function (minLongitude, maxLongitude, minLatitude, maxLatitude) {
            var serverInfo = {
                baseAddr: "127.0.0.1:3000",
                maxLng: maxLongitude,
                minLng: minLongitude,
                maxLat: maxLatitude,
                minLat: minLatitude
            };

            $scope.minLongitude = "";
            $scope.maxLongitude = "";
            $scope.minLatitude = "";
            $scope.maxLatitude = "";

            $http.post("/director/serverinfo", serverInfo)
                .success(function (response) {})
                .error(function (err) {
                    console.log(err);
                });
        }
    }
]);