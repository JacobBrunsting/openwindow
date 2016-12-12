angular.module('openwindow').controller('newpostctrl', [
        '$scope',
        '$window',
        '$http',
        function($scope, $window, $http) {
            $scope.test = "You should be on the new message page now";
            $scope.createNewSitePost = function() {
                // add a post to the database
                $scope.test = "changed";
                var sitepost = {title : $scope.title, body : $scope.body};
                $scope.title = '';
                $scope.body = '';
                $http.post("/api/sitepost", sitepost)
                     .success(function(response) {
                                  $window.location.href = '#/home';
                              })
                     .error(function(error) {});
            }
        }
]);


