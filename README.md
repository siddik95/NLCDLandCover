## NLCD Land Cover Ratio Analysis

This repo contains code for the NLCD Land Cover Analyzer of the [Google Earth Engine App](https://siddikbrur.users.earthengine.app/view/nlcd-land-cover-analyzer).

### Define the NLCD data to be used to perform the analysis

For this app, I am using years 2019 and 2021 [NLCD data from USGS](https://www.usgs.gov/centers/eros/science/national-land-cover-database).

First, let's define a variable dictionary that contains NLCD data for both years, with the year and the data source name.

```javascript
var NLCD_ASSETS = {
  '2021': 'USGS/NLCD_RELEASES/2021_REL/NLCD',
  '2019': 'USGS/NLCD_RELEASES/2019_REL/NLCD',
};
```
### Reclassification of the NLCD Land Cover Data
NLCD land cover data originally came in 30-m resolution and more than one class for each primary class.
Here, we reclassified land cover data into nine major classes following [NLCD data class](https://www.mrlc.gov/data/legends/national-land-cover-database-class-legend-and-description) with slide deviation.
```javascript
var from_classes = [11, 12, 21, 22, 23, 24, 31, 41, 42, 43, 52, 71, 81, 82, 90, 95];
var to_classes = [1, 1, 2, 2, 2, 2, 3, 4, 4, 4, 5, 6, 7, 8, 9, 9];

var class_names = ['Water', 'Developed', 'Barren', 'Forest', 'Shrubland', 'Grassland', 'Pasture', 'Agriculture', 'Wetlands'];
var class_palette = ['466baf', 'd92d2d', 'b2b2b2', '136612', 'd8b969', 'a3cc51', 'e0e000', 'ab6c24', '6ca986'];
var vis_params = {min: 1, max: 9, palette: class_palette};
```

### Define State and County from Tiger/Line Shapefile
From [Tiger/Line Shapefiles](https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html) available in Google Earth Engine, let's define state
and county variables.
```javascript
var counties = ee.FeatureCollection('TIGER/2018/Counties');
var states = ee.FeatureCollection('TIGER/2018/States');
```

