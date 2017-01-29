angular.module('openwindow').controller('homectrl', [
        '$scope',
        '$http',
        '$location',
        'post_updater',
        'geolocation',
        'post_creator',
        'INT_CONSTANTS',
        function($scope, $http, $location, post_updater, geolocation, post_creator, INT_CONSTANTS) {
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
                var params = $scope.location;
                params.radius = INT_CONSTANTS.POST_RADIUS;
                $http.get("/api/siteposts", {params:params})
                    .success(function(response) {
                        var posts = response.body;
                        $scope.posts = [];
                        for (postId in posts) {
                            $scope.posts[postId] = post_creator.getFormattedPost(posts[postId]);
                        }
                        var UPDATE_INTERVAL = 10000;
                        post_updater.startUpdatingPosts($scope.posts, $scope.location, UPDATE_INTERVAL);
                    }
                );
            }
        }
]);

