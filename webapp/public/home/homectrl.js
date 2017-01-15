angular.module('openwindow').controller('homectrl', [
        '$scope',
        '$http',
        '$window',
        'post_updater',
        function($scope, $http, $window, post_updater) {
            getAllSitePosts = function() {
                $scope.page = "home";
                $http.get("/api/siteposts")
                    .success(function(posts) {
                        $scope.posts = [];
                        for (postId in posts) {
                            var post = posts[postId];
                            var formattedPost = {
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
                            $scope.posts.push(formattedPost);
                        }
                        var UPDATE_INTERVAL = 10000;
                        post_updater.startUpdatingPosts($scope.posts, UPDATE_INTERVAL);
                    }
                );
            }
            getAllSitePosts();
            $scope.addPost = function() {
               $window.location.href = '#/new';
            }
        }
]);

