const bodyParser = require('body-parser');
const express = require('express');
const request = require('request');
const app = express();

let serverUrls = [];
let lastServerIndex = 0;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: false
}));
app.set('json spaces', 1);

app.use('*', (req, res, next) => {
    console.log(req.method + ' ' + req.originalUrl);
    if (req.body && JSON.stringify(req.body) !== '{}') {
        console.log(JSON.stringify(req.body));
    }
    next();
});

/**
 * @api /balancer/servers - Set the list of web servers the load balancer sends
 *  requests to
 * @apiParam {string[]} serverurls - The urls of the web servers
 */
app.post('/balancer/servers', (req, res) => {
    serverUrls = req.body.serversurls;
    res.status(200).send();
});

app.all('*', (req, res) => {
    if (serverUrls.length === 0) {
        res.status(500).send();
        return;
    }
    let nextServerIndex = lastServerIndex + 1;
    if (nextServerIndex >= serverUrls.length) {
        nextServerIndex = 0;
    }
    const serverUrl = serverUrls[nextServerIndex];
    const newReqUrl = serverUrl + req.originalUrl;
    lastServerIndex = nextServerIndex;

    let requestParams = {
        url: newReqUrl,
        method: req.method,
        body: req.body,
        json: true
    }

    request(requestParams, (err, reqRes) => {
        if (err) {
            tryNextServer();
        } else {
            res.status(reqRes.statusCode).send(reqRes.body);
        }
    });

    function tryNextServer() {
        if (serverUrls.length === 0) {
            res.status(500).send();
            return;
        }
        let retryServerIndex = nextServerIndex + 1;
        if (retryServerIndex >= serverUrls.length) {
            retryServerIndex = 0;
        }
        requestParams.url = serverUrls[retryServerIndex] + req.originalUrl;
        request(requestParams, (err, reqRes) => {
            if (err) {
                res.status(500).send(err);
            } else {
                res.status(reqRes.statusCode).send(reqRes.body);
            }
        });
    }
});

const PORT_KEY = 'port';
let port = 8080;

process.argv.forEach(function (val, index) {
    if (index >= 2) {
        var splitVal = val.split('=');
        if (splitVal.length > 1) {
            switch (splitVal[0]) {
                case PORT_KEY:
                    port = parseInt(splitVal[1]);
                    return;
            }
        }
    }
});

console.log('');
console.log('load balancer listening on port ' + port);
console.log('');

app.listen(port);