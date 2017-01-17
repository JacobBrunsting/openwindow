angular.module('openwindow').controller('homectrl', [
        '$scope',
        '$http',
        '$location',
        'post_updater',
        'geolocation',
        function($scope, $http, $location, post_updater, geolocation) {
            function setupPage(location) {
                $scope.location = location;
                getAllSitePosts();
                $scope.addPost = function() {
                    
                    $location.url(geolocation.addLocationToURL('/new', $scope.location));
                }
            }
            function onLocationRetrievalFailure(error) {
                console.log(error);
            }
            geolocation.get(setupPage, onLocationRetrievalFailure);
            function getAllSitePosts() {
                $scope.page = "home";
                $http.get("/api/siteposts", {params:$scope.location})
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
        }
]);

