
angular.module('simplelog', ['bll', 'ui.bootstrap'])
    .run(['$rootScope', function ($rootScope) {
        // $rootScope.a = true;
        // this.b=true;
        // $rootScope.menu = {};
    }])
    .controller("simplelogCtrl", ['$scope', '$rootScope', '$timeout', '$compile', '$q', '$bl', function ($scope, $rootScope, $timeout, $compile, $q, $bl) {
        const vars = $rootScope.vars = $scope.vars = { logCurrentPage:1, logPerPage:100, logs:[] };
        const view = $rootScope.view = $scope.view = { };
        let ctrl = this;
        let homey;


        ctrl.init = async (homey, scope)=> {
            ctrl.homey = homey;
            $scope.__ = Homey.__;
            $bl.init(homey, $scope);
            $bl.get("settings.view.settings", async(x)=> {
                view.settings = x;
                //await $bl.api("POST", "/date", {format:formats}, (x)=> temp.dateFormats = x );
            });
            loadLogs();
                
            $scope.$watch("vars.logCurrentPage", async(newValue, oldValue)=> {
                let opt = {};
                if(newValue>oldValue) opt.lastLog = vars.logs.length?vars.logs[vars.logs.length-1].id:null;
                await loadLogs(opt);
            });
        };

        async function loadLogs({lastLog}) {
            let opt = {take:vars.logPerPage, skip:(vars.logCurrentPage-1)*vars.logPerPage};
            if(lastLog) opt.lastLog = lastLog;
            await $bl.api("POST", "/", opt, (x)=> {
                vars.logTotal = (vars.logCurrentPage-1)*vars.logPerPage + (vars.logs = x).length +1 ;
                console.log(vars.logTotal);
            });
        }

        $scope.toggleSetting = (setting)=> {
            if(!view.settings) view.settings = {};
            view.settings[setting]=!view.settings[setting];
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