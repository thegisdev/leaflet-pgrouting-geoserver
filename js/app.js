var geoserverUrl = '/geoserver';
var pointerDown = false;
var currentMarker = null;
var changed = false;
var routeLayer;
var routeSource;
var travelTime;
var travelDist;

// initialize our map
var map = L.map('map', {
  center: [-1.2836622060674874, 36.822524070739746],
  zoom: 15 //set the zoom level
});

//add openstreet baselayer to the map
var OSM = L.tileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution:
    '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

// format a single place name
function formatPlace(name) {
  if (name == null || name == '') {
    return 'unnamed street';
  } else {
    return name;
  }
}

// format the list of place names, which may be single roads or intersections
function formatPlaces(list) {
  var text;
  if (!list) {
    return formatPlace(null);
  }
  var names = list.split(',');
  if (names.length == 0) {
    return formatPlace(null);
  } else if (names.length == 1) {
    return formatPlace(names[0]);
  } else if (names.length == 2) {
    text = formatPlace(names[0]) + ' and ' + formatPlace(names[1]);
  } else {
    text = ' and ' + formatPlace(names.pop());
    names.forEach(function(name) {
      text = name + ', ' + text;
    });
  }

  return 'the intersection of ' + text;
}

// format times for display
function formatTime(time) {
  var mins = Math.round(time * 60);
  if (mins == 0) {
    return 'less than a minute';
  } else if (mins == 1) {
    return '1 minute';
  } else {
    return mins + ' minutes';
  }
}

// format distances for display
function formatDist(dist) {
  var units;
  dist = dist.toPrecision(2);
  if (dist < 1) {
    dist = dist * 1000;
    units = 'm';
  } else {
    units = 'km';
  }

  // make sure distances like 5.0 appear as just 5
  dist = dist.toString().replace(/[.]0$/, '');
  return dist + units;
}

// create a point with a colour and change handler
function createMarker(point) {
  var marker = L.marker(point, { draggable: true });
  return marker;
}

var sourceMarker = createMarker([-1.283147351126288, 36.822524070739746])
  .on('dragend', function(e) {
    console.log('source marker dragend event');
  })
  .addTo(map);

var targetMarker = createMarker([-1.286107765621784, 36.83449745178223])
  .on('dragend', function(e) {
    console.log('target marker dragend event');
  })
  .addTo(map);

// timer to update the route when dragging
window.setInterval(function() {
  if (currentMarker && changed) {
    getVertex(currentMarker);
    getRoute();
    changed = false;
  }
}, 250);

// WFS to get the closest vertex to a point on the map
function getVertex(marker) {
  var coordinates = marker.getLatLng();
  var url =
    geoserverUrl +
    '/wfs?service=WFS&version=1.0.0&' +
    'request=GetFeature&typeName=tutorial:nearest_vertex&' +
    'outputformat=application/json&' +
    'viewparams=x:' +
    coordinates[0] +
    ';y:' +
    coordinates[1];
  $.ajax({
    url: url,
    async: false,
    dataType: 'json',
    success: function(json) {
      loadVertex(json, marker == sourceMarker);
    }
  });
}

// load the response to the nearest_vertex layer
function loadVertex(response, isSource) {
  var features = response.features;
  if (isSource) {
    if (features.length == 0) {
      map.removeLayer(routeLayer);
      source = null;
      return;
    }
    source = features[0];
  } else {
    if (features.length == 0) {
      map.removeLayer(routeLayer);
      target = null;
      return;
    }
    target = features[0];
  }
}

function getRoute() {
  // set up the source and target vertex numbers to pass as parameters
  var viewParams = [
    'source:' + source.getId().split('.')[1],
    'target:' + target.getId().split('.')[1]
  ];

  var url =
    geoserverUrl +
    '/wfs?service=WFS&version=1.0.0&' +
    'request=GetFeature&typeName=tutorial:shortest_path&' +
    'outputformat=application/json&' +
    '&viewparams=' +
    viewParams.join(';');

  // remove the previous layer and create a new one
  map.removeLayer(routeLayer);

  var routeLayer = L.geoJSON(null);

  $.getJSON(url, function(data) {
    routeLayer.addData(data);
  });

  // add the new layer to the map
  map.addLayer(routeLayer);
}

getVertex(sourceMarker);
getVertex(targetMarker);
getRoute();
