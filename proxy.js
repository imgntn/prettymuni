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

app.get(['/health', '/healthz'], function(req, res) {
    res.status(200).json({
        ok: true,
        service: 'prettymuni'
    });
});

app.use(compression());
app.use(express.static('docs'));

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
    var allowedHosts = [
        'jbpmunimap.herokuapp.com',
        'prettymuni.com',
        'www.prettymuni.com',
        'prettymuni.playablefuture.com'
    ];
    var allowedOrigins = [
        'https://prettymuni.com',
        'https://www.prettymuni.com',
        'https://prettymuni.playablefuture.com'
    ];

    if(allowedHosts.indexOf(host) < 0){
        res.send(null)
        return;
    }
    if(origin && allowedOrigins.indexOf(origin) < 0){
        res.send(null)
         return;
    }
    if (req.url.indexOf('webservices.nextbus.com/service/publicXMLFeed') < 0) {
        res.send(null)
        return;
    } else {
        var url = req.url.replace('/?url=', '');
        proxyNextbusRequest(req, res, url);
    }

});


app.listen(process.env.PORT || 3000);

