///////////////////////////////////////////////////////////////////////////
// Copyright © Esri. All Rights Reserved.
//
// Licensed under the Apache License Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
///////////////////////////////////////////////////////////////////////////

define([
  'dojo/_base/lang',
  'dojo/_base/html',
  'dojo/_base/declare',
  './BaseDijit',
  'dojo/text!./ChartDijit.html',
  'moment/moment',
  'jimu/dijit/_chartDijitOption',
  'jimu/dijit/Chart',
  'jimu/DataSourceManager',
  'jimu/LayerInfos/LayerInfos',
  '../utils',
  'jimu/utils',
  'libs/moment/twix'
], function(lang, html, declare, BaseDijit, template, moment, ChartDijitOption,
  Chart, DataSourceManager, LayerInfos, utils, jimuUtils) {
  window.makeTwix(moment);
  var clazz = declare([BaseDijit], {
    templateString: template,
    type: 'chart',
    baseClass: 'infographic-chart-dijit',
    layerInfosObj: null,
    dataSourceManager: null,
    featuresCountForPreview: 50,
    dataSource: null, //{dsType,filterByExtent,layerId,name,useSelection}
    config: null,
    map: null,

    maxTimeIntervals: 10000,
    maxLabels: 10000,
    dsType: '', //CLIENT_FEATURES, FRAMEWORK_FEATURES, FRAMEWORK_STATISTICS

    constructor: function(options) {
      this.visible = options.visible;
      this.layerInfosObj = LayerInfos.getInstanceSync();
      this.dataSourceManager = DataSourceManager.getInstance();

      this.config = options.config;
      this.featureLayerForFrameWork = null;
      this.layerObject = null;
      this.popupInfo = null;
    },

    postCreate: function() {
      this.inherited(arguments);
      this._init();
      this.upgradeConfig();
    },

    setLayerInfo: function(layerObject, featureLayerForFrameWork, popupInfo) {
      this.layerObject = layerObject;
      this.popupInfo = popupInfo;
      this.featureLayerForFrameWork = featureLayerForFrameWork;
      this._initChartDijitOption();
    },

    getDataURL: function() {
      if (!this.chart) {
        return;
      }
      return this.chart.getDataURL();
    },

    resize: function() {
      if (!this.chart) {
        return;
      }
      this.chart.resize();
    },

    setVisible: function(visible) {
      this.visible = visible;
    },

    destroy: function() {
      if (this.chart) {
        this.chart.destroy();
      }
      this.chart = null;
      this.inherited(arguments);
    },

    clearChart: function() {
      if (this.chart) {
        this.chart.clear();
      }
      this.showNodata();
    },

    setBackgroundColor: function(bg) {
      this.domNode.style.backgroundColor = bg;
    },

    _setyAxisName: function() {
      var displayConfig = this.config && this.config.display;
      var yAxis = displayConfig && displayConfig.yAxis;
      if (!yAxis || !yAxis.show || typeof yAxis.name === 'undefined') {
        this._hideyAxisName();
        return;
      }
      this._showyAxisName();
      var name = yAxis.name;
      this._setyAxisNameText(name);
      var nameTextStyle = yAxis.nameTextStyle;
      if (!nameTextStyle || !nameTextStyle.color) {
        return;
      }
      this._setyAxisNameColor(nameTextStyle.color);
    },

    _setyAxisNameText: function(text) {
      this.yAxisName.innerHTML = jimuUtils.stripHTML(text);
    },

    _setyAxisNameColor: function(color) {
      html.setStyle(this.yAxisName, 'color', color);
    },

    _hideyAxisName: function() {
      html.setStyle(this.yAxisName, 'display', 'none');
    },

    _showyAxisName: function() {
      html.setStyle(this.yAxisName, 'display', 'flex');
    },

    resetData: function() {
      this.dataSource = null;
      this.dsType = '';
      this.data = null;
      this._hasStatisticsed = undefined;
      this.layerObject = null;
      this.popupInfo = null;
      this.featureLayerForFrameWork = null;
      this.chartDijitOption.init(null, null, null, this.map);
    },

    //this.dataSource
    setDataSource: function(dataSource) {
      this.inherited(arguments);
      this.dataSource = dataSource;
      this._calcDataSourceType(this.dataSource);
    },

    onUpdateDataStart: function() {
      this._showOverlay();
    },

    onUpdateDataDone: function() {
      this._hideOverlay();
    },

    _calcDataSourceType: function(dataSource) {
      if (dataSource.layerId) {
        this.dsType = 'CLIENT_FEATURES';
      } else if (dataSource.frameWorkDsId) {
        var dsInfo = utils.getDsTypeInfoMeta(dataSource.frameWorkDsId, this.appConfig);
        var dsMeta = dsInfo && dsInfo.dsMeta;
        if (!dsMeta) {
          return;
        }
        if (dsMeta.type === 'Features') {
          this.dsType = 'FRAMEWORK_FEATURES';
        } else if (dsMeta.type === 'FeatureStatistics') {
          this.dsType = 'FRAMEWORK_STATISTICS';
        }
      }
    },

    //chart dijit related config, not widget config
    //this.config
    setConfig: function(config) {
      this.config = config;
      this.upgradeConfig();
    },

    upgradeConfig:function(){
      this.config = utils.upgradeChartAxisFormatConfig(this.config, this.layerObject, this.popupInfo);
    },

    //this.data
    onDataSourceDataUpdate: function(data) {
      if (data && typeof data.features !== 'undefined') {
        if (this.inSettingPage && data.features.length > this.featuresCountForPreview) {
          data.features = data.features.slice(0, this.featuresCountForPreview);
        }
        this.data = data;
        this._hasStatisticsed = !!data.hasStatisticsed;
      }
    },

    //create echarts option and render it
    startRendering: function() {
      this.specialChartConfig(this.config);
      if (!this._shouldRenderChart()) {
        return;
      }
      if (!this.chart) {
        this._createJimuChart();
      }
      this._updateBackgroundColor();
      this._setyAxisName();
      this._splitConfig();

      this._createChartSeriesOption();

      if (!this.seriesOption) {
        this.showNodata();
        return;
      }

      if (this._checkIsTooManyLabels(this.seriesOption)) {
        return;
      }

      this._createChartOption();
      
      //Remove items where category is null or NaN
      this.chartOption.labels = this.chartOption.labels.filter(x => x !== 'NaN' && x !== null);
      this.chartOption.series.forEach((serie, index) => {
        this.chartOption.series[index].data = this.chartOption.series[index].data.filter(x => x.value !== null && x.name !== 'null');
      })
      
      this.chartOption.axisMin = this.config.data.axisMin;
      this.chartOption.axisMin ? this.chart.updateConfigVerticalDataMin(this.chartOption) : this.chart.updateConfigVertical(this.chartOption);
      this.chart.resize();
    },

    //step 2, create echarts option
    _createChartOption: function() {
      var isSameFeatures = this._isSameFeatures();
      var isSameOption = utils.isEqual(this.dataOption, this._oldDataOption) &&
        utils.isEqual(this.displayOption, this._oldDisplayOption);
      if (isSameFeatures && isSameOption) {
        return;
      }
      this.chartOption = null;
      if (!this.seriesOption) {
        return;
      }
      this.chartOption = this.chartDijitOption.updateChartOptionDisplay(lang.clone(this.seriesOption),
        this.displayOption, this.dataOption);
      this._oldDisplayOption = null;
      this._oldDisplayOption = lang.clone(this.displayOption);
    },

    //step 1, create echart option.series and labels
    _createChartSeriesOption: function() {
      var isSameFeatures = this._isSameFeatures();
      var isSameDataOption = utils.isEqual(this.dataOption, this._oldDataOption);
      if (isSameFeatures && isSameDataOption) {
        return;
      }

      this._oldDataOption = null;
      this._oldDataOption = lang.clone(this.dataOption);

      var dataOption = this.dataOption;
      dataOption.features = this.features;

      var csuData = this.chartDijitOption.getClientStatisticsData(dataOption);
      this.seriesOption = null;
      if (!csuData) {
        return;
      }
      this.chartDijitOption.bindChartEvent(this.chart, dataOption, csuData);
      this.seriesOption = this.chartDijitOption.getChartOptionSeries(this.dataOption, csuData);
    },

    //-------------------Tools methods------------------

    //Split the required configuration items, reduce the repeated computation
    _splitConfig: function() {
      if (!this.config) {
        return;
      }
      var dataConfig = this.config.data;
      var displayConfig = this.config.display;

      this.features = this._cleanFeatures(this.data.features);

      var filterByExtent = this.dataSource.filterByExtent;
      var useSelection = this.dataSource.useSelection;
      var hasStatisticsed = this._isStatisticsed();

      var dataOption = {
        filterByExtent: filterByExtent,
        useSelection: useSelection,
        hasStatisticsed: hasStatisticsed
      };

      this.dataOption = null;
      this.dataOption = lang.mixin(dataOption, dataConfig);

      this.displayOption = null;
      this.displayOption = displayConfig;
    },

    _cleanFeatures: function(features) {
      if (!features || !features.length) {
        return;
      }
      return features.map(function(f) {
        return {
          attributes: f.attributes
        };
      });
    },

    _isSameFeatures: function() {
      var features = this.features;
      if (!features) {
        return true;
      }
      var featureAttrs = features.map(function(f) {
        return f.attributes;
      });
      if (utils.isEqual(featureAttrs, this._oldFeatureAttrs)) {
        return true;
      }
      this._oldFeatureAttrs = featureAttrs;
    },

    _isStatisticsed: function() {
      if (this.inSettingPage) {
        return this.dsType === 'FRAMEWORK_STATISTICS';
      }
      return !!this._hasStatisticsed;
    },

    _shouldRenderChart: function() {
      if (!this.visible) {
        return;
      }
      if (!this.config) {
        return;
      }
      var basicRequire = this.domNode &&
        this.data && this.data.features && this._hasVaildConfig(this.config.data);
      var specificRequire;
      if (this.dsType === 'CLIENT_FEATURES') {
        specificRequire = !!this.layerObject;
      } else if (this.dsType === 'FRAMEWORK_FEATURES' || this.dsType === 'FRAMEWORK_STATISTICS') {
        specificRequire = !!this.featureLayerForFrameWork;
      }
      if (basicRequire && specificRequire) {
        var features = this.data.features;
        if (this._checkIsTooManyTimeInterval(features)) {
          var message = this.nls.parsingperiodTip;
          this.showNodata(message);
          return false;
        }
      } else {
        this.showNodata();
        return false;
      }
      this.hideNodata();
      return true;
    },

    _hasVaildConfig: function(data) {
      if (!data || !data.mode) {
        return false;
      }
      var valueFields = data.valueFields;
      if (data.mode === 'feature') {
        return data.clusterField && valueFields && valueFields.length;
      } else if (data.mode === 'category') {
        return data.clusterField && data.operation && valueFields && valueFields.length;
      } else if (data.mode === 'count') {
        return data.clusterField;
      } else if (data.mode === 'field') {
        return data.operation && valueFields && valueFields.length;
      }
    },

    _getNodataTextColor: function() {
      var color = '#666';
      var displayConfig = this.config && this.config.display;
      var dataConfig = this.config && this.config.data;
      if (!displayConfig || !dataConfig) {
        return color;
      }

      if (dataConfig.type === 'pie') {
        color = displayConfig.dataLabelColor;
      } else {
        color = displayConfig.horizontalAxisTextColor || displayConfig.verticalAxisTextColor;
      }
      if (!color) {
        color = '#666';
      }
      return color;
    },

    specialChartConfig: function(config) {
      if (!config) {
        return;
      }
      var theme = this._getChartTheme();
      utils.specialChartConfig(config, theme);
      return config;
    },

    _showOverlay: function() {
      html.removeClass(this.overlap, 'hide');
    },

    _hideOverlay: function() {
      html.addClass(this.overlap, 'hide');
    },

    showNodata: function(message) { //type:timeInterval,maxLabels
      html.addClass(this.domNode, 'no-data');
      this._setNoDataColor();
      if (message) {
        this.noDataDiv.innerHTML = jimuUtils.sanitizeHTML(message);
      }
    },

    _setNoDataColor: function() {
      var textColor = this._getNodataTextColor();
      if (this.noDataDiv && this.noDataDiv.style) {
        this.noDataDiv.style.color = textColor;
      }
    },

    _initChartDijitOption: function() {
      if (!this.chartDijitOption) {
        return;
      }
      var featureLayer = null;
      if (this.dsType === 'CLIENT_FEATURES') {
        featureLayer = this.layerObject;
      } else {
        featureLayer = this.featureLayerForFrameWork;
      }
      var symbolLayer = this.layerObject;
      this.chartDijitOption.init(featureLayer, symbolLayer, this.popupInfo, this.map, this.layerObject);
    },

    _checkIsTooManyLabels: function(chartOptions) {
      var labels = chartOptions.labels;
      if (labels && labels.length > this.maxLabels) {
        var message = this.nls.manyCategoryTip;
        this.showNodata(message);
        return true;
      }
      return false;
    },

    _checkIsTooManyTimeInterval: function(features) {
      var dataConfig = this.config && this.config.data;
      var dateConfig = dataConfig && dataConfig.dateConfig;
      if (!dateConfig || dateConfig.minPeriod === 'automatic') {
        return false;
      }
      var fieldName = dateConfig.clusterField;

      var times = features.map(lang.hitch(this, function(feature) {
        var attributes = feature.attributes;
        return attributes[fieldName];
      }));
      times = times.filter(function(e) {
        return !!e;
      });

      var minTime = Math.min.apply(Math, times);
      var maxTime = Math.max.apply(Math, times);

      var start = moment(minTime).subtract(1, 'seconds').local();
      var end = moment(maxTime).add(1, 'seconds').local();
      var numbers = Math.round(end.diff(start, dateConfig.minPeriod, true));
      return numbers >= this.maxTimeIntervals;
    },

    _createChartDijitOption: function() {
      var args = {
        map: null
      };
      if (!this.inSettingPage) {
        args.map = this.map;
      }
      this.chartDijitOption = new ChartDijitOption(args);
    },

    _init: function() {
      this._createChartDijitOption();
      this._updateBackgroundColor();
    },

    _createJimuChart: function() {
      var dataConfig = this.config && this.config.data;
      var type = dataConfig && dataConfig.type;
      this.DEFAULT_CONFIG = {
        type: type || 'column',
        theme: this._getChartTheme(),
        labels: [],
        series: [{
          data: []
        }]
      };

      this.chart = new Chart({
        chartDom: this.chartDomNode,
        config: this.DEFAULT_CONFIG,
        preview: this.inSettingPage
      });

      this.chart.updateConfigVertical = function(config) {
        if (!config || !this.chart) {
          return false;
        }

        var prevOption = this.chart.getOption();
        var isSameNumberSeriesItems = this._isSameNumberSeriesItems(prevOption, config);
        var prevRatio = (!this.preview && isSameNumberSeriesItems) ? this.getDatazoomRatio(prevOption) : null;

        this.config = config;
        this._specialThemeByConfig(config);
        var option = this._chartFactory(config);
        // swap the axes, keep the x-axis name and name text style - want user to be able to configure horizontal = x and vertical = y as normal in the builder
        [option.xAxis, option.yAxis, option.xAxis.name, option.xAxis.nameTextStyle] = [option.yAxis, option.xAxis, option.xAxis.name, option.xAxis.nameTextStyle];
        // delete y-axis name since this is set elsewhere
        delete option.yAxis.name;
        this.chart.setOption(option, true);
        // increase grid right
        this.chartUtils.defultGrid.right = 20;
        this._settingByGrid(config, option, prevRatio);
        // configure chart for realtime update as slider bar is adjusted, turn off slider data filtering which had been causing weird line redraws
        option.dataZoom[0].realtime = option.dataZoom[1].realtime = true;
        option.dataZoom[0].filterMode = option.dataZoom[1].filterMode = 'none';
        this.chart.setOption(option, false);

        return true;
      };

      this.chart.updateConfigVerticalDataMin = function(config) {
        if (!config || !this.chart) {
          return false;
        }

        var prevOption = this.chart.getOption();
        var isSameNumberSeriesItems = this._isSameNumberSeriesItems(prevOption, config);
        var prevRatio = (!this.preview && isSameNumberSeriesItems) ? this.getDatazoomRatio(prevOption) : null;

        this.config = config;
        this._specialThemeByConfig(config);
        var option = this._chartFactory(config);
        // calculate the minimum axis value as the nearest whole integer less than or equal to the minimum series value
        function calcAxisMin(value) {
          let exp = String(Math.floor(value)).length - 1;
          return Math.floor(value / Math.pow(10, exp)) * Math.pow(10, exp);
        }
        var series = []
        for (x in option.series) {
          for (y in option.series[x].data) {
            series.push(option.series[x].data[y].value);
          }
        }
        // filter out any nulls or undefined in the data
        series = series.filter(x => typeof x === 'string');
        // set yAxis min to calculated value
        var axisMin = calcAxisMin(Math.min(...series));
        option.yAxis.min = axisMin;
        // swap the axes, keep the x-axis name and name text style - want user to be able to configure horizontal = x and vertical = y as normal in the builder
        [option.xAxis, option.yAxis, option.xAxis.name, option.xAxis.nameTextStyle] = [option.yAxis, option.xAxis, option.xAxis.name, option.xAxis.nameTextStyle];
        // delete y-axis name since this is set elsewhere
        delete option.yAxis.name;
        this.chart.setOption(option, true);
        // increase grid right
        this.chartUtils.defultGrid.right = 20;

        this.chart.setOption(option, true);
        this._settingByGrid(config, option, prevRatio);
        // configure chart for realtime update as slider bar is adjusted, turn off slider data filtering which had been causing weird line redraws
        option.dataZoom[0].realtime = option.dataZoom[1].realtime = true;
        option.dataZoom[0].filterMode = option.dataZoom[1].filterMode = 'none';
        this.chart.setOption(option, false);

        return true;
      };

      this.chart.placeAt(this.chartDomNode);
      this.chart.resize();
    },

    _getChartTheme: function() {
      if (this.isDarkTheme()) {
        return "dark";
      } else {
        return "light";
      }
    },

    _updateBackgroundColor: function() {
      var displayConfig = this.config && this.config.display;
      if (displayConfig && displayConfig.backgroundColor) {
        this.setBackgroundColor(displayConfig.backgroundColor);
      }
    },

    hideNodata: function() {
      html.removeClass(this.domNode, 'no-data');
    }

  });

  return clazz;
});