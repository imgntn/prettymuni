function te_Mapper() {
    this.setupDrawingSpace();
    this.loadAllBaseMaps();
}

te_Mapper.prototype = {
    refreshRate: 15,
    liveData: {},
    baseMapNames: ['arteries', 'freeways', 'neighborhoods', 'streets'],
    baseMapGroups: [],
    subsets: [],

    loadAllBaseMaps: function() {
        var _t = this;
        this.baseMapNames.forEach(function(baseMap) {
            _t.loadBaseMap(baseMap);
        })
    },
    loadBaseMap: function(mapName) {
        var _t = this;
        var mapName = mapName || this.baseMapNames[2];

        d3.json("assets/sfmaps/" + mapName + ".json", function(error, geojson) {
            if (error) return console.error(error);
            console.log(geojson);
            _t.addBaseMapLayer(geojson);
        });
    },
    fetchNextBusXMLFeed: function() {},
    parseNextBusXMLFeed: function() {},
    setupDrawingSpace: function() {
        var width = window.innerWidth,
            height = window.innerHeight;

        this.svg = d3.select("body").append("svg")
            .attr("width", width)
            .attr("height", height);

        this.projection = d3.geoMercator()
            .scale(250000)
            .rotate([0, 0])
            .center([-122.433701, 37.767683])
            .translate([width / 2, height / 2]);

    },
    addBaseMapLayer: function(geojson) {
        var svgGroup = this.svg.append("g");

        var geoPath = d3.geoPath()
            .projection(this.projection);

        svgGroup.selectAll("path")
            .data(geojson.features)
            .enter()
            .append("path")
            .style("fill", "#FB5B1F")
            .style("stroke", "#ffffff")
            .attr("d", geoPath);

        console.log('end of basemap drawing')

        this.baseMapGroups.push(svgGroup);

    },
    drawVehicles: function() {},
    handleSubsetSelect: function() {},
}


var liveMapper = new te_Mapper();

function Vehicle() {}