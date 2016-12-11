var express = require('express');
var request = require('request');
var compression = require('compression');

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

    console.log('origin',JSON.stringify(origin));
    console.log('host',JSON.stringify(host));
    if (req.url.indexOf('webservices.nextbus.com/service/publicXMLFeed') < 0) {
        // console.log('only proxying my queries')
        return;
        res.send(null)
    } else {
        var url = req.url.replace('/?url=', '');
        req.pipe(request(url)).pipe(res);
    }

});


app.listen(process.env.PORT || 3000);

