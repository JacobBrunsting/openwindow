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
            getAllPosts();
            $scope.addPost = function () {
                $location.url(geolocation.addLocationToURL('/new', $scope.location));
            }
        }

        function onLocationRetrievalFailure(err) {
            console.log(err);
        }
        //geolocation.get(setupPage, onLocationRetrievalFailure);
        setupPage(getTestingLocation());

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

        function getTestingLocation() {
            let longitude;
            let latitude;
            do {
                if (longitude && latitude) {
                    console.log("The current coordinates are invalid, please try again");
                }
                longitude = prompt("Testing only: Enter the testing user's longitude (-180 - 180)");
                latitude = prompt("Testing only: Enter the testing user's latitude (-90 - 90)")
            } while(isNaN(longitude) || isNaN(latitude) || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90);
            return {longitude: longitude, latitude: latitude};
        }
    }
]);