function Mapper() {
    this.setupDrawingSpace();
    this.setupControls();
    this.loadAllBaseMaps();
}

Mapper.prototype = {
    refreshRate: 10,
    refreshInterval: null,
    baseProjectionScale: 350000,
    baseMapNames: [
        'neighborhoods',
        'streets',
        //'streets_minified',
        //'streets_reduced_precision',
        'freeways',
        'arteries',
    ],
    baseMapGeoJSON: [],
    baseMapGroups: [],
    vehicleGroups: {},
    zoomTransform: null,
    routes: [],
    routeColors: {},
    routeTileBackgroundColor:'rgba(0,0,0,0.40)',
    activeRoutes: [],
    proxyURL: 'https://jbpmunimap.herokuapp.com/?url=',
    proxyURL: '/proxy?url=',
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
            .center([-122.433701, 37.767683])
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

        _t.zoomTransform = d3.event.transform;

    },

    loadAllBaseMaps: function() {
        var _t = this;

        _t.baseMapNames.forEach(function(mapName) {
            _t.loadBaseMap(mapName);
        })
    },

    loadBaseMap: function(mapName) {
        var _t = this;


        // do a thing, possibly async, then…
        d3.json("assets/sfmaps/" + mapName + ".json", function(error, geojson) {
            if (error) {
                //Mapper.js:82 SyntaxError: Unexpected end of JSON input(…)
                // happens when a basemap fails to load.  need promises!
                console.error(error);
                return
            }
            geojson.name = mapName;
            _t.baseMapGeoJSON.push(geojson);
            if (_t.baseMapGeoJSON.length === _t.baseMapNames.length) {
                _t.drawBaseMaps();
            } else {
                console.log('Waiting for basemaps to finish loading')
            }
        });
    },


    drawBaseMaps: function() {
        var _t = this;
        _t.baseMapNames.forEach(function(mapName) {
            var geoJSON = _t.getBaseMapGeoJSONByName(mapName);
            _t.addBaseMapLayer(geoJSON, mapName);
        });

        //post basemap load hook
    },

    drawAllRoutesAtInterval: function() {
        console.log('should draw all routes')
        var _t = this;
        _t.drawAllRoutes();

        _t.refreshInterval = setInterval(function() {
            _t.drawAllRoutes();
        }, _t.refreshRate * 1000)
    },

    getBaseMapGeoJSONByName: function(mapName) {
        return this.baseMapGeoJSON.filter(function(obj) {
            return obj.name == mapName;
        })[0];
    },

    addBaseMapLayer: function(geojson, mapName) {
        var _t = this;
        var svgGroup = _t.svg.append("g").attr('id', 'layer_' + mapName)

        var geoPath = d3.geoPath()
            .projection(this.projection);

        svgGroup.selectAll("path")
            .data(geojson.features)
            .enter()
            .append("path")
            .style("fill", getRandomHexColor())
            .style("stroke", getRandomHexColor())
            .attr("d", geoPath)
            .on('click', _t.clickGeoJSON)

        console.log('end of basemap drawing', geojson.name)

        this.baseMapGroups.push(svgGroup);

    },

    clickGeoJSON: function(val) {
        console.log('geoJSON clicked', val.properties)
    },

    mouseoverVehicle: function(val) {
        console.log('vehicle mouseover', val['@attributes'])

    },

    mouseoutVehicle: function(val) {
        console.log('vehicle mouseout', val['@attributes'])

    },

    clickVehicle: function(val) {
        console.log('vehicle clicked', val['@attributes'])

    },

    fetchRouteList: function() {
        var _t = this;
        var routeListURL = _t.proxyURL + 'http://webservices.nextbus.com/service/publicXMLFeed?command=routeList&a=sf-muni';

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
                            resolve(parsedRouteList);
                            _t.routes = parsedRouteList.body.route;
                        }
                    }
                }
            }
        });

        return p
    },

    fetchRoute: function(tag) {
        var _t = this;
        var tag = tag || '';
        tag = tag.toUpperCase();

        var routeURL = _t.proxyURL + 'http://webservices.nextbus.com/service/publicXMLFeed?command=routeConfig&a=sf-muni&r=' + tag;

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
                            resolve(parsedRoute);
                        }
                    }
                }
            }
        });

        return p

    },

    fetchVehicleLocations: function(tag, epochTime) {
        var _t = this;
        var tag = tag;
        tag = tag.toUpperCase();
        var epochTime = epochTime || 0;
        var vehicleLocationsURL = _t.proxyURL + 'http://webservices.nextbus.com/service/publicXMLFeed?command=vehicleLocations&a=sf-muni&r=' + tag + '&t=' + epochTime;;

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
                            console.log('error in fetch vehicles')

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

    drawAllRoutes: function() {
        var _t = this;
        _t.fetchRouteList()
            .then(function(data) {
                data.body.route.forEach(function(route) {
                    var tag = route['@attributes'].tag;
                    _t.drawVehiclesForRoute(tag);
                })
            })
            .catch(function(err) {
                console.error('Error drawing all routes', err);
            });
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
                    //console.log('no vehicles for route')
                    return;
                }
                _t.drawVehicles(locations.body.vehicle, tag)
            })
            .catch(function(err) {
                console.error('Error drawing vehicles for route', err);
            });
    },

    filterPredictableVehicles: function(vehicles) {
        return vehicles.filter(function(obj) {
            return obj['@attributes'].predictable === "true";
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

    drawVehicles: function(vehicles, tag) {
        var _t = this;
        if (!vehicles) {
            //console.log('no vehicles to draw')
            return;
        }
        var _t = this;

        var svgGroup;
        var colors;

        //resuse existing vehicle groups 
        if (_t.vehicleGroups.hasOwnProperty(tag)) {
            svgGroup = d3.select('#route_' + tag)
        } else {
            svgGroup = _t.svg.append("g").attr('id', "route_" + tag).attr('class', 'route-group')
                .on("mouseover", function() {
                    var sel = d3.select(this);
                    sel.moveToFront();
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
        var dotGroups = svgGroup.selectAll(".dot-group").data(predictableVehicles, function(d) {
            return d['@attributes'].id;
        })

        var headingDots = svgGroup.selectAll(".heading-dot").data(predictableVehicles, function(d) {
            return d['@attributes'].id;
        })

        var colors = _t.routeColors[tag];

        dotGroups.exit().remove();

        dotGroups
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
            .transition()
            .attr("transform", _t.translateHeadingDot)
            .duration(_t.refreshRate * 1000)

        var dotGroup = dotGroups.enter()
            .append("g")
            .attr('class', 'dot-group')
            .on("mouseover", function() {
                var sel = d3.select(this);
                sel.moveToFront();
            })
            .on('click', function(e) {
                _t.clickVehicle(e)
            })
            .attr("transform", function(d) {
                return "translate(" + _t.projection([
                    d['@attributes'].lon,
                    d['@attributes'].lat
                ]) + ")";
            })

        dotGroup.append("circle")
            .call(_t.zoom.transform, _t.zoomTransform)
            .attr("r", "6")
            .attr("fill", colors.circle.fill)
            .attr("stroke", colors.circle.stroke)
            .style('stroke-width', '1px')
            .transition().attr("r", "12").duration(1000)
            .transition().attr("r", "8").duration(1000)

        dotGroup.append("text")
            .attr('text-anchor', "middle")
            .attr('dy', '0.35em')
            .style("font-size", "8")
            .style('stroke-width', '1px')
            .style('paint-order', 'stroke')
            .attr("fill", colors.text.fill)
            .attr("stroke", colors.text.stroke)
            .attr("dx", 0)
            .text(function(d) {
                return d['@attributes'].routeTag
            })
            .transition().style("font-size", "12").duration(1000)
            .transition().style("font-size", "8").duration(1000)

        //create a heading dot
        dotGroup.append("circle").attr('class', 'heading-dot')
            .call(_t.zoom.transform, _t.zoomTransform)
            .attr("r", "0.45")
            .attr("fill", colors.headingDot.fill)
            //.attr("stroke", getRandomHexColor())
            .attr("transform", _t.translateHeadingDot)
            // .transition().attr("r", "1.5").duration(1000)
            // .transition().attr("r", "0.45").duration(1000)


    },
    translateHeadingDot: function(d) {
        var heading = d['@attributes'].heading;
        var radianHeading = Math.radians(heading);
        var y = 8 * -Math.cos(radianHeading) + 0
        var x = 8 * Math.sin(radianHeading) + 0
        return "translate(" + x + "," + y + ")";
    },

    setupControls: function() {
        var _t = this;

        document.addEventListener("DOMContentLoaded", function() {
            // code…
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

        });
    },

    createControlOption: function(text, value) {
        var _t = this;
        var el = document.createElement('div');
        el.classList.add('route-selector-tile')
        el.setAttribute('value', value);
        el.onclick = function(e) {
            console.log('e on tile click')
            _t.toggleRoute(value, el);
            return false;
        }

        var routeTag = document.createElement('div')
        routeTag.innerText = value;
        routeTag.classList.add('route-selector-tile-tag')
        el.appendChild(routeTag);

        return el
    },

    createControlButtons: function() {
        var _t = this;

        var clearButtonHolder=document.createElement('div');
        clearButtonHolder.classList.add('clear-all-button-holder')

        var clearButton = document.createElement('div')
        clearButton.innerText = 'Clear All';
        clearButton.classList.add('clear-all-button')

        clearButtonHolder.appendChild(clearButton);


        var closeRouteSelectorButtonHolder=document.createElement('div');
        closeRouteSelectorButtonHolder.classList.add('close-route-selector-button-holder')

        var closeRouteSelectorButton = document.createElement('div');
        closeRouteSelectorButton.innerText = 'Close Route Selector';
        closeRouteSelectorButton.classList.add('close-route-selector-button');

        closeRouteSelectorButtonHolder.appendChild(closeRouteSelectorButton);

        _t.routeSelector.appendChild(closeRouteSelectorButtonHolder);
        _t.routeSelector.appendChild(clearButtonHolder);

        var showRouteSelectorButtonHolder=document.createElement('div');
        showRouteSelectorButtonHolder.classList.add('show-route-selector-button-holder');

        var showRouteSelectorButton = document.createElement('div');
        showRouteSelectorButton.innerText = 'Choose Routes';

        showRouteSelectorButton.classList.add('show-route-selector-button')

        showRouteSelectorButtonHolder.appendChild(showRouteSelectorButton);

        var buttonOverlay = document.getElementsByClassName('button-overlay-container')[0];

        buttonOverlay.appendChild(showRouteSelectorButtonHolder);
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
            console.log('hello click')
            _t.showRouteSelector();
            return false;
        }
    },

    hideRouteSelector: function() {
        var _t = this;
        _t.routeSelector.style.display = "none";
        _t.buttonOverlay.style.display = "inline-block";
    },

    showRouteSelector: function() {
        var _t = this;
        _t.routeSelector.style.display = "inline-block";
        _t.buttonOverlay.style.display = "none";
    },

    toggleRoute: function(value, el) {
        var _t = this;
        console.log('active routes at toggle', _t.activeRoutes)
        console.log('toggling route', value)

        if (_t.activeRoutes.indexOf(value) > -1) {
            //already active, inactivate it
            _t.makeRouteInactive(value,el)
            el.classList.remove('active')
        } else {
            el.classList.add('active')
            _t.makeRouteActive(value,el)

        }
    },

    makeRouteActive: function(route, el) {
        var _t = this;
        _t.activeRoutes.push(route);
        _t.drawVehiclesForRoute(route);
        window.el=el;
        el.style.backgroundColor=_t.routeColors[route].circle.fill;
    },

    makeRouteInactive: function(route,el) {
       var _t = this;
        el.style.backgroundColor=_t.routeTileBackgroundColor;
        svgGroup = d3.select('#route_' + route).data([]).exit().remove();
        delete _t.vehicleGroups[route];
        var index = _t.activeRoutes.indexOf(route);
        if (index !== -1) {
            _t.activeRoutes.splice(index, 1);
        }
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
        _t.clearControlOptions();
        _t.createControlButtons();
        _t.routes.forEach(function(route) {
            var control = _t.createControlOption(route['@attributes'].title, route['@attributes'].tag)
            _t.routeSelector.appendChild(control);
        });

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
                _t.drawSetOfRoutes(_t.activeRoutes)
            }
        }, _t.refreshRate * 1000)

    },

    clearAll: function(e) {
        var _t = this;
        console.log('clearAll', e)
        d3.selectAll(".route-group").data([]).exit().remove();
        _t.activeRoutes = [];
        _t.vehicleGroups = {};
        _t.routeColors = {};
        _t.generateColorsForAllRoutes();
        var activeTiles = document.querySelectorAll(".route-selector-tile.active");

        [].forEach.call(activeTiles, function(el) {
            el.classList.remove("active");
            el.style.backgroundColor=_t.routeTileBackgroundColor;
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
                stuck = true;
            } else if (stuck && e.target.scrollTop <= stickPoint) {
                closeButton.style.position = '';
                stuck = false;
            }
        }
    }

}


var liveMapper = new Mapper();

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