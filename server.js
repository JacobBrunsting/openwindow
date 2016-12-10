var express = require('express');
var app = express();
var bodyParser = require('body-parser');

app.use(bodyParser.json()); // lots of other parsers you can use!
app.use(express.static(__dirname + '/public'));

app.post("/api/sitepost", addNewSitePost);

function addNewSitePost(request, response) {
    var sitePost = request.body;
    console.log("added new post " + sitePost.title + ", " + sitePost.body);
}

app.listen(3000);

