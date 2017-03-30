angular.module('openwindow').service('request_maker', ['$http', function ($http) {
    this.getPostFromServer = function (postId, serverAddress, callback) {
        var uri = '/api/post?id=' + postId;
        $http.get(uri, {
                params: {
                    databaseAddress: serverAddress
                }
            })
            .then(function (res) {
                    callback(res.data);
                },
                function (err) {
                    console.log("request_maker:getPostFromServer:" + JSON.stringify(err));
                });
    }

    this.addComment = function (postId, serverAddress, comment, callback) {
        $http.post('/api/comment', {
                id: postId,
                comment: comment
            }, {
                params: {
                    databaseAddress: serverAddress
                }
            })
            .then(function (res) {
                    callback(res.data);
                },
                function (err) {
                    console.log("request_maker:addComment:" + JSON.stringify(err));
                });
    }

    this.voteOnPost = function (postId, serverAddress, vote) {
        return $http.put('/api/' + vote, {
            id: postId,
        }, {
            params: {
                databaseAddress: serverAddress,
            }
        });
    }
}]);