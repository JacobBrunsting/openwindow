angular.module('openwindow').controller('newpostctrl', [
        '$scope',
        '$window',
        '$http',
        function($scope, $window, $http) {
            $scope.test = "You should be on the new message page now";
            $scope.createNewSitePost = function() {
                // add a post to the database
                $scope.test = "changed";
                $window.location.href = '#/home';
                var sitepost = {title : $scope.title, body : 'TEST'};
                $scope.title = '';
                $http.post("/api/sitepost", sitepost);
            }
        }
]);


