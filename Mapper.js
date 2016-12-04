function te_Mapper() {
    this.setupDrawingSpace();
    this.loadAllBaseMaps();
}

te_Mapper.prototype = {
    refreshRate: 15,
    liveData: {},
    baseMapNames: [
        'neighborhoods',
        'streets',
        'freeways',
        'arteries',
    ],
    baseMapGeoJSON: [],
    baseMapGroups: [],
    setupDrawingSpace: function() {
        var width = window.innerWidth,
            height = window.innerHeight;

        this.svg = d3.select("body").append("svg")
            .attr("width", width)
            .attr("height", height);

        this.projection = d3.geoMercator()
            .scale(350000)
            .rotate([0, 0])
            .center([-122.433701, 37.767683])
            .translate([width / 2, height / 2]);
    },

    loadAllBaseMaps: function() {
        var _t = this;

        _t.baseMapNames.forEach(function(mapName) {
            _t.loadBaseMap(mapName)
        })

    },

    loadBaseMap: function(mapName) {
        var _t = this;
        var mapName = mapName || _t.baseMapNames[2];

        // do a thing, possibly async, then…
        d3.json("assets/sfmaps/" + mapName + ".json", function(error, geojson) {
            if (error) {
                reject(Error("Failed to load base map."));
                console.error(error);
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
            _t.addBaseMapLayer(geoJSON);
        })
    },
    getBaseMapGeoJSONByName: function(mapName) {
        return this.baseMapGeoJSON.filter(function(obj) {
            return obj.name == mapName;
        })[0];
    },

    addBaseMapLayer: function(geojson) {
        var _t = this;
        var svgGroup = _t.svg.append("g");

        var geoPath = d3.geoPath()
            .projection(this.projection);

        svgGroup.selectAll("path")
            .data(geojson.features)
            .enter()
            .append("path")
            .style("fill", getRandomHexColor())
            .style("stroke", getRandomHexColor())
            .attr("d", geoPath)
            // .on('mouseover', _t.mouseOver)
            // .on('mouseout', _t.mouseOut)
            .on('click', _t.clicked)

        console.log('end of basemap drawing',
            geojson.name)

        this.baseMapGroups.push(svgGroup);

    },
    mouseOver: function(val) {
        console.log('val mouseOver', val)
    },
    mouseOut: function(val) {
        console.log('val mouseOut', val)
    },
    clicked: function(val) {
        console.log('val clicked', val.properties)
    },
    fetchNextBusXMLFeed: function() {

    },
    parseNextBusXMLFeed: function() {

    },

    drawVehicles: function() {},
    handleSubsetSelect: function() {},
}


var liveMapper = new te_Mapper();

function Vehicle() {}

function getRandomHexColor() {
    return '#' + ("000000" + Math.random().toString(16).slice(2, 8).toUpperCase()).slice(-6);
}