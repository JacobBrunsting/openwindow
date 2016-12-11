var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var mongoose = require('mongoose');
mongoose.connect('mongodb://localhost/openwindowdatabase');

var SitePostSchema = mongoose.Schema({
    title: {type: String, required:true}, 
    body: {type: String, required:true},  
    posterId: {type: Number, default: 0},
    postTime: {type: Date, default: Date.now}
}, {collection: 'SitePostDatabase'}); // structure of a post

var sitePostModel = mongoose.model("sitePostModel", SitePostSchema);

app.use(bodyParser.json()); // lots of other parsers you can use!
app.use(express.static(__dirname + '/public'));

app.post("/api/sitepost", addNewSitePost);

// request body must match SitePostSchema (i.e. have title and body strings)
function addNewSitePost(request, response) {
    var sitePost = request.body;
    console.log("added new post " + sitePost.title + ", " + sitePost.body);
    sitePostModel.create(sitePost);
    response.json();
}

app.listen(3000);

