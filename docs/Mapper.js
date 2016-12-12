function Mapper() {
    this.setupDrawingSpace();
    this.setupControls();
    this.loadAllBaseMaps();
    this.lazyLoadStreetsBaseMap();
}

Mapper.prototype = {
    refreshRate: 10,
    refreshInterval: null,
    baseProjectionScale: 350000,
    baseMapCenter: [-122.433701, 37.767683],
    baseMapNames: [
        'neighborhoods',
        'arteries',
        'freeways',
    ],
    baseMapGeoJSON: [],
    baseMapGroups: [],
    vehicleGroups: {},
    zoomTransform: null,
    routes: [],
    routeColors: {},
    routeTileBackgroundColor: 'rgba(0,0,0,0.40)',
    activeRoutes: [],
    vehicleStore: {},
    getProxyURL: function() {
        if (window.location.hostname === 'localhost') {
            return 'proxy?url='
        } else {
            return 'https://jbpmunimap.herokuapp.com/proxy?url='
        }

    },

    isSecure: function() {
        var _t = this;
        if (window.location.protocol.indexOf('https:') > -1) {
            return _t.getProxyURL()
        } else {
            return ''
        }

    },

    setupDrawingSpace: function() {
        var _t = this;
        var width = window.innerWidth,
            height = window.innerHeight;

        _t.zoom = d3.zoom()
            .scaleExtent([1, 10])
            .on("zoom", function() {
                _t.zoomed()
            })

        _t.svg = d3.select(".map-container").append("svg")
            .attr("preserveAspectRatio", "xMidYMid slice")
            .attr("viewBox", "0 0 " + width + " " + height)
            .classed("svg-content-responsive", true)
            .call(_t.zoom)

        _t.projection = d3.geoMercator()
            .scale(_t.baseProjectionScale)
            .rotate([0, 0])
            .center(_t.baseMapCenter)
            .translate([width / 2, height / 2])

    },

    zoomed: function() {
        var _t = this;

        _t.baseMapGroups.forEach(function(mapGroup) {
            mapGroup.attr("transform", d3.event.transform);
        });

        for (var property in _t.vehicleGroups) {
            if (_t.vehicleGroups.hasOwnProperty(property)) {
                _t.vehicleGroups[property].attr("transform", d3.event.transform);
            }
        }

        var routePaths = _t.svg.selectAll('.route-path').attr('transform', d3.event.transform)

        _t.zoomTransform = d3.event.transform;

    },

    loadAllBaseMaps: function() {
        var _t = this;

        _t.baseMapNames.forEach(function(mapName) {
            _t.loadBaseMap(mapName);
        })
    },

    lazyLoadStreetsBaseMap: function() {
        var _t = this;

        d3.json("assets/sfmaps/streets.json", function(error, geojson) {
            if (error) {
                console.error(error);
                return
            }
            geojson.name = 'streets';
            _t.baseMapGeoJSON.push(geojson);
            _t.addStreetsBaseMapLayer(geojson);

        });
    },

    addStreetsBaseMapLayer: function(geojson) {
        var _t = this;
        var svgGroup = _t.svg.append("g").attr('id', 'layer_streets')

        var geoPath = d3.geoPath()
            .projection(_t.projection);

        svgGroup.selectAll("path")
            .data(geojson.features)
            .enter()
            .append("path")
            .style("stroke", getRandomHexColor())
            .attr("d", geoPath)
            
        var streetsLayer = document.getElementById('layer_streets');
        var svg = document.getElementsByTagName('svg')[0];

        svg.insertBefore(streetsLayer, svg.children[1])

        _t.baseMapGroups.push(svgGroup);

    },

    loadBaseMap: function(mapName) {
        var _t = this;

        d3.json("assets/sfmaps/" + mapName + ".json", function(error, geojson) {
            if (error) {
                console.error(error);
                return
            }
            geojson.name = mapName;
            _t.baseMapGeoJSON.push(geojson);
            if (_t.baseMapGeoJSON.length === _t.baseMapNames.length) {
                _t.drawBaseMaps();
            } else {}
        });
    },

    drawBaseMaps: function() {
        var _t = this;
        _t.baseMapNames.forEach(function(mapName) {
            var geoJSON = _t.getBaseMapGeoJSONByName(mapName);
            _t.addBaseMapLayer(geoJSON, mapName);
        });

        //post basemap load hook
        _t.hideLoader()
    },

    addBaseMapLayer: function(geojson, mapName) {
        if (!geojson || typeof geojson === 'undefined') {
            return
        };
        var _t = this;
        var svgGroup = _t.svg.append("g").attr('id', 'layer_' + mapName)

        var geoPath = d3.geoPath()
            .projection(_t.projection);

        svgGroup.selectAll("path")
            .data(geojson.features)
            .enter()
            .append("path")
            .style("fill", getRandomHexColor())
            .style("stroke", getRandomHexColor())
            .attr("d", geoPath)
            // .transition()
            // .duration(5500)
            // .attr('opacity', 1)

        _t.baseMapGroups.push(svgGroup);

    },

    getBaseMapGeoJSONByName: function(mapName) {
        var _t = this;
        return _t.baseMapGeoJSON.filter(function(obj) {
            return obj.name == mapName;
        })[0];
    },



    fetchRouteList: function() {
        var _t = this;

        var routeListURL = _t.isSecure() + 'http://webservices.nextbus.com/service/publicXMLFeed?command=routeList&a=sf-muni';

        var p = new Promise(function(resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', routeListURL);
            xhr.send(null);
            xhr.onerror = reject;
            xhr.onreadystatechange = function() {
                var DONE = 4;
                var OK = 200;
                if (xhr.readyState === DONE) {
                    if (xhr.status === OK) {
                        var parsedRouteList = xmlToJson(xhr.responseXML);
                        if (parsedRouteList.hasOwnProperty('body') && parsedRouteList.body.hasOwnProperty('Error')) {
                            reject(parsedRouteList.body.Error)
                        } else {
                            _t.routes = parsedRouteList.body.route;
                            resolve(parsedRouteList);

                        }
                    }
                }
            }
        });

        return p;
    },

    fetchRoute: function(tag) {
        if (typeof tag !== 'string' || tag === null) {
            return
        }
        var _t = this;
        var tag = tag || '';
        tag = tag.toUpperCase();

        var routeURL = _t.isSecure() + 'http://webservices.nextbus.com/service/publicXMLFeed?command=routeConfig&a=sf-muni&r=' + tag;

        var p = new Promise(function(resolve, reject) {

            var xhr = new XMLHttpRequest();
            xhr.open('GET', routeURL);
            xhr.send(null);
            xhr.onerror = reject;

            xhr.onreadystatechange = function() {
                var DONE = 4;
                var OK = 200;
                if (xhr.readyState === DONE) {
                    if (xhr.status === OK) {
                        var parsedRoute = xmlToJson(xhr.responseXML);
                        if (parsedRoute.hasOwnProperty('body') && parsedRoute.body.hasOwnProperty('Error')) {
                            reject(parsedRoute.body.Error)
                        } else {
                            _t.drawRoutePath(parsedRoute.body.route)

                            resolve(parsedRoute);
                        }
                    }
                }
            }
        });

        return p;

    },


    drawRoutePath: function(route) {

        // Due to the nature of the configuration there can be many separate paths, some of them
        // overlapping. A map client should simply draw all of the paths. The paths are not necessarily in
        // any kind of order so you should only connect the points within a path. You should not connect the
        // points between two separate paths though.


        //given a route
        //for every 'path' segment
        //create a d3 path using all of the points in that 'path'
        //(will have to project latlon to get xy)

        var _t = this;
        var allPaths = route.path;

        var svgGroup = _t.svg.append("g").attr('id', "routePath_" + route['@attributes'].tag).attr('class', 'route-path');

        var routePathLayer = document.getElementById("routePath_" + route['@attributes'].tag);
        var svg = document.getElementsByTagName('svg')[0];
        svg.insertBefore(routePathLayer, svg.children[4]);


        var pathsToDraw = [];
        allPaths.forEach(function(path) {
            var links = _t.connectPoints(path);
            pathsToDraw.push(links);
        });

        pathsToDraw.forEach(function(pathData, index) {
            var linePath = svgGroup.selectAll(".lineConnect_" + route['@attributes'].tag + "_" + index)
                .data(pathData)
                .enter()
                .append("line")
                .attr("class", "lineConnect_" + route['@attributes'].tag + "_" + index)
                .attr('stroke', _t.routeColors[route['@attributes'].tag].circle.fill)
                .attr('stroke-width', 1.5)
                .attr("x1", function(d) {
                    return d[0][0];
                })
                .attr("y1", function(d) {
                    return d[0][1];
                })
                .attr("x2", function(d) {
                    return d[1][0];
                })
                .attr("y2", function(d) {
                    return d[1][1];
                })
                .call(_t.zoom.transform, _t.zoomTransform)


        })

    },

    connectPoints: function(path) {
        var _t = this;

        var links = [];
        var data = path.point;
        var i;
        for (i = 0, len = data.length - 1; i < len; i++) {
            links.push(
                [
                    _t.projection([data[i]['@attributes'].lon, data[i]['@attributes'].lat]),
                    _t.projection([data[i + 1]['@attributes'].lon, data[i + 1]['@attributes'].lat]),
                ]
            )

        }

        return links;

    },

    mouseoverVehicle: function(val) {
        console.log('vehicle mouseover', val['@attributes']);

    },

    mouseoutVehicle: function(val) {
        console.log('vehicle mouseout', val['@attributes']);

    },

    clickVehicle: function(val) {
        console.log('vehicle clicked', val['@attributes']);

    },

    fetchVehicleLocations: function(tag, epochTime) {
        var _t = this;
        var tag = tag;
        tag = tag.toUpperCase();
        var epochTime = epochTime || 0;
        var vehicleLocationsURL = _t.isSecure() + 'http://webservices.nextbus.com/service/publicXMLFeed?command=vehicleLocations&a=sf-muni&r=' + tag + '&t=' + epochTime;;

        var p = new Promise(function(resolve, reject) {

            var xhr = new XMLHttpRequest();
            xhr.open('GET', vehicleLocationsURL);
            xhr.send(null);
            xhr.onerror = reject;

            xhr.onreadystatechange = function() {
                var DONE = 4;
                var OK = 200;
                if (xhr.readyState === DONE) {
                    if (xhr.status === OK) {
                        var parsedVehicleLocations = xmlToJson(xhr.responseXML);
                        if (parsedVehicleLocations.hasOwnProperty('body') && parsedVehicleLocations.body.hasOwnProperty('Error')) {
                            reject(parsedVehicleLocations.body.Error)
                        } else {
                            resolve(parsedVehicleLocations);
                        }
                    }
                }
            }
        });

        return p

    },

    drawSetOfRoutes: function(routeSet) {
        var _t = this;

        routeSet.forEach(function(route) {
            _t.drawVehiclesForRoute(route);
        })
    },

    drawVehiclesForRoute: function(tag) {
        var _t = this;
        var tag = tag || '5';
        tag = tag.toUpperCase();
        _t.fetchVehicleLocations(tag)
            .then(function(locations) {
                if (!locations.body.hasOwnProperty('vehicle')) {
                    return;
                }
                _t.drawVehicles(locations.body.vehicle, tag)
            })
            .catch(function(err) {
                console.log('Error drawing vehicles for route', err);
            });
    },

    generateRouteColors: function() {
        return {
            circle: {
                fill: getRandomHexColor(),
                stroke: 'black'
            },
            text: {
                fill: 'white',
                stroke: 'black'
            },
            headingDot: {
                fill: 'white',
                stroke: null
            }
        }
    },

    generateColorsForAllRoutes: function() {
        var _t = this;
        _t.routes.forEach(function(route) {
            var tag = route['@attributes'].tag;
            //resuse existing vehicle groups and colors
            var colors;
            if (_t.routeColors.hasOwnProperty(tag)) {
                colors = _t.routeColors[tag];
            } else {
                colors = _t.generateRouteColors();
            }
            _t.routeColors[tag] = colors;
        })

    },

    filterPredictableVehicles: function(vehicles) {
        return vehicles.filter(function(obj) {
            return obj['@attributes'].predictable === "true";
        });
    },

    filterMovedVehicles: function(vehicles) {
        var _t = this;
        return vehicles.filter(function(obj) {
            return _t.checkIfVehicleHasMoved(obj);
        });
    },

    checkIfVehicleHasMoved: function(vehicle) {
        var _t = this;

        var hasLast = _t.vehicleStore[vehicle['@attributes'].id];
        if (typeof(hasLast) === 'undefined' || hasLast == null) {
            return false;
        }
        var lastLon = _t.vehicleStore[vehicle['@attributes'].id]['@attributes'].lon;;
        var lastLat = _t.vehicleStore[vehicle['@attributes'].id]['@attributes'].lat;
        var currentLon = vehicle['@attributes'].lon;
        var currentLat = vehicle['@attributes'].lat
        var lonChanged = currentLon !== lastLon;
        var latChanged = currentLat !== lastLat;

        if (lonChanged || latChanged) {
            return true
        } else {
            return false
        }
    },

    filterChangedHeadingVehicles: function(vehicles) {
        var _t = this;
        return vehicles.filter(function(obj) {
            return _t.checkIfVehicleHasChangedHeading(obj);
        });
    },

    checkIfVehicleHasChangedHeading: function(vehicle) {
        var _t = this;

        var hasLast = _t.vehicleStore[vehicle['@attributes'].id];
        if (typeof(hasLast) === 'undefined' || hasLast == null) {
            return false;
        }
        var lastHeading = _t.vehicleStore[vehicle['@attributes'].id]['@attributes'].heading;;
        var currentHeading = vehicle['@attributes'].heading

        if (lastHeading !== currentHeading) {
            return true
        } else {
            return false
        }
    },


    drawVehicles: function(vehicles, tag) {
        var _t = this;
        if (!vehicles) {
            //no vehicles to draw
            return;
        }

        var svgGroup;

        //resuse existing vehicle groups 
        if (_t.vehicleGroups.hasOwnProperty(tag)) {
            svgGroup = d3.select('#route_' + tag)
        } else {
            svgGroup = _t.svg.append("g").attr('id', "route_" + tag).attr('class', 'route-group')
                .on("mouseover", function() {
                    var sel = d3.select(this);
                    sel.moveToFront();
                    var thisRoutePath = document.getElementById('routePath_' + tag);
                    var firstRouteGroup = document.getElementsByClassName('route-group')[0]
                    firstRouteGroup.insertAdjacentElement('beforebegin', thisRoutePath)
                })
        }

        _t.vehicleGroups[tag] = svgGroup;

        if (Array.isArray(vehicles) === false) {
            //nextbus will return a single vehicle object instead of an array with one object if there is only one. so we make our own array
            var temp = [];
            temp.push(vehicles);
            vehicles = temp;
        }

        var predictableVehicles = _t.filterPredictableVehicles(vehicles);
        var movedVehicles = _t.filterMovedVehicles(predictableVehicles);
        var changedHeadingVehicles = _t.filterChangedHeadingVehicles(predictableVehicles);

        //we need to store the vehicles so we can see if they've moved in the future
        predictableVehicles.forEach(function(vehicle) {
            _t.vehicleStore[vehicle['@attributes'].id] = vehicle;
        })

        var colors = _t.routeColors[tag];

        var dotGroups = svgGroup.selectAll(".dot-group").data(predictableVehicles, function(d) {
            return d['@attributes'].id;
        })

        var headingDots = svgGroup.selectAll(".heading-dot").data(predictableVehicles, function(d) {
            return d['@attributes'].id;
        })

        var headingDrops = svgGroup.selectAll(".drop-group").data(predictableVehicles, function(d) {
            return d['@attributes'].id;
        })

       

        var dotGroup = dotGroups.enter()
            .append("g")
            .attr('class', 'dot-group')
            .on("mouseover", function() {
                var sel = d3.select(this);
                sel.moveToFront();
            })
            // .on('click', function(e) {
            //     _t.clickVehicle(e)
            // })
            .attr("transform", function(d) {
                return "translate(" + _t.projection([
                    d['@attributes'].lon,
                    d['@attributes'].lat
                ]) + ")";
            })

        //create a heading drop

        var dropGroup = dotGroup.append('g')
            .style('transform-origin', 'center center')

        var drop = dropGroup.append('path')
            .style('transform-origin', 'center center')
            .attr('d', _t.dropPath)
            .attr('class', 'drop-group')
            .attr('fill', 'black')
            .attr("transform", _t.placeHeadingDrop)

        dotGroup.append("circle")
            .call(_t.zoom.transform, _t.zoomTransform)
            .attr("r", "6")
            .attr("fill", colors.circle.fill)
            .attr("stroke", colors.circle.stroke)
            .style('stroke-width', '1px')
            .transition().attr("r", "12").duration(1000).delay(function(d, i) { return i * 40; })
            .transition().attr("r", "8").duration(1000)

        dotGroup.append("text")
            .attr('text-anchor', "middle")
            .attr('dy', '0.35em')
            .style("font-size", "8")
            .style('stroke-width', '1px')
            .style('paint-order', 'stroke')
            .attr("fill", colors.text.fill)
            .attr("stroke", colors.text.stroke)
            .text(function(d) {
                return d['@attributes'].routeTag
            })
            .transition().style("font-size", "12").duration(1000).delay(function(d, i) { return i * 50; })
            .transition().style("font-size", "8").duration(1000)

        //create a heading dot
        dotGroup.append("circle")
            .attr('class', 'heading-dot')
            .call(_t.zoom.transform, _t.zoomTransform)
            .attr("fill", colors.circle.fill)
            .attr("r", "0.5")
            .attr("transform", _t.translateHeadingDot)



        dotGroups.exit().remove();

        headingDrops
            .data(changedHeadingVehicles, function(d) {
                return d['@attributes'].id;
            })
            .attr("transform", _t.placeHeadingDrop)


        dotGroups
            .data(movedVehicles, function(d) {
                return d['@attributes'].id;
            })
            .transition()
            .attr("transform", function(d) {
                return "translate(" + _t.projection([
                    d['@attributes'].lon,
                    d['@attributes'].lat
                ]) + ")";
            })
            .duration(_t.refreshRate * 1000)

        //the headings change fairly frequently so we update them as well. would be nicer if they went around the arc.
        headingDots
            .data(movedVehicles, function(d) {
                return d['@attributes'].id;
            })
            .transition()
            .attr("transform", _t.translateHeadingDot)
            .duration(_t.refreshRate * 1000)



    },

    dropPath: function(d) {
        var dropPath = "M15 6 Q 15 6, 25 18 A 12.8 12.8 0 1 1 5 18 Q 15 6 15 6z";
        return dropPath;
    },

    placeHeadingDrop: function(d) {
        var _t = this;
        var heading = d['@attributes'].heading;
        var radianHeading = Math.radians(heading);
        var y = 9 * -Math.cos(radianHeading) + 0;
        var x = 9 * Math.sin(radianHeading) + 0;
        var tag = d['@attributes'].routeTag;

        return "scale(0.6)rotate(" + heading + ")translate(" + -15 + "," + -28 + ")";
    },

    translateHeadingDot: function(d) {
        var heading = d['@attributes'].heading;
        var radianHeading = Math.radians(heading);
        var y = 9 * -Math.cos(radianHeading) + 0
        var x = 9 * Math.sin(radianHeading) + 0
        return "translate(" + x + "," + y + ")";
    },

    setupControls: function() {
        var _t = this;

        _t.fetchRouteList()
            .then(function(data) {
                _t.updateControlOptions();
                _t.generateColorsForAllRoutes();
                _t.makeRouteSelectorButtonsSticky();
                _t.refreshActiveRoutes();
            })
            .catch(function(err) {
                console.error('Error drawing all routes', err);
            });

    },

    createControlOption: function(text, routeProps) {
        var _t = this;
        var el = document.createElement('div');
        el.classList.add('route-selector-tile')
        el.setAttribute('value', routeProps.tag);
        el.onclick = function(e) {
            _t.toggleRoute(routeProps.tag, el);
            return false;
        }

        var routeTag = document.createElement('div');
        routeTag.innerText = routeProps.tag;
        routeTag.classList.add('route-selector-tile-tag');
        el.appendChild(routeTag);

        var routeTitle = document.createElement('div');
        routeTitle.innerText = routeProps.title;
        routeTitle.classList.add('route-selector-tile-title');
        el.appendChild(routeTitle);

        return el
    },

    clearControlOptions: function() {
        var _t = this;
        while (_t.routeSelector.hasChildNodes()) {
            _t.routeSelector.removeChild(_t.routeSelector.lastChild);
        }
    },

    updateControlOptions: function() {
        var _t = this;
        _t.routeSelector = document.getElementsByClassName('route-selector')[0];

        _t.createControlButtons();
        _t.routes.forEach(function(route) {
            var control = _t.createControlOption(route['@attributes'].title, route['@attributes'])
            _t.routeSelector.appendChild(control);
        });
    },

    createControlButtons: function() {
        var _t = this;

        var clearButtonHolder = document.getElementsByClassName('clear-all-button-holder')[0];
        var closeRouteSelectorButtonHolder = document.getElementsByClassName('close-route-selector-button-holder')[0];
        closeRouteSelectorButtonHolder.classList.add('close-route-selector-button-holder');

        var showRouteSelectorButtonHolder = document.getElementsByClassName('show-route-selector-button-holder')[0];

        var buttonOverlay = document.getElementsByClassName('button-overlay-container')[0];

        _t.buttonOverlay = buttonOverlay;

        closeRouteSelectorButtonHolder.onclick = function() {
            _t.hideRouteSelector()
            return false;
        }

        clearButtonHolder.onclick = function(e) {
            _t.clearAll(e);
            return false;
        }

        showRouteSelectorButtonHolder.onclick = function() {
            _t.showRouteSelector();
            return false;
        }
    },

    hideRouteSelector: function() {
        var _t = this;
        _t.routeSelector.style.display = "none";
        _t.buttonOverlay.style.display = "inline-block";
        ga('send', {
            hitType: 'event',
            eventCategory: 'Route Selection',
            eventAction: 'Close Route Selector (Show Map)',
        });
    },

    showRouteSelector: function() {
        var _t = this;
        _t.routeSelector.style.display = "inline-block";
        _t.buttonOverlay.style.display = "none";
        ga('send', {
            hitType: 'event',
            eventCategory: 'Route Selection',
            eventAction: 'Show Route Selector',
        });
    },

    toggleRoute: function(value, el) {
        var _t = this;
        if (_t.activeRoutes.indexOf(value) > -1) {
            //already active, inactivate it
            _t.makeRouteInactive(value, el)
            el.classList.remove('active')
            ga('send', {
                hitType: 'event',
                eventCategory: 'Route Selection',
                eventAction: 'Hide Route',
                eventLabel: value
            });

        } else {
            el.classList.add('active')
            _t.makeRouteActive(value, el)
            ga('send', {
                hitType: 'event',
                eventCategory: 'Route Selection',
                eventAction: 'Show Route',
                eventLabel: value
            });

        }
    },

    makeRouteActive: function(route, el) {
        var _t = this;
        _t.activeRoutes.push(route);
        _t.fetchRoute(route).then(function() {
            _t.drawVehiclesForRoute(route);
        });
        window.el = el;
        el.style.backgroundColor = _t.routeColors[route].circle.fill;
    },

    makeRouteInactive: function(route, el) {
        var _t = this;
        el.style.backgroundColor = _t.routeTileBackgroundColor;
        d3.select('#route_' + route).data([]).exit().remove();
        d3.select('#routePath_' + route).data([]).exit().remove();
        delete _t.vehicleGroups[route];
        var index = _t.activeRoutes.indexOf(route);
        if (index !== -1) {
            _t.activeRoutes.splice(index, 1);
        }
    },

    refreshActiveRoutes: function() {
        var _t = this;
        if (_t.refreshInterval !== null) {
            clearInterval(_t.refreshInterval);
        }
        _t.refreshInterval = setInterval(function() {
            if (_t.activeRoutes.length === 0) {
                return
            } else {
                ga('send', {
                    hitType: 'event',
                    eventCategory: 'Active Route Refresh',
                    eventAction: 'Refresh',
                    eventLabel: _t.activeRoutes.toString()
                });
                _t.drawSetOfRoutes(_t.activeRoutes)
            }
        }, _t.refreshRate * 1000)

    },

    clearAll: function(e) {
        var _t = this;
        d3.selectAll(".route-group").data([]).exit().remove();
        d3.selectAll('.route-path').data([]).exit().remove();
        _t.activeRoutes = [];
        _t.vehicleGroups = {};
        _t.routeColors = {};
        _t.generateColorsForAllRoutes();
        var activeTiles = document.querySelectorAll(".route-selector-tile.active");

        [].forEach.call(activeTiles, function(el) {
            el.classList.remove("active");
            el.style.backgroundColor = _t.routeTileBackgroundColor;
        });

        ga('send', {
            hitType: 'event',
            eventCategory: 'Route Selection',
            eventAction: 'Clear',
        });
    },

    makeRouteSelectorButtonsSticky: function() {
        var _t = this;
        var closeButton = document.getElementsByClassName("close-route-selector-button-holder")[0];
        var stuck = false;
        var stickPoint = closeButton.offsetTop;

        stickPoint = closeButton.offsetTop + closeButton.offsetHeight;
        _t.routeSelector.onscroll = function(e) {
            if ((e.target.scrollTop > stickPoint) && !stuck) {
                closeButton.style.position = 'fixed';
                // Create the measurement node


                var scrollDiv = document.createElement("div");
                scrollDiv.className = "scrollbar-measure";
                document.body.appendChild(scrollDiv);

                // Get the scrollbar width
                var scrollbarWidth = scrollDiv.offsetWidth - scrollDiv.clientWidth;

                // Delete the DIV 
                document.body.removeChild(scrollDiv);

                closeButton.style.right = scrollbarWidth / 2 + 'px';
                stuck = true;
            } else if (stuck && e.target.scrollTop <= stickPoint) {
                closeButton.style.position = '';
                closeButton.style.right = '';
                stuck = false;
            }
        }
    },

    hideLoader: function() {
        var loader = document.getElementsByClassName('loader-container')[0];
        loader.style.display = "none";
        var showRouteSelectorButtonHolder = document.getElementsByClassName('show-route-selector-button-holder')[0];
        showRouteSelectorButtonHolder.style.display = 'inline-flex'
    },

    offerCustomPrint: function() {
        var _t = this;
        if (localStorage.setItem('hasSeenPrettyMuniCustomPrint' !== null)) {
            return
        } else {
            _t.setTimeout(function() {
                _t.showCustomPrintPopover();
            }, 200)
        }

    },

    showCustomPrintPopover: function() {
        var popover = document.getElementsByClassName('custom-print-popover')[0];
        popover.style.display = "inline-block";
        localStorage.setItem('hasSeenPrettyMuniCustomPrint', true)
    },

    hideCustomPrintPopover: function() {
        var popover = document.getElementsByClassName('custom-print-popover')[0];
        popover.style.display = "none";
    },

}

function getRandomHexColor() {
    return '#' + ("000000" + Math.random().toString(16).slice(2, 8).toUpperCase()).slice(-6);
}

// Converts from degrees to radians.
Math.radians = function(degrees) {
    var degrees = parseInt(degrees);
    return degrees * Math.PI / 180;
};

// Converts from radians to degrees.
Math.degrees = function(radians) {
    return radians * 180 / Math.PI;
};

//https://gist.github.com/trtg/3922684
d3.selection.prototype.moveToFront = function() {
    return this.each(function() {
        this.parentNode.appendChild(this);
    });
};

function savePNG() {
    var doctype = '<?xml version="1.0" standalone="no"?>' + '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">';
    // serialize our SVG XML to a string.
    var source = (new XMLSerializer()).serializeToString(d3.select('svg').node());
    // create a file blob of our SVG.
    var blob = new Blob([doctype + source], {
        type: 'image/svg+xml;charset=utf-8'
    });
    var url = window.URL.createObjectURL(blob);
    // Put the svg into an image tag so that the Canvas element can read it in.
    var img = d3.select('body').append('img')
        .attr('width', 1920)
        .attr('height', 1280)
        .node();
    img.onload = function() {
            // Now that the image has loaded, put the image into a canvas element.
            var canvas = d3.select('body').append('canvas').node();
            canvas.width = 1920;
            canvas.height = 1280;
            var ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            var canvasUrl = canvas.toDataURL("image/png");
            var img2 = d3.select('body').append('img')
                .attr('width', 1920)
                .attr('height', 1280)
                .node();
            // this is now the base64 encoded version of our PNG! you could optionally 
            // redirect the user to download the PNG by sending them to the url with 
            window.open(canvasUrl)
            img2.src = canvasUrl;
        }
        // start loading the image.
    img.src = url;
}

document.addEventListener("DOMContentLoaded", function() {
    var liveMapper = new Mapper();
    window.liveMapper = liveMapper;
}, {
    passive: true
});