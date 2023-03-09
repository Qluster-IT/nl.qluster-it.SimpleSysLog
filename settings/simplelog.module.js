//if (typeof window.angular === 'undefined') return;

if (typeof window.angular !== 'undefined') angular.module('simplelog', [
    'bll',
    'ngAnimate',
    'ngTouch',
    'ui.bootstrap',
    'ui.grid',
    'ui.grid.resizeColumns',
    'ui.grid.autoResize',
    'ui.grid.pagination',
    'ui.grid.selection',
    'ui.grid.moveColumns',
    'ui.grid.saveState',
    'tmh.dynamicLocale',
    //'ui.grid.exporter'
])

    .run(['$rootScope', function ($rootScope) {
        // $rootScope.a = true;
        // this.b=true;
        // $rootScope.menu = {};
    }])
    .controller("simplelogCtrl", ['$scope', '$rootScope', '$timeout', '$compile', '$q', '$bl', 'gridUtil', 'uiGridConstants', '$window', '$http', 'tmhDynamicLocale', function ($scope, $rootScope, $timeout, $compile, $q, $bl, gridUtil, uiGridConstants, $window, $http, tmhDynamicLocale) {
        const vars = $rootScope.vars = $scope.vars = { logCurrentPage: 1, logPerPage: 100, logs: [] };
        const view = $rootScope.view = $scope.view = { lang: 'en', severities: {}, facilities: {}, id: 'log', settings: {}, showHints: false };
        $scope.homey = $window.Homey;
        

        let localeSetter = tmhDynamicLocale;
        let ctrl = this;
        let homey = this.homey = $window.Homey;
        let Homey = homey;
        let __ = homey.__;

        $bl.init(homey, $scope);

        homey.getLanguage()
            .then((x) => console.log(x) & $scope.$apply(() => ($scope.view.lang = x) & localeSetter.set(x)))
            .catch(x => { });

        $bl.get('showHints', (x) => view.showHints = (x !== undefined && x !== null ? x : true));
        //view.showHints = true;

        let gridDefer = $q.defer();

        var facilities = {
            Kernel: 0,
            User: 1,
            System: 3,
            Audit: 13,
            Alert: 14,
            Flow: 16,
            Device: 17,
            App: 18
            // ,
            // Local3: 19,
            // Local4: 20,
            // Local5: 21,
            // Local6: 22,
            // Local7: 23
        };

        var severities = {
            Emergency: 0,
            Alert: 1,
            Critical: 2,
            Error: 3,
            Warning: 4,
            Notice: 5,
            Informational: 6,
            Debug: 7
        };

        for (const severityKey in severities)
            if (Object.hasOwnProperty.call(severities, severityKey)) {
                const severityNr = severities[severityKey];
                view.severities[severityNr] = severityKey;
            }

        for (const facilityKey in facilities)
            if (Object.hasOwnProperty.call(facilities, facilityKey)) {
                const facilityNr = facilities[facilityKey];
                view.facilities[facilityNr] = facilityKey;
            }

        async function loadLogs({ severity, facility, lastLog } = {}) {
            view.isBusy = true;
            //let opt = { take: vars.logPerPage, skip: (vars.logCurrentPage - 1) * vars.logPerPage, timestampFormat: 'datetime' };
            let opt = _.cloneDeep(arguments[0]) || {};
            opt.timestampFormat = 'datetime';
            if (!opt.take) opt.take = $scope.logGridOptions.paginationPageSize;
            if (!opt.skip) opt.skip = ($scope.logGridApi.pagination.getPage() - 1) * $scope.logGridOptions.paginationPageSize;

            if (lastLog) opt.lastLog = lastLog;
            await $bl.api("POST", "/", opt, (x) => {
                vars.logTotal = ($scope.logGridApi.pagination.getPage() - 1) * $scope.logGridOptions.paginationPageSize + (vars.logs = x.logs).length + 1;
                $scope.logGridApi.core.notifyDataChange(uiGridConstants.dataChange.COLUMN);
                $scope.logGridOptions.totalItems = vars.logTotal;
                view.isBusy = false;
            });
        }

        function filter(searchTerm, cellValue, row, column) {
            if (!cellValue) return false;

            if (cellValue.constructor !== Array) {
                cellValue = [cellValue];
            }

            var ss = searchTerm
                .toString()
                .replace(/[\W_]+/g, '')
                .toUpperCase();
            var regex = new RegExp(ss);

            var match = false;

            for (var i = 0; i < cellValue.length; i++)
                match =
                    match ||
                    regex.test(
                        cellValue[i]
                            .toString()
                            .toUpperCase()
                            .replace(/[\W_]+/g, '')
                    );

            return match;
        }
        let $query = function () {
            return {
                pagesize: 50,
                pagenr: 1,
                /** @type {String} */
                sort: null,
                /**
                 * @type {{field:String, direction:String}[]}
                 * */
                filters: null,
                /**
                 * Fill the query with values from the grid filters
                 * @function
                 * @param {any} grid
                 */
                fill: function (grid) {
                    this.pagenr = 1;
                    grid.options.paginationCurrentPage = 1;
                    var sortcolumn = _.find(grid.columns, function (c) {
                        return c.sort && c.sort.priority === 0;
                    });
                    this.sort = sortcolumn ? { field: sortcolumn.name ? sortcolumn.name : sortcolumn.field, direction: sortcolumn.sort.direction } : null;
                    this.filters = _.filter(
                        _.map(grid.columns, function (c) {
                            var t = c.filters[0].term;
                            var b = _.map(c.filters, 'term');
                            return { field: c.name ? c.name : c.field, term: c.filters[0].term, terms: _.map(c.filters, 'term'), comparator: c.filters[0].comparator };
                        }),
                        function (f) {
                            return (f.term !== undefined && f.term !== null) || !_.every(f.terms, x => !x);
                        }
                    );
                }
            };
        };

        $scope.logQuery = $query();


        ctrl.init = async () => {
            //$scope.__ = Homey.__;
            let loaded = false;
            $bl.get("settings", async (x) => {
                view.settings = (x = x || {});
                await gridDefer.promise;
                if (view.settings.logGridState) {
                    //console.log(view.settings.logGridState);
                    $scope.logGridApi.saveState.restore($scope, view.settings.logGridState);
                    // let state = $scope.logGridApi.saveState.save();
                    // view.settings.logGridState = state;
                } else
                    if (!loaded) (loaded = true) & loadLogs();
            });
            await gridDefer.promise;

            homey.ready();

            if (!loaded) (loaded = true) & loadLogs();

            // $scope.$watch("vars.logCurrentPage", async (newValue, oldValue) => {
            //     let opt = {};
            //     if (newValue > oldValue) opt.lastLog = vars.logs.length ? vars.logs[vars.logs.length - 1].id : null;
            //     await loadLogs(opt);
            // });
        };
        let columnWidhtSet = false;

        $scope.logGridOptions = {
            paginationPageSizes: [10, 15, 20, 25, 50, 75, 100, 250],//, 500, 1000],
            paginationPageSize: 50,
            useExternalPagination: true,
            //useExternalSorting: true,
            useExternalFiltering: true,

            enableSorting: false,
            enableColumnResizing: true,
            enableRowHeaderSelection: false,
            // enableMinHeightCheck: false,
            noUnselect: true,
            multiSelect: false,

            enableFiltering: true,
            enableHorizontalScrollbar: 1,
            enableVerticalScrollbar: 1,
            enableGridMenu: true,
            //rowHeight: 26,
            keepLastSelected: true,

            saveScroll: false,
            saveWidth: false,
            savePagination: false,
            saveGrouping: false,
            saveSelection: false,
            gridMenuTitleFilter: Homey.__,

            "data": "vars.logs",
            "onRegisterApi": function (gridApi, gridScope) {
                $scope.logGridApi = gridApi;
                //console.log(gridApi);
                gridApi.core.on.rowsRendered($scope, function (logGridCtrl) {
                    //console.log('rowsRendered');
                    $scope.logGridCtrl = logGridCtrl;
                    $scope.logGridScope = logGridCtrl.grid;
                    //console.log(logGridCtrl);
                    if (!columnWidhtSet && logGridCtrl.grid.rows && logGridCtrl.grid.rows.length) $timeout(function () {
                        columnWidhtSet = true;
                        //console.log('timeout');
                        angular.forEach($scope.logGridScope.columns, function (col) {
                            //gridCtrl.resizeOnData(col);

                            //var col = uiGridResizeColumnsService.findTargetCol($scope.col, $scope.position, rtlMultiplier);

                            // Don't resize if it's disabled on this column
                            if (col.colDef.enableColumnResizing === false) {
                                return;
                            }

                            // Go through the rendered rows and find out the max size for the data in this column
                            var maxWidth = 0;

                            // Get the parent render container element
                            var renderContainerElm = angular.element('.ui-grid-render-container').get(0);// col.getRenderContainer();// gridUtil.closestElm($elm, '.ui-grid-render-container');

                            // Get the cell contents so we measure correctly. For the header cell we have to account for the sort icon and the menu buttons, if present
                            var cells = renderContainerElm.querySelectorAll('.' + uiGridConstants.COL_CLASS_PREFIX + col.uid + ' .ui-grid-cell-contents');
                            Array.prototype.forEach.call(cells, function (cell) {
                                // Get the cell width
                                // gridUtil.logDebug('width', gridUtil.elementWidth(cell));

                                // Account for the menu button if it exists
                                var menuButton;
                                if (angular.element(cell).parent().hasClass('ui-grid-header-cell')) {
                                    menuButton = angular.element(cell).parent()[0].querySelectorAll('.ui-grid-column-menu-button');
                                }

                                gridUtil.fakeElement(cell, {}, function (newElm) {
                                    // Make the element float since it's a div and can expand to fill its container
                                    var e = angular.element(newElm);
                                    e.attr('style', 'float: left');

                                    var width = gridUtil.elementWidth(e) + 2;

                                    if (menuButton) {
                                        var menuButtonWidth = gridUtil.elementWidth(menuButton);
                                        width = width + menuButtonWidth;
                                    }

                                    if (width > maxWidth) {
                                        maxWidth = width;
                                    }
                                });
                            });
                            maxWidth += 20;
                            //console.log('maxwidht');
                            //console.log(maxWidth);
                            // check we're not outside the allowable bounds for this column
                            var newWidth = constrainWidth(col, maxWidth);
                            var xDiff = newWidth - col.drawnWidth;
                            col.width = newWidth;
                            col.hasCustomWidth = true;

                            //console.log(newWidth);

                            logGridCtrl.grid.refreshCanvas(true).then(function () {
                                logGridCtrl.grid.queueGridRefresh();
                            });
                            function constrainWidth(col, width) {
                                var newWidth = width;

                                // If the new width would be less than the column's allowably minimum width, don't allow it
                                if (col.minWidth && newWidth < col.minWidth) {
                                    newWidth = col.minWidth;
                                }
                                else if (col.maxWidth && newWidth > col.maxWidth) {
                                    newWidth = col.maxWidth;
                                }
                                return newWidth;
                            }

                        });
                    });
                    //if (!self.gridapi.pagination && !(self.gridapi.grid.options.totalItems > 0)) return;
                });


                // gridApi.core.on.sortChanged($scope, function () {
                //     $scope.logQuery.fill(gridApi.grid);
                //     console.log($scope.logQuery);
                //     //$scope.refresh(false, false);
                // });

                gridApi.core.on.filterChanged($scope, function () {
                    $scope.logQuery.fill(gridApi.grid);
                    //console.log($scope.logQuery);
                    $scope.refresh($scope.logQuery);
                    //$scope.refresh(false, false);
                });

                gridApi.pagination.on.paginationChanged($scope, function (pagenr, pagesize) {
                    $scope.logQuery.pagenr = pagenr;
                    $scope.logQuery.pagesize = pagesize;
                    $scope.refresh($scope.logQuery);
                });
                gridDefer.resolve();

            },
            columnDefs: [
                // {
                //     field: 'i',
                //     displayName: '#',
                //     width: 50, // a random fixed size, doesn't work without this
                //     sorting:false
                // },
                {
                    field: 'timestamp',
                    displayName: 'Timestamp',
                    headerCellFilter: '__',
                    width: 100,
                    sort: { direction: uiGridConstants.DESC, priority: 1 },
                    //cellFilter: 'date:"longDate"',
                    filterCellFiltered: true,
                    filters: [
                        {
                            name: 'From',
                            condition: uiGridConstants.filter.GREATER_THAN_OR_EQUAL
                        },
                        {
                            name: 'To',
                            condition: uiGridConstants.filter.LESS_THAN_OR_EQUAL
                        }
                    ],
                    //cellFilter: 'date:"M/d/yyyy h:mm:ss a"',
                    filterHeaderTemplate: '<div class="ui-grid-filter-container row"><div ng-repeat="colFilter in col.filters" class="col-md-6 col-md-offset-0 col-sm-6 col-sm-offset-0 col-xs-6 col-xs-offset-0"><div custom-grid-date-filter-header></div></div></div>',
                    cellTemplate:
                        '<div class="ui-grid-cell-contents">{{row.entity.timestamp_formatted || row.entity.timestamp}}</div>'
                },
                {
                    field: 'message',
                    displayName: 'Message',
                    headerCellFilter: '__',
                    width: '*'
                },
                {
                    field: 'app',
                    displayName: 'App',
                    headerCellFilter: '__',
                    width: '*',
                    filter: { condition: filter }
                },
                {
                    field: 'severity',
                    displayName: 'Severity',
                    headerCellFilter: '__',
                    width: 75,
                    filter: {
                        noTerm: true,
                        type: uiGridConstants.filter.SELECT,
                        selectOptions: _.map(severities, (val, key) => { return { value: val, label: key }; })
                    },
                    cellTemplate:
                        '<div class="ui-grid-cell-contents">{{grid.appScope.view.severities[row.entity.severity]}}</div>'
                },
                {
                    field: 'facility',
                    displayName: 'Facility',
                    headerCellFilter: '__',
                    width: 75,
                    filter: {
                        noTerm: true,
                        type: uiGridConstants.filter.SELECT,
                        selectOptions: _.map(facilities, (val, key) => { return { value: val, label: key }; })
                    },
                    cellTemplate:
                        '<div class="ui-grid-cell-contents">{{grid.appScope.view.facilities[row.entity.facility]}}</div>'
                }

            ],
            gridMenuCustomItems: [
                {
                    icon: 'fa-solid fa-wrench',
                    title: __('Settings'),
                    action: function ($event) {
                        view.id = 'settings';
                    },
                    order: 0
                },
                {
                    icon: 'fa-solid fa-arrows-rotate',
                    title: __('Refresh Log'),
                    action: function ($event) {

                        $scope.refresh($scope.logQuery);
                    },
                    order: 2
                },
                {
                    icon: 'fa-solid fa-file-excel',
                    title: __('Export as Excel'),
                    action: function ($event) {
                        $scope.downloadFile('xlsx');
                    },
                    order: 9
                },
                {
                    icon: 'fa-solid fa-file-csv',
                    title: __('Export as CSV'),
                    action: function ($event) {
                        $scope.downloadFile('csv');
                    },
                    order: 10
                },
                {
                    icon: 'fa-solid fa-file-code',
                    title: __('Export as JSON'),
                    action: function ($event) {
                        $scope.downloadFile('json');
                    },
                    order: 11
                },
                {
                    icon: 'fa-solid fa-floppy-disk',
                    title: __('Save columns'),
                    action: function ($event) {
                        let state = $scope.logGridApi.saveState.save();
                        if (state && state.columns) for (let i = 0; i < state.columns.length; i++) {
                            const column = state.columns[i];
                            for (let j = 0; j < column.filters.length; j++) {
                                const filter = column.filters[j];
                                if (filter.selectOptions) delete filter.selectOptions;
                            }
                            delete column.width;
                        }
                        console.log(state);
                        view.settings.logGridState = state;
                        $scope.saveSettings();
                    },
                    order: 200
                },
                {
                    icon: 'fa-solid fa-info',
                    title: __('Show hints'),
                    action: function ($event) {
                        view.showHints = true;
                    },
                    order: 201
                }
            ],
            enableColumnResize: true
            // rowTemplate:                                
            //         '<div ng-dblclick="grid.appScope.onDblClick(row)" ng-repeat="(colRenderIndex, col) in colContainer.renderedColumns track by col.colDef.name" class="ui-grid-cell" ng-class="{ \'ui-grid-row-header-cell\': col.isRowHeader }" ui-grid-cell ></div>'
        };


        $scope.saveSettings = function () {
            view.isBusy = true;
            $bl.set("settings", view.settings, async (x) => {
                if ($scope.settingsForm) {
                    $scope.settingsForm.$setSubmitted();
                    $scope.settingsForm.$setPristine();
                }
                view.isBusy = false;
            });
        };

        $scope.refresh = function (query) {
            let opts = {};
            //console.log(query.filters);
            if (query && query.filters) for (let i = 0; i < query.filters.length; i++) {
                const filter = query.filters[i];
                switch (filter.field) {
                    case 'severity': opts.severity = filter.term; break;
                    case 'facility': opts.facility = filter.term; break;
                    case 'app': opts.app = filter.term; break;
                    case 'message': opts.message = filter.term; break;
                    case 'timestamp':
                        if (filter.terms[0] && !(filter.terms[0] instanceof Date)) filter.terms[0] = new Date(filter.terms[0]);
                        if (filter.terms[1] && !(filter.terms[1] instanceof Date)) filter.terms[1] = new Date(filter.terms[1]);
                        opts.timestamp_fromUTC = filter.terms[0] ? new Date(Date.UTC(filter.terms[0].getFullYear(), filter.terms[0].getMonth(), filter.terms[0].getDate(), 0, 0, 0, 0)) : undefined;
                        opts.timestamp_toUTC = filter.terms[1] ? new Date(Date.UTC(filter.terms[1].getFullYear(), filter.terms[1].getMonth(), filter.terms[1].getDate(), 0, 0, 0, 0)) : undefined;
                        break;
                    default:
                        break;
                }
            }
            opts.take = query.pagesize;
            loadLogs(opts);


        };

        $scope.toggleSetting = (setting) => {
            if (!view.settings) view.settings = {};
            view.settings[setting] = !view.settings[setting];
            if (setting === 'rotated90') $scope.logGridApi.core.handleWindowResize();
        };

        // $scope.downloadCSV = async () => {
        //     let opt = { returnType:'csv' };
        //     await $bl.api("POST", "/", opt, (x) => {
        //         var encodedUri = encodeURI("data:text/csv;charset=utf-8," + x.csv);
        //         console.log(encodedUri);
        //         $bl.openURL(encodedUri);
        //     });
        // };
        $scope.downloadFile = async (type) => {
            view.isBusy = true;
            //let opt = { returnType: type };
            let downloadLink = await $bl.api("GET", "/getlogdownloadurl/" + type);
            if(!downloadLink) {
                $scope.$apply(() => {
                    (view.isBusy = false);
                });
                return (view.isBusy = false);
            }
            $http.get(downloadLink.localTestUrl).catch((err) => {
                //if(x) $bl.openURL(downloadLink.cloudUrl);
                if (err) $bl.openURL(downloadLink.cloudUrl);
                view.isBusy = false;
            }).then((x) => {
                if (x) $bl.openURL(downloadLink.localUrl);
                view.isBusy = false;
            });

            //$bl.openURL(downloadLink.url + downloadLink.filenameEncoded);
        };

        $scope.closeHints = function () {
            view.showHints = false;
            $bl.set('showHints', false);
        };



        ctrl.init();
    }])

    .directive('ngEnter', function () {
        return function (scope, element, attrs) {
            element.bind('keydown keypress', function (event) {
                if (event.which === 13) {
                    scope.$apply(function () {
                        scope.$eval(attrs.ngEnter || attrs.ngClick, {
                            $event: event
                        });
                    });
                    event.preventDefault();
                }
            });
        };
    })
    .directive('tooltip', function ($compile) {
        var contentContainer;
        return {
            restrict: "A",
            scope: {
                myTooltipScope: "="
            },
            link: function (scope, element, attrs) {
                var text = attrs.tooltip;

                scope.hidden = true;

                var tooltipElement = angular.element("<div ng-hide='hidden' class='tooltip'>");
                tooltipElement.append("<div>" + text.replaceAll('\r\n', '<br/>') + "</div>");

                element.append(tooltipElement);
                element
                    .on('mouseenter', function (event) {
                        scope.hidden = false; scope.$digest();

                        let width = $(document).width();
                        if (event.pageX <= (width / 2))
                            tooltipElement.css({ 'top': event.pageY - 50, 'left': event.pageX, 'position': 'fixed' });
                        else
                            tooltipElement.css({ 'top': event.pageY - 50, 'left': (event.pageX - tooltipElement.outerWidth()), 'position': 'fixed' });
                    })
                    .on('mouseleave', function () { scope.hidden = true; scope.$digest(); })
                    .on('click', function () { scope.hidden = true; scope.$digest(); });

                var toolTipScope = scope.$new(true);
                angular.extend(toolTipScope, scope.myTooltipScope);
                $compile(tooltipElement.contents())(toolTipScope);
                $compile(tooltipElement)(scope);
            }
        };
    })
    .directive('windowConfirm', ['$parse', function ($parse) {

        return {
            templateUrl: 'window-confirm.template.html',
            //replace:true,
            scope: {
                onOk: '@',
                onCancel: '@',
                title: '@',
                message: '@'

            },
            restrict: 'E',
            transclude: true,
            controller: function ($scope) {

            },
            link: function (scope, element, attrs) {
                scope.closed = false;
                scope.ok = function ($event) {
                    $event.preventDefault();
                    $event.stopPropagation();
                    $parse(attrs.onOk)(scope.$parent);
                }
                scope.cancel = function ($event) {
                    $event.preventDefault();
                    $event.stopPropagation();
                    $parse(attrs.onCancel)(scope.$parent);

                }
            }
        };
    }])
    .controller('gridDatePickerFilterCtrl', ['$scope', '$timeout', '$uibModal', 'uiGridConstants', function ($scope, $timeout, $uibModal, uiGridConstants) {

        $timeout(function () {
            // console.log($scope.col);
            var field = $scope.col.colDef.name;

            var allDates = _.map($scope.col.grid.appScope.logGridOptions.data, function (datum) {
                return datum[field];
            });

            var minDate = new Date(2020, 01, 01);// _.min(allDates);
            var maxDate = new Date();// _.max(allDates);

            $scope.openDatePicker = function (filter) {

                var modalInstance = $uibModal.open({
                    templateUrl: 'custom-date-filter.html',
                    controller: 'customGridDateFilterModalCtrl as custom',
                    size: 'sm',
                    windowClass: 'custom-date-filter-modal',
                    resolve: {
                        filterName: [function () {
                            return filter.name;
                        }],
                        minDate: [function () {
                            return new Date(minDate);
                        }],
                        maxDate: [function () {
                            return new Date(maxDate);
                        }],
                        filterDate: [function () {
                            return filter.term;
                        }]
                    }
                });

                modalInstance.result.then(function (selectedDate) {

                    if (!$scope.colFilter.listTerm) $scope.colFilter.listTerm = {};
                    $scope.colFilter.listTerm[filter.name] = selectedDate;

                    $scope.colFilter.term = selectedDate;
                });
            };

        });


    }])
    .controller('customGridDateFilterModalCtrl', ['$scope', '$rootScope', '$log', '$uibModalInstance', 'filterName', 'minDate', 'maxDate', 'filterDate', '$bl', function ($scope, $rootScope, $log, $uibModalInstance, filterName, minDate, maxDate, filterDate, $bl) {

        var ctrl = this;

        //console.log('filter name', filterName);
        //console.log('min date', minDate, 'max date', maxDate);

        ctrl.title = $bl.__('Select Date ' + filterName) + ' ';
        ctrl.minDate = minDate;
        ctrl.maxDate = maxDate;
        ctrl.customDateFilterForm;
        //ctrl.currentDate = new Date();
        let f = filterDate;
        //console.log(f);
        //console.log('f');
        ctrl.filterDate = filterDate;
        //  ctrl.filterDate = new Date();// (filterName.indexOf('From') !== -1) ? angular.copy(ctrl.minDate) : angular.copy(ctrl.maxDate);

        function setDateToStartOfDay(date) {
            return new Date(date.getFullYear(), date.getMonth(), date.getDate());
        }

        function setDateToEndOfDay(date) {
            return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
        }

        ctrl.filterDateChanged = function () {
            ctrl.filterDate = (filterName.indexOf('From') !== -1) ? setDateToStartOfDay(ctrl.filterDate) : setDateToEndOfDay(ctrl.filterDate);
            $log.log('new filter date', ctrl.filterDate);
        };

        ctrl.setFilterDate = function (date) {
            $uibModalInstance.close(date);
        };

        ctrl.cancelDateFilter = function () {
            $uibModalInstance.dismiss();
        };

    }])

    .directive('customGridDateFilterHeader', function () {
        return {
            template: '<button class="btn btn-default date-time-filter-buttons" style="width:90%;padding:inherit;" ng-click="openDatePicker(colFilter)">{{ colFilter.name | __ }}</button><div role="button" class="ui-grid-filter-button-select cancel-custom-date-range-filter-button ng-scope" ng-click="removeFilter(colFilter, $index)" ng-if="!colFilter.disableCancelFilterButton" ng-disabled="colFilter.term === undefined || colFilter.term === null || colFilter.term === \'\'" ng-show="colFilter.term !== undefined &amp;&amp; colFilter.term != null" tabindex="0" aria-hidden="false" aria-disabled="false" style=""><i class="ui-grid-icon-cancel cancel-custom-date-range-filter" ui-grid-one-bind-aria-label="aria.removeFilter" aria-label="Remove Filter">&nbsp;</i></div>',
            controller: 'gridDatePickerFilterCtrl'
        };
    });