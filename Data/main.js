var template = Handlebars.compile(`
<div class="card">
	<a class="link" href="{{link}}">
		<h2 class="title">{{title}}</h2>
		<span class="info">{{info}}</span>
	</a>
	<div class="desc">{{desc}}</div>
	<div class="scholar">
		<a href="https://scholar.google.com/scholar?cites={{cited_by_link}}&as_sdt=2005&sciodt=0,5&hl=en" class="sc_citing">Cited by {{cited_by}}</a>
		<a href="https://scholar.google.com/scholar?q=related:{{related_link}}:scholar.google.com/&scioq=&hl=en&as_sdt=2005&sciodt=0,5" class="related">Related</a>
	</div>
</div>
`);


var margin = {
		top: 150,
		right: 0,
		bottom: 10,
		left: 150
	},
	width = window.innerWidth,
	height = window.innerHeight,
	innerRadius = 90,
	outerRadius = window.innerHeight / 2,
	majorAngle = 2 * Math.PI / 3,
	minorAngle = 1 * Math.PI;

var angle = d3.scaleLinear()
	.range([0, 2 * Math.PI - 0.1]);
// .domain(["source", "source-target", "target-source", "target"])

var radius = d3.scaleLinear()
	.range([innerRadius, outerRadius]);

var radiusScale = d3.scaleLinear()
	.range([5, 20]);

var color = d3.scaleOrdinal(d3.schemeCategory10);

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

svg = svg.append("g").attr("transform", "translate(" + outerRadius + "," + outerRadius + ")");
// var svg = d3.select("#chartId").append("svg")
// .attr("width", width)
// .attr("height", height)
// .append("g")

// Load the data and display the plot!
d3.json("dbClean.json", function (graph) {
	nodes = []
	for (const entry of Object.keys(graph)) {
		temp = graph[entry];
		nodes.push(temp)
	}

	var nodesByName = {},
		links = [],
		formatNumber = d3.format(",d"),
		defaultInfo;

	var highestCitationCount = 0
	var lowestCitationCount = 500000000
	var highestModularity = 0
	// Construct an index by node name.
	nodes.forEach(function (d) {
		d.connectors = [];
		d.packageName = d.info_louvain_modularity;
		nodesByName[d.gs_id] = d;
		if (d.info_page_rank > highestCitationCount)
			highestCitationCount = d.info_page_rank
		if (d.info_page_rank < lowestCitationCount)
			lowestCitationCount = d.info_page_rank
		if (d.packageName > highestModularity)
			highestModularity = d.packageName
	});


	d3.select("svg").call(d3.zoom()
		.extent([
			[0, 0],
			[width, height]
		])
		.scaleExtent([-8, 8])
		.on("zoom", zoomed));



	radiusScale.domain([lowestCitationCount, highestCitationCount]);
	angle.domain([0, highestModularity])
	// Convert the import lists into links with sources and targets.
	nodes.forEach(function (source) {
		related = Object.keys(source.related)
		related.forEach(function (targetName) {
			var target = nodesByName[targetName];
			if (!source.source)
				source.connectors.push(source.source = {
					node: source,
					degree: 0
				});
			if (!target.target)
				target.connectors.push(target.target = {
					node: target,
					degree: 0
				});
			links.push({
				source: source.source,
				target: target.target
			});
		});
	});

	// Determine the type of each node, based on incoming and outgoing links.
	nodes.forEach(function (node) {
		if (node.source && node.target) {
			node.type = node.source.type = "target-source";
			node.target.type = "source-target";
		} else if (node.source) {
			node.type = node.source.type = "source";
		} else if (node.target) {
			node.type = node.target.type = "target";
		} else {
			node.connectors = [{
				node: node
			}];
			node.type = "source";
		}
	});

	// Initialize the info display.
	var info = d3.select("#details");

	// Normally, Hive Plots sort nodes by degree along each axis. However, since
	// this example visualizes a package hierarchy, we get more interesting
	// results if we group nodes by package. We don't need to sort explicitly
	// because the data file is already sorted by class name.

	// Nest nodes by type, for computing the rank.
	var nodesByType = d3.nest()
		.key(function (d) {
			return d.info_louvain_modularity;
		})
		.sortKeys(d3.ascending)
		.entries(nodes);

	// Duplicate the target-source axis as source-target.
	// nodesByType.push({
	// 	key: "source-target",
	// 	values: nodesByType[2].values
	// });

	// Compute the rank for each type, with padding between packages.
	nodesByType.forEach(function (type) {
		var lastName = type.values[0].packageName,
			count = 0;
		type.values.forEach(function (d, i) {
			if (d.packageName != lastName) lastName = d.packageName, count += 2;
			d.index = count++;
		});
		type.count = count - 1;
	});

	// Set the radius domain.
	radius.domain(d3.extent(nodes, function (d) {
		return d.index;
	}));

	// Draw the axes.
	// var dAxes = svg.selectAll(".axis")
	// 	.data(nodesByType)
	// 	.enter().append("line")
	// 	.attr("class", "axis")
	// 	.attr("transform", function (d) {
	// 		if (isNaN(d.key))
	// 			console.log("hello");

	// 		return "rotate(" + degrees(angle(d.key)) + ")";
	// 	})
	// 	.attr("x1", radius(0) * 2 - 10)
	// 	.attr("x2", function (d) {
	// 		return radius(d.count * 4)* 2 + 10;
	// 	});

	// Draw the links.
	var dLinks = svg.append("g")
		.attr("class", "links")
		.selectAll(".link")
		.data(links)
		.enter().append("path")
		.attr("class", "link")
		.attr("d", link()
			.angle(function (d) {
				return angle(d.node.packageName);
			})
			.radius(function (d) {
				return radius(d.node.index * 2) * 2;
			}))
		.on("mouseover", linkMouseover)
		.on("mouseout", mouseout);

	// Draw the nodes. Note that each node can have up to two connectors,
	// representing the source (outgoing) and target (incoming) links.
	var dNodes = svg.append("g")
		.attr("class", "nodes")
		.selectAll(".node")
		.data(nodes)
		.enter().append("circle")
		.attr("class", "node")
		.style("fill", function (d) {
			return color(d.packageName);
		})
		.attr("transform", function (d) {
			// console.log(d.packageName);
			return "rotate(" + degrees(angle(d.packageName)) + ")";

		})
		.attr("cx", function (d) {
			return radius(d.index * 2) * 2;
		})
		.attr("r", function (d) {
			// return 4;
			return radiusScale(d.info_page_rank);
		})
		.on("mouseover", nodeMouseover)
		// .on("mouseout", mouseout)
		.on("click", nodeMouseClick)


	function isLinked(p, d) {
		return p.source.node === d || p.target.node === d;
	}

	function isInRelated(p, d) {
		return (p.gs_id in d.related) || (d.gs_id in p.related);
	}

	function generateCard(d) {
		inf = ""
		Array.from(d.info).forEach(function (item, index) {
			sufix = index != d.info.length - 1 ? " - " : "";
			inf += `${item} ${sufix}`
		})

		temp = template({
			link: d.link,
			title: d.title,
			desc: d.description,
			info: inf,
			cited_by: d.citation_count,
			cited_by_link: d.cite_url,
			related_link: d.gs_id
		})

		return temp;
	}


	// Highlight the link and connected nodes on mouseover.
	function linkMouseover(d) {
		svg.selectAll(".link").classed("hover", function (p) {
			return p === d;
		});
		svg.selectAll(".node").classed("hover", function (p) {
			return p === d.source.node || p === d.target.node;
		});
		// info.text(d.source.node.title + " → " + d.target.node.title);
		info.html(generateCard(d.source.node) + generateCard(d.target.node));
	}

	// Highlight the node and connected links on mouseover.
	function nodeMouseover(d) {
		svg.selectAll(".link").classed("hover", function (p) {
			return isLinked(p, d);
		});

		svg.selectAll(".node").classed("hover", function (p) {
			return isInRelated(p, d);
		});

		d3.select(this).classed("hover", true);
		d3.select(this).classed("hide", false);

		info.html(generateCard(d));
	}

	function nodeMouseClick(d) {
		accumHTML = ""
		if (d3.select(this).classed("active")) {
			svg.selectAll(".active").classed("active", false);
			svg.selectAll(".hide").classed("hide", false);

		} else {
			svg.selectAll(".link").classed("active", function (p) {
				flag = isLinked(p, d);
				return flag
			});

			svg.selectAll(".hover").classed("hover", false);

			svg.selectAll(".node").classed("active", function (p) {
				flag = isInRelated(p, d);
				if (flag)
					accumHTML += generateCard(p)
				return flag
			});

			svg.selectAll(".link").classed("hide", function (p) {
				flag = !isLinked(p, d);
				return flag
			});
			svg.selectAll(".node").classed("hide", function (p) {
				flag =  !isInRelated(p, d);
				return flag
			});

			d3.select(this).classed("active", true);
			d3.select(this).classed("hide", false);
		}

		info.html(generateCard(d) + accumHTML);
	}

	// Clear any highlighted nodes or links.
	function mouseout() {
		svg.selectAll(".active").classed("active", false);
		// info.text(defaultInfo);
	}

	function zoomed() {
		svg.attr("transform", d3.event.transform);
	}
});

// A shape generator for Hive links, based on a source and a target.
// The source and target are defined in polar coordinates (angle and radius).
// Ratio links can also be drawn by using a startRadius and endRadius.
// This class is modeled after d3.svg.chord.
function link() {
	var source = function (d) {
			return d.source;
		},
		target = function (d) {
			return d.target;
		},
		angle = function (d) {
			return d.angle;
		},
		startRadius = function (d) {
			return d.radius;
		},
		endRadius = startRadius,
		arcOffset = -Math.PI / 2;

	function link(d, i) {
		var s = node(source, this, d, i),
			t = node(target, this, d, i),
			x;
		if (t.a < s.a) x = t, t = s, s = x;
		if (t.a - s.a > Math.PI) s.a += 2 * Math.PI;
		var a1 = s.a + (t.a - s.a) / 3,
			a2 = t.a - (t.a - s.a) / 3;
		return s.r0 - s.r1 || t.r0 - t.r1 ?
			"M" + Math.cos(s.a) * s.r0 + "," + Math.sin(s.a) * s.r0 +
			"L" + Math.cos(s.a) * s.r1 + "," + Math.sin(s.a) * s.r1 +
			"C" + Math.cos(a1) * s.r1 + "," + Math.sin(a1) * s.r1 +
			" " + Math.cos(a2) * t.r1 + "," + Math.sin(a2) * t.r1 +
			" " + Math.cos(t.a) * t.r1 + "," + Math.sin(t.a) * t.r1 +
			"L" + Math.cos(t.a) * t.r0 + "," + Math.sin(t.a) * t.r0 +
			"C" + Math.cos(a2) * t.r0 + "," + Math.sin(a2) * t.r0 +
			" " + Math.cos(a1) * s.r0 + "," + Math.sin(a1) * s.r0 +
			" " + Math.cos(s.a) * s.r0 + "," + Math.sin(s.a) * s.r0 :
			"M" + Math.cos(s.a) * s.r0 + "," + Math.sin(s.a) * s.r0 +
			"C" + Math.cos(a1) * s.r1 + "," + Math.sin(a1) * s.r1 +
			" " + Math.cos(a2) * t.r1 + "," + Math.sin(a2) * t.r1 +
			" " + Math.cos(t.a) * t.r1 + "," + Math.sin(t.a) * t.r1;
	}

	function node(method, thiz, d, i) {
		var node = method.call(thiz, d, i),
			a = +(typeof angle === "function" ? angle.call(thiz, node, i) : angle) + arcOffset,
			r0 = +(typeof startRadius === "function" ? startRadius.call(thiz, node, i) : startRadius),
			r1 = (startRadius === endRadius ? r0 : +(typeof endRadius === "function" ? endRadius.call(thiz, node, i) : endRadius));
		return {
			r0: r0,
			r1: r1,
			a: a
		};
	}

	link.source = function (_) {
		if (!arguments.length) return source;
		source = _;
		return link;
	};

	link.target = function (_) {
		if (!arguments.length) return target;
		target = _;
		return link;
	};

	link.angle = function (_) {
		if (!arguments.length) return angle;
		angle = _;
		return link;
	};

	link.radius = function (_) {
		if (!arguments.length) return startRadius;
		startRadius = endRadius = _;
		return link;
	};

	link.startRadius = function (_) {
		if (!arguments.length) return startRadius;
		startRadius = _;
		return link;
	};

	link.endRadius = function (_) {
		if (!arguments.length) return endRadius;
		endRadius = _;
		return link;
	};

	return link;
}

function degrees(radians) {
	return radians / Math.PI * 180 - 90;
}