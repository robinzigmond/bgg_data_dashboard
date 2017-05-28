queue()
    .defer(d3.json, "/BGG/game_info")
    .await(makeGraphs);

function makeGraphs(error, game_infoJson) {

    var game_data = game_infoJson;

    var games = crossfilter(game_data);

    var yearDim = games.dimension(function(d) {
        return d["yearpublished"]
    });

    var numGamesByYear = yearDim.group();

    var minYear = yearDim.bottom(1)[0]["yearpublished"];
    var maxYear = yearDim.top(1)[0]["yearpublished"];

    var yearChart = dc.barChart("#year-bar-chart");

    /* chart details taken for now from Code Institute example,
    will customise more later */
    yearChart
        .width(800)
        .height(200)
        .margins({top: 10, right: 50, bottom: 30, left: 50})
        .dimension(yearDim)
        .group(numGamesByYear)
        .transitionDuration(500)
        .x(d3.time.scale().domain([minYear, maxYear]))
        .elasticY(true)
        .xAxisLabel("Year Published")
        .yAxis().ticks(4);

    dc.renderAll();
}