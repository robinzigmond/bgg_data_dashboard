// use queue.js to delay rendering the dashboard until the data is loaded from the database
queue()
    .defer(d3.json, "/BGG/game_info")
    .await(renderDashboard);

// main function to render all dashboard components
function renderDashboard(error, game_infoJson) {
    /* the code in this function is arranged by chart/widget, rather than definining all dimensions first,
    then all groups and so on. I find that arranging it this way makes it easier to find which code is
    used by which dashboard element, which makes the code easier to understand, to alter and to maintain */
    var game_data = game_infoJson;
    // set up crossfilter
    var games = crossfilter(game_data);

    /**
     * Game type selector (also called "subdomain" on BGG)
     */
    var typeDim = games.dimension(function(d) {
        /* need to create our own array of type names for each game,
        not stored directly in the API data - it has to be extracted
        from the game's rank information (each game has both an overall
        rank, and separate ranks for each type which it is a member of) */
        var types = [];
        var typeRankInfo = d.stats.ranks;
        var typeCount = typeRankInfo.length;
        for (i=1; i<typeCount; i++) {  /* start counting from 1 because the
            first entry is just for the overall "board game rank". */
            /* the "friendlyname" property holds a string such as
            "Strategy Game Rank" - so we extract it and slice off the last
            5 characters to get just the type name */
            var typeString = typeRankInfo[i].friendlyname.slice(0, 
                             typeRankInfo[i].friendlyname.length - 5);
            types.push(typeString);
        }
        return types;
    }, true); /* the "true" argument is used in crossfilter v1.4 to indicate
    that the dimension is array-valued */

    var gamesByType = typeDim.group();

    var typeMenu = dc.selectMenu("#type-select");

    typeMenu
        .dimension(typeDim)
        .group(gamesByType);

    /**
     * Player count selector:
     */
    var playerCountDim = games.dimension(function(d) {
        /* create an array of all allowed player counts
        using "minplayers" and "maxplayers" properties
        Will just use "7+" for all player counts above 6,
        and therefore need to return a string in all cases */
        var playerCounts = [];
        for (var players=1; players<7; players++) {
            if (d.minplayers<=players && players<=d.maxplayers) {
                playerCounts.push(String(players));
            }
        }
        if (d.maxplayers>6) {
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
    // variable to show which play times I want to display
    var allPlayTimes = [15, 30, 45, 60, 90, 120, 180];

    var playTimeDim = games.dimension(function(d) {
        /* create an array of all possible play times for each
        game, using the "minplaytime" and "maxplaytime" properties */
        return allPlayTimes.filter(function(time) {
            return d.minplaytime<=time && time<=d.maxplaytime;
        });
    }, true);

    var gamesByPlayTime = playTimeDim.group();

    var playTimeMenu = dc.selectMenu("#playtime-select");

    playTimeMenu
        .dimension(playTimeDim)
        .group(gamesByPlayTime);


    /**
     * select menu to filter by minimum number of ratings
     */

    // array variable for the options I want displayed
    var possibleMins = [100, 200, 500, 1000, 2000, 5000, 10000];

    var minRatingsDim = games.dimension(function(d) {
        return possibleMins.filter(function(lowerBound) {
            return lowerBound<=d.stats.usersrated;
        });
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

    var reduceAddRating = function(p, v) {
        p.count++;
        p.total += v.stats.average;
        return p;
    }

    var reduceRemoveRating = function(p, v) {
        p.count--;
        p.total -= v.stats.average;
        return p;
    }

    var reduceInitial = function() {
        return {count: 0, total: 0};
    }

    var average = function(d) {
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
        p.total += v.stats.usersrated;
        return p;
    }

    function reduceRemoveNumRatings(p, v) {
        p.count--;
        p.total -= v.stats.usersrated;
        return p;
    }

    avgNumRatingsND
        .group(games.groupAll().reduce(reduceAddNumRatings, reduceRemoveNumRatings, reduceInitial))
        .valueAccessor(average)
        .formatNumber(d3.format(",.0f"));


    /**
     * Year Published Chart:
     */

    /* basic year dimension, not used directly for chart - but for calculating
    the most recent year in the data set, and later for the data table */
    var yearDim = games.dimension(function(d) {
        return +d.yearpublished;
    });

    /* function which, given a year, returns a string with the column label
    we want a game published that year to appear in. The choice of grouping
    is of course arbitrary, but this one seems to give a good balance between
    accurate information and screen space */
    var groupYears = function(year) {
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
    };

    var yearGroupedDim = games.dimension(function(d) {
        return groupYears(d.yearpublished);
    });

    var numGamesByYear = yearGroupedDim.group();

    var maxYear = yearDim.top(1)[0].yearpublished;
    
    var yearChart = dc.barChart("#year-bar-chart");

    // create array of all column labels, needed to pass into the d3 ordinal scale domain
    var yearGroups = ["not given", "<1970", "1970s","1980s", "1990s"];
    for (year=2000; year<=maxYear; year++) {
        yearGroups.push(String(year));
    }

    yearChart
        .width(800)
        .minWidth(500)
        .dimension(yearGroupedDim)
        .group(numGamesByYear)
        .transitionDuration(1000)
        .x(d3.scale.ordinal().domain(yearGroups))
        .xUnits(dc.units.ordinal)  // required for graph to display correctly with ordinal scale
        .elasticY(true)
        .yAxis().ticks(4);

    
    /**
     * alternative row chart for years, to display on narrow screens:
     */

    var yearChartAlt = dc.rowChart("#year-row-chart");

    yearChartAlt
        .width(400)
        .height(600)
        .dimension(yearGroupedDim)
        .group(numGamesByYear)
        /* ordering function takes a key-value pair from the group function
        - to get them in the right order we return the index in the yearGroups
        array, defined above */
        .ordering(function(d) {return yearGroups.indexOf(d.key);})
        .ordinalColors(["#1f77b4"])
        .transitionDuration(1000)
        .elasticX(true)
        .xAxis().ticks(4);
    
    /**
     * mechanics chart:
     */
    var mechanicsDim = games.dimension(function(d) {
        return d.mechanics;
    }, true);

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
    }, true);

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
        return d.designers;
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

    /* function to make a string from a game's rating, showing which integer
    range it falls in */  
    var groupedRatingsDim = games.dimension(function(d) {
        var avgRating = d.stats.average;
        var lower = Math.floor(avgRating);
        var upper = lower+1;
        return String(lower) + "-" + String(upper);
    });

    var gamesByRating = groupedRatingsDim.group();

    var ratingsChart = dc.pieChart("#avg-rating-pie-chart");

    ratingsChart
        .height(200)
        .width(200)
        .innerRadius(30)
        .dimension(groupedRatingsDim)
        .group(gamesByRating)
        .transitionDuration(1000)
        .cap(10)
        .othersGrouper(false);

    /**
     * table display of games
     */

    // define basic ratings dimension, not needed before
    var ratingsDim = games.dimension(function(d) {
        return d.stats.average;
    })

    var table = dc.dataTable("#table");

    /* set initial table ordering properties - these can be
    changed later by the user clicking on the table headings */
    var tableDim = ratingsDim;
    var tableGroup = function(d) {
            return d.stats.average;
    };
    var ratingSort = function(d) {return d.stats.average;};
    var tableSort = ratingSort;

    // define new ordering functions which order numerically, rather than as strings:
    var numAscending = function(a,b) {return d3.ascending(+a, +b);};
    var numDescending = function(a,b) {return d3.descending(+a, +b);};
    // use this to set initial table ordering as descending
    var tableOrder = numDescending;

    table
        .dimension(tableDim)
        .group(tableGroup)
        // hide "group" subheadings
        .showGroups(false)
        .columns([
            /* name column - acting as a link to the BGG page for that game. For this
            we need to know the game's BGG id number */
            {label: "Name",
             format: function(d) {return "<a href='https://boardgamegeek.com/boardgame/"
                 + d.id + "/' target='_blank'>" + d.name + "</a>";}},

            /* column for year published, giving the full year, but still "not given"
            if the data is missing */
            {label: "Year Published",
             format: function(d) {if (!d.yearpublished) {
                 return "not given";
                } else {
                 return d.yearpublished;
                }}},

            /* average rating is rounded to 2 decimal places. Using .toFixed(2)
            ensures that trailing zeros are shown */
            {label: "Average Rating",
             format: function(d) {return d.stats.average.toFixed(2);}},
 
            {label: "Number of Ratings",
             format: function(d) {return d.stats.usersrated;}},
        ])
        .sortBy(tableSort)
        .order(tableOrder)
        .size(Infinity);

    /* implement table pagination, following the example in the dc docs,
    but adapted to give the functionality I want */
    
    /* pageSize is a constant, giving the number of entries in each table page.
    Offset is the number of the first entry shown in a given page, and of course
    alters as the user navigates through the pages */
    var offset = 1, pageSize = 15;
      
    /* the following function, when called, updates the html with the correct values
    to put in the "showing x-y of x" text. It also disables any of the buttons when
    they will have no effect (the first and previous buttons if on the first page, and
    the next and last ones if on the last page) */
    var display = function() {
        d3.select("#begin")
          .text(offset);
        d3.select("#end")
          .text(Math.min(offset+pageSize-1, ratingsDim.top(Infinity).length));
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
      
  
    /* this important function updates the page offsets, then calls the display function
    to rerender the table. update() is called whenever a new table page is requested - 
    including when new filters are added/removed from the data by interactions with the charts */
    var update = function() {
        table.beginSlice(offset-1);
        table.endSlice(offset+pageSize-1);
        display();
    }

    /* the next 4 functions are deliberately defined as global variables - by leaving out
    the "var" keyword - so that they can be called by onlick attributes in the html.
    After updating the offset, they call update to set the correct beginSlice and endSlice
    values, then table.redraw() to rerender the table. Finally, it calls the makeTableHeaders
    function - defined below - to ensure the table column headings have the correct styling
    and behave correctly when clicked.*/

    /* Note that, as well as being called when the user clicks the appropriate button,
    first() is also called by clicks on other dashboard elements. This ensures that when 
    the filters are changed, the user always sees the first page of the new table */
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
        /* slightly complicated formula for the offset here! I have split it into 2 lines,
        and not just for reasons of horizontal space. The first line finds the largest multiple
        of pageSize which is no greater than the total number of games, and adds one to it */
        offset = Math.floor(ratingsDim.top(Infinity).length/pageSize)*pageSize + 1 
        /* but this fails when the total number is an exact multiple of pageSize, because then
        if gives the total number plus 1. So we need to test for this and subtract pageSize
        if it is the case: */
                 - (ratingsDim.top(Infinity).length/pageSize % 1 ? 0 : pageSize);
        update();
        table.redraw();
        makeTableHeaders();
    }

    /* this function is needed to display the table headers (other than the first,
    for name) correctly - giving them the "ordering" class so they can be styled as I want,
    and most importantly adding the necessary event listeners so that they reorder the table
    when clicked. Note that since the necessary html elements do not exist to start with,
    but only when dc.renderAll is called - and later when the table is redrawn in response to
    user interactions - it is necessary to define this as a function, and explicitly call
    it whenever anything happens to redraw the table */
    var makeTableHeaders = function() {
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

    /* all that remains for the table re-ordering code is to define the functions
    that re-order - and then redisplay - the table. The precise functionality coded
    for here is that clicking each header should order the table by that column, in
    descending order - but that a second click on the same column should switch to
    ascending order. This is the purpose of the if/else statements for setting the
    tableSort and tableOrder functions.
    
    Note that all end with a call to first() - because I think it is natural to want
    to see the start of the table when calling for a reordering*/

    var yearSort = function(d) {if (!d.yearpublished) {
                                   return (-100000); /* arbitrarily large negative number
                                   to ensure "not given" occurs after all games with a given year.
                                   NB I tried -Infinity but it didn't work. */
                               } else {
                                   return +d.yearpublished;
                               }};
    sortByYear = function() {
        tableDim = yearDim;
        tableGroup = yearSort;
        if (tableSort == yearSort) {
            tableOrder = (tableOrder==numDescending ? numAscending : numDescending);
        }
        else {
          tableSort = yearSort;
          tableOrder = numDescending;
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
        tableGroup = function(d) {return d.stats.average;};
        if (tableSort == ratingSort) {
            tableOrder = (tableOrder==numDescending ? numAscending : numDescending);
        }
        else {
          tableSort = ratingSort;
          tableOrder = numDescending;
        }
        table.dimension(tableDim)
             .group(tableGroup)
             .sortBy(tableSort)
             .order(tableOrder)
             .redraw();
        first();
    }

      
    var numRatingsSort = function(d) {return +d.stats.usersrated;};
    var numRatingsDim = games.dimension(function(d) {return +d.stats.usersrated;});
    sortByNumRatings = function() {
        tableDim = numRatingsDim;
        tableGroup = function(d) {return +d.stats.usersrated;};
        if (tableSort == numRatingsSort) {
            tableOrder = (tableOrder==numDescending ? numAscending : numDescending);
        }
        else {
          tableSort = numRatingsSort;
          tableOrder = numDescending;
        }
        table.dimension(tableDim)
             .group(tableGroup)
             .sortBy(tableSort)
             .order(tableOrder)
             .redraw();
        first();
    }


    /* the following are very simple functions which clear all filters on the
    relevant row charts when called (and then update all charts). They are used
    as onclick values for the appropriate buttons, and for this reason once again
    need to be defined as global functions */
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

    /* the following 3 funcitons are needed to get everything up and running when the page first
    loads. First to display the correct values in the below-table text, then render all charts,
    then finally make sure the table headers are generated correctly. */
    update();
    dc.renderAll();
    makeTableHeaders();

    /* the following code ensures that the row chart and bar chart for the Year Published information - the
    two versions of the same chart, only one of which is ever displayed depending on screen size - always stay
    "in sync", so that the user on a tablet can keep on making selections and rotating the screen in arbitrary
    combinations and keep seeing what they would expect, as if there was just one chart whose display was being
    altered. It is done by keeping track of which of the 2 charts has been interacted with (since this must
    remain the same between resize or orientationchange events), then passing all the filters applied to that
    chart to the other, when the next such event happens.

    This may work if the syncCharts function is applied on each click of the relevant chart - but I have not
    tried it. There is potential for it not to work as expected due to dc updating the filters at the same
    time as the syncCharts function is trying to do so, with potentially unexpected results. And there is no
    practical need to update these charts at any time other than resize or orientationchange events*/

    var lastClickedChart;

    document.getElementById("year-bar-chart").addEventListener("click", function() {lastClickedChart="bar";});
    document.getElementById("year-row-chart").addEventListener("click", function() {lastClickedChart="row";});
    
    var syncCharts = function() {
        if (lastClickedChart == "bar") {
            // first clear any filters which may be active
            yearChartAlt.filter(null);
            // then apply all filters from the clicked chart to the non-clicked one
            var filters = yearChart.filters();
            for (var i=0; i<filters.length; i++) {
                yearChartAlt.filter(filters[i]);
            }
            yearChartAlt.redraw();
        }
        else if (lastClickedChart =="row") {
            yearChart.filter(null);
            var filters = yearChartAlt.filters();
            for (var i=0; i<filters.length; i++) {
                yearChart.filter(filters[i]);
            }
            yearChart.redraw();
        }
    }

    window.addEventListener("resize", syncCharts);
    window.addEventListener("orientationchange", syncCharts);
}