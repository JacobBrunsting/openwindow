app = angular.module('openwindow', ['ui.router']);

app.controller('windowopener', [
        '$scope',
        function($scope) {
            // Title
            $scope.test = "this is a test";
            // Posts
            $scope.post_prefix = ":::";
            $scope.posts = [
            {title:'Title1', body:'Body 1'},
            {title:'Title2', body:'Bdy 1'},
            {title:'Title3', body:'By 1'},
            {title:'Title4', body:'o 1'}
            ];
            $scope.post_suffix = ";;;";
            // Input
            $scope.addPost = function() {
                $scope.posts.push({title:'new',body:'other'});
            }
            $scope.addCustomPost = function() {
                if ($scope.title != '') {
                    $scope.posts.push({title: $scope.title,body:'bod'});
                    $scope.title = '';
                }
            }
        }
]);

app.controller('windowcreator', [
        '$scope',
        '$window',
        function($scope, $window) {
            $scope.test = "You should be on the new message page now";
            $scope.addCustomPost = function() {
                // add a post to the database
                $scope.test = "changed";
                $window.location.href = '#/home';
            }
        }
]);

app.config([
    '$stateProvider',
    '$urlRouterProvider',
    function($stateProvider, $urlRouterProvider) {
        $stateProvider.state('home', {
            url: '/home',
            templateUrl: '/home.html',
            controller: 'windowopener'
        });
        $stateProvider.state('new', {
            url: '/new',
            templateUrl: '/newpost.html',
            controller: 'windowcreator'
        });
        $urlRouterProvider.otherwise('home');
    }
]);
