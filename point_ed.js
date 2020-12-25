var map, points, selected, cm, iconRed;

window.onload = function() {
  map = L.map('map', { doubleClickZoom: false }).setView([45, 20], 4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a>'
  }).addTo(map);
  points = L.featureGroup().addTo(map);

  console.log(localStorage.getItem('saved'))
  if (localStorage.getItem('saved'))
    document.getElementById('restore').display = 'block';

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
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    shadowSize: [41, 41]
  });

  document.addEventListener('keydown', function(e) {
    if (event.key == 'Escape')
      unselect();
  });

  map.on('dblclick', function(e) {
    addPoint(e.latlng);
  });
};

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
    selected.setIcon(new L.Icon.Default());
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
  selected.setIcon(iconRed);
  selected.dragging.enable();
  cm.setValue(propsToText(selected));
  document.getElementById('sidebar-props').style.visibility = 'inherit';
  document.getElementById('sidebar-empty').style.display = 'none';
  cm.focus();
}

function addPoint(coord) {
  document.getElementById('sidebar-start').style.display = 'none';
  if (!coord)
    coord = map.getCenter();
  let m = L.marker(coord);
  m.on('click', selectPoint);
  m.feature = m.toGeoJSON();
  points.addLayer(m);
  selectPoint({target: m});
}

function deletePoint() {
  var p = selected;
  unselect();
  points.removeLayer(p);
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
      newProps[k.trim()] = parts[3].trim();
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
  if (points)
    map.removeLayer(points);
  points = L.geoJSON(data, {
    onEachFeature(f, layer) {
      layer.on('click', selectPoint);
      let name = getPointName(layer);
      if (name)
        layer.bindTooltip(name);
    }
  });
  map.addLayer(points);
  document.getElementById('sidebar-start').style.display = 'none';
  map.fitBounds(points.getBounds());
}

function loadFile(input) {
  let reader = new FileReader();
  reader.readAsText(input.files[0]);
  reader.onerror = function() {
    window.alert('Failed to read a file, try again');
  }
  reader.onload = function() {
    doLoad(reader.result);
  }
}

function restoreSaved() {
  doLoad(localStorage.getItem('saved'));
}

function savePoints() {
  let pointsStr = points ? JSON.stringify(points.toGeoJSON()) : null;
  let link = document.getElementById('downlink');
  link.setAttribute('href', points ? 'data:application/geo+json;charset=utf-8,' + encodeURIComponent(pointsStr) : '#');
  localStorage.setItem('saved', pointsStr);
  document.getElementById('download').style.display = points ? 'block' : 'none';
}
