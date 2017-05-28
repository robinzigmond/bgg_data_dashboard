queue()
    .defer(d3.json, "/BGG/game_info")
    .await(makeGraphs);

function makeGraphs(error, game_infoJson) {

    var game_data = game_infoJson;

    var games = crossfilter(game_data);

    var yearDim = games.dimension(function(d) {
        return d["yearpublished"];
    });

    var yearGroupedDim = games.dimension(function(d) {
        var year = d["yearpublished"];
        if (year<1900) {
            return "<1900";
        }
        else if (year<2000) {
            var startYear = 10*Math.floor(year/10);
            var startYearString = String(startYear);
            /*var endYearString = String(+startYearString.slice(2)+9);
            if (endYearString == "9") {
                endYearString = "09";
            }
            return (startYearString + "-" + endYearString);*/
            return (startYearString + "s");
        } 
        else {
            return String(year);
        }
    });

    var numGamesByYear = yearGroupedDim.group();

    var maxYear = yearDim.top(1)[0]["yearpublished"];
    
    var yearChart = dc.barChart("#year-bar-chart");

    var yearGroups = ["<1900", "1900s", "1910s", "1920s", "1930s", "1940s", "1950s", 
    "1960s", "1970s", "1980s", "1990s"];
    for (year=2000; year<=maxYear; year++) {
        yearGroups.push(String(year));
    }

    yearChart
        .width(800)
        .height(200)
        .margins({top: 10, right: 50, bottom: 30, left: 50})
        .dimension(yearGroupedDim)
        .group(numGamesByYear)
        .transitionDuration(500)
        .x(d3.scale.ordinal().domain(yearGroups))
        .xUnits(dc.units.ordinal)  // required for graph to display correctly with ordinal scale
        .elasticY(true)
        .xAxisLabel("Year Published")
        .yAxis().ticks(4);

    dc.renderAll();
}