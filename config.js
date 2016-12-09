angular.module('openwindow').config([
    '$stateProvider',
    '$urlRouterProvider',
    function($stateProvider, $urlRouterProvider) {
        $stateProvider.state('home', {
            url: '/home',
            templateUrl: '/home/home.html',
            controller: 'homectrl'
        });
        $stateProvider.state('new', {
            url: '/new',
            templateUrl: '/newpost/newpost.html',
            controller: 'newpostctrl'
        });
        $urlRouterProvider.otherwise('home');
    }
]);
