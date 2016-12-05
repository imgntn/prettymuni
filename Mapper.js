function te_Mapper() {
    this.setupDrawingSpace();
    this.setupControls();
    this.loadAllBaseMaps();
}

te_Mapper.prototype = {
    refreshRate: 10,
    refreshInterval: null,
    baseProjectionScale: 350000,
    baseMapNames: [
        'neighborhoods',
        //'streets',
        'streets_minified',
        //'streets_reduced_precision',
        'freeways',
        'arteries',
    ],
    baseMapGeoJSON: [],
    baseMapGroups: [],
    vehicleGroups: {},
    zoomTransform: null,
    routes: [],
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
            .attr("preserveAspectRatio", "xMinYMin meet")
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

    loadBaseMapPromise: function(mapName) {
        var _t = this;
        var mapName = mapName || _t.baseMapNames[2];

        var p = new Promise(function(resolve, reject) {

            // do a thing, possibly async, then…
            d3.json("assets/sfmaps/" + mapName + ".json", function(error, geojson) {
                if (error) {
                    //Mapper.js:82 SyntaxError: Unexpected end of JSON input(…)
                    // happens when a basemap fails to load.  need promises!

                    reject(error)
                    console.error(error);
                    return
                }
                geojson.name = mapName;
                _t.baseMapGeoJSON.push(geojson);
                resolve();
            });

        });

        return p
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
        })
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
        var routeListURL = 'http://webservices.nextbus.com/service/publicXMLFeed?command=routeList&a=sf-muni';

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

        var routeURL = 'http://webservices.nextbus.com/service/publicXMLFeed?command=routeConfig&a=sf-muni&r=' + tag;

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
        var vehicleLocationsURL = 'http://webservices.nextbus.com/service/publicXMLFeed?command=vehicleLocations&a=sf-muni&r=' + tag + '&t=' + epochTime;;

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

    drawVehicles: function(vehicles, tag) {
        var _t = this;
        if (!vehicles) {
            //console.log('no vehicles to draw')
            return;
        }
        var _t = this;

        var svgGroup;

        if (_t.vehicleGroups.hasOwnProperty(tag)) {
            svgGroup = d3.select('#route_' + tag)
        } else {
            svgGroup = _t.svg.append("g").attr('id', "route_" + tag);
        }
        _t.vehicleGroups[tag] = svgGroup;

        if (Array.isArray(vehicles) === false) {
            //nextbus will return a single vehicle object instead of an array with one object if there is only one. so we make our own array
            var temp = [];
            temp.push(vehicles);
            vehicles = temp;
        }

        var dotGroups = svgGroup.selectAll(".dot-group").data(vehicles, function(d) {
            return d['@attributes'].id;
        })

        dotGroups.exit().remove();

        dotGroups
            .transition()
            .attr("transform", function(d) {
                return "translate(" + _t.projection([
                    d['@attributes'].lon,
                    d['@attributes'].lat
                ]) + ")";
            })
            .duration(_t.refreshRate * 1000 / 2)

        var dotGroup = dotGroups.enter()
            .append("g")
            .attr('class', 'dot-group')
            .attr("transform", function(d) {
                return "translate(" + _t.projection([
                    d['@attributes'].lon,
                    d['@attributes'].lat
                ]) + ")";
            })

        dotGroup.append("circle")
            .call(_t.zoom.transform, _t.zoomTransform)
            .attr("r", "6")
            .attr("fill", getRandomHexColor())
            .attr("stroke", getRandomHexColor())
            .transition().attr("r", "12").duration(1000)
            .transition().attr("r", "8").duration(1000)

        dotGroup.append("text")
            .attr("stroke", "#fff")
            .attr('text-anchor', "middle")
            .attr('dy', '0.35em')
            .style("font-size", "8")
            .style('stroke-width', '1px')
            .style('paint-order', 'stroke')
            .attr("dx", 0)
            .text(function(d) {
                return d['@attributes'].routeTag
            })
            .transition().style("font-size", "12").duration(1000)
            .transition().style("font-size", "8").duration(1000)

        svgGroup.selectAll('.dot-group')
            .on('click', _t.clickVehicle)
            .on('mouseover', _t.mouseoverVehicle)
            //.on('mouseout', _t.mouseoutVehicle)

    },

    setupControls: function() {
        var _t = this;

        document.addEventListener("DOMContentLoaded", function() {
            // code…
            _t.fetchRouteList()
                .then(function(data) {
                    _t.updateControlOptions();
                })
                .catch(function(err) {
                    console.error('Error drawing all routes', err);
                });

        });
    },

    createControlOption: function(text, value) {
        var el = document.createElement('option');
        el.innerText = text;
        el.setAttribute('value', value);
        return el
    },

    updateControlOptions: function() {
        var _t = this;
        _t.routeSelector = document.getElementsByClassName('route-selector')[0];
        _t.clearControlOptions();
        var firstOption = _t.createControlOption('See Specific Routes', "");
        firstOption.setAttribute('disabled', true);
        firstOption.setAttribute('selected', true)
        _t.routeSelector.appendChild(firstOption);
        _t.routes.forEach(function(route) {
            var control = _t.createControlOption(route['@attributes'].title, route['@attributes'].tag)
            _t.routeSelector.appendChild(control);
        });
        $('.route-selector').material_select();
        $(".route-selector").on('change', function() {
            console.log($(this).val());
        });

    },

    clearControlOptions: function() {
        var _t = this;
        while (_t.routeSelector.hasChildNodes()) {
            _t.routeSelector.removeChild(_t.routeSelector.lastChild);
        }
    },

}


var liveMapper = new te_Mapper();

function getRandomHexColor() {
    return '#' + ("000000" + Math.random().toString(16).slice(2, 8).toUpperCase()).slice(-6);
}