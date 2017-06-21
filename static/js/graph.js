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
        // need to create our own array of type names for each game,
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
        return playTimes;
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
            if (possibleMins[i] <= d["stats"]["usersrated"]) {
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
        return +d["yearpublished"];
    });

    var yearGroupedDim = games.dimension(function(d) {
        var year = d["yearpublished"];
        if (!year) {
            return "not given";
        }
        else if (year<1970) {
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

    var yearGroups = ["not given", "<1970", "1970s","1980s", "1990s"];
    for (year=2000; year<=maxYear; year++) {
        yearGroups.push(String(year));
    }

    yearChart
        .width(800)
        .minWidth(500)
        /* .height(150) */
        // .margins({top: 10, right: 50, bottom: 30, left: 50})
        .dimension(yearGroupedDim)
        .group(numGamesByYear)
        .transitionDuration(1000)
        .x(d3.scale.ordinal().domain(yearGroups))
        .xUnits(dc.units.ordinal)  // required for graph to display correctly with ordinal scale
        .elasticY(true)
        // .xAxisLabel("Year Published")
        .yAxis().ticks(4);

    
    /**
     * alternative row chart for years, to display on narrow screens:
     */

    var yearChartAlt = dc.rowChart("#year-row-chart");

    yearChartAlt
        .width(400)
        // .minWidth(400)
        .height(600)
        .dimension(yearGroupedDim)
        .group(numGamesByYear)
        .ordinalColors(["#1f77b4"])
        .transitionDuration(1000)
        .elasticX(true)
        .xAxis().ticks(4);
    
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
        .ordinalColors(["#1f77b4"])
        .transitionDuration(1000)
        .rowsCap(10)
        .othersGrouper(false)
        .elasticX(true)
        .xAxis().ticks(4);

    /**
     * categories chart:
     */
    var categoriesDim = games.dimension(function(d) {
        return d.categories;
    }, true);  // tell crossfilter that this dimension is an array

    var numGamesByCategory = categoriesDim.group();

    var categoriesChart = dc.rowChart("#categories-row-chart");

    categoriesChart
        .width(400)
        .height(250)
        .dimension(categoriesDim)
        .group(numGamesByCategory)
        .ordinalColors(["#1f77b4"])
        .transitionDuration(1000)
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
        .ordinalColors(["#1f77b4"])
        .transitionDuration(1000)
        .rowsCap(10)
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
        .ordinalColors(["#1f77b4"])
        .transitionDuration(1000)
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
        .height(200)
        .width(200)
        // .radius(150)
        .innerRadius(30)
        .dimension(groupedRatingsDim)
        .group(gamesByRating)
        .transitionDuration(1000)
        .cap(10)
        .othersGrouper(false);

    /**
     * table display of games
     */

    var ratingsDim = games.dimension(function(d) {
        return d["stats"]["average"];
    })

    var table = dc.dataTable("#table");

    var tableDim = ratingsDim;
    var tableGroup = function(d) {
            return d["stats"]["average"];
    };
    var ratingSort = function(d) {return d["stats"]["average"];};
    var tableSort = ratingSort;
    var tableOrder = d3.descending;

    table
        .dimension(tableDim)
        .group(tableGroup)
        .showGroups(false)
        .columns([
            {label: "Name",
             format: function(d) {return "<a href='https://boardgamegeek.com/boardgame/"
                 + d["id"] + "/' target='_blank'>" + d["name"] + "</a>";}},

            {label: "Year Published",
             format: function(d) {if (!d["yearpublished"]) {
                 return "not given";
                } else {
                 return d["yearpublished"];
                }}},

            {label: "Average Rating",
             format: function(d) {return d["stats"]["average"].toFixed(2);}},
             // round to 2 decimal places

            {label: "Number of Ratings",
             format: function(d) {return d["stats"]["usersrated"];}},
        ])
        .sortBy(tableSort)
        .order(tableOrder)
        .size(Infinity);

      // implement table pagination, following the example in the dc docs
      var offset = 1, pageSize = 15;
      
      function display() {
          d3.select("#begin")
            .text(offset);
          d3.select("#end")
            .text(Math.min(offset + pageSize - 1, ratingsDim.top(Infinity).length));
          d3.select("#prev")
            .attr("disabled", offset-pageSize<0 ? "true" : null);
          d3.select("#next")
            .attr("disabled", offset+pageSize-1>=(ratingsDim.top(Infinity).length) ? "true" : null);
          d3.select("#size").text(ratingsDim.top(Infinity).length);
          d3.select("#first")
            .attr("disabled", offset==1 ? "true" : null);
          d3.select("#last")
            .attr("disabled", offset+pageSize-1>=(ratingsDim.top(Infinity).length) ? "true" : null);
      }
      
      // these functions are deliberately defined as global variables,
      // so that they can be called by onlick attributes in the html
   
      update = function() {
          table.beginSlice(offset-1);
          table.endSlice(offset+pageSize-1);
          display();
      }

      first = function() {
          offset = 1;
          update();
          table.redraw();
          makeTableHeaders();
      }
      
      next = function() {
          offset += pageSize;
          update();
          table.redraw();
          makeTableHeaders();
      }
      
      prev = function() {
          offset -= pageSize;
          update();
          table.redraw();
          makeTableHeaders();
      }

      last = function() {
          offset = Math.floor(ratingsDim.top(Infinity).length/pageSize)*pageSize + 1 - 
                   (ratingsDim.top(Infinity).length/pageSize % 1 ? 0 : pageSize);
          update();
          table.redraw();
          makeTableHeaders();
      }

      makeTableHeaders = function() {
          var yearHeader = document.querySelectorAll(".dc-table-head")[1];
          yearHeader.classList.add("ordering");
          yearHeader.addEventListener("click", sortByYear);
          var ratingHeader = document.querySelectorAll(".dc-table-head")[2];
          ratingHeader.classList.add("ordering");
          ratingHeader.addEventListener("click", sortByRating);
          var numRatingsHeader = document.querySelectorAll(".dc-table-head")[3];
          numRatingsHeader.classList.add("ordering");
          numRatingsHeader.addEventListener("click", sortByNumRatings);
      }

      var yearSort = function(d) {return +d["yearpublished"];};
      sortByYear = function() {
          tableDim = yearDim;
          tableGroup = function(d) {return d["yearpublished"];};
          if (tableSort == yearSort) {
              tableOrder = (tableOrder==d3.descending ? d3.ascending : d3.descending);
          }
          else {
            tableSort = yearSort;
            tableOrder = d3.descending;
          }
          table.dimension(tableDim)
               .group(tableGroup)
               .sortBy(tableSort)
               .order(tableOrder)
               .redraw();
          first();
      }

      sortByRating = function() {
          tableDim = ratingsDim;
          tableGroup = function(d) {return d["stats"]["average"];};
          if (tableSort == ratingSort) {
              tableOrder = (tableOrder==d3.descending ? d3.ascending : d3.descending);
          }
          else {
            tableSort = ratingSort;
            tableOrder = d3.descending;
          }
          table.dimension(tableDim)
               .group(tableGroup)
               .sortBy(tableSort)
               .order(tableOrder)
               .redraw();
          first();
      }

      
      var numRatingsSort = function(d) {return +d["stats"]["usersrated"];};
      var numRatingsDim = games.dimension(function(d) {return +d["stats"]["usersrated"];});
      sortByNumRatings = function() {
          tableDim = numRatingsDim;
          tableGroup = function(d) {return +d["stats"]["usersrated"];};
          if (tableSort == numRatingsSort) {
              tableOrder = (tableOrder==d3.descending ? d3.ascending : d3.descending);
          }
          else {
            tableSort = numRatingsSort;
            tableOrder = d3.descending;
          }
          table.dimension(tableDim)
               .group(tableGroup)
               .sortBy(tableSort)
               .order(tableOrder)
               .redraw();
          first();
      }

      clearMechanics = function() {
          mechanicsChart.filter(null);
          dc.redrawAll();
      }

      clearCategories = function() {
          categoriesChart.filter(null);
          dc.redrawAll();
      }

      clearDesigners = function() {
          designersChart.filter(null);
          dc.redrawAll();
      }

      clearPublishers = function() {
          publishersChart.filter(null);
          dc.redrawAll();
      }

    update();
    dc.renderAll();
    first();

    // code to update visual display of the 2 year charts (bar chart and row chart) so that one changes
    // when a selection is made on the other. This is done because on some tablets it is possible to rotate
    // the screen so that one disappears and the other appears - to maintain the illusion that they are
    // "the same" chart, they need to be kept "in sync".
    var barColumns = document.querySelectorAll("#year-bar-chart rect.bar");
    var rowRows = document.querySelectorAll("#year-row-chart g.row rect");
    var numColumns = barColumns.length;

    var updateBarToRow = function() {
        for (var i=0; i<numColumns; i++) {
            var longTitle = barColumns[i].firstElementChild.textContent;
            var title = longTitle.slice(0, longTitle.indexOf(":"));
            var isMatchingRow = function(row) {
                return (row.nextElementSibling.textContent == title);
            }
            var selected = barColumns[i].classList.contains("selected");
            var deselected = barColumns[i].classList.contains("deselected");
            if (selected) {
                rowRows.forEach(function(row) {
                    if (isMatchingRow(row)) {
                        row.classList.remove("deselected");
                        row.classList.add("selected");
                    }
                });
            } else if (deselected) {
                rowRows.forEach(function(row) {
                    if (isMatchingRow(row)) {
                        row.classList.remove("selected");
                        row.classList.add("deselected");
                    }
                });
            }
            else {
                rowRows.forEach(function(row) {
                    if (isMatchingRow(row)) {
                        row.classList.remove("selected");
                        row.classList.remove("deselected");
                    }
                });
            }
        }
    }

    var updateRowToBar = function() {
        for (var i=0; i<numColumns; i++) {
            var title = rowRows[i].nextElementSibling.textContent;
            var isMatchingColumn = function(column) {
                return (column.firstElementChild.textContent.indexOf(title)==0);
            }
            var selected = rowRows[i].classList.contains("selected");
            var deselected = rowRows[i].classList.contains("deselected");
            if (selected) {
                barColumns.forEach(function(col) {
                    if (isMatchingColumn(col)) {
                        col.classList.remove("deselected");
                        col.classList.add("selected");
                    }
                });
            } else if (deselected) {
                barColumns.forEach(function(col) {
                    if (isMatchingColumn(col)) {
                        col.classList.remove("selected");
                        col.classList.add("deselected");
                    }
                });
            }
            else {
                barColumns.forEach(function(col) {
                    if (isMatchingColumn(col)) {
                        col.classList.remove("selected");
                        col.classList.remove("deselected");
                    }
                });
            }
        }
    }

    var syncCharts = function() {
        // do each update twice to ensure stablity and avoidance of "race conditions"
        for (var i=0; i<2; i++) {
            updateBarToRow();
            updateRowToBar();
        }
    }
    window.addEventListener("resize", syncCharts);
    window.addEventListener("orientationchange", syncCharts);
}