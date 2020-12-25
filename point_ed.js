var map, points, selected, cm, iconRed, iconSmall;
var smallIcons = true;

window.onload = function() {
  map = L.map('map', { doubleClickZoom: false }).setView([45, 20], 4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a>',
    maxZoom: 19
  }).addTo(map);
  points = L.featureGroup().addTo(map);

  if (localStorage.getItem('savedPoints'))
    document.getElementById('restore').style.display = 'block';

  CodeMirror.defineSimpleMode('props1', {
    start: [
      { regex: /("[^"]+"|[^ ]+)/, token: 'keyword', sol: true }
    ]
  });
  cm = CodeMirror.fromTextArea(document.getElementById('props'), {
    mode: 'props1'
  });

  iconRed = L.icon({
    iconUrl: 'marker-red.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
		iconSize:    [25, 41],
		iconAnchor:  [12, 41],
		popupAnchor: [1, -34],
		tooltipAnchor: [16, -28],
		shadowSize:  [41, 41]
  });

  iconSmall = new L.Icon.Default({
    iconSize: [13, 21],
    iconAnchor: [6, 21],
    popupAnchor: [1, -17],
    tooltipAnchor: [8, -14],
    shadowSize: [21, 21]
  });

  document.addEventListener('keydown', function(e) {
    if (event.key == 'Escape')
      unselect();
  });

  map.on('dblclick', function(e) {
    addPoint(e.latlng);
  });
  map.on('click', unselect);

  document.addEventListener('dragover', function(e) {
    e.stopPropagation();
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  document.addEventListener('drop', function(e) {
    e.stopPropagation();
    e.preventDefault();
    if (e.dataTransfer.files)
      loadFile(e.dataTransfer);
  });
};

function getIcon(isSelected) {
  if (isSelected)
    return iconRed;
  return smallIcons ? iconSmall : L.Marker.prototype.options.icon;
}

function toggleIconSize() {
  smallIcons = !smallIcons;
  points.eachLayer(function(m) {
    if (m != selected)
      m.setIcon(getIcon());
  });
}

function unselect() {
  if (selected) {
    let newProps = textToProps(cm.getValue());
    if (!compareProps(newProps, selected.feature.properties)) {
      selected.feature.properties = newProps;
      let name = getPointName(selected);
      if (name)
        selected.bindTooltip(name);
      else
        selected.unbindTooltip();
    }
    cm.setValue('');
    savePoints();
    selected.setIcon(getIcon());
    selected.dragging.disable();
    selected = null;
  }
  document.getElementById('sidebar-props').style.visibility = 'hidden';
  document.getElementById('sidebar-empty').style.display = 'block';
}

function selectPoint(e) {
  let point = e.target;
  if (selected)
    unselect();
  selected = point;
  selected.setIcon(getIcon(true));
  selected.dragging.enable();
  cm.setValue(propsToText(selected));
  document.getElementById('sidebar-props').style.visibility = 'inherit';
  document.getElementById('sidebar-empty').style.display = 'none';
  cm.focus();
}

function addPoint(coord) {
  document.getElementById('sidebar-start').style.display = 'none';
  if (points.getLayers().length == 0)
    clearStorage();
  if (!coord)
    coord = map.getCenter();
  let m = L.marker(coord, { icon: getIcon() });
  m.on('click', selectPoint);
  m.feature = m.toGeoJSON();
  points.addLayer(m);
  selectPoint({target: m});
}

function deletePoint() {
  var p = selected;
  unselect();
  points.removeLayer(p);
  if (points.getLayers().length == 0) {
    document.getElementById('sidebar-empty').style.display = 'none';
    document.getElementById('sidebar-start').style.display = 'block';
  } else
  savePoints();
}

function getPointName(point) {
  let props = point.feature.properties;
  if (props['name']) return props.name;
  if (props['title']) return props.title;
  if (props['id']) return props.id;
  for (p in props) {
    if (p.toLowerCase().indexOf('name') >= 0) return props[p];
    if (p.toLowerCase().indexOf('title') >= 0) return props[p];
  }
  return null;
}

function propsToText(point) {
  let props = point.feature.properties;
  let s = '';
  for (p in props) {
    s += (p.indexOf(' ') >= 0 ? '"' + p + '"' : p) + '  ' + props[p] + '\n';
  }
  return s;
}

function textToProps(s) {
  let newProps = {};
  for (let line of s.split('\n')) {
    let parts = line.trim().match(/^(?:"([^"]+)"|([^ ]+))\s+(.+)$/);
    if (parts && parts[3]) {
      let k = parts[1] || parts[2];
      let v = parts[3].trim();
      let vNum = Number(v);
      newProps[k.trim()] = isNaN(vNum) ? v : vNum;
    }
  }
  return newProps;
}

function compareProps(p1, p2) {
  let k1 = Object.keys(p1);
  let k2 = Object.keys(p2);
  if (k1.length != k2.length)
    return false;
  for (let k of k1)
    if (k1[k] != k2[k])
      return false;
  return true;
}

function doLoad(content) {
  let data = null;
  try {
    data = JSON.parse(content);
  } catch (error) {
    window.alert(error);
    return;
  }

  unselect();
  map.removeLayer(points);
  points = L.geoJSON(data, {
    onEachFeature(f, layer) {
      layer.on('click', selectPoint);
      layer.setIcon(getIcon());
      let name = getPointName(layer);
      if (name)
        layer.bindTooltip(name);
    }
  });
  map.addLayer(points);
  document.getElementById('sidebar-start').style.display = 'none';
  map.fitBounds(points.getBounds(), {maxZoom: 15});
}

function loadFile(input) {
  let reader = new FileReader();
  let fileName = input.files[0].name;
  reader.readAsText(input.files[0]);
  reader.onerror = function() {
    window.alert('Failed to read a file, try again');
  }
  reader.onload = function() {
    clearStorage();
    document.getElementById('downlink').setAttribute('download', fileName);
    doLoad(reader.result);
  }
}

function restoreSaved() {
  doLoad(localStorage.getItem('savedPoints'));
  if (localStorage.getItem('savedPointsName'))
    document.getElementById('downlink').setAttribute('download', localStorage.getItem('savedPointsName'));
}

function clearStorage() {
  localStorage.removeItem('savePoints');
  localStorage.removeItem('savePointsName');
}

function savePoints() {
  let pointsStr = points.getLayers().length > 0 ? JSON.stringify(points.toGeoJSON()) : null;
  let link = document.getElementById('downlink');
  link.setAttribute('href', points ? 'data:application/geo+json;charset=utf-8,' + encodeURIComponent(pointsStr) : '#');
  localStorage.setItem('savedPoints', pointsStr);
  localStorage.setItem('savedPointsName', document.getElementById('downlink').getAttribute('download'));
  document.getElementById('download').style.display = pointsStr ? 'block' : 'none';
}
