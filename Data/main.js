var template = Handlebars.compile(`
<div class="card" id="{{gs_id}}" style="border-color: {{col}}">
	<a target="_blank" class="link" href="{{link}}">
		<h2 class="title">{{title}}</h2>
		<span class="info">{{info}}</span>
	</a>
	<div class="desc">{{desc}}</div>
	<div class="scholar">
		<span class="find" id="{{gs_id}}" style="cursor: pointer;"><i class="fas fa-compress-arrows-alt"></i></span>
		<span class="isolate" id="{{gs_id}}" style="cursor: pointer;"><i class="fas fa-project-diagram"></i></span>
		<span class="type" >{{type}}</span>
		<a target="_blank" href="https://scholar.google.com/scholar?cites={{cited_by_link}}&as_sdt=2005&sciodt=0,5&hl=en" class="sc_citing">Cited by {{cited_by}}</a>
		<a target="_blank" href="https://scholar.google.com/scholar?q=related:{{related_link}}:scholar.google.com/&scioq=&hl=en&as_sdt=2005&sciodt=0,5" class="related">Related</a>
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

var colors = ["#7f0000", "#cc0000", "#ff4444", "#ff7f7f", "#ffb2b2", "#995100", "#cc6c00", "#ff8800", "#ffbb33", "#ffe564", "#2c4c00", "#436500", "#669900", "#99cc00", "#d2fe4c", "#3c1451", "#6b238e", "#9933cc", "#aa66cc", "#bc93d1", "#004c66", "#007299", "#0099cc", "#33b5e5", "#8ed5f0", "#660033", "#b20058", "#e50072", "#ff3298", "#ff7fbf"]
// var color = d3.scaleOrdinal(colors);
var colors = d3.schemeCategory10
colors = colors.concat(d3.schemeCategory20)
colors = colors.concat(d3.schemeCategory20b)
colors = colors.concat(d3.schemeCategory20c)
var color = d3.scaleOrdinal(colors);

d3.select("#chartId")
	.append("div")
	.classed("svg-container", true)
	.append("svg")
	.attr("preserveAspectRatio", "xMinYMin meet")
	.attr("viewBox", "0 0 " + window.innerWidth + " " + window.innerHeight)
	.classed("svg-content-responsive", true)

var svg = d3.select("svg"),
	width = +svg.attr("width"),
	height = +svg.attr("height");

translateG = svg.append("g").attr("id", "test-trans").attr("transform", "translate(0,0)");
zoomG = translateG.append("g")
var prevTrans;

svg = zoomG.append("g").attr("transform", "translate(" + outerRadius + "," + outerRadius + ")");


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


	var dAxes = svg.selectAll(".axis")
		.data(nodesByType)
		.enter().append("line")
		.attr("class", "axis")
		.attr("transform", function (d) {
			return "rotate(" + degrees(angle(d.key)) + ")";
		})
		.style("cursor", "pointer")
		.style("stroke-width", "2px")
		.style("stroke", function (d) {
			return color(d.key);
		})
		.attr("x1", radius(0) * 2 - 15)
		.attr("x2", radius(0) * 2 - 26)
		.on("click", clickOnAxis)

	// Draw the axes.
	var dAxesCircle = svg.selectAll(".axiscir")
		.data(nodesByType)
		.enter().append("circle")
		.attr("class", "axis")
		.attr("transform", function (d) {
			return "rotate(" + degrees(angle(d.key)) + ")";
		})
		.style("cursor", "pointer")
		.style("fill", "transparent")
		.style("stroke-width", "2px")
		.style("stroke", function (d) {
			return color(d.key);
		})
		.attr("cx", radius(0) * 2 - 30)
		.attr("r", 4)
		.on("click", clickOnAxis)

	// .attr("x2", function (d) {
	// 	return radius(d.count * 4)* 2 + 10;
	// });

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
		.on("click", linkMouseClick)
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

	var dForm = d3.select("input")
		.on("keydown", search)

	var dFocus = d3.selectAll(".find")
		.on("click", cardMouseOver);

	var dIsolate = d3.selectAll(".isolate")
		.on("click", cardIsolate);

	var dReset = svg.selectAll(".reset")
		.data([1])
		.enter().append("circle")
		.attr("class", "axis")
		.style("cursor", "pointer")
		.style("fill", "#222")
		.style("stroke-width", "0")
		.style("stroke", function (d) {
			return color(d.key);
		})
		.attr("cx", 0)
		.attr("r", 20)
		.on("click", resetGraph)

	function search() {
		// if is ENTER
		if (d3.event.keyCode == 13) {
			accumHTML = ""

			term = this.value
			svg.selectAll(".node").each(function (p) {
				t = p.title.toLowerCase().includes(term)
				d = p.description.toLowerCase().includes(term)
				i = false
				Array.from(p.info).forEach(function (item) {
					i = i || item.toLowerCase().includes(term)
				});

				if (t || d || i) {
					accumHTML += generateCard(p);
				}
			});

			setCards(accumHTML);
		}
	}

	function setCards(html) {
		info.html(html);
		dFocus = d3.selectAll(".find")
			.on("click", cardMouseOver);

		dIsolate = d3.selectAll(".isolate")
			.on("click", cardIsolate);
	}


	function isLinked(p, d) {
		return p.source.node === d || p.target.node === d;
	}

	function resetGraph() {
		setNodeClass(null, "hover", function () {
			return false
		});

		setNodeClass(null, "active", function () {
			return false
		});

		setNodeClass(null, "hide", function () {
			return false
		});

		setLinkClass(null, "active", function () {
			return false
		});

		setLinkClass(null, "hover", function () {
			return false
		});

		setLinkClass(null, "hide", function () {
			return false
		});
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

		c = d3.color(color(d.packageName))
		temp = template({
			link: d.link,
			title: d.title,
			desc: d.description,
			info: inf,
			gs_id: d.gs_id,
			type: d.ptype == "" ? 'N/A' : d.ptype,
			col: `rgba(${c.r},${c.g},${c.b}, 1)`,
			cited_by: d.citation_count,
			cited_by_link: d.cite_url,
			related_link: d.gs_id
		})

		return temp;
	}


	function isolateNodes(d, func) {
		var accumHTML = ""

		svg.selectAll(".node").classed("active", function (p) {
			var flag = func(p, d);
			if (flag)
				accumHTML += generateCard(p)
			return flag
		});

		svg.selectAll(".node").classed("hide", function (p) {
			var flag = func(p, d);
			return !flag
		});

		return accumHTML
	}


	function isolateLinks(d, func) {
		svg.selectAll(".link").classed("active", function (p) {
			return func(p, d);
		});

		svg.selectAll(".link").classed("hide", function (p) {
			return !func(p, d)
		});
	}

	function setNodeClass(d, clss, func) {
		var accumHTML = ""

		svg.selectAll(".node").classed(clss, function (p) {
			var flag = func(p, d);
			if (flag)
				accumHTML += generateCard(p)
			return flag
		});

		return accumHTML;
	}

	function setLinkClass(d, clss, func) {
		svg.selectAll(".link").classed(clss, function (p) {
			return func(p, d);
		});
	}

	function hideLinks(flag) {
		svg.selectAll(".link").classed("hide", flag);
	}

	function cardMouseOver(d) {
		var gs_id = d3.select(this).attr('id')
		svg.selectAll(".node").each(function (p) {
			var isHidden = d3.select(this).classed("hide");
			if (p.gs_id == gs_id && !isHidden) {
				var x = 0;
				var y = 0;
				var elem = this.getBoundingClientRect()
				var midW = window.innerWidth / 2
				var midH = window.innerHeight / 2

				var left = elem.left + (elem.width / 2)
				var top = elem.top + (elem.height / 2)

				// if (Math.abs(left - midW) > 50) {
				if (left < midW) {
					if (left < 0)
						x += Math.abs(left) + midW
					else
						x += midW - left
				} else if (left > midW) {
					x += -(left - midW)
				}
				// }


				// if (Math.abs(top - midH) > 50) {
				if (top < midH) {
					if (top < 0)
						y += Math.abs(top) + midH
					else
						y += midH - top
				} else if (top > midH) {
					y += -(top - midH)
				}
				// }

				var scale = d3.zoomTransform(zoomElem.node()).k

				zoomElem.transition().duration(1000).call(zoom.translateBy, x / scale, y /scale)
					.on("end", function () {
						zoomElem.transition().duration(1000).call(zoom.scaleTo, 3)
					});

				d3.selectAll(".active").classed("active", false);
				d3.selectAll(".hover").classed("hover", false);
				d3.select(this).classed("active", true);
				d3.select(this).classed("hover", false);
			}
		});
	}


	function clickOnAxis(d) {
		var accumHTML = isolateNodes(d, function (a, b) {
			return a.packageName == b.key;
		})

		isolateLinks(d, function (p, d) {
			var t = parseInt(d.key)
			return t == p.source.node.packageName || t == p.target.node.packageName;
		})
		// hideLinks(true)

		setCards(accumHTML)

	}

	function linkMouseClick(d) {
		isolateNodes(d, function (p, d) {
			return isLinked(d, p);
		})

		isolateLinks(d, function (p, d) {
			return p === d;
		})

		setCards(generateCard(d.source.node) + generateCard(d.target.node));
	}

	// Highlight the link and connected nodes on mouseover.
	function linkMouseover(d) {
		setLinkClass(d, "hover", function (p, d) {
			return p === d;
		})

		var accumHTML = setNodeClass(d, "hover", function (p, d) {
			return p === d.source.node || p === d.target.node;
		})

		setCards(accumHTML)
	}

	// Highlight the node and connected links on mouseover.
	function nodeMouseover(d) {
		var accumHTML = generateCard(d)

		svg.selectAll(".active").classed("active", false);
		svg.selectAll(".link").classed("hover", function (p) {
			return isLinked(p, d);
		});

		svg.selectAll(".node").classed("hover", function (p) {
			flag = isInRelated(p, d);
			if (flag)
				accumHTML += generateCard(p)
			return flag
		});


		d3.select(this).classed("hover", true);
		d3.select(this).classed("hide", false);

		// elem = this.getBoundingClientRect()
		// console.log(elem.top, elem.left);

		setCards(accumHTML);
	}

	function cardIsolate(d) {
		gs_id = d3.select(this).attr('id')
		svg.selectAll(".node").each(function (p) {
			if (p.gs_id == gs_id) {
				nodeMouseClick(p, this)
			}
		});

	}

	function nodeMouseClick(d, element) {
		var accumHTML = ""
		// if (d3.select(this).classed("active")) {
		// 	svg.selectAll(".active").classed("active", false);
		// 	svg.selectAll(".hide").classed("hide", false);
		// } else {
		svg.selectAll(".hover").classed("hover", false);


		accumHTML += isolateNodes(d, function (p, d) {
			return isInRelated(p, d);
		})

		isolateLinks(d, function (p, d) {
			return isLinked(p, d);
		})

		if (!Number.isInteger(element)) {
			d3.select(element).classed("active", true);
			d3.select(element).classed("hide", false);
		} else {
			d3.select(this).classed("active", true);
			d3.select(this).classed("hide", false);
		}
		// }

		setCards(generateCard(d) + accumHTML);
	}

	// Clear any highlighted nodes or links.
	function mouseout() {
		svg.selectAll(".active").classed("active", false);
		// info.text(defaultInfo);
	}



	var zoom = d3.zoom()
		.scaleExtent([-8, 8])
		.on("zoom", zoomed)

	var zoomElem = d3.select("svg");
	zoomElem.call(zoom);


	function decomposeTranslation(transZ) {
		var temp = transZ.substring(transZ.indexOf("(") + 1, transZ.indexOf(")")).split(",");
		return [parseFloat(temp[0]), parseFloat(temp[1])];

	}

	function composeTranslation(x, y) {
		return `translate(${x},${y}) `
	}

	function zoomed() {
		z = d3.event.transform

		// try {
		// 	t = zoomG.attr("transform").split(" ");
		// 	t = decomposeTranslation(t[0])

		// 	dx = prevTrans[0] - z.x;
		// 	dy = prevTrans[1] - z.y;
		// 	z.x = dx + t[0]
		// 	z.y = dy + t[1]
		// 	// zoomG.attr("transform", decomposeTranslation(z.x, z.y) + `scale(${z.k})`);
		// } catch {}
		zoomG.attr("transform", z);
		// zoom.transform(zoomElem, d3.zoomTransform(zoomElem.node()))
		prevTrans = [z.x, z.y];
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