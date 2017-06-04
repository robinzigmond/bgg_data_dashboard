queue()
    .defer(d3.json, "/BGG/game_info")
    .await(makeGraphs);

function makeGraphs(error, game_infoJson) {

    var game_data = game_infoJson;

    var games = crossfilter(game_data);

    /**
     * Game type selector (also called "subdomain" on BGG)
     */
    var typeDim = games.dimension(function(d) {
        // need to creat our own array of type names for each game,
        // because it is stored in a harder-to-accept way in the
        // API data
        var types = [];
        var typeRankInfo = d["stats"]["ranks"];
        var typeCount = typeRankInfo.length;
        for (i=1; i<typeCount; i++) {  // start counting from 1 because the first entry
            // is just for the overall "board game rank".
            // Slice off last 5 characters, which are " Rank":
            var typeString = typeRankInfo[i].friendlyname.slice(0, 
            typeRankInfo[i].friendlyname.length - 5);
            types.push(typeString);
        }
        return types;
    }, true);

    var gamesByType = typeDim.group();

    var typeMenu = dc.selectMenu("#type-select");

    typeMenu
        .dimension(typeDim)
        .group(gamesByType);

    /**
     * Player count selector:
     */
    var playerCountDim = games.dimension(function(d) {
        // create an array of all allowed player counts
        // using "minplayers" and "maxplayers" properties
        // Will just use "7+" for all player counts above 6,
        // and therefore need to return a string in all cases
        var playerCounts = [];
        for (players=1; players<7; players++) {
            if (d["minplayers"]<=players && players<=d["maxplayers"]) {
                playerCounts.push(String(players));
            }
        }
        if (d["maxplayers"]>6) {
            playerCounts.push("7+");
        }
        return playerCounts;
    }, true)

    var gamesByPlayerCount = playerCountDim.group();

    var playerCountMenu = dc.selectMenu("#player-count-select");

    playerCountMenu
        .dimension(playerCountDim)
        .group(gamesByPlayerCount);
    

    /**
     * Play time selector:
     */

    var allPlayTimes = [15, 30, 45, 60, 90, 120, 180];

    var playTimeDim = games.dimension(function(d) {
        // create an array of all possible play times
        // using "minplaytime" and "maxplaytime" properties
        // The allPlayTimes array shows the values we want
        // available
        var playTimes = [];
        for (i in allPlayTimes) {
            var time = allPlayTimes[i];
            if (d["minplaytime"]<=time && time<=d["maxplaytime"]) {
                playTimes.push(time);
            }
        }
        return playTimes;  // at the moment it seems that playTimes always stays as the empty array. I cannot work out why!
    }, true);

    var gamesByPlayTime = playTimeDim.group();

    var playTimeMenu = dc.selectMenu("#playtime-select");

    playTimeMenu
        .dimension(playTimeDim)
        .group(gamesByPlayTime);


    /**
     * select for minimum number of ratings
     */

    var possibleMins = [100, 200, 500, 1000, 2000, 5000, 10000];

    var minRatingsDim = games.dimension(function(d) {
        var moreRatingsThan = []
        for (i in possibleMins) {
            if (possibleMins[i] < d["stats"]["usersrated"]) {
                moreRatingsThan.push(possibleMins[i]);
            }
        }
        return moreRatingsThan;
    }, true);

    var gamesByMinRatings = minRatingsDim.group();

    var minRatingsMenu = dc.selectMenu("#min-ratings-select");

    minRatingsMenu
        .dimension(minRatingsDim)
        .group(gamesByMinRatings);


    /**
     * total # of games display
     */

    var totalGamesND = dc.numberDisplay("#num-games-ND");

    totalGamesND
        .group(games.groupAll())
        .valueAccessor(function(d) {
            return d;
        })
        .formatNumber(d3.format(",d"));

    /**
     * average rating display
     */

    var avgRatingND = dc.numberDisplay("#avg-rating-ND");

    // define reduce functions to compute average

    function reduceAddRating(p, v) {
        p.count++;
        p.total += v["stats"]["average"];
        return p;
    }

    function reduceRemoveRating(p, v) {
        p.count--;
        p.total -= v["stats"]["average"];
        return p;
    }

    function reduceInitial() {
        return {count: 0, total: 0};
    }

    function average(d) {
        if (d.count != 0) {
            return (d.total/d.count);
        }
        else {
            return 0;
        }
    }

    avgRatingND
        .group(games.groupAll().reduce(reduceAddRating, reduceRemoveRating, reduceInitial))
        .valueAccessor(average)
        .formatNumber(d3.format(".2f"));

    
    /**
     * average # of ratings display
     */

    var avgNumRatingsND = dc.numberDisplay("#avg-num-ratings-ND");

    function reduceAddNumRatings(p, v) {
        p.count++;
        p.total += v["stats"]["usersrated"];
        return p;
    }

    function reduceRemoveNumRatings(p, v) {
        p.count--;
        p.total -= v["stats"]["usersrated"];
        return p;
    }

    avgNumRatingsND
        .group(games.groupAll().reduce(reduceAddNumRatings, reduceRemoveNumRatings, reduceInitial))
        .valueAccessor(average)
        .formatNumber(d3.format(",.0f"));


    /**
     * Year Published Chart:
     */
    var yearDim = games.dimension(function(d) {
        return d["yearpublished"];
    });

    var yearGroupedDim = games.dimension(function(d) {
        var year = d["yearpublished"];
        if (year<1970) {
            return "<1970";
        }
        else if (year<2000) {
            var startYear = 10*Math.floor(year/10);
            var startYearString = String(startYear);
            return (startYearString + "s");
        } 
        else {
            return String(year);
        }
    });

    var numGamesByYear = yearGroupedDim.group();

    var maxYear = yearDim.top(1)[0]["yearpublished"];
    
    var yearChart = dc.barChart("#year-bar-chart");

    var yearGroups = ["<1970", "1970s","1980s", "1990s"];
    for (year=2000; year<=maxYear; year++) {
        yearGroups.push(String(year));
    }

    yearChart
        .width(800)
        .height(150)
        .margins({top: 10, right: 50, bottom: 30, left: 50})
        .dimension(yearGroupedDim)
        .group(numGamesByYear)
        .transitionDuration(500)
        .x(d3.scale.ordinal().domain(yearGroups))
        .xUnits(dc.units.ordinal)  // required for graph to display correctly with ordinal scale
        .elasticY(true)
        .xAxisLabel("Year Published")
        .yAxis().ticks(4);

    /**
     * mechanics chart:
     */
    var mechanicsDim = games.dimension(function(d) {
        return d.mechanics;
    }, true);  // tell crossfilter that this dimension is an array

    var numGamesByMechanic = mechanicsDim.group();

    var mechanicsChart = dc.rowChart("#mechanics-row-chart");

    mechanicsChart
        .width(400)
        .height(250)
        .dimension(mechanicsDim)
        .group(numGamesByMechanic)
        .rowsCap(10)
        .othersGrouper(false)
        .elasticX(true)
        .xAxis().ticks(4);

    /**
     * designers chart
     */
    var designersDim = games.dimension(function(d) {
        return d["designers"];
    }, true)

    var gamesByDesigner = designersDim.group();

    var designersChart = dc.rowChart("#designers-row-chart");

    designersChart
        .width(400)
        .height(250)
        .dimension(designersDim)
        .group(gamesByDesigner)
        .rowsCap(5)
        .othersGrouper(false)
        .elasticX(true)
        .xAxis().ticks(4);

    /**
     * publishers chart
     */
    var publishersDim = games.dimension(function(d) {
        return d["publishers"];
    }, true)

    var gamesByPublisher = publishersDim.group();

    var publishersChart = dc.rowChart("#publishers-row-chart");

    publishersChart
        .width(400)
        .height(250)
        .dimension(publishersDim)
        .group(gamesByPublisher)
        .rowsCap(10)
        .othersGrouper(false)
        .elasticX(true)
        .xAxis().ticks(4);

   /**
     * ratings pie chart
     */
    var groupedRatingsDim = games.dimension(function(d) {
        var avgRating = d["stats"]["average"];
        var lower = Math.floor(avgRating);
        var upper = lower+1;
        return String(lower) + "-" + String(upper);
    });

    var gamesByRating = groupedRatingsDim.group();

    var ratingsChart = dc.pieChart("#avg-rating-pie-chart");

    ratingsChart
        .height(250)
        .width(400)
        .radius(100)
        .innerRadius(40)
        .dimension(groupedRatingsDim)
        .group(gamesByRating)
        .cap(10)
        .othersGrouper(false);

    /**
     * table display of games
     */

    var ratingsDim = games.dimension(function(d) {
        return d["stats"]["average"];
    })

    var table = dc.dataTable("#table");

    table
        .dimension(ratingsDim)
        .group(function(d) {
            var ratingRoundedDown = Math.floor(d["stats"]["average"]);
            return ratingRoundedDown + "-" + (ratingRoundedDown+1);
        })
        .columns([
            {label: "Name",
             format: function(d) {return "<a href='https://boardgamegeek.com/boardgame/"
                 + d["id"] + "/' target='_blank'>" + d["name"] + "</a>";}},

            {label: "Year Published",
             format: function(d) {return d["yearpublished"];}},

            {label: "Average Rating",
             format: function(d) {return d["stats"]["average"];}},

            {label: "Number of Ratings",
             format: function(d) {return d["stats"]["usersrated"];}}/*,

            {label: "Minimum # of Players",
             format: function(d) {return d["minplayers"];}},

            {label: "Maximum # of Players",
             format: function(d) {return d["maxplayers"];}},

            {label: "Minimum playtime (minutes)",
             format: function(d) {return d["minplaytime"];}},

            {label: "Maximum playtime (minutes)",
             format: function(d) {return d["maxplaytime"];}}*/
        ])
        .sortBy(function(d) {return d["stats"]["average"]})
        .order(d3.descending)
        .size(Infinity);

      // implement table pagination, followig the example in the dc docs
      var offset = 1, pageSize = 25;
      
      function display() {
          d3.select('#begin')
            .text(offset);
          d3.select('#end')
            .text(offset + pageSize - 1);
          d3.select('#prev')
            .attr('disabled', offset-pageSize<0 ? 'true' : null);
          d3.select('#next')
            .attr('disabled', offset+pageSize>=(ratingsDim.top(Infinity).length) ? 'true' : null);
          d3.select('#size').text(ratingsDim.top(Infinity).length);
      }
      
      // these functions are deliberately defined as global variables,
      // so that they can be called by onlick attributes in the html
   
      update = function() {
          table.beginSlice(offset-1);
          table.endSlice(offset+pageSize-1);
          display();
      }
      
 
      next = function() {
          offset += pageSize;
          update();
          table.redraw();
      }
      
      prev = function() {
          offset -= pageSize;
          update();
          table.redraw();
      }

    update();
    dc.renderAll();
}