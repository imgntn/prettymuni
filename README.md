# https://www.prettymuni.com
# What this is

I was asked to create a live map of San Francisco transportation recently when applying to a job, so I made this :)

It uses d3.js and vanilla javascript to show and update current positions of realtime buses in the San Francisco Muni system.

![Alt text](https://github.com/imgntn/prettymuni/raw/master/screenshot.PNG?raw=true "Optional Title")

# To-Do

# essentials
- [x] base maps
- [x] get and parse muni data
- [x] draw muni vehicles for a given route
- [x] update every 15 seconds
- [x] transitions for vehicle updates
- [x] map zoom and pan
- [x] handle resizing of window
- [x] figure out how to add at any zoom level
- [x] route text labels for vehicle circles
- [x] better method for animating for route label and vehicle circle
- [x] click data for vehicles
- [x] allow selection of subset of vehicles for display from HTML5 control
- [x] remove unused routes on select
- [x] clear all button
- [x] vehicle headings
- [x] dictionary of colors for routes so that new vehicles come in with the same one their route already has.
- [x] route selection list
- [x] full screen
- [x] show route tag
- [x] touch tile to toggle
- [x] needs to fill the active routes list
- [x] simple loader

# nice-to-haves
- [x] active color of tile is bus route color
- [x] teardrop heading indicator
- [] show all button
- [] show route name on hover in route selector tile
- [] inbound/ outbound "ping" button
- [] scale vehicle groups down as you zoom in so the fit the streets.
- [] custom, thematic loader.  
- [] load street map async 
- [] fade in the streets when they are loaded async so that it looks nice
- [] clicking should toggle route line path display on off
- [] every route line path has two inner lines for inbound outbound directional pulse wave along the stops
- [] offline detection
- [x] send google analytics event on route toggle
- [] add 'live' indicator to top of page
- [] add gulp deploy task for copying a /public folder into docs to cleanup that naming mess and detach github pushes from production
-[] ^^ stop working on master ;P

# bugs
- [x] when a new vehicle is added or removed from a route, the route is being shuffled. fixed by passing second parameter to .data() to keep track
- [x] handle cases of predictable:'false' -- getting stranded circles right now.
- [x] when dropdown is open, it cannot be closed without clicking in the top container area.  a click on the map should definitely close it too.
- [x] mouseover brings group to front of route.  needs to bring route to front of other routes also.
- [x] mixed content warnings since the nextbus api isn't https. fixed by creating my own proxy
- [x] mobile: can't close dropdown at all :P even when pressing 'done' https://github.com/Dogfalo/materialize/issues/3501
- [x] browser default looks like crap on desktop and i don't want to start doing feature detection, so i think i'll roll my own.
- [x] remove material design, jquery
- [x] need my own route selector, layout, buttons. 
- [] rotations on tearpdrop transitions are weird.  sort out how to make a group


# bandwidth and performance observations
- 1.1kb per route
- ~80kb to get all routes
- streets geoJSON is 9mb and probably needs to be simplified
- gzipping on server reduces this to 1.2mb delivered, but should still try to do it async
- 118kb .js
- 1kb css
- MS edge perf is bad.
- perf rankings:  chrome, firefox, edge.
- a bit poky on the chromebook but it does run all routes.
- perf problems are likely related to the number of svg elements.  dom manipulation can get slow.

# mobile observations
- not a lot of space on the flip on an iphone 5s.  but likely okay on bigger phones.  
- standard multiple select works nicely on iphone

# framework observations
-  well, materialize didn't end up being helpful and the standard html5 select sucks so i'm rolling my own

# wow-zone
- [] use an elevation service to do a sweet altitude vis 
    https://developers.google.com/maps/documentation/elevation/start
- [] favorite routes
- [] favorite colors
- [] html5 geolocation + 'show nearest'
- [] maybe use topoJSON
- [] maybe use vector tiles? http://bl.ocks.org/mbostock/5616813 https://mapzen.com/projects/vector-tiles/
