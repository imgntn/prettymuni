# What this is
https://www.prettymuni.com
I was asked to create a live map of San Francisco transportation recently when applying to a job, so I made this :)

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
- [] simple loader
- [x] clear all button
- [x] vehicle headings
- [x] dictionary of colors for routes so that new vehicles come in with the same one their route already has.
- [x] route selection list
    -[x] full screen
    -[x] show route tag
    -[] show route name (only at larger widths)
    -[x] touch tile to toggle
    -[x] needs to fill the active routes list


# nice-to-haves
- [] show all button
- [] a decent base color pallete
- [] hover data for vehicles
- [] inbound/ outbound checkboxes
- [] different color ring for inbound / outbound
- [] visual inbound outbound indicator.  maybe hatching. tried h
- [] draw route stops + paths
- [] a neat vehicle svg
- [] active color of tile is bus route color
- [] scale text inside of circles to fit always 
- [] scale vehicle groups down as you zoom in so the fit the streets.
- [] monochrome pallete choice
- [] offline detection
- [] load streetmap async 

# bugs
- [x] when a new vehicle is added or removed from a route, the route is being shuffled. fixed by passing second parameter to .data() to keep track
- [x] handle cases of predictable:'false' -- getting stranded circles right now.
- [x] when dropdown is open, it cannot be closed without clicking in the top container area.  a click on the map should definitely close it too.
- [x] mouseover brings group to front of route.  needs to bring route to front of other routes also.
- [x] mixed content warnings since the nextbus api isn't https. fixed by creating my own proxy
- [] heading dots sometimes get stuck large when adding multiple routes in a row
- [] mobile: can't close dropdown at all :P even when pressing 'done' https://github.com/Dogfalo/materialize/issues/3501
- [] browser default looks like crap on desktop and i don't want to start doing feature detection, so i think i'll roll my own.

- maintenence
- [] remove material design, jquery
- [] need my own route selector, layout, buttons.  


# bandwidth and performance observations
- 1.1kb per route
- ~80kb to get all routes
- streets geoJSON is 9mb and probably needs to be simplified
- 530kb .js
- 20kb css
- 48kb font
- miserable performance with all routes on MS edge
- perf rankings:  chrome, firefox, edge.
- a bit poky on the chromebook but it does run all routes.


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


