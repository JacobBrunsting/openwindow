angular.module('openwindow').controller('newpostctrl', [
        '$scope',
        '$window',
        '$http',
        'geolocation',
        function($scope, $window, $http, geolocation) {
            var posterLocation;
            
            // TODO: Look into alternative geolocation services to add 
            // compatability with more browsers
            if (!("geolocation" in navigator)) {
                alert("Error:location unavaliable");
                return;
            }

            geolocation.get(
                function(position) {
                    posterLocation = position;
                    console.log("successfully got position with longitude " + position.longitude);
                },
                function(error) {
                    console.log(error);    
                });

            $scope.createNewSitePost = function() {
                console.log("creatinng new site post, location is " + JSON.stringify(posterLocation));
                if (posterLocation == undefined) {
                    console.log("poster location was undefined, getting position");
                    geolocation.get(
                        $scope.submitPostWithThisLocation, 
                        function(err) {
                        // TODO: Add error checking stuff here
                            console.log(err);
                        }
                    );
                } else {
                    $scope.submitPostWithThisLocation(posterLocation);
                }
            }

            $scope.submitPostWithThisLocation = function(posterLocation) {
                console.log("submitting post with location " + JSON.stringify(posterLocation));
                var sitepost = {
                    title:     $scope.title,
                    body:      $scope.body,
                    longitude: posterLocation.longitude,
                    latitude:  posterLocation.latitude
                };
                $scope.title = '';
                $scope.body = '';
                $http.post("/api/sitepost", sitepost)
                    .success(
                        function(response) {
                            $window.location.href = '#/home';
                        }
                    )
                    .error(
                        function(error) {
                            console.log(error);
                        }
                    );
            }
        }
]);


