angular.module('openwindow').controller('homectrl', [
    '$scope',
    '$http',
    '$location',
    'post_updater',
    'geolocation',
    'post_creator',
    'INT_CONSTANTS',
    function ($scope, $http, $location, post_updater, geolocation, post_creator, INT_CONSTANTS) {
        function setupPage(location) {
            $scope.location = location;
            $scope.longitude_input = location.longitude;
            $scope.latitude_input = location.latitude;
            getAllPosts();
            $scope.addPost = function () {
                $location.url('/new');
            }
        }

        $scope.updateLocation = function() {
            $scope.posts = [];
            let newLocation = {longitude: $scope.longitude_input, latitude: $scope.latitude_input};
            geolocation.setLocation(newLocation);
            setupPage(newLocation);
        }

        function onLocationRetrievalFailure(err) {
            console.log(err);
        }
        geolocation.get(setupPage, onLocationRetrievalFailure);

        function getAllPosts() {
            $scope.page = "home";
            var params = $scope.location;
            params.radius = INT_CONSTANTS.POST_RADIUS;
            $http.get("/api/posts", {
                    params: params
                })
                .success(function (response) {
                    var posts = response.body;
                    $scope.posts = [];
                    for (postId in posts) {
                        $scope.posts[postId] = post_creator.getFormattedPost(posts[postId]);
                    }
                    var UPDATE_INTERVAL = 10000;
                    post_updater.startUpdatingPosts($scope.posts, $scope.location, UPDATE_INTERVAL);
                });
        }
    }
]);