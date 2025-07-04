// ===================================================================================
//  NLCD Land Cover Analysis App with Optional County Selection
// ===================================================================================

var NLCD_ASSETS = {
  '2021': 'USGS/NLCD_RELEASES/2021_REL/NLCD',
  '2019': 'USGS/NLCD_RELEASES/2019_REL/NLCD',
};

var from_classes = [11, 12, 21, 22, 23, 24, 31, 41, 42, 43, 52, 71, 81, 82, 90, 95];
var to_classes   = [1,  1,  2,  2,  2,  2,  3,  4,  4,  4,  5,  6,  7,  8,  9,  9];

var class_names = ['Water', 'Developed', 'Barren', 'Forest', 'Shrubland', 'Grassland', 'Pasture', 'Agriculture', 'Wetlands'];
var class_palette = ['466baf', 'd92d2d', 'b2b2b2', '136612', 'd8b969', 'a3cc51', 'e0e000', 'ab6c24', '6ca986'];
var vis_params = {min: 1, max: 9, palette: class_palette};

var counties = ee.FeatureCollection('TIGER/2018/Counties');
var states = ee.FeatureCollection('TIGER/2018/States');

var active_state_counties = null;
var selected_state = null;

// ===================================================================================
// UI SETUP
// ===================================================================================

ui.root.clear();
var main_panel = ui.Panel({ style: {width: '380px', padding: '10px'} });
var map_panel = ui.Map();
var split_panel = ui.SplitPanel({ firstPanel: main_panel, secondPanel: map_panel });
ui.root.add(split_panel);

main_panel.add(ui.Label({
  value: 'NLCD Land Cover Analyzer',
  style: {fontSize: '24px', fontWeight: 'bold', margin: '0 0 10px 0'}
}));

main_panel.add(ui.Label('Select a state and year to analyze land cover. Optionally choose a county.'));

var year_select = ui.Select({
  items: Object.keys(NLCD_ASSETS),
  placeholder: 'Select a year...',
  style: {stretch: 'horizontal'},
  onChange: onStateOrYearChange
});

var state_select = ui.Select({
  placeholder: 'Loading states...',
  style: {stretch: 'horizontal'},
  onChange: onStateOrYearChange
});

var county_select = ui.Select({
  placeholder: 'Select a county (optional)...',
  style: {stretch: 'horizontal'},
  disabled: true,
  onChange: onCountySelected
});

var export_button = ui.Button({
  label: 'Generate County Stats CSV Link',
  onClick: exportTable,
  disabled: true,
  style: {stretch: 'horizontal'}
});

// Create a placeholder label for the download link/status message.
var download_widget = ui.Label();

main_panel.add(ui.Label('1. Select Analysis Year', {fontWeight: 'bold'}));
main_panel.add(year_select);
main_panel.add(ui.Label('2. Select State', {fontWeight: 'bold'}));
main_panel.add(state_select);
main_panel.add(ui.Label('3. Select County (ptional)', {fontWeight: 'bold'}));
main_panel.add(county_select);

main_panel.add(ui.Label('State Land Cover Distribution', {fontSize: '18px', fontWeight: 'bold'}));
var state_chart_panel = ui.Panel([ui.Label('Select a state to see chart.')]);
main_panel.add(state_chart_panel);

main_panel.add(ui.Label('County Land Cover Distribution', {fontSize: '18px', fontWeight: 'bold'}));
var county_chart_panel = ui.Panel([ui.Label('Optional: Select a county to see chart.')]);
main_panel.add(county_chart_panel);

main_panel.add(ui.Label('4. Export Results', {fontWeight: 'bold'}));
main_panel.add(export_button);
// Add the placeholder widget to the panel. It will be updated with status messages.
main_panel.add(download_widget);


// Load states
states.aggregate_array('NAME').evaluate(function(state_names) {
  state_select.items().reset(state_names.sort());
  state_select.setPlaceholder('Select a state...');
});

map_panel.setCenter(-98.58, 39.82, 4); // USA center

// ===================================================================================
// FUNCTIONALITY
// ===================================================================================

function onStateOrYearChange() {
  var year = year_select.getValue();
  var state_name = state_select.getValue();
  if (!year || !state_name) return;

  selected_state = ee.Feature(states.filter(ee.Filter.eq('NAME', state_name)).first());
  var state_fp = selected_state.get('STATEFP');
  active_state_counties = counties.filter(ee.Filter.eq('STATEFP', state_fp));

  // Populate counties
  active_state_counties.aggregate_array('NAME').evaluate(function(names) {
    county_select.items().reset(names.sort());
    county_select.setDisabled(false);
    county_select.setPlaceholder('Select a county (optional)...');
  });

  // Clear map, zoom to state, show state boundary and land cover
  map_panel.clear();
  selected_state.evaluate(function(f) {
    map_panel.centerObject(ee.Feature(f), 6);
  });

  var nlcd = ee.ImageCollection(NLCD_ASSETS[year]).first().select('landcover');
  var reclassified = nlcd.remap(from_classes, to_classes).rename('landcover');

  map_panel.addLayer(reclassified.clip(selected_state.geometry()), vis_params, 'State Land Cover (' + year + ')');
  
  var state_boundary = ee.FeatureCollection([selected_state]);
  map_panel.addLayer(state_boundary.style({color: 'white', fillColor: '00000000', width: 2}), {}, 'Selected State');

  drawChart(reclassified, selected_state.geometry(), 'State: ' + state_name, state_chart_panel);
  export_button.setDisabled(false);
  download_widget.setValue(''); // Clear any previous download link/message.

  // Reset county chart
  county_chart_panel.clear().add(ui.Label('Optional: Select a county to see chart.'));
}

function onCountySelected(county_name) {
  if (!county_name || !active_state_counties) return;

  var year = year_select.getValue();
  var nlcd = ee.ImageCollection(NLCD_ASSETS[year]).first().select('landcover');
  var reclassified = nlcd.remap(from_classes, to_classes).rename('landcover');

  var county = ee.Feature(active_state_counties.filter(ee.Filter.eq('NAME', county_name)).first());
  var county_fc = ee.FeatureCollection([county]);

  var stateLandCoverLayer = map_panel.layers().get(0);
  map_panel.layers().reset([stateLandCoverLayer]);
  
  map_panel.addLayer(county_fc.style({color: 'yellow', fillColor: '00000000', width: 3}), {}, 'Selected County');
  map_panel.centerObject(county, 8);

  drawChart(reclassified, county.geometry(), 'County: ' + county_name, county_chart_panel);
}

function drawChart(image, region, title, panel) {
  panel.clear().add(ui.Label('Calculating chart...'));

  var areaImage = ee.Image.pixelArea();
  var imageWithArea = areaImage.addBands(image);

  var stats = imageWithArea.reduceRegion({
    reducer: ee.Reducer.sum().group({groupField: 1, groupName: 'class'}),
    geometry: region,
    scale: 1000,
    maxPixels: 1e11
  });

  stats.evaluate(function(statsDict) {
    if (!statsDict || !statsDict.groups || statsDict.groups.length === 0) {
      panel.clear().add(ui.Label('No data found for this region.'));
      return;
    }

    var totalArea = statsDict.groups.reduce(function(acc, item) {
      return acc + item['sum'];
    }, 0);

    var chartData = [['Class', 'Percentage', {role: 'style'}]];
    statsDict.groups.sort(function(a, b) { return a.class - b.class; });

    statsDict.groups.forEach(function(item) {
      var classIndex = item['class'] - 1;
      var className = class_names[classIndex];
      var color = class_palette[classIndex];
      var percentage = (item['sum'] / totalArea) * 100;
      chartData.push([className, percentage, color]);
    });

    var chart = new ui.Chart(chartData, 'ColumnChart', {
      title: title,
      hAxis: {title: 'Land Cover Class', slantedText: true},
      vAxis: {title: 'Area (%)', maxValue: 100},
      legend: {position: 'none'}
    });

    panel.clear().add(chart);
  });
}


// =================================================================================
// UPDATED FUNCTION: Generates a direct download link instead of an export task.
// =================================================================================
function exportTable() {
  var year = year_select.getValue();
  var state_name = state_select.getValue();

  if (!active_state_counties || !year) return;

  // Update UI to show that processing is happening.
  export_button.setDisabled(true);
  download_widget.setValue('⚙️ Generating download link... Please wait.');
  download_widget.style().set({color: 'gray', margin: '4px'});
  download_widget.setUrl(null);

  var nlcd = ee.ImageCollection(NLCD_ASSETS[year]).first().select('landcover');
  var reclassified = nlcd.remap(from_classes, to_classes).rename('landcover');

  var county_stats = reclassified.reduceRegions({
    collection: active_state_counties,
    reducer: ee.Reducer.frequencyHistogram(),
    scale: 100
  });

  var formatStats = function(feature) {
    var hist = ee.Dictionary(feature.get('histogram'));
    var total_pixels = ee.Number(hist.values().reduce(ee.Reducer.sum())).max(1);

    var create_property = function(class_name, feat) {
      feat = ee.Feature(feat);
      class_name = ee.String(class_name);
      var class_index_0 = ee.List(class_names).indexOf(class_name);
      var class_key = class_index_0.add(1).format();
      var count = ee.Number(hist.get(class_key, 0));
      var percentage = count.divide(total_pixels).multiply(100);
      return feat.set(class_name.cat('_percent'), percentage);
    };
    
    var feature_with_percents = ee.Feature(ee.List(class_names).iterate(create_property, feature));
    var final_columns = ['NAME', 'GEOID'].concat(
      class_names.map(function(name) { return name + '_percent'; })
    );
    return feature_with_percents.select(final_columns, null, false);
  };
  
  var final_table = county_stats.map(formatStats);
  var description = 'NLCD_Percent_' + state_name.replace(/ /g, '_') + '_' + year;
  
  // Use getDownloadURL for direct download.
  final_table.getDownloadURL({
    format: 'csv',
    filename: description,
    callback: function(url, failureMessage) {
      if (url) {
        // Success: Display the clickable download link.
        download_widget.setValue('✅ Success! Click here to download CSV.');
        download_widget.setUrl(url);
        download_widget.style().set({color: '#1a73e8'}); // Google Blue
      } else {
        // Failure: Display an error message.
        download_widget.setValue('❌ Error: ' + failureMessage + '. The state may be too large for direct download.');
        download_widget.style().set({color: 'red'});
      }
      // Re-enable the button once the process is complete.
      export_button.setDisabled(false);
    }
  });
}
