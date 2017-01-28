angular.module('openwindow').service('request_maker', 
        ['$http', function($http) {
            this.getPostFromServer = function(postId, serverAddress, callback) {
                var url = 'http://' + serverAddress + '/api/post?id=' + postId;
                $http.get(url)
                    .then(function(res) {
                              callback(res.data); 
                          },
                          function(err) {
                          });
            }

            this.addComment = function(postId, serverAddress, comment, callback) {
                var url = 'http://' + serverAddress + '/api/comment';
                $http.post(url, {id:postId, comment:comment})
                     .then(function(res) {
                               callback(res.data);
                           },
                           function(err) {
                           });
            }
    }]);
