var margin = {
		top: 150,
		right: 0,
		bottom: 10,
		left: 150
	},
	width = window.innerWidth,
	height = window.innerHeight;

var x = d3.scaleBand().range([0, width]),
	z = d3.scaleLinear().domain([0, 4]).clamp(true),
	c = d3.scaleOrdinal(d3.schemeCategory10);

var svg = d3.select("body").append("svg")
	.attr("width", width + margin.left + margin.right)
	.attr("height", height + margin.top + margin.bottom)
	.style("margin-left", -margin.left + "px")
	
var gg = svg.append("g")
	.attr("transform", "translate(" + margin.left + "," + margin.top + ")");

svg.call(d3.zoom()
	.extent([
		[0, 0],
		[width + margin.left + margin.right, height + margin.top + margin.bottom]
	])
	.scaleExtent([1, 8])
	.on("zoom", zoomed));

function zoomed() {
	gg.attr("transform", d3.event.transform);
}

function processData(graph) {

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
	return gLinks;
}

d3.json("db.json", function (ms) {
	g = ms
	miserables = {}
	miserables["nodes"] = d3.entries(ms);
	miserables["links"] = processData(ms)
	var matrix = [],
		nodes = miserables.nodes,
		n = nodes.length;

	// Compute index per node.
	nodes.forEach(function (node, i) {
		node.index = i;
		g[node.key].index = i
		node.count = 0;
		g[node.key].count = 0
		matrix[i] = d3.range(n).map(function (j) {
			return {
				x: j,
				y: i,
				z: 0
			};
		});
	});

	// Convert links to matrix; count character occurrences.
	miserables.links.forEach(function (link) {
		matrix[g[link.source].index][g[link.target].index].z += link.value;
		matrix[g[link.target].index][g[link.source].index].z += link.value;
		matrix[g[link.source].index][g[link.source].index].z += link.value;
		matrix[g[link.target].index][g[link.target].index].z += link.value;
		nodes[g[link.source].index].count += link.value;
		nodes[g[link.target].index].count += link.value;
	});

	// Precompute the orders.
	var orders = {
		name: d3.range(n).sort(function (a, b) {
			return d3.ascending(nodes[a].key, nodes[b].key);
		}),
		count: d3.range(n).sort(function (a, b) {
			return nodes[b].count - nodes[a].count;
		})
		// group: d3.range(n).sort(function (a, b) {
		// 	return nodes[b].group - nodes[a].group;
		// })
	};

	// The default sort order.
	x.domain(orders.name);

	var row = gg.selectAll(".row")
		.data(matrix)
		.enter().append("g")
		.attr("class", "row")
		.attr("transform", function (d, i) {
			return "translate(0," + x(i) + ")";
		})
		.each(row);

	row.append("line")
		.attr("x2", width);

	row.append("text")
		.attr("x", -6)
		.attr("y", x.bandwidth() / 2)
		.attr("dy", ".32em")
		.attr("text-anchor", "end")
		.text(function (d, i) {
			return nodes[i].value.title;
		});

	var column = gg.selectAll(".column")
		.data(matrix)
		.enter().append("g")
		.attr("class", "column")
		.attr("transform", function (d, i) {
			return "translate(" + x(i) + ")rotate(-90)";
		});

	column.append("line")
		.attr("x1", -width);

	column.append("text")
		.attr("x", 6)
		.attr("y", x.bandwidth() / 2)
		.attr("dy", ".32em")
		.attr("text-anchor", "start")
		.text(function (d, i) {
			return nodes[i].value.title;
		});

	function row(row) {
		var cell = d3.select(this).selectAll(".cell")
			.data(row.filter(function (d) {
				return d.z;
			}))
			.enter().append("rect")
			.attr("class", "cell")
			.attr("x", function (d) {
				return x(d.x);
			})
			.attr("width", x.bandwidth())
			.attr("height", x.bandwidth())
			.style("fill-opacity", function (d) {
				return z(d.z);
			})
			// .style("fill", function (d) {
			// 	return nodes[d.x].group == nodes[d.y].group ? c(nodes[d.x].group) : null;
			// })
			.on("mouseover", mouseover)
			.on("mouseout", mouseout);
	}

	function mouseover(p) {
		d3.selectAll(".row text").classed("active", function (d, i) {
			return i == p.y;
		});
		d3.selectAll(".column text").classed("active", function (d, i) {
			return i == p.x;
		});
	}

	function mouseout() {
		d3.selectAll("text").classed("active", false);
	}

	d3.select("#order").on("change", function () {
		clearTimeout(timeout);
		order(this.value);
	});

	function order(value) {
		x.domain(orders[value]);

		var t = svg.transition().duration(2500);

		t.selectAll(".row")
			.delay(function (d, i) {
				return x(i) * 4;
			})
			.attr("transform", function (d, i) {
				return "translate(0," + x(i) + ")";
			})
			.selectAll(".cell")
			.delay(function (d) {
				return x(d.x) * 4;
			})
			.attr("x", function (d) {
				return x(d.x);
			});

		t.selectAll(".column")
			.delay(function (d, i) {
				return x(i) * 4;
			})
			.attr("transform", function (d, i) {
				return "translate(" + x(i) + ")rotate(-90)";
			});
	}

	var timeout = setTimeout(function () {
		order("group");
		d3.select("#order").property("selectedIndex", 2).node().focus();
	}, 5000);
});