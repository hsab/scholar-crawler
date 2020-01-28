d3.select("#chartId")
  .append("div")
  .classed("svg-container", true)
  .append("svg")
  .attr("preserveAspectRatio", "xMinYMin meet")
  .attr("viewBox", "0 0 " + window.innerWidth + " " + window.innerHeight)
  .classed("svg-content-responsive", true)

// d3.select("#chartId")
//   .append("div")
//   .append("svg")
//   .attr("width", 600)
//   .attr("height", 400);

var svg = d3.select("svg"),
  width = +svg.attr("width"),
  height = +svg.attr("height");



var color = d3.scaleOrdinal(d3.schemeCategory20);

var simulation = d3.forceSimulation()
  .force("link", d3.forceLink().id(function (d) {
    return d.key;
  }))
  .force("charge", d3.forceManyBody())
  .force("charge", d3.forceManyBody())
  .force("collision", d3.forceCollide().radius(5));

d3.json("db.json", function (error, graph) {
  if (error) throw error;

  uniqueRelations = {}
  gLinks = []

  maxVal = 0

  const keys = Object.keys(graph)
  for (const key of keys) {
    gs_id = graph[key]["gs_id"]
    related = graph[key]["related"]
    for (rel in related) {
      rel = related[rel]
      unique1 = gs_id.concat(rel)
      unique2 = rel.concat(gs_id)

      if (unique1 in uniqueRelations || unique2 in uniqueRelations)
        continue
      else {
        uniqueRelations[unique1] = true
        temp = {
          "source": gs_id,
          "target": rel,
          "value": graph[key]["citation_count"] + graph[rel]["citation_count"]
        }
        if (temp.value > maxVal)
          maxVal = temp.value
        gLinks.push(temp)
      }
    }
  }

  var linkScale = d3.scaleLog()
  .domain([10, maxVal])
  .range([1, 5]);

  var radiusScale = d3.scaleLinear()
  .domain([0, maxVal])
  .range([5, 20]);

  var link = svg.append("g")
    .attr("class", "links")
    .selectAll("line")
    .data(gLinks)
    .enter().append("line")
    .attr("stroke-width", function (d) {
      return linkScale(d.value);
    });

  var gNodes = d3.entries(graph);
  var node = svg.append("g")
    .attr("class", "nodes")
    .selectAll("g")
    .data(gNodes)
    .enter().append("g")


  svg.call(d3.zoom()
    .extent([
      [0, 0],
      [width, height]
    ])
    .scaleExtent([-8, 8])
    .on("zoom", zoomed));

  var radius = 5
  var circles = node.append("circle")
    .attr("r", function (d) {
      return radiusScale(d.value.citation_count);
    })
    .attr("fill", function (d) {
      return "blue";
      // return color(d.group);
    })
    .attr("cx", width / 2)
    .attr("cy", height / 2)
    .call(d3.drag()
      .on("start", dragstarted)
      .on("drag", dragged)
      .on("end", dragended));

  var lables = node.append("text")
    .text(function (d) {
      return d.value["title"];
    })
    .attr('x', 6)
    .attr('y', 3);

  node.append("title")
    .text(function (d) {
      return d.key;
    });

  simulation
    .nodes(gNodes)
    .on("tick", ticked);

  simulation.force("link")
    .links(gLinks);

  function zoomed() {
    link.attr("transform", d3.event.transform);
    node.attr("transform", d3.event.transform);
    circles.attr("transform", d3.event.transform);
    lables.attr("transform", d3.event.transform);
  }


  function ticked() {
    link
      .attr("x1", function (d) {
        return d.source.x;
      })
      .attr("y1", function (d) {
        return d.source.y;
      })
      .attr("x2", function (d) {
        return d.target.x;
      })
      .attr("y2", function (d) {
        return d.target.y;
      });

    node
      .attr("transform", function (d) {
        return "translate(" + d.x + "," + d.y + ")";
      })
  }
});

function dragstarted(d) {
  if (!d3.event.active) simulation.alphaTarget(0.3).restart();
  d.fx = d.x;
  d.fy = d.y;
}

function dragged(d) {
  d.fx = d3.event.x;
  d.fy = d3.event.y;
}

function dragended(d) {
  if (!d3.event.active) simulation.alphaTarget(0);
  d.fx = null;
  d.fy = null;
}