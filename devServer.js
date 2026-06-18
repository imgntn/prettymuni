var express = require('express');
var compression = require('compression');

var app = express();

function proxyNextbusRequest(req, res, url) {
    fetch(url, {
        headers: {
            'Accept': req.get('accept') || '*/*',
            'User-Agent': 'prettymuni-proxy'
        }
    }).then(function(upstreamResponse) {
        var contentType = upstreamResponse.headers.get('content-type');
        if (contentType) {
            res.set('Content-Type', contentType);
        }
        res.status(upstreamResponse.status);
        return upstreamResponse.arrayBuffer();
    }).then(function(body) {
        res.send(Buffer.from(body));
    }).catch(function(error) {
        console.error(error);
        res.status(502).json({ error: 'Proxy error' });
    });
}

app.use(compression());
app.get(['/health', '/healthz'], function(req, res) {
    res.status(200).json({
        ok: true,
        service: 'prettymuni'
    });
});
app.use(express.static('docs'))

app.use(function(err, req, res, next) {
    console.error(err.stack)
    res.status(500)
    res.render('error', {
        error: err
    })
})


//so because nextbus is http only, we have to proxy this request to avoid mixed content warnings and still serve our app over https.
app.use('/proxy', function(req, res) {
    if (req.url.indexOf('webservices.nextbus.com/service/publicXMLFeed') < 0) {
        // console.log('only proxying my queries')
        return;
        res.send(null)
    } else {
        var url = req.url.replace('/?url=', '');
        // console.log('url is', url)
        proxyNextbusRequest(req, res, url);
    }

});


app.listen(process.env.PORT || 3000);

//FORCE SSL
// app.use(function(req, res, next) {
//   if(req.headers['x-forwarded-proto']==='http') {
//     return res.redirect(['https://', req.get('Host'), req.url].join(''));
//   }
//   next();
// });
