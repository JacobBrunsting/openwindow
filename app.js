angular.module('openwindow', []).controller('windowopener', [
        '$scope',
        function($scope) {
            $scope.test = "this is a test";
            $scope.post_prefix = ":::";
            $scope.posts = ["post 1", "post 2", "post 3"];
            $scope.posts_suffix = ";;;";
        }
]);
