var express = require('express');
var request = require('request');

var app = express();


app.use(function(err, req, res, next) {
    console.error(err.stack)
    res.status(500)
    res.render('error', {
        error: err
    })
})

//so because nextbus is http only, we have to proxy this request to avoid mixed content warnings and still serve our app over https.
app.use('/proxy', function(req, res) {

    var origin = req.get('origin');
    var host = req.get('host');

    if(host!=="jbpmunimap.herokuapp.com"){
        res.send(null)
        return;
    }
    if(origin!=="https://prettymuni.com"){
        res.send(null)
         return;
    }
    if (req.url.indexOf('webservices.nextbus.com/service/publicXMLFeed') < 0) {
        res.send(null)
        return;
    } else {
        var url = req.url.replace('/?url=', '');
        req.pipe(request(url)).pipe(res);
    }

});


app.listen(process.env.PORT || 3000);

