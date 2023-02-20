
angular.module('simplelog', [
    'bll',
    'ui.bootstrap',
    'ngTouch',
    'ui.grid',
    'ui.grid.resizeColumns',
    'ui.grid.autoResize',
    'ui.grid.pagination',
    'ui.grid.selection'
])
    .run(['$rootScope', function ($rootScope) {
        // $rootScope.a = true;
        // this.b=true;
        // $rootScope.menu = {};
    }])
    .controller("simplelogCtrl", ['$scope', '$rootScope', '$timeout', '$compile', '$q', '$bl', 'gridUtil', 'uiGridConstants', function ($scope, $rootScope, $timeout, $compile, $q, $bl, gridUtil, uiGridConstants) {
        const vars = $rootScope.vars = $scope.vars = { logCurrentPage: 1, logPerPage: 100, logs: [] };
        const view = $rootScope.view = $scope.view = { severities: {}, facilities: {} };
        let ctrl = this;
        let homey;

        var facilities = {
            Kernel: 0,
            User: 1,
            System: 3,
            Audit: 13,
            Alert: 14,
            Local0: 16,
            Local1: 17,
            Local2: 18,
            Local3: 19,
            Local4: 20,
            Local5: 21,
            Local6: 22,
            Local7: 23
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
            //let opt = { take: vars.logPerPage, skip: (vars.logCurrentPage - 1) * vars.logPerPage, timestampFormat: 'datetime' };
            let opt = _.cloneDeep(arguments[0]) || {}; 
            opt.timestampFormat = 'datetime';
            if(!opt.take) opt.take=$scope.logGridOptions.paginationPageSize;
            if(!opt.skip) opt.skip=($scope.logGridApi.pagination.getPage()- 1) * $scope.logGridOptions.paginationPageSize;
            
            if (lastLog) opt.lastLog = lastLog;
            await $bl.api("POST", "/", opt, (x) => {
                vars.logTotal = ($scope.logGridApi.pagination.getPage() - 1) * $scope.logGridOptions.paginationPageSize + (vars.logs = x).length + 1;
                $scope.logGridApi.core.notifyDataChange(uiGridConstants.dataChange.COLUMN);
                $scope.logGridOptions.totalItems = vars.logTotal;
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
                            return { field: c.name ? c.name : c.field, term: c.filters[0].term, comparator: c.filters[0].comparator };
                        }),
                        function (f) {
                            return f.term !== undefined && f.term !== null;
                        }
                    );
                }
            };
        };

        $scope.logQuery = $query();


        ctrl.init = async (homey, scope) => {
            ctrl.homey = homey;
            $scope.__ = Homey.__;
            $bl.init(homey, $scope);
            $bl.get("settings.view.settings", async (x) => {
                view.settings = x;
                //await $bl.api("POST", "/date", {format:formats}, (x)=> temp.dateFormats = x );
            });
            loadLogs();

            // $scope.$watch("vars.logCurrentPage", async (newValue, oldValue) => {
            //     let opt = {};
            //     if (newValue > oldValue) opt.lastLog = vars.logs.length ? vars.logs[vars.logs.length - 1].id : null;
            //     await loadLogs(opt);
            // });
        };
        let columnWidhtSet = false;

        $scope.logGridOptions = {

            paginationPageSizes: [10, 15, 20, 25, 50, 75, 100],
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

            saveScroll: true,
            "data": "vars.logs",
            "onRegisterApi": function (gridApi, gridScope) {
                $scope.logGridApi = gridApi;
                console.log(gridApi);
                gridApi.core.on.rowsRendered($scope, function (logGridCtrl) {
                    console.log('rowsRendered');
                    $scope.logGridCtrl = logGridCtrl;
                    $scope.logGridScope = logGridCtrl.grid;
                    console.log(logGridCtrl);
                    if (!columnWidhtSet && logGridCtrl.grid.rows && logGridCtrl.grid.rows.length) $timeout(function () {
                        columnWidhtSet = true;
                        console.log('timeout');
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

                            // check we're not outside the allowable bounds for this column
                            var newWidth = constrainWidth(col, maxWidth);
                            var xDiff = newWidth - col.drawnWidth;
                            col.width = newWidth;
                            col.hasCustomWidth = true;

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
                    console.log($scope.logQuery);
                    $scope.refresh($scope.logQuery);
                    //$scope.refresh(false, false);
                });

                gridApi.pagination.on.paginationChanged($scope, function (pagenr, pagesize) {
                    $scope.logQuery.pagenr = pagenr;
                    $scope.logQuery.pagesize = pagesize;                    
                    $scope.refresh($scope.logQuery);
                });

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
                    //displayName: 'Timestamp',
                    width: 100,
                    sort: { direction: uiGridConstants.DESC, priority: 1 },
                    cellTemplate:
                        '<div class="ui-grid-cell-contents">{{row.entity.timestamp_formatted || row.entity.timestamp}}</div>'
                },
                {
                    field: 'severity',
                    displayName: 'Severity',
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
                    width: 75,
                    filter: {
                        noTerm: true,
                        type: uiGridConstants.filter.SELECT,
                        selectOptions: _.map(facilities, (val, key) => { return { value: val, label: key }; })
                    },
                    cellTemplate:
                        '<div class="ui-grid-cell-contents">{{grid.appScope.view.facilities[row.entity.facility]}}</div>'
                },
                {
                    field: 'app',
                    displayName: 'App',
                    width: '*',
                    filter: { condition: filter }
                },
                {
                    field: 'message',
                    displayName: 'Message',
                    width: '*'
                }

            ],
            enableColumnResize: true
            // rowTemplate:                                
            //         '<div ng-dblclick="grid.appScope.onDblClick(row)" ng-repeat="(colRenderIndex, col) in colContainer.renderedColumns track by col.colDef.name" class="ui-grid-cell" ng-class="{ \'ui-grid-row-header-cell\': col.isRowHeader }" ui-grid-cell ></div>'
        };

        $scope.refresh = function (query) {
            let opts = {};
            if (query && query.filters) for (let i = 0; i < query.filters.length; i++) {
                const filter = query.filters[i];
                switch (filter.field) {
                    case 'severity': opts.severity = filter.term; break;
                    case 'facility': opts.facility = filter.term; break;
                    case 'app': opts.app = filter.term; break;
                    case 'message': opts.message = filter.term; break;
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
    }]);