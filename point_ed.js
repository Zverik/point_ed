var map, points, filtered, filter, selected, cm, iconRed, iconSmall;
var smallIcons = true;

window.onload = function() {
  map = L.map('map', { doubleClickZoom: false }).setView([45, 20], 4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a>',
    maxZoom: 19
  }).addTo(map);
  points = L.featureGroup();
  filtered = L.featureGroup().addTo(map);
  updateFiltered();

  if (localStorage.getItem('savedPoints'))
    document.getElementById('restore').style.display = 'block';

  CodeMirror.defineSimpleMode('props1', {
    start: [
      { regex: /("[^"]+"|[^ ]+)/, token: 'keyword', sol: true }
    ]
  });
  cm = CodeMirror.fromTextArea(document.getElementById('props'), {
    mode: 'props1', lineWrapping: true
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

function canTouchField(k, v) {
  let goodTypes = ['number', 'string', 'boolean', 'bigint'];
  return k.substring(0, 1) != '$' && goodTypes.indexOf(typeof v) >= 0;
}

function unselect() {
  if (selected) {
    let newProps = textToProps(cm.getValue(), selected.feature.properties);
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
    updateFiltered();
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
  cm.setCursor(cm.lineCount(), 0);
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
  filtered.addLayer(m);
  selectPoint({target: m});
}

function deletePoint() {
  var p = selected;
  unselect();
  filtered.removeLayer(p);
  points.removeLayer(p);
  if (points.getLayers().length == 0) {
    document.getElementById('sidebar-empty').style.display = 'none';
    document.getElementById('sidebar-start').style.display = 'block';
  } else
    savePoints();
}

function getPointName(point) {
  let props = point.feature.properties;
  if (props['name']) return ''+props.name;
  if (props['title']) return ''+props.title;
  if (props['id']) return ''+props.id;
  if (props['ref']) return ''+props.ref;
  for (p in props) {
    if (p.toLowerCase().indexOf('name') >= 0) return '' + props[p];
    if (p.toLowerCase().indexOf('title') >= 0) return '' + props[p];
  }
  return null;
}

function propsToText(point) {
  let props = point.feature.properties;
  let s = '';
  for (p in props) {
    if (canTouchField(p, props[p])) {
      let k = p.indexOf(' ') >= 0 ? '"' + p + '"' : p;
      let v = (typeof props[p] == 'string' &&
        props[p].match(/^(\d*\.?\d+|true|false)$/i)) ?
        '"' + props[p] + '"' : props[p];
      s += k + '  ' + v + '\n';
    }
  }
  return s;
}

function textToProps(s, props) {
  let newProps = {};
  for (p in props)
    if (!canTouchField(p, props[p]))
      newProps[p] = props[p];

  for (let line of s.split('\n')) {
    let parts = line.trim().match(/^(?:"([^"]+)"|([^ ]+))\s+(.+)$/);
    if (parts && parts[3]) {
      let k = parts[1] || parts[2];
      let v = parts[3].trim();
      if (v.match(/^".*"$/))
        newProps[k.trim()] = v.substring(1, v.length - 1).trim();
      else if (v.toLowerCase() == 'true')
        newProps[k.trim()] = true;
      else if (v.toLowerCase() == 'false')
        newProps[k.trim()] = false;
      else {
        let vNum = Number(v);
        newProps[k.trim()] = isNaN(vNum) ? v : vNum;
      }
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
    if (p1[k] != p2[k])
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
  points = L.geoJSON(data, {
    onEachFeature(f, layer) {
      layer.on('click', selectPoint);
      layer.setIcon(getIcon());
      let name = getPointName(layer);
      if (name)
        layer.bindTooltip(name);
    }
  });
  updateFiltered();
  document.getElementById('sidebar-start').style.display = 'none';
  if (filtered.getLayers().length > 0)
    map.fitBounds(filtered.getBounds(), {maxZoom: 16});
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

function updateLinks() {
  let pointsStr = points.getLayers().length > 0 ? JSON.stringify(points.toGeoJSON()) : null;
  let filterStr = filtered.getLayers().length > 0 ? JSON.stringify(filtered.toGeoJSON()) : null;
  let link = document.getElementById('downlink');
  let linkF = document.getElementById('downfilter');
  link.setAttribute('href', pointsStr ? 'data:application/geo+json;charset=utf-8,' + encodeURIComponent(pointsStr) : '#');
  linkF.setAttribute('href', filterStr ? 'data:application/geo+json;charset=utf-8,' + encodeURIComponent(filterStr) : '#');
  document.getElementById('download').style.display = pointsStr ? 'block' : 'none';
}

function savePoints() {
  updateLinks();
  let pointsStr = points.getLayers().length > 0 ? JSON.stringify(points.toGeoJSON()) : null;
  localStorage.setItem('savedPoints', pointsStr);
  localStorage.setItem('savedPointsName', document.getElementById('downlink').getAttribute('download'));
}

function matchesFilter(props, tokens) {
  for (let token of tokens) {
    if (token != '') {
      let neg = token[0] == '-';
      if (neg)
        token = token.substring(1).trimStart();
      let semi = token.indexOf(':')
      let eq = token.indexOf('=')
      let matches;
      if (semi > 0 && (eq < 0 || semi < eq)) {
        let k = token.substring(0, semi).trimEnd();
        let v = token.substring(semi+1).trimStart();
        matches = k in props && props[k].indexOf(v) >= 0;
      } else if (eq > 0 && (semi < 0 || eq < semi)) {
        let k = token.substring(0, eq).trimEnd();
        let v = token.substring(eq+1).trimStart();
        matches = k in props && props[k] == v;
      } else {
        matches = token in props;
      }
      if (neg)
        matches = !matches;
      if (!matches)
        return false;
    }
  }
  return true
}

function updateFiltered() {
  if (!filter) {
    for (let f of filtered.getLayers()) {
      if (!points.hasLayer(f))
        filtered.removeLayer(f);
    }
    points.eachLayer(function(f) {
      if (!filtered.hasLayer(f))
        filtered.addLayer(f);
    });
  } else {
    let tokens = filter.split(/\s+/);
    points.eachLayer(function(p) {
      if (p == selected || matchesFilter(p.feature.properties, tokens)) {
        if (!filtered.hasLayer(p))
          filtered.addLayer(p);
      } else {
        if (filtered.hasLayer(p))
          filtered.removeLayer(p);
      }
    });
    for (let f of filtered.getLayers()) {
      if (!points.hasLayer(f))
        filtered.removeLayer(f);
    }
  }
  updateLinks();
}

function updateFilter(value) {
  filter = value;
  updateFiltered();
}

function clearFilter() {
  document.getElementById('filter').value = '';
  filter = null;
  updateFiltered();
}
