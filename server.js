var express = require('express');
var request = require('request');
var compression = require('compression');

var app = express();

app.use(function(err, req, res, next) {
    console.error(err.stack)
    res.status(500).send('Something broke!')
})

app.use(compression());
app.use(express.static('public'))

//so because nextbus is http only, we have to proxy this request to avoid mixed content warnings and still serve our app over https.
app.use('/proxy', function(req, res) {
    if (req.url.indexOf('webservices.nextbus.com/service/publicXMLFeed') < 0) {
        // console.log('only proxying my queries')
        return;
        res.send(null)
    } else {
        var url = req.url.replace('/?url=', '');
        // console.log('url is', url)
        req.pipe(request(url)).pipe(res);
    }

});

app.use(function(err, req, res, next) {
    console.error(err.stack)
    res.status(500)
    res.render('error', {
        error: err
    })
})

app.listen(process.env.PORT || 3000);

//FORCE SSL
// app.use(function(req, res, next) {
//   if(req.headers['x-forwarded-proto']==='http') {
//     return res.redirect(['https://', req.get('Host'), req.url].join(''));
//   }
//   next();
// });