function Mapper() {
    this.applyRuntimeConfig();
    this.setupDrawingSpace();
    this.setupControls();
    this.loadAllBaseMaps();
    this.lazyLoadStreetsBaseMap();
    this.initProtobuf();
}

Mapper.prototype = {
    refreshRate: 10,
    hiddenRefreshRate: 30,
    showAllRouteStepDelayMs: 18,
    refreshInterval: null,
    consecutiveRefreshErrors: 0,
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
    routePathGroups: {},
    zoomTransform: null,
    pendingZoomTransform: null,
    zoomFramePending: false,
    zoomStage: null,
    renderCanvas: null,
    renderContext: null,
    canvasDevicePixelRatio: 1,
    canvasRenderPending: false,
    labelVisibilityMinZoom: 1,
    headingVisibilityMinZoom: 1,
    vehicleLabelsVisible: false,
    vehicleHeadingsVisible: false,
    routes: [],
    routeColors: {},
    routeTileBackgroundColor: 'rgba(0,0,0,0.40)',
    activeRoutes: [],
    vehicleStore: {},
    vehicleCacheByRoute: {},
    vehicleCacheTimestampMs: 0,
    routePathGeometryByRoute: {},
    vehicleRenderDataByRoute: {},
    showAllActivationTimerIds: [],
    isProgressivelyShowingAllRoutes: false,
    myPositionGroup: null,
    apiBaseURL: '/api/511',
    operatorId: 'SF',
    gtfsRealtimeRoot: null, // Will hold the protobuf root for GTFS-realtime
    applyRuntimeConfig: function() {
        var _t = this;
        var runtimeConfig = window.PRETTYMUNI_CONFIG || {};

        if (runtimeConfig.operatorId && typeof runtimeConfig.operatorId === 'string') {
            _t.operatorId = runtimeConfig.operatorId;
        }

        if (runtimeConfig.apiBaseURL && typeof runtimeConfig.apiBaseURL === 'string') {
            _t.apiBaseURL = runtimeConfig.apiBaseURL;
        }
    },
    getProxyURL: function() {
        return 'proxy?url=';
    },

    isSecure: function() {
        var _t = this;
        if (window.location.protocol.indexOf('https:') > -1) {
            return _t.getProxyURL()
        } else {
            return ''
        }

    },

    initProtobuf: function() {
        var _t = this;
        
        // GTFS-realtime protobuf schema definition
        var gtfsRealtimeProto = {
            "nested": {
                "transit_realtime": {
                    "nested": {
                        "FeedMessage": {
                            "fields": {
                                "header": {"type": "FeedHeader", "id": 1, "rule": "required"},
                                "entity": {"type": "FeedEntity", "id": 2, "rule": "repeated"}
                            }
                        },
                        "FeedHeader": {
                            "fields": {
                                "gtfs_realtime_version": {"type": "string", "id": 1, "rule": "required"},
                                "timestamp": {"type": "uint64", "id": 3}
                            }
                        },
                        "FeedEntity": {
                            "fields": {
                                "id": {"type": "string", "id": 1, "rule": "required"},
                                "vehicle": {"type": "VehiclePosition", "id": 4}
                            }
                        },
                        "VehiclePosition": {
                            "fields": {
                                "trip": {"type": "TripDescriptor", "id": 1},
                                "vehicle": {"type": "VehicleDescriptor", "id": 8},
                                "position": {"type": "Position", "id": 2},
                                "timestamp": {"type": "uint64", "id": 5}
                            }
                        },
                        "TripDescriptor": {
                            "fields": {
                                "trip_id": {"type": "string", "id": 1},
                                "route_id": {"type": "string", "id": 5}
                            }
                        },
                        "VehicleDescriptor": {
                            "fields": {
                                "id": {"type": "string", "id": 1},
                                "label": {"type": "string", "id": 2}
                            }
                        },
                        "Position": {
                            "fields": {
                                "latitude": {"type": "float", "id": 1, "rule": "required"},
                                "longitude": {"type": "float", "id": 2, "rule": "required"},
                                "bearing": {"type": "float", "id": 3}
                            }
                        }
                    }
                }
            }
        };
        
        if (typeof protobuf === 'undefined') {
            console.error('protobuf library not loaded - vehicle positions will not work');
            return;
        }
        
        try {
            _t.gtfsRealtimeRoot = protobuf.Root.fromJSON(gtfsRealtimeProto);
            console.log('GTFS-realtime protobuf schema loaded successfully');
        } catch (e) {
            console.error('Failed to load GTFS-realtime protobuf schema:', e);
        }
    },

    setupDrawingSpace: function() {
        var _t = this;
        var width = window.innerWidth,
            height = window.innerHeight;

        _t.zoom = d3.zoom()
            .scaleExtent([1, 10])
            .filter(function() {
                if (!d3.event) {
                    return true;
                }
                // Keep wheel + mouse interactions for desktop zoom/pan.
                // Touch handlers are disabled to avoid non-passive touch warnings.
                return d3.event.type !== 'touchstart' &&
                    d3.event.type !== 'touchmove' &&
                    d3.event.type !== 'touchend';
            })
            .on("zoom", function() {
                _t.zoomed()
            })

        _t.svg = d3.select(".map-container").append("svg")
            .attr("preserveAspectRatio", "xMidYMid slice")
            .attr("viewBox", "0 0 " + width + " " + height)
            .classed("svg-content-responsive", true)
            .call(_t.zoom)
            .on("wheel.zoom", null)
            .on("touchstart.zoom", null)
            .on("touchmove.zoom", null)
            .on("touchend.zoom", null)

        _t.zoomStage = _t.svg.append("g").attr("id", "zoom-stage");
        _t.setupCanvasOverlay(width, height);
        _t.attachWheelZoomHandler();

        _t.projection = d3.geoMercator()
            .scale(_t.baseProjectionScale)
            .rotate([0, 0])
            .center(_t.baseMapCenter)
            .translate([width / 2, height / 2])

        _t.zoomTransform = d3.zoomIdentity;
        _t.applyZoomTransform(_t.zoomTransform);

    },

    zoomed: function() {
        var _t = this;
        _t.scheduleZoomTransform(d3.event.transform);
    },

    scheduleZoomTransform: function(transform) {
        var _t = this;
        _t.pendingZoomTransform = transform;
        _t.zoomTransform = transform;

        if (_t.zoomFramePending) {
            return;
        }
        _t.zoomFramePending = true;

        var raf = (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function')
            ? window.requestAnimationFrame.bind(window)
            : function(cb) {
                return setTimeout(cb, 16);
            };

        raf(function() {
            _t.zoomFramePending = false;
            if (_t.pendingZoomTransform) {
                _t.applyZoomTransform(_t.pendingZoomTransform);
            }
        });
    },

    applyZoomTransform: function(transform) {
        var _t = this;

        if (_t.zoomStage) {
            _t.zoomStage.attr("transform", transform);
        }

        var shouldShowLabels = !!(transform && typeof transform.k === 'number' && transform.k >= _t.labelVisibilityMinZoom);
        if (_t.vehicleLabelsVisible !== shouldShowLabels) {
            _t.vehicleLabelsVisible = shouldShowLabels;
            if (_t.svg) {
                _t.svg.selectAll('.dot-group text').style('display', shouldShowLabels ? null : 'none');
            }
        }

        var shouldShowHeadings = !!(transform && typeof transform.k === 'number' && transform.k >= _t.headingVisibilityMinZoom);
        if (_t.vehicleHeadingsVisible !== shouldShowHeadings) {
            _t.vehicleHeadingsVisible = shouldShowHeadings;
        }

        _t.requestCanvasRender();
    },

    setupCanvasOverlay: function(width, height) {
        var _t = this;
        var container = document.getElementsByClassName('map-container')[0];
        if (!container) {
            return;
        }

        var existingCanvas = container.querySelector('.map-canvas-overlay');
        if (existingCanvas) {
            _t.renderCanvas = existingCanvas;
        } else {
            _t.renderCanvas = document.createElement('canvas');
            _t.renderCanvas.className = 'map-canvas-overlay';
            container.appendChild(_t.renderCanvas);
        }

        _t.renderContext = _t.renderCanvas.getContext('2d', {
            alpha: true
        });
        _t.canvasDevicePixelRatio = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;

        _t.resizeCanvasOverlay(width, height);
        _t.requestCanvasRender();
    },

    resizeCanvasOverlay: function(width, height) {
        var _t = this;
        if (!_t.renderCanvas) {
            return;
        }

        var dpr = _t.canvasDevicePixelRatio || 1;
        _t.renderCanvas.style.width = width + 'px';
        _t.renderCanvas.style.height = height + 'px';
        _t.renderCanvas.width = Math.max(1, Math.floor(width * dpr));
        _t.renderCanvas.height = Math.max(1, Math.floor(height * dpr));
    },

    requestCanvasRender: function() {
        var _t = this;
        if (!_t.renderCanvas || !_t.renderContext) {
            return;
        }
        if (_t.canvasRenderPending) {
            return;
        }
        _t.canvasRenderPending = true;

        var raf = (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function')
            ? window.requestAnimationFrame.bind(window)
            : function(cb) {
                return setTimeout(cb, 16);
            };

        raf(function() {
            _t.canvasRenderPending = false;
            _t.renderCanvasLayers();
        });
    },

    renderCanvasLayers: function() {
        var _t = this;
        if (!_t.renderCanvas || !_t.renderContext) {
            return;
        }

        var ctx = _t.renderContext;
        var dpr = _t.canvasDevicePixelRatio || 1;
        var width = _t.renderCanvas.width;
        var height = _t.renderCanvas.height;
        var transform = _t.zoomTransform || d3.zoomIdentity;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, width, height);
        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.translate(transform.x || 0, transform.y || 0);
        ctx.scale(transform.k || 1, transform.k || 1);

        var viewportBounds = _t.getViewportBounds(transform, dpr, width, height);
        _t.renderRoutePathsOnCanvas(ctx, viewportBounds);
        _t.renderVehiclesOnCanvas(ctx, viewportBounds);

        ctx.restore();
    },

    getViewportBounds: function(transform, dpr, canvasWidthPx, canvasHeightPx) {
        var scale = (transform && transform.k) ? transform.k : 1;
        var tx = (transform && transform.x) ? transform.x : 0;
        var ty = (transform && transform.y) ? transform.y : 0;
        var width = canvasWidthPx / (dpr || 1);
        var height = canvasHeightPx / (dpr || 1);

        return {
            left: (-tx) / scale,
            right: (width - tx) / scale,
            top: (-ty) / scale,
            bottom: (height - ty) / scale
        };
    },

    isBoundsVisible: function(bounds, viewportBounds, padding) {
        if (!bounds || !viewportBounds) {
            return true;
        }
        var extra = typeof padding === 'number' ? padding : 0;
        if (bounds.maxX < viewportBounds.left - extra) {
            return false;
        }
        if (bounds.minX > viewportBounds.right + extra) {
            return false;
        }
        if (bounds.maxY < viewportBounds.top - extra) {
            return false;
        }
        if (bounds.minY > viewportBounds.bottom + extra) {
            return false;
        }
        return true;
    },

    renderRoutePathsOnCanvas: function(ctx, viewportBounds) {
        var _t = this;
        (_t.activeRoutes || []).forEach(function(routeTag) {
            var paths = _t.routePathGeometryByRoute[routeTag];
            if (!paths || paths.length === 0) {
                return;
            }

            var routeColor = _t.routeColors[routeTag] && _t.routeColors[routeTag].circle
                ? _t.routeColors[routeTag].circle.fill
                : '#ffffff';

            ctx.strokeStyle = routeColor;
            ctx.lineWidth = 1.5;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';

            paths.forEach(function(pathData) {
                var points = pathData && pathData.points ? pathData.points : pathData;
                var bounds = pathData && pathData.bounds ? pathData.bounds : null;

                if (!Array.isArray(points) || points.length < 2) {
                    return;
                }
                if (!_t.isBoundsVisible(bounds, viewportBounds, 80)) {
                    return;
                }
                ctx.beginPath();
                ctx.moveTo(points[0][0], points[0][1]);
                for (var i = 1; i < points.length; i++) {
                    ctx.lineTo(points[i][0], points[i][1]);
                }
                ctx.stroke();
            });
        });
    },

    renderVehiclesOnCanvas: function(ctx, viewportBounds) {
        var _t = this;
        var showLabels = _t.vehicleLabelsVisible;
        var showHeadings = _t.vehicleHeadingsVisible;

        (_t.activeRoutes || []).forEach(function(routeTag) {
            var vehicles = _t.vehicleRenderDataByRoute[routeTag];
            if (!vehicles || vehicles.length === 0) {
                return;
            }

            var colors = _t.routeColors[routeTag] || _t.generateRouteColors();

            vehicles.forEach(function(vehicle) {
                if (!vehicle) {
                    return;
                }
                var x = vehicle.x;
                var y = vehicle.y;
                if (!isFinite(x) || !isFinite(y)) {
                    return;
                }
                if (!_t.isBoundsVisible({
                        minX: x,
                        maxX: x,
                        minY: y,
                        maxY: y
                    }, viewportBounds, 40)) {
                    return;
                }

                ctx.beginPath();
                ctx.arc(x, y, 8, 0, Math.PI * 2);
                ctx.fillStyle = colors.circle.fill;
                ctx.fill();
                ctx.strokeStyle = colors.circle.stroke || 'black';
                ctx.lineWidth = 1;
                ctx.stroke();

                if (showHeadings) {
                    _t.drawVehicleHeadingArrowOnCanvas(ctx, x, y, vehicle.heading);
                }

                if (showLabels) {
                    ctx.font = '8px Fira Sans';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.lineWidth = 1;
                    ctx.strokeStyle = colors.text.stroke || 'black';
                    ctx.fillStyle = colors.text.fill || 'white';
                    ctx.strokeText(vehicle.routeTag || '', x, y);
                    ctx.fillText(vehicle.routeTag || '', x, y);
                }
            });
        });
    },

    drawVehicleHeadingArrowOnCanvas: function(ctx, x, y, heading) {
        var headingDeg = parseInt(heading, 10);
        if (isNaN(headingDeg)) {
            headingDeg = 0;
        }

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(headingDeg * Math.PI / 180);

        // Start near the outer edge of the vehicle dot and keep the arrow short/narrow.
        var shaftStartY = -5.1;
        var shaftEndY = -8.4;
        var tipY = -10.4;
        var headBaseY = -8.45;
        var headHalfWidth = 2.2;

        // Subtle short shadow for legibility without large overhang.
        ctx.shadowColor = 'rgba(0,0,0,0.25)';
        ctx.shadowBlur = 1.6;
        ctx.shadowOffsetX = 0.65;
        ctx.shadowOffsetY = 0.65;

        ctx.beginPath();
        ctx.moveTo(0, shaftStartY);
        ctx.lineTo(0, shaftEndY);
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = 2.0;
        ctx.lineCap = 'round';
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, shaftStartY);
        ctx.lineTo(0, shaftEndY);
        ctx.strokeStyle = 'rgba(255,255,255,0.98)';
        ctx.lineWidth = 1.2;
        ctx.lineCap = 'round';
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, tipY);
        ctx.lineTo(headHalfWidth, headBaseY);
        ctx.lineTo(-headHalfWidth, headBaseY);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,255,255,0.98)';
        ctx.fill();

        ctx.restore();
    },

    attachWheelZoomHandler: function() {
        var _t = this;
        if (!_t.svg || !_t.zoom) {
            return;
        }

        var svgNode = _t.svg.node();
        if (!svgNode || typeof svgNode.addEventListener !== 'function') {
            return;
        }

        if (_t.onWheelZoom) {
            svgNode.removeEventListener('wheel', _t.onWheelZoom);
        }

        _t.onWheelZoom = function(event) {
            if (!event) {
                return;
            }

            event.preventDefault();

            var rect = svgNode.getBoundingClientRect();
            var point = [
                event.clientX - rect.left,
                event.clientY - rect.top
            ];

            var scaleFactor = Math.pow(2, -event.deltaY * (event.deltaMode ? 120 : 1) / 500);
            _t.svg.call(_t.zoom.scaleBy, scaleFactor, point);
        };

        svgNode.addEventListener('wheel', _t.onWheelZoom, {
            passive: false
        });
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
        var parent = _t.zoomStage || _t.svg;
        var svgGroup = parent.append("g").attr('id', 'layer_streets')

        var geoPath = d3.geoPath()
            .projection(_t.projection);

        svgGroup.selectAll("path")
            .data(geojson.features)
            .enter()
            .append("path")
            .style("fill", getRandomHexColor())
            .style("stroke", getRandomHexColor())
            .attr("d", geoPath)

        var streetsLayer = document.getElementById('layer_streets');
        var stageNode = _t.zoomStage ? _t.zoomStage.node() : null;
        if (stageNode && streetsLayer) {
            stageNode.insertBefore(streetsLayer, stageNode.children[1] || null);
        }

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
        var parent = _t.zoomStage || _t.svg;
        var svgGroup = parent.append("g").attr('id', 'layer_' + mapName)

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

    sortRoutesForDisplay: function(routes) {
        var routeList = Array.isArray(routes) ? routes.slice() : [];
        var collator = (typeof Intl !== 'undefined' && typeof Intl.Collator === 'function')
            ? new Intl.Collator('en', {
                numeric: true,
                sensitivity: 'base'
            })
            : null;

        function getTag(route) {
            return ((route && route['@attributes'] && route['@attributes'].tag) || '').trim();
        }

        function getTitle(route) {
            return ((route && route['@attributes'] && route['@attributes'].title) || '').trim();
        }

        function groupForTag(tag) {
            if (/^[A-Za-z]/.test(tag)) {
                return 0; // Alphabetic routes first, A-Z
            }
            if (/^[0-9]/.test(tag)) {
                return 1; // Numeric routes after letters, ascending
            }
            return 2;
        }

        routeList.sort(function(a, b) {
            var aTag = getTag(a);
            var bTag = getTag(b);

            var groupDelta = groupForTag(aTag) - groupForTag(bTag);
            if (groupDelta !== 0) {
                return groupDelta;
            }

            var tagDelta = collator
                ? collator.compare(aTag, bTag)
                : aTag.localeCompare(bTag);
            if (tagDelta !== 0) {
                return tagDelta;
            }

            var aTitle = getTitle(a);
            var bTitle = getTitle(b);
            return collator
                ? collator.compare(aTitle, bTitle)
                : aTitle.localeCompare(bTitle);
        });

        return routeList;
    },



    fetchRouteList: function() {
        var _t = this;

        var routeListURL = _t.apiBaseURL + '/lines?operator_id=' + encodeURIComponent(_t.operatorId);

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
                        try {
                            var routes = JSON.parse(xhr.responseText);
                            // Transform 511 API format to match old format
                            var normalizedRoutes = routes.map(function(route) {
                                return {
                                    '@attributes': {
                                        tag: route.PublicCode,
                                        title: route.Name
                                    }
                                };
                            });
                            _t.routes = _t.sortRoutesForDisplay(normalizedRoutes);
                            resolve({ body: { route: _t.routes } });
                        } catch (e) {
                            reject('Failed to parse route list: ' + e.message);
                        }
                    } else {
                        reject(new Error('Route list HTTP ' + xhr.status + ': ' + xhr.statusText));
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

        // Use 511 patterns API to get route patterns and stops
        var patternsURL = _t.apiBaseURL + '/patterns?operator_id=' + encodeURIComponent(_t.operatorId) + '&line_id=' + encodeURIComponent(tag);

        var p = new Promise(function(resolve, reject) {
            // Fetch both patterns and stop coordinates in parallel
            Promise.all([
                new Promise(function(patternsResolve, patternsReject) {
                    var xhr = new XMLHttpRequest();
                    xhr.open('GET', patternsURL);
                    xhr.send(null);
                    xhr.onerror = patternsReject;
                    xhr.onreadystatechange = function() {
                        var DONE = 4;
                        var OK = 200;
                        if (xhr.readyState === DONE) {
                            if (xhr.status === OK) {
                                try {
                                    var patterns = JSON.parse(xhr.responseText);
                                    patternsResolve(patterns);
                                } catch (e) {
                                    patternsReject(e);
                                }
                            } else {
                                patternsReject(new Error('Patterns HTTP ' + xhr.status + ': ' + xhr.statusText));
                            }
                        }
                    };
                }),
                _t.fetchStopCoordinates(tag)
            ]).then(function(results) {
                var patterns = results[0];
                var stopCoordinates = results[1];
                
                console.log('Patterns data for route ' + tag + ':', patterns);
                console.log('Stop coordinates for route ' + tag + ':', stopCoordinates);
                
                // Generate route paths from patterns and stop coordinates
                var routePaths = _t.generateRoutePathsFromStops(patterns, stopCoordinates, tag);
                
                resolve({ 
                    body: { 
                        route: { 
                            '@attributes': { tag: tag },
                            patterns: patterns,
                            stopCoordinates: stopCoordinates,
                            path: routePaths // Create compatible path structure for existing drawRoutePath function
                        } 
                    } 
                });
            }).catch(function(error) {
                console.error('Error fetching route data:', error);
                reject(error);
            });
        });

        return p;
    },

    fetchStopCoordinates: function(tag) {
        var _t = this;
        var stopsURL = _t.apiBaseURL + '/stops?operator_id=' + encodeURIComponent(_t.operatorId) + '&line_id=' + encodeURIComponent(tag);

        var p = new Promise(function(resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', stopsURL);
            xhr.responseType = 'text';
            xhr.send(null);
            xhr.onerror = reject;
            xhr.onreadystatechange = function() {
                var DONE = 4;
                var OK = 200;
                if (xhr.readyState === DONE) {
                    if (xhr.status === OK) {
                        try {
                            var stopsData = JSON.parse(xhr.responseText);
                            console.log('Stops data for route ' + tag + ':', stopsData);
                            
                            // Create a lookup table of stop coordinates by stop ID
                            var stopCoordinates = {};
                            if (stopsData && stopsData.Contents && stopsData.Contents.dataObjects && 
                                stopsData.Contents.dataObjects.ScheduledStopPoint) {
                                var stops = stopsData.Contents.dataObjects.ScheduledStopPoint;
                                // Handle both single stop and array of stops
                                if (!Array.isArray(stops)) {
                                    stops = [stops];
                                }
                                stops.forEach(function(stop) {
                                    if (stop.Location && stop.Location.Longitude && stop.Location.Latitude) {
                                        stopCoordinates[stop.id] = {
                                            lat: parseFloat(stop.Location.Latitude),
                                            lon: parseFloat(stop.Location.Longitude),
                                            name: stop.Name || stop.id
                                        };
                                    }
                                });
                            }
                            
                            resolve(stopCoordinates);
                        } catch (e) {
                            console.error('Error parsing stops data:', e);
                            reject(e);
                        }
                    } else {
                        console.error('Failed to fetch stops:', xhr.status, xhr.statusText);
                        reject(new Error('HTTP ' + xhr.status + ': ' + xhr.statusText));
                    }
                }
            };
        });

        return p;
    },

    generateRoutePathsFromStops: function(patterns, stopCoordinates, tag) {
        var _t = this;
        var routePaths = [];

        try {
            if (!patterns) {
                console.log('No patterns data available for route ' + tag);
                return routePaths;
            }

            var journeyPatterns = patterns.journeyPatterns || (
                patterns.Contents &&
                patterns.Contents.dataObjects &&
                patterns.Contents.dataObjects.ServiceJourneyPattern
            );

            if (!journeyPatterns) {
                console.log('No patterns data available for route ' + tag);
                return routePaths;
            }

            if (!Array.isArray(journeyPatterns)) {
                journeyPatterns = [journeyPatterns];
            }

            journeyPatterns.forEach(function(pattern) {
                var pointsInSequence = pattern.PointsInSequence || pattern.pointsInSequence || {};
                var stopPoints = pointsInSequence.StopPointInJourneyPattern;
                var timingPoints = pointsInSequence.TimingPointInJourneyPattern;

                var points = [];
                if (Array.isArray(stopPoints)) {
                    points = points.concat(stopPoints);
                } else if (stopPoints && typeof stopPoints === 'object') {
                    points.push(stopPoints);
                }

                if (Array.isArray(timingPoints)) {
                    points = points.concat(timingPoints);
                } else if (timingPoints && typeof timingPoints === 'object') {
                    points.push(timingPoints);
                }

                if (points.length === 0) {
                    return;
                }

                points.sort(function(a, b) {
                    var orderA = parseInt(a.Order || a.order || 0, 10);
                    var orderB = parseInt(b.Order || b.order || 0, 10);
                    return orderA - orderB;
                });

                var pathPoints = [];
                points.forEach(function(pointInPattern) {
                    var stopId = pointInPattern.ScheduledStopPointRef;
                    if (stopId && stopCoordinates[stopId]) {
                        pathPoints.push({
                            '@attributes': {
                                lat: stopCoordinates[stopId].lat,
                                lon: stopCoordinates[stopId].lon
                            }
                        });
                    }
                });

                if (pathPoints.length >= 2) {
                    routePaths.push({
                        point: pathPoints
                    });
                }
            });

            console.log('Generated ' + routePaths.length + ' route paths for route ' + tag);
            return routePaths;

        } catch (error) {
            console.error('Error generating route paths from stops:', error);
            return routePaths;
        }
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
        var routeTag = route['@attributes'].tag;

        // Check if we have paths to draw
        if (!allPaths || allPaths.length === 0) {
            console.log('No route paths available for route', routeTag);
            delete _t.routePathGroups[routeTag];
            delete _t.routePathGeometryByRoute[routeTag];
            _t.requestCanvasRender();
            return;
        }

        var projectedPaths = allPaths
            .map(function(path) {
                return _t.buildProjectedPolyline(path);
            })
            .filter(function(points) {
                return points && Array.isArray(points.points) && points.points.length >= 2;
            });

        _t.routePathGeometryByRoute[routeTag] = projectedPaths;
        _t.requestCanvasRender();

    },

    buildProjectedPolyline: function(path) {
        var _t = this;
        if (!path || !Array.isArray(path.point) || path.point.length < 2) {
            return null;
        }

        var points = [];
        path.point.forEach(function(point, index) {
            var attrs = point && point['@attributes'];
            if (!attrs) {
                return;
            }
            var projectedPoint = _t.projection([attrs.lon, attrs.lat]);
            if (!projectedPoint || !isFinite(projectedPoint[0]) || !isFinite(projectedPoint[1])) {
                return;
            }

            points.push(projectedPoint);
        });

        if (points.length < 2) {
            return null;
        }

        return {
            points: points,
            bounds: _t.buildPolylineBounds(points)
        };
    },

    buildPolylineBounds: function(points) {
        if (!Array.isArray(points) || points.length === 0) {
            return null;
        }

        var minX = points[0][0];
        var maxX = points[0][0];
        var minY = points[0][1];
        var maxY = points[0][1];

        for (var i = 1; i < points.length; i++) {
            var point = points[i];
            if (!point) {
                continue;
            }
            if (point[0] < minX) {
                minX = point[0];
            }
            if (point[0] > maxX) {
                maxX = point[0];
            }
            if (point[1] < minY) {
                minY = point[1];
            }
            if (point[1] > maxY) {
                maxY = point[1];
            }
        }

        return {
            minX: minX,
            maxX: maxX,
            minY: minY,
            maxY: maxY
        };
    },

    buildCanvasVehicleData: function(vehicles) {
        var _t = this;
        if (!Array.isArray(vehicles) || vehicles.length === 0) {
            return [];
        }

        return vehicles.reduce(function(acc, vehicle) {
            var attrs = vehicle && vehicle['@attributes'];
            if (!attrs) {
                return acc;
            }

            var projectedPoint = _t.projection([attrs.lon, attrs.lat]);
            if (!projectedPoint || !isFinite(projectedPoint[0]) || !isFinite(projectedPoint[1])) {
                return acc;
            }

            acc.push({
                id: attrs.id || '',
                routeTag: attrs.routeTag || '',
                heading: attrs.heading || '0',
                x: projectedPoint[0],
                y: projectedPoint[1]
            });
            return acc;
        }, []);
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

    fetchVehicleLocations: function() {
        var _t = this;
        var vehicleLocationsURL = _t.apiBaseURL + '/vehiclepositions?agency=' + encodeURIComponent(_t.operatorId);

        var p = new Promise(function(resolve, reject) {
            if (!_t.gtfsRealtimeRoot) {
                reject(new Error('GTFS-realtime protobuf schema not loaded'));
                return;
            }

            var xhr = new XMLHttpRequest();
            xhr.open('GET', vehicleLocationsURL);
            xhr.responseType = 'arraybuffer';
            xhr.send(null);
            xhr.onerror = reject;

            xhr.onreadystatechange = function() {
                var DONE = 4;
                var OK = 200;
                if (xhr.readyState === DONE) {
                    if (xhr.status === OK) {
                        try {
                            var FeedMessage = _t.gtfsRealtimeRoot.lookupType('transit_realtime.FeedMessage');
                            var buffer = new Uint8Array(xhr.response);
                            var message = FeedMessage.decode(buffer);
                            var vehicles = _t.transformGTFSVehiclesToOldFormat(message);
                            resolve({ body: { vehicle: vehicles } });
                        } catch (e) {
                            reject(new Error('Failed to parse GTFS-realtime data: ' + e.message));
                        }
                    } else {
                        reject(new Error('Vehicle positions HTTP ' + xhr.status + ': ' + xhr.statusText));
                    }
                }
            };
        });

        return p;
    },

    coerceProtoNumber: function(value) {
        if (value === null || typeof value === 'undefined') {
            return 0;
        }
        if (typeof value === 'number') {
            return value;
        }
        if (typeof value === 'string') {
            var parsed = Number(value);
            return isNaN(parsed) ? 0 : parsed;
        }
        if (typeof value.toNumber === 'function') {
            return value.toNumber();
        }
        var coerced = Number(value);
        return isNaN(coerced) ? 0 : coerced;
    },

    transformGTFSVehiclesToOldFormat: function(feedMessage) {
        var _t = this;
        var vehicles = [];

        if (!feedMessage.entity) {
            return vehicles;
        }

        feedMessage.entity.forEach(function(entity) {
            if (entity.vehicle && entity.vehicle.position) {
                var vehicle = entity.vehicle;
                var position = vehicle.position;
                var routeId = null;
                if (vehicle.trip && vehicle.trip.route_id) {
                    routeId = vehicle.trip.route_id;
                } else if (vehicle.trip && vehicle.trip.trip_id) {
                    var tripParts = vehicle.trip.trip_id.split('_');
                    if (tripParts.length > 0) {
                        routeId = tripParts[0];
                    }
                }

                var vehicleTimestampSeconds = _t.coerceProtoNumber(vehicle.timestamp);
                var secondsSinceReport = 0;
                if (vehicleTimestampSeconds > 0) {
                    secondsSinceReport = Math.max(0, Math.floor((Date.now() / 1000) - vehicleTimestampSeconds));
                }

                var transformedVehicle = {
                    '@attributes': {
                        id: vehicle.vehicle ? vehicle.vehicle.id || entity.id : entity.id,
                        routeTag: routeId ? routeId.toString().toUpperCase() : 'UNKNOWN',
                        dirTag: 'unknown',
                        lat: position.latitude.toString(),
                        lon: position.longitude.toString(),
                        secsSinceReport: secondsSinceReport,
                        predictable: 'true',
                        heading: position.bearing ? Math.round(position.bearing).toString() : '0',
                        speedKmHr: '0'
                    }
                };

                vehicles.push(transformedVehicle);
            }
        });

        return vehicles;
    },

    groupVehiclesByRoute: function(vehicles) {
        var _t = this;
        return vehicles.reduce(function(acc, vehicle) {
            var routeTag = _t.normalizeRouteTag(vehicle['@attributes'].routeTag);
            if (!routeTag) {
                return acc;
            }
            if (!acc.hasOwnProperty(routeTag)) {
                acc[routeTag] = [];
            }
            acc[routeTag].push(vehicle);
            return acc;
        }, {});
    },

    normalizeRouteTag: function(routeTag) {
        if (!routeTag) {
            return '';
        }
        return routeTag.toString().toUpperCase().trim();
    },

    routeTagMatches: function(selectedTag, vehicleTag) {
        var normalizedSelected = this.normalizeRouteTag(selectedTag);
        var normalizedVehicle = this.normalizeRouteTag(vehicleTag);

        if (!normalizedSelected || !normalizedVehicle) {
            return false;
        }

        if (normalizedSelected === normalizedVehicle) {
            return true;
        }

        // 511 vehicle feeds often collapse rapid variants (e.g. 14R -> 14).
        if (normalizedSelected.endsWith('R') && normalizedSelected.slice(0, -1) === normalizedVehicle) {
            return true;
        }

        if (normalizedVehicle.endsWith('R') && normalizedVehicle.slice(0, -1) === normalizedSelected) {
            return true;
        }

        return false;
    },

    pruneVehicleStoreByActiveFeed: function(vehicles) {
        var _t = this;
        var activeVehicleIds = {};

        (vehicles || []).forEach(function(vehicle) {
            var attrs = vehicle && vehicle['@attributes'];
            if (attrs && attrs.id) {
                activeVehicleIds[attrs.id] = true;
            }
        });

        Object.keys(_t.vehicleStore).forEach(function(vehicleId) {
            if (!activeVehicleIds[vehicleId]) {
                delete _t.vehicleStore[vehicleId];
            }
        });
    },

    resolveVehiclesForRoute: function(tag, groupedVehiclesByRoute, perRefreshCache) {
        var _t = this;
        var normalizedTag = _t.normalizeRouteTag(tag);
        if (!normalizedTag) {
            return [];
        }

        var cache = perRefreshCache || {};
        if (cache.hasOwnProperty(normalizedTag)) {
            return cache[normalizedTag];
        }

        var groupedVehicles = groupedVehiclesByRoute || {};
        var directMatch = groupedVehicles[normalizedTag];
        if (Array.isArray(directMatch) && directMatch.length > 0) {
            cache[normalizedTag] = directMatch;
            return directMatch;
        }

        var matchedVehicles = [];
        Object.keys(groupedVehicles).forEach(function(vehicleTag) {
            if (_t.routeTagMatches(normalizedTag, vehicleTag)) {
                matchedVehicles = matchedVehicles.concat(groupedVehicles[vehicleTag]);
            }
        });

        cache[normalizedTag] = matchedVehicles;
        return matchedVehicles;
    },

    drawSetOfRoutes: function(routeSet) {
        var _t = this;
        return _t.fetchVehicleLocations()
            .then(function(locations) {
                var allVehicles = locations.body && locations.body.vehicle ? locations.body.vehicle : [];
                _t.vehicleCacheByRoute = _t.groupVehiclesByRoute(allVehicles);
                _t.vehicleCacheTimestampMs = Date.now();
                _t.pruneVehicleStoreByActiveFeed(allVehicles);
                var resolvedVehiclesCache = {};

                routeSet.forEach(function(route) {
                    _t.drawVehiclesForRoute(route, _t.vehicleCacheByRoute, resolvedVehiclesCache);
                });
            });
    },

    drawVehiclesForRoute: function(tag, groupedVehiclesByRoute, resolvedVehiclesCache) {
        var _t = this;
        var tag = tag || '5';
        tag = _t.normalizeRouteTag(tag);
        var groupedVehicles = groupedVehiclesByRoute || _t.vehicleCacheByRoute || {};
        var vehiclesForRoute = _t.resolveVehiclesForRoute(tag, groupedVehicles, resolvedVehiclesCache || {});

        _t.drawVehicles(vehiclesForRoute, tag);
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

        if (Array.isArray(vehicles) === false) {
            //nextbus will return a single vehicle object instead of an array with one object if there is only one. so we make our own array
            var temp = [];
            temp.push(vehicles);
            vehicles = temp;
        }

        var predictableVehicles = _t.filterPredictableVehicles(vehicles);

        // Store latest predictable vehicles so next refresh can compute deltas.
        predictableVehicles.forEach(function(vehicle) {
            _t.vehicleStore[vehicle['@attributes'].id] = vehicle;
        });
        _t.vehicleGroups[tag] = predictableVehicles;
        _t.vehicleRenderDataByRoute[tag] = _t.buildCanvasVehicleData(predictableVehicles);
        _t.requestCanvasRender();
    },

    dropPath: function(d) {
        var dropPath = "M15 6 Q 15 6, 25 18 A 12.8 12.8 0 1 1 5 18 Q 15 6 15 6z";
        return dropPath;
    },

    placeHeadingDrop: function(d) {
        var heading = d['@attributes'].heading;
        var radianHeading = Math.radians(heading);
        var y = 9 * -Math.cos(radianHeading) + 0;
        var x = 9 * Math.sin(radianHeading) + 0;
        return "translate(" + x + "," + y + ")rotate(" + heading + ")scale(0.45)translate(-15,-18)";
    },

    translateHeadingDot: function(d) {
        var heading = d['@attributes'].heading;
        var radianHeading = Math.radians(heading);
        var y = 9 * -Math.cos(radianHeading) + 0
        var x = 9 * Math.sin(radianHeading) + 0
        return "translate(" + x + "," + y + ")";
    },

    rotateHeadingNeedle: function(d) {
        var heading = parseInt(d['@attributes'].heading, 10);
        if (isNaN(heading)) {
            heading = 0;
        }
        return "rotate(" + heading + ")";
    },

    setupControls: function() {
        var _t = this;

        _t.fetchRouteList()
            .then(function(data) {
                _t.updateControlOptions();
                _t.generateColorsForAllRoutes();
                _t.makeRouteSelectorButtonsSticky();
                _t.refreshActiveRoutes();
                _t.updateToggleAllRoutesButtonLabel();
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
        routeTitle.innerText = routeProps.tag + ' ' + routeProps.title;
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
        _t.populateRouteSearchOptions();
    },

    createControlButtons: function() {
        var _t = this;

        var clearButtonHolder = document.getElementsByClassName('clear-all-button-holder')[0];
        var closeRouteSelectorButtonHolder = document.getElementsByClassName('close-route-selector-button-holder')[0];
        closeRouteSelectorButtonHolder.classList.add('close-route-selector-button-holder');

        var showRouteSelectorButtonHolder = document.getElementsByClassName('show-route-selector-button-holder')[0];
        var toggleAllRoutesButtonHolder = document.getElementsByClassName('toggle-all-routes-button-holder')[0];
        var routeSearchInput = document.getElementsByClassName('route-search-input')[0];
        var routeSearchOptions = document.getElementById('route-search-options');
        var routeSearchHolder = document.getElementsByClassName('route-search-holder')[0];

        var buttonOverlay = document.getElementsByClassName('button-overlay-container')[0];

        _t.buttonOverlay = buttonOverlay;
        _t.toggleAllRoutesButtonHolder = toggleAllRoutesButtonHolder;
        _t.routeSearchInput = routeSearchInput;
        _t.routeSearchOptions = routeSearchOptions;
        _t.routeSearchHolder = routeSearchHolder;

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

        if (toggleAllRoutesButtonHolder) {
            toggleAllRoutesButtonHolder.onclick = function() {
                _t.toggleAllRoutesQuick();
                return false;
            }
        }

        if (routeSearchInput) {
            routeSearchInput.onchange = function() {
                _t.handleRouteSearchSelection(routeSearchInput.value);
            };

            routeSearchInput.onkeydown = function(e) {
                if (e.key === 'Enter') {
                    _t.handleRouteSearchSelection(routeSearchInput.value);
                    e.preventDefault();
                    return false;
                }
            };
        }
    },

    populateRouteSearchOptions: function() {
        var _t = this;
        if (!_t.routeSearchOptions) {
            return;
        }

        while (_t.routeSearchOptions.firstChild) {
            _t.routeSearchOptions.removeChild(_t.routeSearchOptions.firstChild);
        }

        _t.routes.forEach(function(route) {
            var attrs = route['@attributes'];
            var option = document.createElement('option');
            option.value = attrs.tag + ' ' + attrs.title;
            _t.routeSearchOptions.appendChild(option);
        });
    },

    findRouteTagFromSearchInput: function(rawValue) {
        var _t = this;
        var value = (rawValue || '').trim();
        if (!value) {
            return null;
        }

        var upper = value.toUpperCase();
        var firstToken = upper.split(/\s+/)[0];

        var exactTag = _t.routes.find(function(route) {
            return route['@attributes'].tag.toUpperCase() === upper;
        });
        if (exactTag) {
            return exactTag['@attributes'].tag;
        }

        var firstTokenMatch = _t.routes.find(function(route) {
            return route['@attributes'].tag.toUpperCase() === firstToken;
        });
        if (firstTokenMatch) {
            return firstTokenMatch['@attributes'].tag;
        }

        var titleMatch = _t.routes.find(function(route) {
            var title = route['@attributes'].title || '';
            return title.toUpperCase().indexOf(upper) > -1;
        });

        if (titleMatch) {
            return titleMatch['@attributes'].tag;
        }

        return null;
    },

    handleRouteSearchSelection: function(rawValue) {
        var _t = this;
        var routeTag = _t.findRouteTagFromSearchInput(rawValue);
        if (!routeTag) {
            return;
        }

        var tile = _t.getRouteTileByTag(routeTag);
        if (!tile) {
            return;
        }

        if (_t.activeRoutes.indexOf(routeTag) === -1) {
            _t.toggleRoute(routeTag, tile);
        }

        if (_t.routeSearchInput) {
            _t.routeSearchInput.value = '';
        }
    },

    getRouteTileByTag: function(routeTag) {
        return document.querySelector('.route-selector-tile[value="' + routeTag + '"]');
    },

    updateToggleAllRoutesButtonLabel: function() {
        var _t = this;
        if (!_t.toggleAllRoutesButtonHolder) {
            return;
        }
        var label = _t.toggleAllRoutesButtonHolder.querySelector('.toggle-all-routes-button');
        if (!label) {
            return;
        }

        var totalRoutes = _t.routes.length;
        var allActive = _t.isProgressivelyShowingAllRoutes || (totalRoutes > 0 && _t.activeRoutes.length >= totalRoutes);
        label.innerText = allActive ? 'Hide All Routes' : 'Show All Routes';
    },

    cancelProgressiveShowAllRoutes: function() {
        var _t = this;
        if (Array.isArray(_t.showAllActivationTimerIds)) {
            _t.showAllActivationTimerIds.forEach(function(timerId) {
                clearTimeout(timerId);
            });
        }
        _t.showAllActivationTimerIds = [];
        _t.isProgressivelyShowingAllRoutes = false;
    },

    activateAllRoutesQuick: function() {
        var _t = this;
        _t.cancelProgressiveShowAllRoutes();

        var allRouteTags = _t.routes.map(function(route) {
            return route['@attributes'].tag;
        });

        if (allRouteTags.length === 0) {
            return;
        }

        _t.activeRoutes = [];
        _t.isProgressivelyShowingAllRoutes = true;
        _t.updateToggleAllRoutesButtonLabel();
        _t.trackEvent({
            hitType: 'event',
            eventCategory: 'Route Selection',
            eventAction: 'Show All Routes'
        });

        allRouteTags.forEach(function(routeTag, index) {
            var timerId = setTimeout(function() {
                if (_t.activeRoutes.indexOf(routeTag) === -1) {
                    _t.activeRoutes.push(routeTag);
                }

                var tile = _t.getRouteTileByTag(routeTag);
                if (tile) {
                    tile.classList.add('active');
                    tile.style.backgroundColor = _t.routeColors[routeTag].circle.fill;
                }

                var lastIndex = allRouteTags.length - 1;
                if (index === lastIndex) {
                    _t.cancelProgressiveShowAllRoutes();
                    _t.activeRoutes = allRouteTags.slice();
                    _t.updateToggleAllRoutesButtonLabel();
                    _t.drawSetOfRoutes(_t.activeRoutes)
                        .catch(function(err) {
                            console.error('Error drawing all routes', err);
                        });
                }
            }, index * _t.showAllRouteStepDelayMs);

            _t.showAllActivationTimerIds.push(timerId);
        });
    },

    toggleAllRoutesQuick: function() {
        var _t = this;
        var totalRoutes = _t.routes.length;
        var allActive = _t.isProgressivelyShowingAllRoutes || (totalRoutes > 0 && _t.activeRoutes.length >= totalRoutes);

        if (allActive) {
            _t.cancelProgressiveShowAllRoutes();
            _t.clearAll();
            _t.trackEvent({
                hitType: 'event',
                eventCategory: 'Route Selection',
                eventAction: 'Hide All Routes'
            });
        } else {
            _t.activateAllRoutesQuick();
        }
    },

    trackEvent: function(payload) {
        if (typeof window.ga === 'function') {
            window.ga('send', payload);
        }
        if (typeof window.plausible === 'function' && payload) {
            window.plausible(payload.eventAction || 'Pretty Muni Event', {
                props: {
                    category: payload.eventCategory || '',
                    label: payload.eventLabel || ''
                }
            });
        }
    },

    hideRouteSelector: function() {
        var _t = this;
        _t.routeSelector.style.display = "none";
        _t.buttonOverlay.style.display = "flex";
        _t.trackEvent({
            hitType: 'event',
            eventCategory: 'Route Selection',
            eventAction: 'Close Route Selector (Show Map)',
        });
    },

    showRouteSelector: function() {
        var _t = this;
        _t.routeSelector.style.display = "inline-block";
        _t.buttonOverlay.style.display = "none";
        _t.trackEvent({
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
            _t.trackEvent({
                hitType: 'event',
                eventCategory: 'Route Selection',
                eventAction: 'Hide Route',
                eventLabel: value
            });

        } else {
            el.classList.add('active')
            _t.makeRouteActive(value, el)
            _t.trackEvent({
                hitType: 'event',
                eventCategory: 'Route Selection',
                eventAction: 'Show Route',
                eventLabel: value
            });

        }
    },

    makeRouteActive: function(route, el) {
        var _t = this;
        if (_t.activeRoutes.indexOf(route) === -1) {
            _t.activeRoutes.push(route);
        }
        _t.fetchRoute(route).then(function(routeData) {
            var routeResponse = routeData && routeData.body && routeData.body.route ? routeData.body.route : null;
            if (routeResponse) {
                _t.drawRoutePath(routeResponse);
            }
            return _t.drawSetOfRoutes([route]);
        }).catch(function(err) {
            console.error('Error activating route ' + route + ':', err);
        });
        window.el = el;
        el.style.backgroundColor = _t.routeColors[route].circle.fill;
        _t.updateToggleAllRoutesButtonLabel();
    },

    makeRouteInactive: function(route, el) {
        var _t = this;
        if (el) {
            el.style.backgroundColor = _t.routeTileBackgroundColor;
        }
        d3.select('#route_' + route).remove();
        d3.select('#routePath_' + route).remove();
        delete _t.vehicleGroups[route];
        delete _t.routePathGroups[route];
        delete _t.vehicleRenderDataByRoute[route];
        delete _t.routePathGeometryByRoute[route];
        var index = _t.activeRoutes.indexOf(route);
        if (index !== -1) {
            _t.activeRoutes.splice(index, 1);
        }
        _t.requestCanvasRender();
        _t.updateToggleAllRoutesButtonLabel();
    },

    refreshActiveRoutes: function() {
        var _t = this;
        if (_t.refreshInterval !== null) {
            clearTimeout(_t.refreshInterval);
        }
        var baseDelayMs = _t.refreshRate * 1000;
        var hiddenDelayMs = Math.max(_t.hiddenRefreshRate * 1000, baseDelayMs);

        var scheduleNextRefresh = function(delayMs) {
            _t.refreshInterval = setTimeout(function() {
                if (typeof document !== 'undefined' && document.hidden) {
                    scheduleNextRefresh(hiddenDelayMs);
                    return;
                }

                if (_t.activeRoutes.length === 0) {
                    _t.consecutiveRefreshErrors = 0;
                    scheduleNextRefresh(baseDelayMs);
                    return;
                }

                _t.trackEvent({
                    hitType: 'event',
                    eventCategory: 'Active Route Refresh',
                    eventAction: 'Refresh',
                    eventLabel: _t.activeRoutes.toString()
                });

                _t.drawSetOfRoutes(_t.activeRoutes)
                    .then(function() {
                        _t.consecutiveRefreshErrors = 0;
                        scheduleNextRefresh(baseDelayMs);
                    })
                    .catch(function(err) {
                        _t.consecutiveRefreshErrors += 1;
                        var backoffDelayMs = Math.min(baseDelayMs * Math.pow(2, _t.consecutiveRefreshErrors), 60000);
                        console.error('Refresh failed, backing off to ' + backoffDelayMs + 'ms', err);
                        scheduleNextRefresh(backoffDelayMs);
                    });
            }, delayMs);
        };

        scheduleNextRefresh(baseDelayMs);
    },

    clearAll: function(e) {
        var _t = this;
        _t.cancelProgressiveShowAllRoutes();
        d3.selectAll(".route-group").remove();
        d3.selectAll('.route-path').remove();
        _t.activeRoutes = [];
        _t.vehicleGroups = {};
        _t.routePathGroups = {};
        _t.vehicleRenderDataByRoute = {};
        _t.routePathGeometryByRoute = {};
        _t.vehicleStore = {};
        _t.routeColors = {};
        _t.vehicleCacheByRoute = {};
        _t.vehicleCacheTimestampMs = 0;
        _t.consecutiveRefreshErrors = 0;
        _t.generateColorsForAllRoutes();
        var activeTiles = document.querySelectorAll(".route-selector-tile.active");

        [].forEach.call(activeTiles, function(el) {
            el.classList.remove("active");
            el.style.backgroundColor = _t.routeTileBackgroundColor;
        });

        _t.trackEvent({
            hitType: 'event',
            eventCategory: 'Route Selection',
            eventAction: 'Clear',
        });
        _t.requestCanvasRender();
        _t.updateToggleAllRoutesButtonLabel();
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
        var toggleAllRoutesButtonHolder = document.getElementsByClassName('toggle-all-routes-button-holder')[0];
        var routeSearchHolder = document.getElementsByClassName('route-search-holder')[0];
        showRouteSelectorButtonHolder.style.display = 'inline-flex'
        if (toggleAllRoutesButtonHolder) {
            toggleAllRoutesButtonHolder.style.display = 'inline-flex';
        }
        if (routeSearchHolder) {
            routeSearchHolder.style.display = 'inline-flex';
        }
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

    showGeoLocation: function() {
        var _t = this;

        if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(function(position) {
                    var svgGroup;
                    if (_t.myPositionGroup !== null) {
                        svgGroup = d3.select('#myLocation')
                    } else {
                        var parent = _t.zoomStage || _t.svg;
                        svgGroup = parent.append("g").attr('id', 'myLocation')
                    }

                    _t.myPositionGroup = svgGroup;

                    _t.myPosition = svgGroup.selectAll(".my-position").data([position])

                    _t.myPosition.enter()
                        .append("circle")
                        .attr("r", "15")
                        .attr('stroke', 'red')
                        .attr('stroke-width', 1)
                        .attr('fill', 'transparent')
                        .attr("transform", function(d) {
                            return "translate(" + _t.projection([
                                d.coords.longitude,
                                d.coords.latitude
                            ]) + ")";
                        })
                        .attr('class', 'my-position')
                        .transition().attr('r', 30).duration(3000)
                        .transition().attr('r', 2).duration(1000)
                        .transition().attr('stroke-width', 0).duration(1000)
                        .remove()
                  

                },

                _t.handleGeolocationError, {
                    enableHighAccuracy: true
                }
            );
        } else {
            alert('Geolocation must be available to use this feature')
        }
    },
    handleGeolocationError: function(error) {
        function showError(error) {
            switch (error.code) {
                case error.PERMISSION_DENIED:
                    console.log("User denied the request for Geolocation.");
                    break;
                case error.POSITION_UNAVAILABLE:
                    console.log("Location information is unavailable.");
                    break;
                case error.TIMEOUT:
                    console.log("The request to get user location timed out.");
                    break;
                case error.UNKNOWN_ERROR:
                    console.log("An unknown error occurred.");
                    break;
            }
        }
    }

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
