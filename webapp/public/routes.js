angular.module('openwindow').config([
    '$stateProvider',
    '$urlRouterProvider',
    function ($stateProvider, $urlRouterProvider) {
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
        $stateProvider.state('comments', {
            url: '/comments?postId',
            templateUrl: '/comments/comments.html',
            controller: 'commentsctrl'
        });
        $stateProvider.state('dev', {
            url: '/dev',
            templateUrl: '/devpanel/devpanel.html',
            controller: 'devpanelctrl'
        });
        $stateProvider.state('serverinfo', {
            url: '/serverinfo',
            templateUrl: '/serverinfo/serverinfo.html',
            controller: 'serverinfoctrl'
        });
        $urlRouterProvider.otherwise('home');
    }
]);